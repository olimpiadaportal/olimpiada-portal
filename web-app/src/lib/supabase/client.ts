// Browser Supabase client (anon key only). Use in Client Components.
// RLS protects all data; never trust client-side role/score/subscription state.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

export function createClient() {
  // Distinct cookie name so the web-app session never collides with the admin
  // session (both run on localhost, where cookies are shared across ports).
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { name: "sb-olimpiada-web" },
  });
}
