// Session refresh for SSR. Keeps the Supabase auth cookie fresh on each request.
// Admin route protection / permission checks are added in later stages.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// SERVER-enforced idle timeout. The client-side <IdleTimeout /> component is
// UX only (a timer in the browser is trivially bypassed); the real 30-minute
// enforcement happens here: every authenticated request stamps an httpOnly
// last-seen cookie, and a request arriving after >30 idle minutes gets the
// session revoked server-side and is bounced to /login?timeout=1.
const LAST_SEEN_COOKIE = "olimpiq-admin-last-seen";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    // Distinct cookie name so the admin session never collides with the web-app
    // session (both run on localhost, where cookies are shared across ports).
    cookieOptions: { name: "sb-olimpiada-admin" },
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
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    // Network/transient error — keep the existing cookies on the response and let
    // the server guards re-evaluate the session on the actual request.
  }

  if (!user) {
    // NEVER enforce the idle timeout without a session (the login page must not
    // loop). Also clear any stale last-seen marker left over from the previous
    // session, so it cannot instantly time out the NEXT login.
    if (request.cookies.get(LAST_SEEN_COOKIE)) {
      response.cookies.set(LAST_SEEN_COOKIE, "", { maxAge: 0, path: "/" });
    }
    return response;
  }

  const lastSeenRaw = request.cookies.get(LAST_SEEN_COOKIE)?.value;
  const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : NaN;
  if (Number.isFinite(lastSeen) && Date.now() - lastSeen > IDLE_TIMEOUT_MS) {
    // Idle for more than 30 minutes → revoke the session server-side and send
    // the admin back to /login with a "signed out due to inactivity" hint.
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if revocation fails transiently we still redirect; the session
      // cookie stays and the next request re-evaluates.
    }
    const redirect = NextResponse.redirect(new URL("/login?timeout=1", request.url));
    // signOut() queued auth-cookie removals (via setAll) on `response` — copy
    // them onto the redirect so the browser actually drops the session cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.set(LAST_SEEN_COOKIE, "", { maxAge: 0, path: "/" });
    return redirect;
  }

  // Live session and not idle → (re)stamp the last-seen marker on the SAME
  // response object that carries any refreshed auth cookies.
  response.cookies.set(LAST_SEEN_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
