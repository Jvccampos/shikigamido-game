import type { Queries, Mutations, RoomMessage } from "../shared/protocol.js";
import type { PublicRoom } from "../shared/room.js";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
type Auth = {
  userId: string | null;
  displayName: string;
  isAuthenticated: boolean;
  isLoading: boolean;
};
let auth: Auth = {
  userId: null,
  displayName: "",
  isAuthenticated: false,
  isLoading: true,
};
const authListeners = new Set<() => void>(),
  invalidators = new Set<() => void>();
async function request<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Falha de conexão.");
  return value;
}
async function refreshAuth() {
  auth = await request<Auth>("/api/auth");
  for (const listener of authListeners) listener();
  for (const invalidate of invalidators) invalidate();
}
export function useAuth() {
  const [, update] = useState(0);
  useEffect(() => {
    const listener = () => update((v) => v + 1);
    authListeners.add(listener);
    if (auth.isLoading)
      void refreshAuth().catch(() => {
        auth = { ...auth, isLoading: false };
        listener();
      });
    return () => authListeners.delete(listener);
  }, []);
  return auth;
}
export async function signOut() {
  await request("/api/auth/logout", {});
  await refreshAuth();
}
export function openLogin() {
  window.dispatchEvent(new CustomEvent("shiki:login"));
}
export async function enterAsGuest(name: string) {
  await request("/api/auth/guest", { name });
  await refreshAuth();
}
export function useQuery<K extends keyof Queries>(
  name: K,
  ...args: Parameters<Queries[K]>
) {
  const key = JSON.stringify(args);
  const [data, setData] = useState<ReturnType<Queries[K]>>();
  const pending = useRef<AbortController>();
  const refetch = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await request<{ result: ReturnType<Queries[K]> }>(
        `/api/query/${name}`,
        { args: JSON.parse(key) },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result.result);
      return result.result;
    } catch {
      // Keep the last snapshot when a refresh fails.
      return undefined;
    }
  }, [name, key]);
  useEffect(() => {
    const invalidate = () => {
      setData(undefined);
      void refetch();
    };
    invalidate();
    invalidators.add(invalidate);
    return () => {
      invalidators.delete(invalidate);
      pending.current?.abort();
    };
  }, [refetch]);
  return { data, refetch };
}

// HTTP command replies and socket snapshots pass through the same revision check.
export function useRoom(code: string, active: boolean) {
  const [snapshot, setSnapshot] = useState<{
      identity: string;
      room: PublicRoom;
    } | null>(null),
    [error, setError] = useState("");
  const userId = useAuth().userId;
  const identity = `${code}:${userId}`;
  const current = useRef(identity);
  current.current = identity;
  const receive = useCallback(
    (room: PublicRoom | null) => {
      if (current.current !== identity || room?.code !== code) return;
      setSnapshot((previous) => {
        if (
          previous?.identity === identity &&
          (previous.room.status === "waiting"
            ? -1
            : (previous.room.state.revision ?? -1)) >
            (room.status === "waiting" ? -1 : (room.state.revision ?? -1))
        )
          return previous;
        return { identity, room };
      });
      setError("");
    },
    [code, identity],
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active || !code) return;
    let socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      closed = false,
      delay = 500;
    const controller = new AbortController();
    void request<{ result: PublicRoom | null }>(
      "/api/query/room",
      { args: [code] },
      controller.signal,
    )
      .then((result) => {
        if (!closed) receive(result.result);
      })
      .catch((e) => {
        if (!closed) setError(e instanceof Error ? e.message : "Sem conexão.");
      });
    function connect() {
      const connection = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket`,
      );
      socket = connection;
      connection.onopen = () => {
        delay = 500;
        connection.send(JSON.stringify({ room: code }));
      };
      connection.onmessage = (e) => {
        if (closed) return;
        try {
          const message: RoomMessage = JSON.parse(e.data);
          if (message.type === "room") receive(message.room);
        } catch {
          setError("Resposta inválida. Reconectando…");
          connection.close();
        }
      };
      connection.onclose = () => {
        if (!closed) {
          setError("Reconectando…");
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 8000);
        }
      };
      connection.onerror = () => connection.close();
    }
    connect();
    return () => {
      closed = true;
      controller.abort();
      clearTimeout(timer);
      socket?.close();
    };
  }, [active, code, receive, retry]);
  return {
    data: snapshot?.identity === identity ? snapshot.room : null,
    error,
    receive,
    refetch: () => setRetry((n) => n + 1),
  };
}
export async function mutate<K extends keyof Mutations>(
  name: K,
  ...args: Parameters<Mutations[K]>
): Promise<ReturnType<Mutations[K]>> {
  const data = await request<{ result: ReturnType<Mutations[K]> }>(
    `/api/mutation/${name}`,
    { args },
  );
  return data.result;
}
