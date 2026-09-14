import { useCallback, useEffect, useRef, useState } from "preact/hooks";
type Auth = {
  userId: string | null;
  displayName: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  googleEnabled?: boolean;
};
let auth: Auth = {
  userId: null,
  displayName: "",
  isAuthenticated: false,
  isLoading: true,
};
const authListeners = new Set<() => void>(),
  invalidators = new Set<() => void>();
async function request(url: string, body?: unknown, signal?: AbortSignal) {
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
  auth = await request("/api/auth");
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
export function useQuery<T>(name: string, args: unknown[] = []) {
  const key = JSON.stringify(args);
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [isLoading, setLoading] = useState(true);
  const pending = useRef<AbortController>();
  const refetch = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const result = await request(
        `/api/query/${name}`,
        { args: JSON.parse(key) },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result.result);
      setError("");
      return result.result;
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Sem conexão.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
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
  return { data, error, isLoading, refetch };
}

// HTTP command replies and socket snapshots pass through the same revision check.
export function useRoom(code: string, active: boolean) {
  const [snapshot, setSnapshot] = useState<{
      identity: string;
      room: any;
    } | null>(null),
    [error, setError] = useState("");
  const userId = useAuth().userId;
  const identity = `${code}:${userId}`;
  const current = useRef(identity);
  current.current = identity;
  const receive = useCallback(
    (room: any) => {
      if (current.current !== identity || room?.code !== code) return;
      setSnapshot((previous) => {
        if (
          previous?.identity === identity &&
          (previous.room.state?.revision ?? -1) > (room.state?.revision ?? -1)
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
    void request("/api/query/room", { args: [code] }, controller.signal)
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
          const message = JSON.parse(e.data);
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
export function useMutation<A extends any[], R>(name: string) {
  const [isLoading, setLoading] = useState(false),
    [error, setError] = useState("");
  const mutate = useCallback(
    async (...args: A): Promise<R> => {
      setLoading(true);
      try {
        const data = await request(`/api/mutation/${name}`, { args });
        setError("");
        return data.result;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sem conexão.");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [name],
  );
  return { mutate, isLoading, error };
}
