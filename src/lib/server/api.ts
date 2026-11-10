import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getDevice, saveDevice, type Device } from "./device";
import { isDatabaseConfigured } from "./supabase";

const MAX_BODY_BYTES = 2048;

export function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function ok(body: unknown, device?: Device) {
  const response = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  return device ? saveDevice(response, device) : response;
}

export const tooMany = () =>
  fail(429, "rate_limited", "Too many tries. Wait a few minutes and try again.");

/**
 * Wraps a POST route: only accepts requests from our own pages, reads a small
 * JSON body, gets the device, and turns unexpected errors into a plain
 * message (never echoing internal details).
 */
export function route(
  handler: (args: {
    request: NextRequest;
    body: Record<string, unknown>;
    device: Device;
    params: Record<string, string>;
  }) => Promise<Response>,
) {
  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return fail(403, "bad_origin", "This request must come from the Pickle app.");
    }
    if (!isDatabaseConfigured()) {
      return fail(503, "not_configured", "Pickle's database isn't set up yet.");
    }

    let body: Record<string, unknown> = {};
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, "too_large", "That request is too large.");
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      } catch {
        return fail(400, "bad_json", "That request couldn't be read.");
      }
    }

    try {
      const params = await context.params;
      return await handler({ request, body, device: getDevice(request), params });
    } catch (err) {
      // Log the error type only: no IP addresses, tokens or request bodies.
      console.error("Route failed:", request.nextUrl.pathname, err instanceof Error ? err.message : "unknown error");
      return fail(500, "server_error", "Something went wrong. Try again.");
    }
  };
}
