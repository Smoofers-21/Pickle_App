import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// Each phone gets a long random token in an HTTP-only cookie: page scripts
// can't read it, and it is the only thing that identifies a member. The
// database stores only its SHA-256 hash.

const COOKIE = "pickle_device";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Device = { token: string; hash: string; isNew: boolean };

export function getDevice(request: NextRequest): Device {
  const existing = request.cookies.get(COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
    return { token: existing, hash: hashToken(existing), isNew: false };
  }
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), isNew: true };
}

/** Saves a new device token on the phone. */
export function saveDevice(response: NextResponse, device: Device): NextResponse {
  if (device.isNew) {
    response.cookies.set(COOKIE, device.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
