import { afterEach, describe, expect, it, vi } from "vitest";
import { post } from "./client-api";

function respond(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "Content-Type": "application/json" } })));
}

afterEach(() => vi.unstubAllGlobals());

describe("post", () => {
  it("returns the data of a good answer", async () => {
    respond(200, '{"code":"ABCDEF"}');
    expect(await post("/x")).toEqual({ ok: true, data: { code: "ABCDEF" } });
  });

  it("never treats a broken or empty success as success", async () => {
    for (const body of ['{"status":"o', "", "null", '"text"', "42"]) {
      respond(200, body);
      const res = await post("/x");
      expect(res.ok, body).toBe(false);
      if (!res.ok) expect(res.error).toBe("bad_response");
    }
  });

  it("passes on the server's error, or a plain one", async () => {
    respond(403, '{"error":"not_host","message":"Only the host can do that."}');
    expect(await post("/x")).toEqual({ ok: false, error: "not_host", message: "Only the host can do that." });
    respond(500, "<html>oops</html>");
    expect(await post("/x")).toEqual({ ok: false, error: "server_error", message: "Something went wrong. Try again." });
  });

  it("reports no connection when the request fails or times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }));
    const res = await post("/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("offline");
  });

  it("treats a body cut off part way as broken", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"status":'));
        c.error(new DOMException("aborted", "AbortError"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200 })));
    const res = await post("/x");
    expect(res.ok).toBe(false);
  });
});
