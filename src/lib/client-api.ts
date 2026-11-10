// Calls our own server routes from the phone. The device cookie travels with
// every request automatically; page scripts never see it.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

export async function post<T>(path: string, body: unknown = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
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
