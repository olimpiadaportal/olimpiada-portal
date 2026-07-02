// Browser Supabase client (anon key only). Use in Client Components.
// Admin authorization is enforced server-side and by RLS; the browser client
// never gets elevated privileges.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

export function createClient() {
  // Distinct cookie name so the admin session never collides with the web-app
  // session (both run on localhost, where cookies are shared across ports).
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { name: "sb-olimpiada-admin" },
  });
}
