import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeRelativeUrl } from "@/lib/notifications/types";

// Only ever forward to a same-origin RELATIVE path. Anything else (absolute
// URLs, protocol-relative "//evil.com", backslash tricks, or the userinfo
// trick where "@evil.com" appended to the origin becomes credentials@host)
// falls back to the dashboard. Prevents open redirects (R7 security fix).
// Round 51 (audit F15): the shape check is now the ONE shared predicate —
// this local copy had no control-char/length rule while the shared one had no
// `@` rule; two implementations of the same rule always drift.
function safeNext(raw: string | null): string {
  return isSafeRelativeUrl(raw) ? raw : "/dashboard";
}

// Email-confirmation + recovery callback. Supabase appends `?code=...`; we
// exchange it for a session (sets cookies) and route the user onward.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?verify=failed`);
}
