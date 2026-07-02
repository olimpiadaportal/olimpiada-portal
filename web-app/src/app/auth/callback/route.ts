import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only ever forward to a same-origin RELATIVE path. Anything else (absolute
// URLs, protocol-relative "//evil.com", backslash tricks, or the userinfo
// trick where "@evil.com" appended to the origin becomes credentials@host)
// falls back to the dashboard. Prevents open redirects (R7 security fix).
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  // No scheme/userinfo separators inside the path.
  if (raw.includes("://") || raw.includes("@") || raw.includes("\\")) {
    return "/dashboard";
  }
  return raw;
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
