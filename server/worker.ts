import { DurableObject } from "cloudflare:workers";
import { createApp, type App } from "./app.js";
import { openDatabase } from "./database.js";
import { durableSqliteDriver } from "./sqlite-durable.js";

const forwarded = (path: string) =>
  path === "/socket" ||
  path === "/healthz" ||
  path.startsWith("/api/") ||
  path.startsWith("/admin/");

export default {
  async fetch(request, env) {
    if (!forwarded(new URL(request.url).pathname))
      return Response.json({ error: "Não encontrado." }, { status: 404 });
    // One instance holds every room, like the single Node process did.
    return env.GAME.getByName("v1").fetch(request);
  },
} satisfies ExportedHandler<Env>;

type Attachment = {
  userId: string | null;
  subscriptions: number;
  code?: string;
  expires?: number;
};
const tables = {
  users: ["id", "name"],
  sessions: ["hash", "user_id", "expires"],
  decks: ["id", "body"],
  rooms: ["id", "body"],
} as const;
type Dump = Record<keyof typeof tables, Record<string, string | number>[]>;

export class Game extends DurableObject<Env> {
  #app?: App;
  get app() {
    return (this.#app ??= createApp({
      db: openDatabase(durableSqliteDriver(this.ctx.storage)),
      publicUrl: this.env.PUBLIC_URL,
      sockets: {
        broadcast: (code, render) => {
          for (const ws of this.ctx.getWebSockets()) {
            const member = ws.deserializeAttachment() as Attachment | null;
            if (member?.code !== code || member.expires === undefined) continue;
            try {
              if (member.expires < Date.now())
                ws.close(1008, "Session expired");
              else
                ws.send(
                  render({ userId: member.userId, expires: member.expires }),
                );
            } catch {
              // The socket is already closing; the mutation still succeeded.
            }
          }
        },
        disconnect: (userId) => {
          for (const ws of this.ctx.getWebSockets())
            if (
              (ws.deserializeAttachment() as Attachment | null)?.userId ===
              userId
            )
              ws.close(1000);
        },
      },
    }));
  }

  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/socket") return this.upgrade(request);
    if (pathname.startsWith("/admin/")) return this.admin(request, pathname);
    return this.app.fetch(
      request,
      request.headers.get("CF-Connecting-IP") || "local",
    );
  }

  async upgrade(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket", { status: 426 });
    if (!this.app.originAllowed(request))
      return new Response("Origem inválida.", { status: 403 });
    const auth = await this.app.authenticate(request);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      userId: auth.userId,
      subscriptions: 0,
    } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const member = ws.deserializeAttachment() as Attachment;
    const text =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text.length > 2048) return ws.close(1009);
    try {
      const msg = JSON.parse(text);
      if (++member.subscriptions > 30) return ws.close(1008);
      ws.serializeAttachment(member);
      if (typeof msg.room !== "string" || !/^[A-Z0-9]{6}$/.test(msg.room))
        return;
      ws.serializeAttachment({
        ...member,
        code: msg.room,
        expires: Date.now() + 86400000,
      } satisfies Attachment);
      ws.send(this.app.roomMessage(msg.room, member.userId));
    } catch {
      ws.close(1008);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code);
    } catch {
      // Already closed, or a status code that cannot be echoed.
    }
  }

  async admin(request: Request, pathname: string) {
    const body = request.method === "POST" ? await request.text() : "";
    const token = this.env.ADMIN_TOKEN;
    const given = /^Bearer (.+)$/.exec(
      request.headers.get("Authorization") || "",
    )?.[1];
    const digest = (s: string) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    if (
      !token ||
      !given ||
      !crypto.subtle.timingSafeEqual(await digest(token), await digest(given))
    )
      return Response.json({ error: "Não autorizado." }, { status: 401 });
    const sql = this.ctx.storage.sql;
    void this.app; // Creates the tables on a fresh instance.
    if (request.method === "GET" && pathname === "/admin/export")
      return Response.json(
        Object.fromEntries(
          Object.keys(tables).map((t) => [
            t,
            sql.exec(`SELECT * FROM ${t}`).toArray(),
          ]),
        ),
      );
    if (request.method === "POST" && pathname === "/admin/import") {
      let dump: Dump;
      try {
        dump = JSON.parse(body);
      } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
      }
      const valid = Object.entries(tables).every(
        ([t, columns]) =>
          Array.isArray(dump?.[t as keyof Dump]) &&
          dump[t as keyof Dump].every((row) =>
            columns.every((c) =>
              ["string", "number"].includes(typeof row?.[c]),
            ),
          ),
      );
      if (!valid)
        return Response.json({ error: "Formato inválido." }, { status: 400 });
      const used = ["users", "decks", "rooms"].some(
        (t) => sql.exec(`SELECT 1 FROM ${t} LIMIT 1`).toArray().length,
      );
      if (used)
        return Response.json(
          { error: "O banco já contém dados." },
          { status: 409 },
        );
      this.ctx.storage.transactionSync(() => {
        for (const [t, columns] of Object.entries(tables))
          for (const row of dump[t as keyof Dump])
            sql.exec(
              `INSERT INTO ${t}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
              ...columns.map((c) => row[c]),
            );
      });
      return Response.json(
        Object.fromEntries(
          Object.keys(tables).map((t) => [t, dump[t as keyof Dump].length]),
        ),
      );
    }
    return Response.json({ error: "Não encontrado." }, { status: 404 });
  }
}
