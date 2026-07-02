// Server Supabase client (anon key + request cookies). Use in Server Components,
// Route Handlers, and Server Actions. Every privileged admin route must verify
// permissions server-side (added in later stages); RLS is the backstop.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    // Distinct cookie name so the admin session never collides with the web-app
    // session (both run on localhost, where cookies are shared across ports).
    cookieOptions: { name: "sb-olimpiada-admin" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component (read-only cookies); middleware refreshes
          // the session, so this is safe to ignore.
        }
      },
    },
  });
}
