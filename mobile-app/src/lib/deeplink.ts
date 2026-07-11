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

type RouteRule = {
  /** Web path prefix ("/news" also matches "/news/some-slug"). */
  prefix: string;
  /** Exact-only rules refuse sub-paths ("/" must not swallow everything). */
  exact?: boolean;
  /** Which sessions may open it; "public" = no session needed. */
  audience: "public" | "parent" | "student";
  /** The expo-router target (M1 targets are the shells; deeper screens land in M2/M3). */
  target: string;
};

// Order matters: first match wins; longer prefixes come first.
const RULES: RouteRule[] = [
  // Student surface.
  { prefix: "/child/test", audience: "student", target: "/(student)/tests" },
  { prefix: "/child/olympiads", audience: "student", target: "/(student)/olympiads" },
  { prefix: "/child/leaderboard", audience: "student", target: "/(student)/ranking" },
  { prefix: "/child/news", audience: "student", target: "/(student)/news" },
  { prefix: "/child/notifications", audience: "student", target: "/(student)/arena" },
  { prefix: "/child/profile", audience: "student", target: "/(student)/arena" },
  { prefix: "/child-login", audience: "public", target: "/(public)/login?tab=student" },
  { prefix: "/child", exact: true, audience: "student", target: "/(student)/arena" },
  // Parent surface.
  { prefix: "/dashboard/news", audience: "parent", target: "/(parent)/news" },
  { prefix: "/dashboard", exact: true, audience: "parent", target: "/(parent)/home" },
  { prefix: "/children", audience: "parent", target: "/(parent)/home" },
  { prefix: "/analytics", audience: "parent", target: "/(parent)/analytics" },
  { prefix: "/olympiads", audience: "parent", target: "/(parent)/olympiads" },
  { prefix: "/subscription", audience: "parent", target: "/(parent)/subscription" },
  { prefix: "/notifications", audience: "parent", target: "/(parent)/home" },
  { prefix: "/profile", audience: "parent", target: "/(parent)/home" },
  // Public surface.
  { prefix: "/login", audience: "public", target: "/(public)/login" },
  { prefix: "/register", audience: "public", target: "/(public)/register" },
  { prefix: "/news", audience: "public", target: "/(public)/welcome" },
  { prefix: "/pricing", audience: "public", target: "/(public)/welcome" },
  { prefix: "/about", audience: "public", target: "/(public)/welcome" },
  { prefix: "/faq", audience: "public", target: "/(public)/welcome" },
  { prefix: "/contact", audience: "public", target: "/(public)/welcome" },
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
    const matches = rule.exact
      ? path === rule.prefix
      : path === rule.prefix || path.startsWith(`${rule.prefix}/`);
    if (!matches) continue;

    if (rule.audience === "public") return { kind: "open", target: rule.target };
    if (role === null) return { kind: "deferred", path, audience: rule.audience };
    if (role === rule.audience) return { kind: "open", target: rule.target };
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
