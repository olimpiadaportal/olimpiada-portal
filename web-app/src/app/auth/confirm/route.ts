import { NextResponse } from "next/server";
import { confirmEmailLink } from "@/lib/auth/confirmEmail";

// The endpoint EVERY Supabase email template links to.
//
//     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
//     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
//
// See lib/auth/confirmEmail.ts for why `{{ .ConfirmationURL }}` cannot work for
// a mobile sign-up: GoTrue returns that token in a URL FRAGMENT, which never
// reaches a server. Verifying the OTP ourselves is flow-agnostic, so the same
// link works whether the account was created on the web or in the app.
//
// Failure never dead-ends: the login page renders `?verify=expired|failed` and
// points at the resend form, so a user whose link aged out has somewhere to go.
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Success lands on the confirmation PAGE, not straight in the dashboard: a
  // user who registered in the mobile app needs to be told it worked and handed
  // a way back into the app, which cannot inherit this browser's session. The
  // recovery template overrides this with `next=/reset-password`.
  const result = await confirmEmailLink(url, "/auth/confirmed");

  if (result.ok) {
    return NextResponse.redirect(`${url.origin}${result.next}`);
  }
  return NextResponse.redirect(
    `${url.origin}/login?verify=${result.reason === "expired" ? "expired" : "failed"}`,
  );
}
