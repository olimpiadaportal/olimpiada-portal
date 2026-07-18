// Deep-link allowlist router (pure module — unit-tested). One link works on
// both platforms because the app mirrors the WEB paths; anything not in the
// allowlist resolves to null and the caller falls back to the role home.
// Notification taps route their `action_url` through the SAME functions.

/** Port of web-app/src/lib/notifications/types.ts isSafeRelativeUrl. */
export function isSafeRelativeUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 512) return false;
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//") || url.startsWith("/\\")) return false;
  if (url.includes("\\")) return false;
  if (url.includes("://")) return false;
  if (/[\u0000-\u001f\u007f ]/.test(url)) return false;
  return true;
}

export type Role = "parent" | "student" | null;

/** Lowercase UUID shape (server ids are Postgres uuids — always lowercase). */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type RouteRule = {
  /** Web path prefix ("/child/test" also matches "/child/test/run"). Unused when `pattern` is set. */
  prefix?: string;
  /** Exact-only rules refuse sub-paths ("/" must not swallow everything). */
  exact?: boolean;
  /** Full-path match for dynamic segments (UUID ids, news slugs); capture 1
   *  fills "{param}" in the target. Non-matches fall through to later rules. */
  pattern?: RegExp;
  /** Which sessions may open it; "public" = no session needed. */
  audience: "public" | "parent" | "student";
  /** The expo-router target. */
  target: string;
  /** Public rules only: a signed-in session lands on ITS surface instead
   *  (e.g. /news → the role's own news tab). */
  roleTargets?: Partial<Record<"parent" | "student", string>>;
  /** Public rules only: roles that must never open it — children never see
   *  commerce, so /pricing blocks student sessions. */
  blockedRoles?: readonly ("parent" | "student")[];
};

// Order matters: first match wins; dynamic patterns and longer prefixes come first.
const RULES: RouteRule[] = [
  // Student surface. Result/review ARE deep-linkable: their RPCs are
  // owner+graded gated server-side (the runner itself stays unlinkable —
  // non-UUID or /run/ paths fall through to the Tests tab).
  {
    pattern: new RegExp(`^/child/test/result/(${UUID})$`),
    audience: "student",
    target: "/(student)/test/result/{param}",
  },
  {
    pattern: new RegExp(`^/child/test/review/(${UUID})$`),
    audience: "student",
    target: "/(student)/test/review/{param}",
  },
  { prefix: "/child/test", audience: "student", target: "/(student)/(tabs)/tests" },
  { prefix: "/child/olympiads", audience: "student", target: "/(student)/(tabs)/olympiads" },
  { prefix: "/child/leaderboard", audience: "student", target: "/(student)/(tabs)/ranking" },
  { prefix: "/child/news", audience: "student", target: "/(student)/(tabs)/news" },
  { prefix: "/child/notifications", audience: "student", target: "/(student)/notifications" },
  { prefix: "/child/profile", audience: "student", target: "/(student)/profile" },
  { prefix: "/child-login", audience: "public", target: "/(public)/login?tab=student" },
  { prefix: "/child", exact: true, audience: "student", target: "/(student)/(tabs)/home" },
  // Parent surface. A child's olympiad page (notification action_url) → the
  // olympiads tab; other /children/... paths keep landing on the parent home.
  { prefix: "/dashboard/news", audience: "parent", target: "/(parent)/(tabs)/news" },
  { prefix: "/dashboard", exact: true, audience: "parent", target: "/(parent)/(tabs)/home" },
  {
    pattern: new RegExp(`^/children/(${UUID})/olympiads$`),
    audience: "parent",
    target: "/(parent)/(tabs)/olympiads",
  },
  { prefix: "/children", audience: "parent", target: "/(parent)/(tabs)/home" },
  { prefix: "/analytics", audience: "parent", target: "/(parent)/(tabs)/analytics" },
  { prefix: "/leaderboard", audience: "parent", target: "/(parent)/leaderboard" },
  { prefix: "/olympiads", audience: "parent", target: "/(parent)/(tabs)/olympiads" },
  { prefix: "/subscription", audience: "parent", target: "/(parent)/(tabs)/subscription" },
  { prefix: "/notifications", audience: "parent", target: "/(parent)/notifications" },
  { prefix: "/profile", audience: "parent", target: "/(parent)/profile" },
  // Public surface. The (public) guard now only bounces signed-in users off
  // the AUTH screens, so info/news targets are reachable in-session too.
  { prefix: "/login", audience: "public", target: "/(public)/login" },
  { prefix: "/register", audience: "public", target: "/(public)/register" },
  // News: signed-in readers get their own list tab, and a single-slug article
  // opens the ROLE's own article route (own shell theme + back behavior);
  // signed out, marketing links keep landing on the public surface.
  {
    pattern: /^\/news\/([^/]+)$/,
    audience: "public",
    target: "/(public)/welcome",
    roleTargets: { parent: "/(parent)/news/{param}", student: "/(student)/news/{param}" },
  },
  {
    prefix: "/news",
    audience: "public",
    target: "/(public)/welcome",
    roleTargets: { parent: "/(parent)/(tabs)/news", student: "/(student)/(tabs)/news" },
  },
  { prefix: "/pricing", audience: "public", target: "/(public)/pricing", blockedRoles: ["student"] },
  { prefix: "/about", audience: "public", target: "/(public)/about" },
  { prefix: "/subjects", audience: "public", target: "/(public)/subjects" },
  { prefix: "/faq", audience: "public", target: "/(public)/faq" },
  { prefix: "/contact", audience: "public", target: "/(public)/contact" },
  { prefix: "/", exact: true, audience: "public", target: "/(public)/welcome" },
];

