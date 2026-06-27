// Browser Supabase client (anon key only). Use in Client Components.
// RLS protects all data; never trust client-side role/score/subscription state.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
