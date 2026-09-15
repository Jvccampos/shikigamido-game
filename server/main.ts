import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import type { Queries } from "../shared/protocol.js";
import type { MutationResponse } from "../shared/room.js";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { WebSocket } from "ws";
import service from "./index.js";
import { openDatabase, type Context } from "./database.js";

export async function createServer(
  options: { database?: string; logger?: boolean } = {},
) {
  const db = openDatabase(
    options.database || process.env.DATABASE_PATH || "storage/shikigamido.db",
  );
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 128 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 2048 } });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Loading the card catalog must not consume the players' command allowance.
    allowList: (request) => !request.url.startsWith("/api/"),
  });
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  };
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const getAuth = (request: FastifyRequest) => {
    const token = request.cookies.shiki_session;
    if (!token) return { userId: null, displayName: "" };
    const u = db.raw
      .prepare(
        "SELECT u.id,u.name FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires>?",
      )
      .get(hash(token), Date.now()) as { id: string; name: string } | undefined;
    return u
      ? { userId: u.id, displayName: u.name }
      : { userId: null, displayName: "" };
  };
  const context = (request: FastifyRequest): Context => ({
    auth: getAuth(request),
    db,
  });
  const newSession = (reply: FastifyReply, id: string) => {
    const token = randomBytes(32).toString("base64url");
    db.raw
      .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)")
      .run(hash(token), id, Date.now() + 30 * 86400000);
    reply.setCookie("shiki_session", token, cookieOptions);
  };
  const channels = new Map<
    WebSocket,
    { code: string; userId: string | null; expires: number }
  >();
  function broadcast(code: string) {
    for (const [socket, member] of channels) {
      if (member.code !== code || socket.readyState !== 1) continue;
      if (member.expires < Date.now()) {
        socket.close(1008, "Session expired");
        channels.delete(socket);
        continue;
      }
      const result = service.queries.room(
        { auth: { userId: member.userId, displayName: "" }, db },
        code,
      );
      socket.send(JSON.stringify({ type: "room", room: result }));
    }
  }
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "POST") {
      const origin = request.headers.origin;
      if (
        origin &&
        origin !== `${request.protocol}://${request.headers.host}` &&
        origin !== process.env.PUBLIC_URL
      ) {
        reply.code(403);
        throw Error("Origem inválida.");
      }
    }
  });
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/api/auth", async (request) => {
    const auth = getAuth(request);
    return {
      ...auth,
      isAuthenticated: !!auth.userId,
      isLoading: false,
    };
  });
  app.post(
    "/api/auth/guest",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const name = (request.body as { name?: unknown } | null)?.name;
      if (typeof name !== "string" || !name.trim() || name.length > 40)
        return reply
          .code(400)
          .send({ error: "Escolha um nome de até 40 caracteres." });
      const current = getAuth(request);
      if (current.userId) {
        db.raw
          .prepare("UPDATE users SET name=? WHERE id=?")
          .run(name.trim(), current.userId);
      } else {
        const id = crypto.randomUUID();
        db.raw
          .prepare("INSERT INTO users(id,name) VALUES (?,?)")
          .run(id, name.trim());
        newSession(reply, id);
      }
      return { ok: true };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies.shiki_session;
    if (token) {
      const id = getAuth(request).userId;
      db.raw.prepare("DELETE FROM sessions WHERE hash=?").run(hash(token));
      for (const [s, m] of channels)
        if (m.userId === id) {
          s.close(1000);
          channels.delete(s);
        }
    }
    reply.clearCookie("shiki_session", cookieOptions);
    return { ok: true };
  });
  app.post<{ Params: { kind: string; name: string } }>(
    "/api/:kind/:name",
    async (request, reply) => {
      const { kind, name } = request.params;
      const handlers =
        kind === "query"
          ? service.queries
          : kind === "mutation"
            ? service.mutations
            : null;
      if (!handlers || !Object.hasOwn(handlers, name))
        return reply.code(404).send({ error: "Ação desconhecida." });
      const args = (request.body as { args?: unknown } | null)?.args;
      if (!Array.isArray(args) || args.length > 8)
        return reply.code(400).send({ error: "Argumentos inválidos." });
      const ctx = context(request);
      // The route accepts unknown arguments; each handler validates its own input.
      const handler = handlers[name as keyof typeof handlers] as (
        ctx: Context,
        ...args: unknown[]
      ) => MutationResponse | ReturnType<Queries[keyof Queries]>;
      const result = handler(ctx, ...args);
      if (
        kind === "mutation" &&
        result &&
        "room" in result &&
        result.room?.code
      )
        broadcast(result.room.code);
      return { result };
    },
  );
  app.get("/socket", { websocket: true }, (socket, request) => {
    const origin = request.headers.origin;
    if (
      origin &&
      origin !== process.env.PUBLIC_URL &&
      origin !== `${request.protocol}://${request.headers.host}`
    ) {
      socket.close(1008);
      return;
    }
    const auth = getAuth(request);
    let subscriptions = 0;
    socket.on("message", (buffer) => {
      try {
        const msg = JSON.parse(buffer.toString());
        if (++subscriptions > 30) {
          socket.close(1008);
          return;
        }
        if (typeof msg.room !== "string" || !/^[A-Z0-9]{6}$/.test(msg.room))
          return;
        channels.set(socket, {
          code: msg.room,
          userId: auth.userId,
          expires: Date.now() + 86400000,
        });
        socket.send(
          JSON.stringify({
            type: "room",
            room: service.queries.room({ auth, db }, msg.room),
          }),
        );
      } catch {
        socket.close(1008);
      }
    });
    socket.on("close", () => channels.delete(socket));
  });
  const heartbeat = setInterval(() => {
    for (const [s] of channels) {
      if (s.readyState !== 1) channels.delete(s);
      else s.ping();
    }
  }, 30000);
  heartbeat.unref();
  const webRoot = resolve("dist/client");
  if (existsSync(webRoot)) {
    await app.register(staticFiles, { root: webRoot });
    app.setNotFoundHandler((request, reply) =>
      request.method === "GET" && !request.url.startsWith("/api")
        ? reply.sendFile("index.html")
        : reply.code(404).send({ error: "Não encontrado." }),
    );
  }
  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    for (const [s] of channels) s.close();
    db.close();
  });
  return app;
}