export type ResolvedLink =
  | { kind: "open"; target: string }
  | { kind: "deferred"; path: string; audience: "parent" | "student" }
  | { kind: "mismatch" }
  | null;

/**
 * Resolve a WEB path against the allowlist for the current session role.
 * - public rules open for everyone;
 * - role rules open when the role matches, DEFER when signed out (stored and
 *   replayed after login), and report a mismatch for the other role.
 * Unknown/unsafe paths resolve to null (caller goes to the role home).
 */
export function resolveDeepLink(rawPath: string, role: Role): ResolvedLink {
  if (!isSafeRelativeUrl(rawPath)) return null;
  const path = rawPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

  for (const rule of RULES) {
    let param: string | undefined;
    if (rule.pattern) {
      const m = rule.pattern.exec(path);
      if (!m) continue;
      param = m[1];
    } else if (rule.prefix) {
      const matches = rule.exact
        ? path === rule.prefix
        : path === rule.prefix || path.startsWith(`${rule.prefix}/`);
      if (!matches) continue;
    } else {
      continue;
    }
    const fill = (target: string) =>
      param === undefined ? target : target.replace("{param}", param);

    if (rule.audience === "public") {
      if (role !== null && rule.blockedRoles?.includes(role)) return { kind: "mismatch" };
      const target = (role !== null ? rule.roleTargets?.[role] : undefined) ?? rule.target;
      return { kind: "open", target: fill(target) };
    }
    if (role === null) return { kind: "deferred", path, audience: rule.audience };
    if (role === rule.audience) return { kind: "open", target: fill(rule.target) };
    return { kind: "mismatch" };
  }
  return null;
}

// ---- deferred-link storage (auth-required links replay after login) ----

let pending: { path: string; audience: "parent" | "student" } | null = null;

export function storePendingLink(path: string, audience: "parent" | "student"): void {
  pending = { path, audience };
}

/** Consume the pending link if it matches the just-signed-in role. */
export function consumePendingLink(role: "parent" | "student"): string | null {
  if (!pending) return null;
  const link = pending;
  pending = null;
  if (link.audience !== role) return null;
  const resolved = resolveDeepLink(link.path, role);
  return resolved && resolved.kind === "open" ? resolved.target : null;
}

export function clearPendingLink(): void {
  pending = null;
}
