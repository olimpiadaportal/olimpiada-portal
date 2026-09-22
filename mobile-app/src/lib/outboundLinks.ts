// The rules for handing a user OUT of the app: WHO may be handed off, and to
// WHAT. Pure module (no React/RN imports) so both halves are unit-tested.
//
// WHO — the Play target-audience declaration includes children, so Google's
// Families policy applies: an app whose audience includes children must not
// lead them out to unmoderated external content. The Contact screen is
// reachable from the account sheet in a CHILD session and renders the
// admin-configured social links (TikTok, Instagram, Facebook, YouTube), a
// WhatsApp hand-off and a maps/directions deep link — which put a student two
// taps from an external social network.
//
// The gate is the one /pricing already carries: `blockedRoles: ["student"]` in
// deeplink.ts, the role bounce in `(public)/_layout.tsx`, and the AccountSheet
// row that renders for a parent only. Contact hides ROWS rather than bouncing
// the whole screen because the support channels are real — a parent is an
// adult and keeps every one of them, and deleting them for everybody would
// trade a child-safety problem for a support one.
//
// WHAT — the force-update and optional-update screens hand an ADMIN-CONFIGURED
// string (mobile_app_versions.store_url) straight to the OS, and on the force
// screen that button is the ONLY control there is: the navigator is not
// mounted, so there is no back either. "Starts with https://" is not a
// destination check — it accepts any host on the web, including a page of AZN
// prices, which is exactly the Play Payments / Apple 3.1.1 breach this binary
// is built to avoid. So the value is matched against the real store hosts and
// everything else fails closed: no button, never a button that opens something
// else.
import type { AuthStatus, SessionRole } from "@/features/auth/authStore";

/**
 * May THIS session be handed off to an external destination — a social
 * network, a WhatsApp conversation, the device's maps app?
 *
 * Signed out is the public marketing surface: no child session exists to
 * protect and it is the same audience the website serves. Otherwise only a
 * CONFIRMED parent qualifies — "student" is a child by definition, and every
 * state where the answer is not yet known fails CLOSED: an unresolved role
 * ("unknown" from a failed has_role RPC, or null), and the "restoring" window
 * before the session has been read back at all. Guessing "adult" there costs a
 * Families-policy violation; guessing "child" costs a parent one row on one
 * screen, on a surface they can still reach by email.
 */
export function outboundLinksAllowed(
  status: AuthStatus,
  role: SessionRole | null,
): boolean {
  if (status === "signedOut") return true;
  return status === "signedIn" && role === "parent";
}

/**
 * The only hosts an admin-configured store URL may point at.
 *
 * Matched EXACTLY, never as a suffix: `endsWith(".play.google.com")` would also
 * accept "play.google.com.evil.test" one dot later. Paths are deliberately not
 * constrained — the Play closed-testing opt-in link
 * (play.google.com/apps/testing/…) is a legitimate store URL and every path on
 * these hosts is store-operated anyway.
 */
const STORE_HOSTS: readonly string[] = [
  "play.google.com",
  "apps.apple.com",
  "itunes.apple.com",
];

/** Is `raw` an https URL on one of the real app stores? */
export function isStoreUrl(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const url = raw.trim();
  if (url.length === 0 || url.length > 512) return false;
  // Whitespace and control characters are never valid inside a URL and are how
  // a second one gets hidden from a host check.
  if (/[\u0000-\u001f\u007f\s]/.test(url)) return false;
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url);
  if (!match) return false;
  const authority = match[1];
  // Userinfo ("play.google.com@evil.test") and a port both live in the
  // authority; neither may contribute to the host being allowlisted.
  if (authority.includes("@")) return false;
  return STORE_HOSTS.includes(authority.toLowerCase());
}
