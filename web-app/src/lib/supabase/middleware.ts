// Session refresh for SSR. Keeps the Supabase auth cookie fresh on each request.
// No business logic here — route protection is enforced server-side by the
// requireParent/requireChild guards (src/lib/auth/session.ts) and Supabase RLS.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before env is configured, do nothing (skeleton still runs).
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    // Distinct cookie name so the web-app session never collides with the admin
    // session (both run on localhost, where cookies are shared across ports).
    cookieOptions: { name: "sb-olimpiada-web" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touch the session so expired tokens are refreshed into the response cookies.
  await supabase.auth.getUser();

  return response;
}
