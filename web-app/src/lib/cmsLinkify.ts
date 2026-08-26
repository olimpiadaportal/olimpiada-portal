// Turning bare URLs in admin-authored prose into real links — WEB ONLY.
//
// WHY THIS RETURNS SEGMENTS AND NOT HTML. The obvious fix for "the link is not
// clickable" is to render the body as HTML. That would be this product's first
// raw-HTML sink, and the CSP cannot save it: `script-src` carries
// 'unsafe-inline' because Next's hydration needs it, so an injected
// `<img src=x onerror=…>` executes. Supabase's auth cookies are not httpOnly
// (the browser client reads them from document.cookie), so a stored payload in
// a news body is token theft — and one component serves anonymous visitors, a
// payment-bearing parent session and a minor's screen.
//
// So no HTML string is ever produced here. This module returns plain data;
// CmsProse turns it into React elements, React escapes every text child, and the
// only attacker-influenced value in the whole path is an `href` — which reduces
// the review to "which URL shapes do we accept".
//
// WHY WEB ONLY. Mobile renders the SAME body column, and a news body is an
// admin-controlled string. CLAUDE.md's store rules forbid opening an external
// https link from an admin-controlled string inside a store build (Apple
// 3.1.1(a) dynamic steering; Azerbaijan gets no anti-steering relief). Mobile
// therefore keeps rendering these as plain, non-tappable text — see
// mobile-app/src/lib/notifMarkdown.tsx, which solves the same problem for
// notifications and carries the same warning. Do not "tidy up" this module into
// the shared mobile path.
//
// WHY NOT A DATA MIGRATION. Rewriting stored bodies into markdown would roughly
// double every URL, and BODY_MAX is 20000 — a link-heavy article would cross the
// cap, be silently truncated at render, and then never be savable again, because
// the edit form reloads the oversized body and every save fails validation. It
// would also print literal `[https://…](https://…)` into the 140-char card
// excerpts on three routes. Render-time linkification fixes every existing
// article, in every locale, at deploy, with no database work at all.
//
// DELIBERATELY NOT SUPPORTED: `[label](url)` markdown. One link syntax per
// surface; markdown stays a notification-only feature. A body containing it
// renders literally, by design.

/** A run of text, optionally a link. `href` absent = plain text. */
export type CmsSegment = {
  text: string;
  href?: string;
  /** True for a cross-origin destination; drives target/rel at render. */
  external?: boolean;
};

/** Matches the cap used by the relative-URL checker elsewhere in the app. */
export const CMS_URL_MAX = 512;

/**
 * Hosts that are US. EXACT match, never `endsWith` — `evil-olympiq.ai` and
 * `olympiq.ai.attacker.com` must not qualify.
 */
const INTERNAL_HOSTS = new Set(["olympiq.ai", "www.olympiq.ai"]);

/** A URL may only begin where a word could begin. */
const OPENERS = new Set([" ", "\t", "(", "[", "{", "«", '"', "'", "“", "‘"]);

/** Trailing characters that are almost always sentence punctuation, not URL. */
const TRAILING = new Set([
  ".", ",", ";", ":", "!", "?", "…", '"', "'", "»", "›", "”", "’",
]);

/** Authority may contain only these. Blocks IDN homographs and userinfo. */
const AUTHORITY_OK = /^[A-Za-z0-9.\-:]+$/;

function isControl(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c < 0x21 || c === 0x7f;
}

/**
 * Does this candidate survive scrutiny? Everything refused here stays literal
 * text — refusing is always safe, accepting is the risk.
 */
