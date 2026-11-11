import "server-only";

// Secret keys, readable only by server code. Importing this file from a
// component that runs in the browser fails the build ("server-only"), so the
// keys can never be bundled into the phone's JavaScript.
//
// These are set in Vercel's environment settings (and in .env.local for local
// development). They must never use the NEXT_PUBLIC_ prefix.
export type ServerSecret =
  | "SUPABASE_SECRET_KEY" // milestone 2
  | "GEOAPIFY_API_KEY" // milestone 4
  | "TICKETMASTER_API_KEY"; // milestone 4

export function serverSecret(name: ServerSecret): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server setting ${name}. Add it in Vercel's environment settings.`);
  }
  return value;
}
