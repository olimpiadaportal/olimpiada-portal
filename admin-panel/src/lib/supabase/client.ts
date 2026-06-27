// Browser Supabase client (anon key only). Use in Client Components.
// Admin authorization is enforced server-side and by RLS; the browser client
// never gets elevated privileges.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
