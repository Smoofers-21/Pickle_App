import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-env", () => ({ serverSecret: () => "synthetic-provider-marker" }));
import { geoapify, ProviderError, searchEvents } from "./providers";

const area = { lat: 30.267, lng: -97.743, radiusMi: 5 };
const context = { now: new Date("2026-11-11T18:00:00Z"), timeZone: "America/Chicago" };
const search = () => geoapify.search(area, "food", context);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("provider HTTP boundary", () => {
  it("cancels an oversized chunked response before waiting for EOF", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(3_000_001)); }, cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(search()).rejects.toMatchObject({ code: "too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces bytes rather than JavaScript character count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "界".repeat(1_000_001) }))));
    await expect(search()).rejects.toMatchObject({ code: "too_large" });
  });

  it("converts response stream errors to safe provider errors", async () => {
    const body = new ReadableStream({ start(c) { c.error(new Error("private-url-and-location")); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(search()).rejects.toMatchObject({ name: "ProviderError", code: "network", message: "provider_network" });
  });

  it("times out an idle response body as well as the initial fetch", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream())));
    const pending = expect(search()).rejects.toMatchObject({ code: "timeout" });
    controller.abort(new DOMException("private timeout detail", "TimeoutError"));
    await pending;
  });

  it("does not wait for an HTTP error body's cancellation", async () => {
    const body = new ReadableStream({ cancel: () => new Promise(() => {}) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 429 })));
    await expect(search()).rejects.toMatchObject({ code: "http", status: 429 });
  });

  it("sends the Geoapify key only in a header and retains raw page consumption", async () => {
    const features = Array.from({ length: 100 }, () => ({}));
    const fetcher = vi.fn().mockResolvedValue(Response.json({ features }));
    vi.stubGlobal("fetch", fetcher);
    const page = await search();
    expect(page).toMatchObject({ candidates: [], more: true, consumed: 100 });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).not.toContain("synthetic-provider-marker");
    expect(init.headers["x-api-key"]).toBe("synthetic-provider-marker");
    expect(init.redirect).toBe("error");
  });

  it("classifies malformed event responses rather than reporting no events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ errors: [{ detail: "private" }] })));
    await expect(searchEvents(area, "2026-11-14")).rejects.toBeInstanceOf(ProviderError);
  });
});
