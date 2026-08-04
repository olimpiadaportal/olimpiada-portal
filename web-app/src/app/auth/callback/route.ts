import { NextResponse } from "next/server";
import { confirmEmailLink } from "@/lib/auth/confirmEmail";

// LEGACY entry point, kept working on purpose.
//
// Until 2026-08-04 the templates used `{{ .ConfirmationURL }}`, which routes
// through Supabase's own /auth/v1/verify and lands back HERE with `?code=`.
// New templates link to /auth/confirm with `{{ .TokenHash }}` instead — see
// lib/auth/confirmEmail.ts for why the old shape could never work for a mobile
// sign-up. Links already sitting in inboxes still point at this path, and a
// confirmation email is exactly the kind of thing someone opens three days
// later, so this route stays and shares the one resolver.
//
// It also still receives the `?next=/reset-password` recovery hand-off.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await confirmEmailLink(url);

  if (result.ok) {
    return NextResponse.redirect(`${url.origin}${result.next}`);
  }
  return NextResponse.redirect(
    `${url.origin}/login?verify=${result.reason === "expired" ? "expired" : "failed"}`,
  );
}
