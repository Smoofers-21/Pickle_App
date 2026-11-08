import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverSecret } from "@/lib/server-env";

let client: SupabaseClient | null = null;

/**
 * Database client for server routes. Uses the secret key, so it is the only
 * thing that can read or write the tables (the browser can't: see
 * supabase/migrations). Never import this from browser code.
 */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. Add it in Vercel's environment settings.");
    client = createClient(url, serverSecret("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
