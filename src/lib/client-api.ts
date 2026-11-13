// Calls our own server routes from the phone. The device cookie travels with
// every request automatically; page scripts never see it.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

/**
 * Longest wait for one request. The slowest route (a lobby refresh that runs
 * a search) is capped at 30 seconds on the server; a request that hangs
 * longer would otherwise hold up every later lobby refresh.
 */
const TIMEOUT_MS = 35_000;

const OFFLINE = { ok: false, error: "offline", message: "No connection. Check your signal and try again." } as const;
/** A success whose body was cut off or isn't JSON: never treated as success. */
const BROKEN = { ok: false, error: "bad_response", message: "Something went wrong. Try again." } as const;

export async function post<T>(path: string, body: unknown = {}, method: "POST" | "DELETE" = "POST"): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return OFFLINE;
  }

  // Reading the body can also time out or fail part way.
  let data: unknown;
  let parsed = true;
  try {
    data = await res.json();
  } catch {
    parsed = false;
  }

  if (res.ok) {
    if (!parsed || data === null || typeof data !== "object") return BROKEN;
    return { ok: true, data: data as T };
  }
  const err = (parsed && data !== null && typeof data === "object" ? data : {}) as { error?: unknown; message?: unknown };
  return {
    ok: false,
    error: typeof err.error === "string" ? err.error : "server_error",
    message: typeof err.message === "string" ? err.message : "Something went wrong. Try again.",
  };
}
