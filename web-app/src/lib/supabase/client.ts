// Browser Supabase client (anon key + the SSR-synced session cookie). Use ONLY
// in "use client" components — never on the server. It carries the signed-in
// user's session (read from the `sb-olimpiada-web` cookie the server writes), so
// RLS applies exactly as it does server-side. Today its sole use is the
// notification center: calling the owner-scoped notification RPCs and
// subscribing to Supabase Realtime for live inbox inserts.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Returns a singleton browser client, or `null` when Supabase is not configured
 * (skeleton/build without env) so callers can degrade gracefully instead of
 * throwing. The cookie name matches the server client so the session is shared.
 */
export function getBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: { name: "sb-olimpiada-web" },
    });
  }
  return cached;
}
