import { MAX_MEMBERS } from "./lobby-rules";

// Messages for screen 04 (can't join).
export const JOIN_ERRORS: Record<string, { title: string; body: string }> = {
  not_found: { title: "Code not found", body: "This code doesn't exist or has expired. Check it with the host." },
  full: { title: "Lobby is full", body: `This lobby already has ${MAX_MEMBERS} members.` },
  locked: {
    title: "Game in progress",
    body: "This lobby is locked until the game ends. Ask the host for the next code.",
  },
  removed: { title: "You were removed", body: "The host removed you from this lobby. You can join a different lobby with a new code." },
  rate_limited: { title: "Too many tries", body: "Wait a few minutes, then try again." },
  bad_name: { title: "Check your name", body: "Use 1–20 letters or numbers." },
  offline: { title: "No connection", body: "Check your signal and try again." },
  not_configured: { title: "Pickle isn't set up yet", body: "The database settings are missing on the server." },
};

export function joinError(error: string, fallback: string) {
  return JOIN_ERRORS[error] ?? { title: "Couldn't join", body: fallback };
}
