// Send people who land on a Vercel deployment host to the brand domain.
//
// WHY THIS EXISTS. The production site answers on olympiq.ai AND on its
// `*.vercel.app` alias. Nothing should send a person to the alias, but things
// did: until 2026-10-09 the mobile app opened its "reset password" page on the
// API origin (a vercel.app host), and once someone is on that host every
// relative link — the logo's "/" — keeps them there. The mobile fix removes
// that entry point; this closes the door for the ones it cannot reach: app
// builds that have not taken the update yet, bookmarks, and copied links.
//
// WHAT IS NEVER REDIRECTED, and why:
//   * /api/*  — the mobile BFF, the payment gateway callbacks and webhooks live
//     here. A redirect would change a POST's origin, and the fetch spec drops
//     the Authorization header on a cross-origin redirect: every signed-in
//     mobile request would silently arrive unauthenticated.
//   * /auth/* — email links already sitting in inboxes. A link is redeemed on
//     the host it names; redirecting it first changes nothing useful and risks
//     separating it from anything the flow stored on that host.
//   * anything but GET/HEAD — a form POST cannot be replayed safely elsewhere.
//   * preview deployments — they exist to be looked at on their own URL.
//
// WHERE IT GOES. To this deployment's own NEXT_PUBLIC_SITE_URL, never to a
// hard-coded olympiq.ai: the staging project ALSO reports VERCEL_ENV=production
// on its own branch (see lib/indexing.ts), and its vercel.app alias must lead
// to staging, not to the live site. No usable site URL → no redirect at all.

const SKIP_PREFIXES = ["/api/", "/auth/", "/_next/"];

export type CanonicalInput = {
  host: string | null;
  pathname: string;
  search: string;
  method: string;
  vercelEnv: string | undefined;
  siteUrl: string | undefined;
};

/** The absolute URL to redirect to, or null to serve the request as-is. */
export function canonicalRedirect(input: CanonicalInput): string | null {
  if (input.vercelEnv !== "production") return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;

  const host = (input.host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (!host.endsWith(".vercel.app")) return null;

  if (input.pathname === "/api" || input.pathname === "/auth") return null;
  if (SKIP_PREFIXES.some((p) => input.pathname.startsWith(p))) return null;

  let site: URL;
  try {
    site = new URL(input.siteUrl ?? "");
  } catch {
    return null;
  }
  // Only a real https brand origin qualifies — never another vercel.app host
  // (a loop) and never a plain-http or localhost value left in an env file.
  if (site.protocol !== "https:") return null;
  const siteHost = site.hostname.toLowerCase();
  if (!siteHost || siteHost === host || siteHost.endsWith(".vercel.app") || siteHost === "localhost") {
    return null;
  }

  // pathname always starts with "/" on a parsed request URL, so this cannot be
  // turned into a different host by a crafted path.
  return `${site.origin}${input.pathname}${input.search}`;
}

/**
 * The middleware entry point. The environment is read HERE and not in
 * middleware.ts on purpose: the middleware also decides INDEXING, and that
 * decision must come from the request host alone (lib/indexing.ts explains why
 * an env var cannot be trusted for it; __tests__/indexing.test.ts keeps env
 * names out of middleware.ts). Choosing a redirect TARGET is a different
 * question, and one only the deployment's own configured site URL can answer.
 */
export function canonicalRedirectFor(request: {
  headers: { get(name: string): string | null };
  nextUrl: { pathname: string; search: string };
  method: string;
}): string | null {
  return canonicalRedirect({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    vercelEnv: process.env.VERCEL_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
