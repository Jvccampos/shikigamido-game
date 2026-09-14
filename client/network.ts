import { useCallback, useEffect, useState } from "preact/hooks";
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
async function request(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
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
export function useQuery<T>(name: string, args: any[] = []) {
  const key = JSON.stringify(args),
    [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [isLoading, setLoading] = useState(true);
  const refetch = useCallback(async () => {
    try {
      const result = await request(`/api/query/${name}`, {
        args: JSON.parse(key),
      });
      setData(result.result);
      setError("");
      return result.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sem conexão.");
    } finally {
      setLoading(false);
    }
  }, [name, key]);
  useEffect(() => {
    void refetch();
    invalidators.add(refetch);
    return () => invalidators.delete(refetch);
  }, [refetch]);
  useEffect(() => {
    if (name !== "room" || !args[0]) return;
    let socket: WebSocket,
      timer: ReturnType<typeof setTimeout>,
      closed = false;
    let delay = 500;
    function connect() {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket`,
      );
      socket.onopen = () => {
        delay = 500;
        socket.send(JSON.stringify({ room: args[0] }));
      };
      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "room") {
            setData(message.room);
            setError("");
          }
        } catch {}
      };
      socket.onclose = () => {
        if (!closed) {
          setError("Reconectando…");
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 8000);
        }
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [name, key, auth.userId]);
  return { data, error, isLoading, refetch };
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
