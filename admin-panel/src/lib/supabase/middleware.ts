// Session refresh for SSR. Keeps the Supabase auth cookie fresh on each request.
// Admin route protection / permission checks are added in later stages.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

  // IMPORTANT: getUser() validates the access token and, when it is expired but
  // the refresh token is still valid, rotates the session and writes the refreshed
  // auth cookies (via setAll above) onto `response`. This keeps a logged-in admin
  // from presenting as logged-out on the next request. Never short-circuit before
  // this call. Swallow transient errors so a momentary blip doesn't drop cookies.
  try {
    await supabase.auth.getUser();
  } catch {
    // Network/transient error — keep the existing cookies on the response and let
    // the server guards re-evaluate the session on the actual request.
  }

  return response;
}
