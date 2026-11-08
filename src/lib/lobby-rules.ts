// Rules shared by the server routes and the screens.

export const MAX_MEMBERS = 10;

// Lobby codes: 6 characters with no look-alikes (no 0/O, no 1/I).
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export const NAME_MAX = 20;
// Letters (any language), numbers, spaces, and ' . - inside the name.
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} '.\-]*$/u;

export function isValidCode(code: unknown): code is string {
  return typeof code === "string" && CODE_PATTERN.test(code);
}

/** Uppercases a typed code and drops characters that can't be in one. */
export function cleanCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

/** Trims and collapses spaces. Returns null when the name isn't allowed. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > NAME_MAX) return null;
  if (!NAME_PATTERN.test(name)) return null;
  return name;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
