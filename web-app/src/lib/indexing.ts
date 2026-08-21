// Which deployments search engines may index.
//
// WHY THIS EXISTS. On 2026-08-21 `staging.olympiq.ai` went live serving a
// byte-identical copy of the marketing site, with no `robots.txt` and no
// `noindex` anywhere. A crawler that finds it indexes a second copy of every
// public page, and the two then compete with each other for the same queries —
// the duplicate can outrank the real one, and it is the copy pointed at a
// throwaway database with test payment credentials. The same is true of every
// `*.vercel.app` alias and every preview deployment.
//
// THE RULE: a deployment must PROVE it is the public production site to be
// indexable. Anything else — staging, previews, the vercel.app aliases,
// localhost, a host header we do not recognise, a missing host header — is
// noindex. Fail-safe points at "not indexed", because an unindexed production
// site is a bad afternoon and an indexed staging site is a slow leak that has
// to be cleaned up out of a search console weeks later.
//
// Deliberately NOT `robots.txt`: `Disallow` stops a crawler READING the page,
// which also stops it reading a noindex directive, so a Disallow'd URL that is
// linked from anywhere can still surface in results as a bare URL. Serving
// `X-Robots-Tag` on every response is the directive that actually removes a
// page from an index, and — unlike a `<meta>` tag — it also covers JSON, PDFs
// and anything else that is not HTML.
//
// Not driven by an env var on purpose. `VERCEL_ENV` reads "production" on the
// staging project (its own production branch), and a `NEXT_PUBLIC_SITE_URL`
// that is unset or stale on the real site would silently deindex it. The host
// the request actually arrived on cannot be wrong about which site answered.

/** Hosts that ARE the public production site. Everything else is noindex. */
export const PRODUCTION_HOSTS: readonly string[] = ["olympiq.ai", "www.olympiq.ai"];

/**
 * `noarchive` alongside `noindex` so a cached copy of a staging page cannot be
 * served from a search result after the deployment is gone; `nofollow` so link
 * equity is never passed from a throwaway host.
 */
export const NOINDEX_HEADER_VALUE = "noindex, nofollow, noarchive";

/** Header name is case-insensitive on the wire; this spelling is the documented one. */
export const ROBOTS_TAG_HEADER = "X-Robots-Tag";

/**
 * Normalize a `Host` header for comparison: lowercase, port removed, one
 * trailing dot (the fully-qualified form, `olympiq.ai.`) removed. A header with
 * anything else unusual in it — whitespace, a userinfo `@`, more than one colon
 * (a bare IPv6 literal), an empty label — is returned as-is and will simply
 * fail the allowlist, which is the safe direction.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (typeof host !== "string") return "";
  let h = host.trim().toLowerCase();
  if (!h) return "";
  // Strip a :port suffix. Only a SINGLE colon can be a port separator on a
  // registered name — an unbracketed IPv6 literal (`::1`) has several, and
  // treating its last one as a port turns `::1` into `:`. A bracketed literal
  // (`[::1]:3000`) keeps the brackets and loses only the port. Either way the
  // result fails the exact-match allowlist below, which is the safe direction;
  // this is about the function being honest, not about the verdict.
  if (h.startsWith("[")) {
    const close = h.indexOf("]");
    if (close > -1 && /^(:\d+)?$/.test(h.slice(close + 1))) h = h.slice(0, close + 1);
  } else {
    const colon = h.indexOf(":");
    if (colon > -1 && colon === h.lastIndexOf(":") && /^\d+$/.test(h.slice(colon + 1))) {
      h = h.slice(0, colon);
    }
  }
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

/**
 * True only for the public production site. A null/absent host is false: we
 * would rather not index a page than index the wrong deployment.
 */
export function isProductionHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  return h.length > 0 && PRODUCTION_HOSTS.includes(h);
}

/**
 * The `X-Robots-Tag` value this deployment should serve, or `null` when the
 * response should carry no directive at all (production — leave indexing to the
 * page's own metadata, exactly as it behaves today).
 */
export function robotsTagFor(host: string | null | undefined): string | null {
  return isProductionHost(host) ? null : NOINDEX_HEADER_VALUE;
}
