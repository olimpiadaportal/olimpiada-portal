// Session refresh for SSR. Keeps the Supabase auth cookie fresh on each request.
// No business logic here — route protection is enforced server-side by the
// requireParent/requireChild guards (src/lib/auth/session.ts) and Supabase RLS.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Header carrying the request path into the server components. A React Server
 * Component cannot read the URL, and the root layout needs the path for exactly
 * one decision: keeping the public privacy policy readable while maintenance
 * mode is on (that URL is registered with Apple and Google, and both re-fetch it
 * after submission). `set` — never `append` — so a client-supplied value of the
 * same name is always overwritten and can never be trusted as input.
 */
export const PATHNAME_HEADER = "x-pathname";

export async function updateSession(request: NextRequest) {
  // Re-read `request.headers` on every call: `request.cookies.set()` below
  // rewrites the incoming `cookie` header, and a snapshot taken once at the top
  // would forward the PRE-refresh cookies to the server components.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
    return headers;
  };

  let response = NextResponse.next({ request: { headers: forwardedHeaders() } });

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
        response = NextResponse.next({ request: { headers: forwardedHeaders() } });
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