export function isAllowedAbsoluteHttpUrl(url: string): boolean {
  if (!url || url.length > CMS_URL_MAX) return false;
  // A backslash anywhere: browsers normalise some of these to `/`, which moves
  // the authority. Not worth reasoning about.
  if (url.includes("\\")) return false;
  for (const ch of url) if (isControl(ch)) return false;

  const lower = url.toLowerCase();
  const scheme = lower.startsWith("https://") ? 8 : lower.startsWith("http://") ? 7 : 0;
  if (scheme === 0) return false;
  // A second scheme inside the candidate means we mis-measured its extent.
  if (url.indexOf("://", scheme) !== -1) return false;

  const rest = url.slice(scheme);
  const cut = rest.search(/[/?#]/);
  const authority = cut === -1 ? rest : rest.slice(0, cut);
  if (!authority || !AUTHORITY_OK.test(authority)) return false;
  // "...", ":80" and friends are not hosts.
  if (!/[A-Za-z0-9]/.test(authority)) return false;
  return true;
}

/**
 * An olympiq.ai URL becomes a same-origin relative path, so it opens in the
 * same tab and leaks no referrer. Returns null when it is not ours, or when the
 * derived path is not a plain relative path.
 */
export function toInternalPath(url: string): string | null {
  if (!isAllowedAbsoluteHttpUrl(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!INTERNAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  // Same shape rules the redirect validator uses: one leading slash, no
  // protocol-relative form, no backslash, no scheme smuggled in.
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("\\") || path.includes("://")) return null;
  if (path.length > CMS_URL_MAX) return null;
  return path;
}

/** Strip sentence punctuation, and brackets only when they are unbalanced. */
function trimTrailing(candidate: string): string {
  let end = candidate.length;
  for (;;) {
    if (end === 0) break;
    const ch = candidate[end - 1];
    if (TRAILING.has(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const open = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      const slice = candidate.slice(0, end);
      let opens = 0;
      let closes = 0;
      for (const c of slice) {
        if (c === open) opens += 1;
        else if (c === ch) closes += 1;
      }
      // Balanced means the bracket belongs to the URL:
      // https://en.wikipedia.org/wiki/Foo_(bar)
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return candidate.slice(0, end);
}

/**
 * Split ONE line into text and link segments.
 *
 * Linear left-to-right scan on indexOf — no regex over the whole line, no
 * nested quantifiers, nothing that can backtrack. The paragraph splitter makes
 * the same ReDoS-safety claim and this must not weaken it.
 *
 * A line with no links returns a single segment, so the common path allocates
 * almost nothing.
 */
export function linkifyLine(line: string): CmsSegment[] {
  if (!line) return [{ text: "" }];
  const lower = line.toLowerCase();
  const out: CmsSegment[] = [];
  let cursor = 0;
  let from = 0;

  for (;;) {
    const hHttp = lower.indexOf("http://", from);
    const hHttps = lower.indexOf("https://", from);
    const at =
      hHttp === -1 ? hHttps : hHttps === -1 ? hHttp : Math.min(hHttp, hHttps);
    if (at === -1) break;

    // Must start at a token boundary, or it is part of a longer word.
    if (at > 0 && !OPENERS.has(line[at - 1])) {
      from = at + 4;
      continue;
    }

    // Extent: to the first whitespace or control character.
    let end = at;
    while (end < line.length && !isControl(line[end])) end += 1;

    const raw = trimTrailing(line.slice(at, end));
    if (!isAllowedAbsoluteHttpUrl(raw)) {
      from = at + 4;
      continue;
    }

    if (at > cursor) out.push({ text: line.slice(cursor, at) });

    const internal = toInternalPath(raw);
    out.push(
      internal
        ? // The LABEL stays exactly what the admin typed; only the href becomes
          // relative. Same destination, same tab, no referrer.
          { text: raw, href: internal, external: false }
        : { text: raw, href: raw, external: true },
    );

    cursor = at + raw.length;
    from = cursor;
  }

  if (cursor === 0) return [{ text: line }];
  if (cursor < line.length) out.push({ text: line.slice(cursor) });
  return out;
}

/** True when the line contains at least one linkable URL. */
export function hasLink(line: string): boolean {
  return linkifyLine(line).some((s) => s.href !== undefined);
}
