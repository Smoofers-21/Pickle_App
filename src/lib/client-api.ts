// Calls our own server routes from the phone. The device cookie travels with
// every request automatically; page scripts never see it.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

/**
 * Longest wait for one request. The slowest route (a lobby refresh that runs
 * a search) is capped at 30 seconds on the server; a request that hangs
 * longer would otherwise hold up every later lobby refresh.
 */
const TIMEOUT_MS = 35_000;

export async function post<T>(path: string, body: unknown = {}, method: "POST" | "DELETE" = "POST"): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "server_error",
        message: typeof data.message === "string" ? data.message : "Something went wrong. Try again.",
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "offline", message: "No connection. Check your signal and try again." };
  }
}
