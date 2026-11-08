import "server-only";
import type { NextRequest } from "next/server";
import { db } from "./supabase";

// Two layers of rate limiting:
//   1. By device, stored in the database, so it holds across server instances.
//   2. By IP address, in this server's memory only. IP addresses are never
//      written to the database or to logs (see Security and privacy in
//      docs/build-plan.md).

export type Limit = { name: string; perDevice: number; perIp: number; windowSeconds: number };

export const LIMITS = {
  create: { name: "create", perDevice: 5, perIp: 20, windowSeconds: 60 * 60 },
  // Wrong codes only, to stop people guessing codes.
  wrongCode: { name: "wrong-code", perDevice: 10, perIp: 30, windowSeconds: 10 * 60 },
  lookup: { name: "lookup", perDevice: 60, perIp: 200, windowSeconds: 10 * 60 },
  join: { name: "join", perDevice: 20, perIp: 60, windowSeconds: 10 * 60 },
  state: { name: "state", perDevice: 400, perIp: 2000, windowSeconds: 10 * 60 },
  change: { name: "change", perDevice: 40, perIp: 200, windowSeconds: 10 * 60 },
} satisfies Record<string, Limit>;

const memory = new Map<string, { hits: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Counts one hit against the IP limit. Returns false when over the limit. */
function hitIp(request: NextRequest, limit: Limit): boolean {
  const now = Date.now();
  if (memory.size > 10_000) {
    for (const [key, entry] of memory) if (entry.resetAt <= now) memory.delete(key);
  }
  const key = `${limit.name}:${clientIp(request)}`;
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { hits: 1, resetAt: now + limit.windowSeconds * 1000 });
    return true;
  }
  entry.hits += 1;
  return entry.hits <= limit.perIp;
}

/** Counts one hit against the device limit. Returns false when over the limit. */
async function hitDevice(deviceHash: string, limit: Limit): Promise<boolean> {
  const { data, error } = await db().rpc("rate_limit_hit", {
    p_bucket: `${limit.name}:${deviceHash}`,
    p_limit: limit.perDevice,
    p_window_seconds: limit.windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

/** Counts one hit against both limits. Returns false when either is exceeded. */
export async function allow(request: NextRequest, deviceHash: string, limit: Limit): Promise<boolean> {
  const ipOk = hitIp(request, limit);
  const deviceOk = await hitDevice(deviceHash, limit);
  return ipOk && deviceOk;
}

/** True when this device or IP is already over the limit, without counting a hit. */
export async function isBlocked(request: NextRequest, deviceHash: string, limit: Limit): Promise<boolean> {
  const entry = memory.get(`${limit.name}:${clientIp(request)}`);
  if (entry && entry.resetAt > Date.now() && entry.hits >= limit.perIp) return true;
  const { data, error } = await db()
    .from("rate_limits")
    .select("hits, reset_at")
    .eq("bucket", `${limit.name}:${deviceHash}`)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && new Date(data.reset_at).getTime() > Date.now() && data.hits >= limit.perDevice);
}
