import Link from "next/link";
import { headers } from "next/headers";
import { getT } from "@/i18n/server";

// Landing page after a confirmation link verifies successfully.
//
// WHY A PAGE AND NOT A REDIRECT
// -----------------------------
// /auth/confirm used to redirect straight to /dashboard. That reads fine on a
// desktop browser and badly on a phone: someone who registered IN THE APP taps
// the link, a browser opens, and they are silently dropped into a *web* session
// they never asked for — with no signal that it worked and no way back to the
// app they were using thirty seconds ago. The app cannot inherit that session
// (different cookie jar entirely), so they still have to sign in there.
//
// So: say plainly that it worked, then offer the two ways forward.
//
// DELIBERATELY OUTSIDE THE (public) ROUTE GROUP
// ---------------------------------------------
// This file sits at src/app/auth/, so it renders under the ROOT layout and gets
// no site header. That is not laziness — the public header's first nav item is
// the pricing page, and a signed-out store reviewer following a confirmation
// link is exactly the audience that must not be one tap from an AZN price list
// (docs/STORE_PAYMENTS_COMPLIANCE.md; the open item is tracked in STATUS.md).
// A chrome-free confirmation page is both better UX and one less exposure.
//
// WHY BOTH BUTTONS ALWAYS RENDER
// ------------------------------
// User-Agent sniffing decides which action is PRIMARY, never which exists. A UA
// string is a hint: desktop-mode-on-phone, in-app browsers and privacy browsers
// all lie about it. Getting the emphasis wrong costs a glance; hiding the only
// working button would strand the user completely.

// The app's custom scheme, fixed in mobile-app/app.json ("scheme": "olympiq").
// `/login` is in the app's deep-link allowlist (mobile-app/src/lib/deeplink.ts)
// and resolves to the parent/student login screen.
const APP_LINK = "olympiq://login";

/**
 * Is this most likely a phone or tablet?
 *
 * Deliberately crude. A precise UA parser would be a dependency and a
 * maintenance burden for a decision whose only consequence is which of two
 * visible buttons is styled as primary.
 */
function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export default async function EmailConfirmedPage() {
  const t = await getT();
  const ua = (await headers()).get("user-agent") ?? "";
  const mobile = isMobileUserAgent(ua);

  const openApp = (
    <a className={mobile ? "btn" : "btn-ghost"} href={APP_LINK}>
      {t("confirmed.openApp")}
    </a>
  );
  const continueWeb = (
    <Link className={mobile ? "btn-ghost" : "btn"} href="/dashboard">
      {mobile ? t("confirmed.continueWeb") : t("confirmed.goDashboard")}
    </Link>
  );

  return (
    <section className="confirmed">
      <div className="confirmed-mark" aria-hidden="true">
        {/* Inline SVG: uploaded SVG is banned repo-wide, JSX markup is the
            house pattern and carries no external request. */}
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" aria-hidden="true">
          <path
            d="M4 12.5l5.2 5.2L20 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1>{t("confirmed.title")}</h1>
      <p className="confirmed-body">{t("confirmed.body")}</p>

      <div className="confirmed-actions">
        {/* Order follows the device: the likely-right action comes first both
            visually AND in the DOM, so keyboard and screen-reader users get the
            same ordering sighted users do. */}
        {mobile ? openApp : continueWeb}
        {mobile ? continueWeb : openApp}
      </div>

      <p className="confirmed-hint">
        {mobile ? t("confirmed.appHint") : t("confirmed.desktopHint")}
      </p>
    </section>
  );
}
