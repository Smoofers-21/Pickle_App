import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ db: () => ({ rpc }) }));
import { allow } from "./rate-limit";

beforeEach(() => rpc.mockReset());

describe("rate limiting", () => {
  it("stops database work after the IP budget is exhausted", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const request = new NextRequest("https://pickle.test", { headers: { "x-real-ip": "192.0.2.1" } });
    const limit = { name: "test-ip", perDevice: 10, perIp: 1, windowSeconds: 60 };
    expect(await allow(request, "device-a", limit)).toBe(true);
    expect(await allow(request, "device-b", limit)).toBe(false);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("still enforces the device budget when the IP is allowed", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const request = new NextRequest("https://pickle.test", { headers: { "x-real-ip": "192.0.2.2" } });
    expect(await allow(request, "device", { name: "test-device", perDevice: 1, perIp: 10, windowSeconds: 60 })).toBe(false);
  });
});
