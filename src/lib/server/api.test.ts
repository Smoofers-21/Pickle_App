import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ isDatabaseConfigured: () => true }));

import { errorLabel, ok, route } from "./api";

const context = { params: Promise.resolve({}) };
const request = (body: string, origin = "https://pickle.test") => new NextRequest("https://pickle.test/api/lobbies", {
  method: "POST", headers: { origin, host: "pickle.test" }, body,
});

afterEach(() => vi.restoreAllMocks());

describe("API request boundary", () => {
  it.each(["null", "not a url", "https://evil.test", "ftp://pickle.test"])("rejects origin %s", async (origin) => {
    const handler = vi.fn(async () => ok({}));
    const response = await route(handler)(request("{}", origin), context);
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts a valid body at the byte limit", async () => {
    const name = "a".repeat(2037); // JSON adds 11 bytes
    const response = await route(async ({ body }) => ok(body))(request(JSON.stringify({ name })), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name });
  });

  it("rejects oversized multibyte JSON before reaching a handler", async () => {
    const handler = vi.fn(async () => ok({}));
    const response = await route(handler)(request(JSON.stringify({ name: "界".repeat(700) })), context);
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels an oversized stream without waiting for its end", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel,
    });
    const req = new NextRequest("https://pickle.test/api/lobbies", {
      method: "POST", headers: { origin: "https://pickle.test", host: "pickle.test" }, body,
    });
    const response = await route(async () => ok({}))(req, context);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("returns bad_json for malformed JSON", async () => {
    const response = await route(async () => ok({}))(request("{"), context);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_json");
  });

  it("does not log upstream error messages", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await route(async () => { throw new Error("sensitive upstream detail"); })(request("{}"), context);
    expect(response.status).toBe(500);
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive upstream detail");
    expect(await response.json()).toMatchObject({ error: "server_error" });
  });
});

describe("errorLabel", () => {
  it("keeps the type and a database error code, never the message", () => {
    expect(errorLabel(Object.assign(new Error("secret detail"), { code: "42703" }))).toBe("Error 42703");
    expect(errorLabel({ message: "secret detail", code: "PGRST116" })).toBe("DatabaseError PGRST116");
    expect(errorLabel({ code: "not a code; drop table" })).toBe("DatabaseError");
    expect(errorLabel("boom")).toBe("unknown error");
  });
});
