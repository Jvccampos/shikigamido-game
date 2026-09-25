import type { Queries } from "../shared/protocol.js";
import type { MutationResponse } from "../shared/room.js";
import service from "./index.js";
import type { Context, GameDatabase } from "./database.js";

export type Auth = { userId: string | null; displayName: string };
export type Member = { userId: string | null; expires: number };
/** Delivers room views to the open sockets; the app decides what each one sees. */
export type Sockets = {
  broadcast(code: string, render: (member: Member) => string): void;
  disconnect(userId: string): void;
};

const SESSION_DAYS = 30;
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

/** Sliding one-minute request counter per key. */
function rateLimiter() {
  const hits = new Map<string, number[]>();
  let calls = 0;
  return (key: string, max: number) => {
    const now = Date.now(),
      since = now - 60000;
    if (++calls % 1000 === 0)
      for (const [k, list] of hits)
        if (list[list.length - 1] <= since) hits.delete(k);
    const list = (hits.get(key) || []).filter((t) => t > since);
    const allowed = list.length < max;
    if (allowed) list.push(now);
    hits.set(key, list);
    return allowed;
  };
}

export function createApp({
  db,
  publicUrl,
  sockets,
}: {
  db: GameDatabase;
  publicUrl: string;
  sockets: Sockets;
}) {
  const cookieAttributes = `Path=/; HttpOnly; SameSite=Lax${publicUrl.startsWith("https:") ? "; Secure" : ""}`;
  const limit = rateLimiter();
  async function authenticate(request: Request): Promise<Auth> {
    const token = readCookie(request, "shiki_session");
    if (!token) return { userId: null, displayName: "" };
    const u = db.raw
      .prepare(
        "SELECT u.id,u.name FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires>?",
      )
      .get(await hash(token), Date.now()) as
      { id: string; name: string } | undefined;
    return u
      ? { userId: u.id, displayName: u.name }
      : { userId: null, displayName: "" };
  }
  const originAllowed = (request: Request) => {
    const origin = request.headers.get("origin");
    return (
      !origin || origin === new URL(request.url).origin || origin === publicUrl
    );
  };
  const roomMessage = (code: string, userId: string | null) =>
    JSON.stringify({
      type: "room",
      room: service.queries.room(
        { auth: { userId, displayName: "" }, db },
        code,
      ),
    });
  async function newSession(id: string) {
    const token = newToken();
    db.raw
      .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)")
      .run(await hash(token), id, Date.now() + SESSION_DAYS * 86400000);
    return `shiki_session=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieAttributes}`;
  }
  // Workers expect the request body to be consumed before any response.
  function parse(text: string) {
    if (text.length > 128 * 1024)
      throw json({ error: "Corpo grande demais." }, 413);
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw json({ error: "JSON inválido." }, 400);
    }
  }
  async function handle(request: Request, body: string, clientIp: string) {
    const { pathname } = new URL(request.url);
    const method = request.method;
    if (method === "GET" && pathname === "/healthz") return json({ ok: true });
    if (!pathname.startsWith("/api/"))
      return json({ error: "Não encontrado." }, 404);
    const guest = method === "POST" && pathname === "/api/auth/guest";
    if (!limit(guest ? `guest:${clientIp}` : clientIp, guest ? 12 : 300))
      return json(
        { error: "Muitas requisições. Tente novamente em instantes." },
        429,
        { "Retry-After": "60" },
      );
    if (method === "POST" && !originAllowed(request))
      return json({ error: "Origem inválida." }, 403);
    if (method === "GET" && pathname === "/api/auth") {
      const auth = await authenticate(request);
      return json({
        ...auth,
        isAuthenticated: !!auth.userId,
        isLoading: false,
      });
    }
    if (guest) {
      const name = (parse(body) as { name?: unknown } | null)?.name;
      if (typeof name !== "string" || !name.trim() || name.length > 40)
        return json({ error: "Escolha um nome de até 40 caracteres." }, 400);
      const current = await authenticate(request);
      if (current.userId) {
        db.raw
          .prepare("UPDATE users SET name=? WHERE id=?")
          .run(name.trim(), current.userId);
        return json({ ok: true });
      }
      const id = crypto.randomUUID();
      db.raw
        .prepare("INSERT INTO users(id,name) VALUES (?,?)")
        .run(id, name.trim());
      return json({ ok: true }, 200, { "Set-Cookie": await newSession(id) });
    }
    if (method === "POST" && pathname === "/api/auth/logout") {
      const token = readCookie(request, "shiki_session");
      if (token) {
        const id = (await authenticate(request)).userId;
        db.raw
          .prepare("DELETE FROM sessions WHERE hash=?")
          .run(await hash(token));
        if (id) sockets.disconnect(id);
      }
      return json({ ok: true }, 200, {
        "Set-Cookie": `shiki_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${cookieAttributes}`,
      });
    }
    const route = /^\/api\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (method !== "POST" || !route)
      return json({ error: "Não encontrado." }, 404);
    const [, kind, name] = route;
    const handlers =
      kind === "query"
        ? service.queries
        : kind === "mutation"
          ? service.mutations
          : null;
    if (!handlers || !Object.hasOwn(handlers, name))
      return json({ error: "Ação desconhecida." }, 404);
    const args = (parse(body) as { args?: unknown } | null)?.args;
    if (!Array.isArray(args) || args.length > 8)
      return json({ error: "Argumentos inválidos." }, 400);
    const ctx: Context = { auth: await authenticate(request), db };
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
    ) {
      const code = result.room.code;
      sockets.broadcast(code, (member) => roomMessage(code, member.userId));
    }
    return json({ result });
  }
  return {
    authenticate,
    originAllowed,
    roomMessage,
    async fetch(request: Request, clientIp: string): Promise<Response> {
      try {
        const body = request.method === "POST" ? await request.text() : "";
        return await handle(request, body, clientIp);
      } catch (error) {
        if (error instanceof Response) return error;
        console.error(error);
        return json({ error: "Erro interno." }, 500);
      }
    },
  };
}
export type App = ReturnType<typeof createApp>;
