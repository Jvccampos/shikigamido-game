import { test } from "node:test";
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { starterDeck } from "../shared/practice.js";
import type { MutationResponse, PublicRoom } from "../shared/room.js";
import type { RoomMessage } from "../shared/protocol.js";

test(
  "a crashed server recovers the active match, sessions and socket views, then accepts the next move",
  { timeout: 20000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "shiki-recovery-"));
    let child: ChildProcess | undefined,
      port = 0;
    const sockets: WebSocket[] = [];
    async function boot() {
      child = fork(
        new URL("./fixtures/restart-server.ts", import.meta.url),
        [],
        {
          execArgv: ["--import", "tsx"],
          env: {
            ...process.env,
            NODE_ENV: "test",
            PORT: String(port),
            DATABASE_PATH: join(dir, "game.db"),
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
          },
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        },
      );
      const [message] = await once(child, "message", {
        signal: AbortSignal.timeout(5000),
      });
      port = (message as { port: number }).port;
    }
    async function post<T>(
      path: string,
      cookie: string,
      body: unknown,
    ): Promise<T> {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200);
      return r.json() as Promise<T>;
    }
    const mutate = async (cookie: string, name: string, ...args: unknown[]) => {
      const r = await post<{ result: MutationResponse }>(
        `/api/mutation/${name}`,
        cookie,
        { args },
      );
      return r.result;
    };
    const room = async (cookie: string, code: string) => {
      const r = await post<{ result: PublicRoom }>("/api/query/room", cookie, {
        args: [code],
      });
      assert(r.result.status !== "waiting");
      return r.result;
    };
    async function subscribe(cookie: string, code: string) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`, {
        headers: { Cookie: cookie },
      });
      sockets.push(socket);
      await once(socket, "open", { signal: AbortSignal.timeout(3000) });
      const initial = once(socket, "message", {
        signal: AbortSignal.timeout(3000),
      });
      socket.send(JSON.stringify({ room: code }));
      const [data] = await initial;
      const message: RoomMessage = JSON.parse(data.toString());
      return { socket, snapshot: message.room };
    }
    try {
      await boot();
      const cookies: string[] = [];
      for (const name of ["Recovery A", "Recovery B", "Recovery spectator"]) {
        const r = await fetch(`http://127.0.0.1:${port}/api/auth/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        assert.equal(r.status, 200);
        cookies.push(r.headers.get("set-cookie")!.split(";")[0]);
      }
      const decks = [];
      for (const [i, element] of ["agua", "fogo"].entries()) {
        const saved = await mutate(
          cookies[i],
          "saveDeck",
          starterDeck(element),
        );
        assert(saved.deck);
        decks.push(saved.deck);
      }
      const created = await mutate(cookies[0], "createRoom", decks[0].id);
      assert(created.room);
      const code = created.room.code;
      await mutate(cookies[1], "joinRoom", code, decks[1].id, false);
      await mutate(cookies[2], "joinRoom", code, undefined, true);
      const assigned = await mutate(cookies[0], "lobbyCommand", code, {
        type: "seat",
        seat: 1,
        userId: decks[1].ownerId,
      });
      assert(!assigned.error);
      await mutate(cookies[0], "lobbyCommand", code, { type: "start" });
      await mutate(cookies[0], "gameCommand", code, { type: "ready", y: 2 }, 0);
      await mutate(cookies[1], "gameCommand", code, { type: "ready", y: 4 }, 0);
      let current = await room(cookies[0], code);
      while (current.state.phase === 1) {
        const result = await mutate(
          cookies[current.state.priority],
          "gameCommand",
          code,
          { type: "pass" },
          current.state.revision,
        );
        assert(!result.error);
        current = await room(cookies[0], code);
      }
      const seat = current.state.priority,
        cookie = cookies[seat];
      const leader = current.state.units.find(
        (u) => u.kind === "omionji" && u.owner === seat,
      )!;
      const moved = await mutate(
        cookie,
        "gameCommand",
        code,
        { type: "move", unitId: leader.id, x: leader.x, y: 3 },
        current.state.revision,
      );
      assert(!moved.error);
      const before = await room(cookie, code),
        spectatorBefore = await room(cookies[2], code);
      const subscription = await subscribe(cookies[2], code);
      assert.deepEqual(subscription.snapshot, spectatorBefore);
      const lost = once(subscription.socket, "close", {
        signal: AbortSignal.timeout(5000),
      });
      const exited = once(child!, "exit", {
        signal: AbortSignal.timeout(5000),
      });
      child!.kill("SIGKILL");
      await exited;
      await lost;
      await boot();
      assert.deepEqual(
        await room(cookie, code),
        before,
        "same persisted match and authenticated seat",
      );
      const reconnected = await subscribe(cookies[2], code);
      assert.deepEqual(reconnected.snapshot, spectatorBefore);
      assert(
        spectatorBefore.state.players.every(
          (p) => p.hand.length === 0 && p.library.length === 0,
        ),
      );
      const stale = await mutate(
        cookie,
        "gameCommand",
        code,
        { type: "move", unitId: leader.id, x: leader.x, y: 3 },
        current.state.revision,
      );
      assert.match(stale.error || "", /atualizada/);
      assert.deepEqual(await room(cookie, code), before);
      const broadcast = once(reconnected.socket, "message", {
        signal: AbortSignal.timeout(3000),
      });
      const next = await mutate(
        cookie,
        "gameCommand",
        code,
        { type: "pass" },
        before.state.revision,
      );
      assert(!next.error);
      const after = await room(cookie, code);
      assert.equal(after.state.revision, before.state.revision! + 1);
      assert.equal(after.state.units.find((u) => u.id === leader.id)?.y, 3);
      const [data] = await broadcast;
      const message: RoomMessage = JSON.parse(data.toString());
      assert.deepEqual(message.room, await room(cookies[2], code));
      const saved = await post<{ result: typeof decks }>(
        "/api/query/myDecks",
        cookie,
        { args: [] },
      );
      assert.equal(saved.result[0].id, decks[seat].id);
    } finally {
      for (const socket of sockets) socket.terminate();
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit", {
          signal: AbortSignal.timeout(5000),
        });
        child.kill("SIGTERM");
        await exited;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
