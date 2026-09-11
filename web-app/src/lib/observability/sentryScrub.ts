// Sentry payload scrubbing — the only thing standing between this product's
// data and a third party.
//
// WHY THIS FILE IS AS PARANOID AS IT IS. OlympIQ holds MINORS' personal data:
// children's first and last names, their 8-digit login IDs, school, city and
// rayon, grade, an optional gender, avatars and quiz results — plus parent
// emails and phone numbers. Sentry is a NEW third-party recipient, and neither
// the Play *Data safety* declaration nor the App Store *App Privacy* card lists
// it today. The SDK options in `sentryOptions.ts` turn every automatic
// collector OFF; this file is the second layer, for the data that arrives
// inside an error MESSAGE rather than inside a collector.
//
// THE DESIGN RULE: match by SHAPE, never by a list of field names.
// A denylist of names ("password", "serviceRoleKey", …) only catches the leaks
// somebody already thought of. A Postgres unique-violation DETAIL, a Supabase
// auth error quoting `c12345678@children.invalid`, or a stack frame that
// stringified a connection string all arrive under names nobody predicted.
// So every free-text string leaving this process is rewritten by `redactText`,
// which keys off the *form* of the value: a JWT looks like a JWT, a connection
// string looks like a connection string, an 8-digit run looks like a child ID.
//
// WHAT SHAPE CANNOT CATCH: a child's first name, school or city are ordinary
// words — no regex finds them. Those are handled structurally instead, by
// deleting the containers they can live in (request bodies, cookies, headers,
// query strings, stack-frame locals, `extra`) rather than by pattern-matching
// their contents. See `scrubEvent` below and `dataCollection` in
// `sentryOptions.ts`.
//
// This module is PURE and type-only in its imports on purpose, so the whole
// posture is unit-testable without booting the SDK:
// `src/lib/__tests__/sentryScrub.test.ts` feeds it one event per class of
// forbidden data and asserts none survives.
import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";

export const REDACTED = "[redacted]";

// ---------------------------------------------------------------------------
// Free-text redaction
// ---------------------------------------------------------------------------

// --- SHARED ROW-DETAIL RULES: BEGIN ---
// Byte-for-byte identical in all three apps, and a test in each app's suite
// reads the other two files and fails if they drift:
//   web-app/src/lib/observability/sentryScrub.ts
//   admin-panel/src/lib/sentry/scrub.ts
//   mobile-app/src/lib/sentryScrub.ts
//
// THE PARENTHESIS HOLE THIS CLOSES. Both rules used to end their payload at
// `[^)]*` — the FIRST inner close-parenthesis. An Azerbaijani school is
// routinely written "132 (tam orta) məktəb", so a row carrying one ended the
// match at "orta)" and EVERY COLUMN AFTER IT survived: in the verifier's own
// fixture that is the city, the rayon, the gender and the grade.
//
// `PAREN_PAYLOAD` matches a parenthesised payload containing one level of
// balanced nesting. `[^()]` cannot cross a parenthesis of EITHER kind, so the
// greedy loop can only advance past a `(` by consuming a complete `(…)` pair.
// That makes it a real balanced matcher rather than a greedy `.*`: it stops at
// the payload's own closing parenthesis, so a following sentence — " already
// exists.", or a second `Key (…)=(…)` later on the line — is never swallowed.
//
// `PAREN_TAIL` is the second alternative, and it exists because a regex cannot
// count. Deeper nesting, or an UNBALANCED parenthesis inside a value ("Məktəb
// (filial"), makes the balanced branch fail — and a rule that fails outright
// leaks the whole row, which is far worse than over-redacting. So when the
// balanced branch cannot match, the rest of the LINE goes instead. Regex
// alternation is ordered, so the precise branch always wins when it can.
//
// Both replacements are fixed points of the balanced branch, so redaction stays
// idempotent however many times it runs.
const PAREN_PAYLOAD = "\\((?:[^()]|\\([^()]*\\))*\\)";
const PAREN_TAIL = "\\([^\\r\\n]*";
const KEY_DETAIL_RE = new RegExp(
  `\\bKey\\s*(?:${PAREN_PAYLOAD}\\s*=\\s*${PAREN_PAYLOAD}` +
    `|\\([^\\r\\n]*?\\)\\s*=\\s*${PAREN_TAIL})`,
  "gi",
);
const KEY_DETAIL_TO = "Key ([redacted])=([redacted])";
const FAILING_ROW_RE = new RegExp(
  `\\bFailing row contains\\s*(?:${PAREN_PAYLOAD}|${PAREN_TAIL})`,
  "gi",
);
const FAILING_ROW_TO = "Failing row contains ([redacted])";
// --- SHARED ROW-DETAIL RULES: END ---

// Each rule is [pattern, replacement]. ORDER MATTERS and is commented per rule;
// a later rule must never be able to chew up a span an earlier one owns.
const TEXT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // 1. Postgres error DETAIL lines. `Key (child_unique_id)=(12345678) already
  //    exists` and `Failing row contains (…, Aylin, Məmmədova, 7, …)` are the
  //    two shapes that carry whole ROWS — including names, which no other rule
  //    here can see. Wipe the parenthesised payload wholesale, keep the
  //    sentence so the error is still recognisable. Both live in the shared
  //    block above, which the other two apps carry verbatim.
  [KEY_DETAIL_RE, KEY_DETAIL_TO],
  [FAILING_ROW_RE, FAILING_ROW_TO],

  // 2. Supabase Storage object paths — this is where avatar URLs live, and the
  //    object key itself is derived per child. Keep the prefix for grouping.
  //    The lookahead is what makes the rule a FIXED POINT of its own output:
  //    the character class excludes `]`, so without it a second pass matched
  //    `/storage/v1/object/[redacted` and appended one more `]`. This text is
  //    re-redacted routinely — `scrubUrl` redacts each path segment and
  //    `beforeSend` then redacts the assembled string again.
  [
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/|upload\/)?(?!\[redacted\])[^\s"'<>)\]]*/gi,
    "/storage/v1/object/[redacted]",
  ],

  // 3. CONNECTION STRINGS, by shape. Any `scheme://user:pass@host/…` — this is
  //    `OLIMPIADA_PROD_DB_URL` / `OLIMPIADA_STAGING_DB_URL` whatever they are
  //    named, and it is matched on the credential form, not on the variable
  //    name. The second rule catches a postgres URL carrying no inline
  //    credentials.
  [
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]*@[^\s"'<>)\]]+/gi,
    "[redacted:connection-string]",
  ],
  [/\bpostgres(?:ql)?:\/\/[^\s"'<>)\]]+/gi, "[redacted:connection-string]"],

  // 4. `Authorization: Bearer …` in any stringified form.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],

  // 5. JWTs. The Supabase SERVICE-ROLE KEY is a JWT; so is every access token
  //    and the anon key. Three dot-separated base64url segments beginning
  //    `eyJ` (base64 for `{"`), then a looser fallback for an unsigned or
  //    truncated one.
  [
    /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
    "[redacted:token]",
  ],
  [/\beyJ[A-Za-z0-9_-]{20,}/g, "[redacted:token]"],

  // 6. Supabase's newer non-JWT key formats (`sb_secret_…`, `sb_publishable_…`,
  //    `sbp_…`) so a future key rotation does not quietly defeat rule 5.
  [/\bsb(?:p|_secret|_publishable)?_[A-Za-z0-9_-]{10,}/gi, "[redacted:token]"],

  // 7. `name = value` where the NAME says secret. This one IS name-based, but
  //    it is additive belt-and-braces on top of the shape rules above, never
  //    the primary defence.
  [
    /((?:api[_-]?key|secret|token|passwo?rd|passwd|pwd|authorization|service[_-]?role|session)["'\s]*[:=]\s*["']?)[^\s"',;&}\]]{4,}/gi,
    "$1[redacted]",
  ],

  // 8. THE SHAPE BACKSTOP: any opaque high-entropy blob of 40+ characters.
  //    A UUID is 36 and survives it (rule 11 owns those); prose never looks
  //    like this. This is what guarantees an unrecognised FUTURE key format
  //    cannot walk out of the process.
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted:token]"],

  // 9. Email addresses — parents' real addresses, and the child's synthetic
  //    Supabase Auth identity `c<8-digit-id>@children.invalid`
  //    (see `childSyntheticEmail`, src/lib/auth/children.ts), which embeds the
  //    login ID in every auth error message Supabase produces.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted:email]"],

  // 10. Phone numbers: E.164 as stored (src/lib/phoneE164.ts) and the
  //     Azerbaijani national 0XX XXX XX XX form a human would type.
  [/\+\d[\d\s\-().]{7,}\d/g, "[redacted:phone]"],
  [/\b0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[redacted:phone]"],

  // 11. UUIDs. `students.profile_id`, attempt ids, subject ids. Pseudonymous
  //     rather than identifying, but STABLE PER CHILD — and removing them also
  //     improves Sentry's grouping, because two reports of one bug stop looking
  //     like two different issues. Must run BEFORE rule 12: a UUID's first
  //     group can be eight digits.
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "[redacted:uuid]",
  ],

  // 12. The 8-digit child login ID, bare. Deliberately aggressive: it will also
  //     eat an 8-digit date like 20260911. That is the correct trade — a date
  //     in an error message is worth nothing next to a child's credentials.
  [/\b\d{8}\b/g, "[redacted:id]"],
];

/**
 * Rewrite one free-text string so no value of a forbidden SHAPE survives.
 * Safe to call on anything, including already-redacted text.
 */
export function redactText(value: string): string {
  if (!value) return value;
  let out = value;
  for (const [pattern, replacement] of TEXT_RULES) {
    // Every RegExp here is global; String.replace resets lastIndex itself.
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structured-field redaction
// ---------------------------------------------------------------------------

// Field NAMES whose value is dropped outright regardless of what it looks like.
// This is the half of the problem `redactText` cannot solve: a first name, a
// school or a city is an ordinary word. Anywhere the SDK hands us a key/value
// pair (tags, contexts, breadcrumb data) the value goes when the key says the
// value is about a person.
const SENSITIVE_KEY_RE =
  /(pass|pwd|secret|token|api[_-]?key|auth|session|cookie|credential|bearer|dsn|name|surname|school|city|district|rayon|region|address|gender|birth|avatar|photo|phone|mobile|tel|email|mail|child|student|parent|query|body|payload|data|url)/i;

// Field NAMES whose value is a URL. These are collapsed by `scrubUrl` rather
// than blanked, because the route shape is the most useful thing an event can
// still say once everything identifying is gone — and because blanking a URL is
// NOT the same as dropping its query string.
//
// `request_path` is the entry that made this a defect rather than a tidy-up:
// `Sentry.captureRequestError` writes the RESOLVED request path — query string
// and all — into `contexts.nextjs.request_path`, and `redactText` alone leaves
// `?q=<a child's name>` completely intact, because an ordinary word has no
// shape for a regex to find. Only `scrubUrl` drops the query.
const URL_KEYS = new Set([
  "url",
  "from",
  "to",
  "href",
  "path",
  "pathname",
  "referrer",
  "request_path",
  "router_path",
  "route_path",
]);

// THE VALUE-SHAPED BACKSTOP.
//
// `SENSITIVE_KEY_RE` above is a list of NAMES, and a list of names only ever
// catches the keys somebody already thought of: `{ ref: 48310277 }`,
// `{ contact: "+994501234567" }` and `{ owner: "leyla@example.com" }` all sail
// straight through it. For a STRING that does not matter — `redactText` sees
// the value itself and matches on its shape. For a NUMBER it matters
// completely, because `redactText` is never called on one: an 8-digit child
// login ID arriving as a JSON number travelled to Sentry verbatim under any
// key at all.
//
// Only shapes that are recognisable WITHOUT a key are listed. A first name, a
// school and a city stay undetectable and always will — that residue is
// structural, and is stated at the top of this file rather than papered over.
const SHAPED_VALUE_RES: readonly RegExp[] = [
  /^\d{8}$/, // the 8-digit child login ID, standing alone
  /^\+[1-9]\d{6,14}$/, // E.164, the form profiles.phone is stored in
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, // an email address
];

/** True when a value identifies a person whatever key it arrived under. */
function isShapedValue(value: number | string): boolean {
  const text = String(value);
  return SHAPED_VALUE_RES.some((pattern) => pattern.test(text));
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 4) return REDACTED;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number") return isShapedValue(value) ? REDACTED : value;
  if (typeof value === "boolean" || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrubUnknown(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (URL_KEYS.has(k)) {
        out[k] = typeof v === "string" ? scrubUrl(v) : REDACTED;
      } else if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubUnknown(v, depth + 1);
      }
    }
    return out;
  }
  // Functions, symbols, bigints — nothing legitimate, do not serialize them.
  return REDACTED;
}

/**
 * Reduce a URL to its ROUTE SHAPE: same origin and path skeleton (so Sentry can
 * still group, and the report still says *where* it broke), with every segment
 * that identifies a person replaced by a placeholder and the query string
 * removed entirely.
 *
 * `/children/3f2a…/edit` becomes `/children/:id/edit`;
 * `/child/test/review/<attempt uuid>` becomes `/child/test/review/:id`.
 */
export function scrubUrl(raw: string): string {
  if (!raw) return raw;
  let url: URL;
  let relative = false;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, "http://scrub.invalid");
      relative = true;
    } catch {
      // Not a URL at all — fall back to plain text redaction.
      return redactText(raw);
    }
  }

  const path = url.pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      if (/^\d{8}$/.test(segment)) return ":childId";
      if (/^\d{4,}$/.test(segment)) return ":id";
      if (segment.includes("@")) return ":redacted";
      // An opaque long token in the path (magic links, signed storage URLs).
      if (segment.length > 32 && /^[A-Za-z0-9_.~-]+$/.test(segment)) {
        return ":token";
      }
      return redactText(segment);
    })
    .join("/");

  // The query string is DROPPED, not scrubbed: `?email=…`, `?next=…` and the
  // Supabase auth `?code=…` all live there and none of it helps debugging.
  const query = url.search ? "?[redacted]" : "";
  return relative ? `${path}${query}` : `${url.origin}${path}${query}`;
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

/**
 * `beforeBreadcrumb`. Returns `null` to drop the crumb entirely.
 *
 * CONSOLE CRUMBS ARE DROPPED OUTRIGHT. web-app/src carries ~130 `console.error`
 * sites; most log an `error.code`, but a handful log `error.message`, and a
 * Supabase/Postgres message embeds VALUES — a unique-violation DETAIL can carry
 * a `child_unique_id`, and any auth error quotes `c<id>@children.invalid`.
 * Redacting them would mostly work; dropping them always works, and a console
 * line is the least valuable crumb we have.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;

  const out: Breadcrumb = { ...breadcrumb };
  if (typeof out.message === "string") out.message = redactText(out.message);

  if (out.data && typeof out.data === "object") {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      if (URL_KEYS.has(k)) {
        data[k] = typeof v === "string" ? scrubUrl(v) : REDACTED;
      } else if (SENSITIVE_KEY_RE.test(k)) {
        data[k] = REDACTED;
      } else {
        data[k] = scrubUnknown(v, 1);
      }
    }
    out.data = data;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * `beforeSend`. Returns `null` to drop the event entirely.
 *
 * Deletes the containers that can hold a child's name/school/city/gender
 * (request body, cookies, headers, query string, stack-frame locals, `extra`),
 * then rewrites every free-text string that is left through `redactText`.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  // 1. Identity. Sentry.setUser() is never called anywhere in this app — both
  //    `sendDefaultPii` and `dataCollection` explicitly do NOT cover data that
  //    was set deliberately, so "never set it" is the only safe posture. This
  //    deletion holds the line even if a future integration sets it for us.
  delete event.user;

  // 2. `extra` is free-form and is exactly where a developer reflexively
  //    attaches "the object that failed". Never send it.
  delete event.extra;

  // 3. The request. Keep the method and the route SHAPE; drop everything else.
  //    POST /api/mobile/v1/auth/child-login carries `{ child_id, password }`;
  //    /children/[id]/edit carries the child's name, school, city, rayon, grade
  //    and gender; the `sb-*-auth-token` cookie IS a live session.
  if (event.request) {
    const { method, url } = event.request;
    event.request = {
      ...(method ? { method } : {}),
      ...(typeof url === "string" ? { url: scrubUrl(url) } : {}),
    };
  }

  // 4. Transaction / message text.
  if (typeof event.transaction === "string") {
    event.transaction = redactText(event.transaction);
  }
  if (typeof event.message === "string") {
    event.message = redactText(event.message);
  } else if (event.message && typeof event.message === "object") {
    const parameterized = event.message as { message?: string };
    if (typeof parameterized.message === "string") {
      parameterized.message = redactText(parameterized.message);
    }
  }

  // 4b. `logentry` — the SAME text as `message`, carried in a different field.
  //     Sentry populates it for captureMessage and for logger integrations, and
  //     it is what the issue list actually renders when an event has no
  //     exception. It was missed here while admin-panel and mobile-app both
  //     handled it, so a message containing a child name shipped verbatim from
  //     the ONE app that serves parents directly. `params` is the interpolation
  //     array — the values that were substituted into the template, which is
  //     exactly where a name or an 8-digit id would sit — so it is deleted
  //     outright rather than redacted, matching the treatment of `extra`.
  const logentry = event.logentry as
    | { message?: string; params?: unknown }
    | undefined;
  if (logentry) {
    if (typeof logentry.message === "string") {
      logentry.message = redactText(logentry.message);
    }
    delete logentry.params;
  }

  // 5. The exception itself — the ISSUE TITLE, and the one place breadcrumb
  //    filtering cannot help.
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = redactText(value.value);
    if (typeof value.type === "string") value.type = redactText(value.type);
    for (const frame of value.stacktrace?.frames ?? []) {
      // Local variables are the path by which SUPABASE_SERVICE_ROLE_KEY or a
      // DB URL held in a local would reach Sentry. `stackFrameVariables: false`
      // already stops them being collected; this is the second lock.
      delete frame.vars;
      if (typeof frame.context_line === "string") {
        frame.context_line = redactText(frame.context_line);
      }
      if (frame.pre_context) frame.pre_context = frame.pre_context.map(redactText);
      if (frame.post_context) {
        frame.post_context = frame.post_context.map(redactText);
      }
    }
  }

  // 6. Contexts. `response` carries headers (and therefore Set-Cookie);
  //    everything else goes through the key denylist plus text redaction, and
  //    any URL-shaped FIELD through `scrubUrl` — `contexts.nextjs.request_path`
  //    is a resolved request URL and would otherwise keep its query string,
  //    which on this app is `?q=<a child's name>` from a search box.
  if (event.contexts) {
    const contexts = { ...event.contexts } as Record<string, unknown>;
    delete contexts.response;
    event.contexts = scrubUnknown(contexts, 1) as Event["contexts"];
  }

  // 7. Tags (short key/value pairs, indexed and searchable in Sentry).
  if (event.tags) event.tags = scrubUnknown(event.tags, 1) as Event["tags"];

  // 8. Breadcrumbs, again — `beforeBreadcrumb` covers the crumbs the SDK
  //    records, but an event can arrive with crumbs attached by other means.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }

  // 9. Noise gate. An event with neither a stack nor a message is not
  //    actionable, and the free plan's 5,000 monthly occurrences are spent per
  //    OCCURRENCE with no way to buy more.
  const hasException = (event.exception?.values ?? []).length > 0;
  const hasMessage =
    typeof event.message === "string"
      ? event.message.trim().length > 0
      : !!event.message;
  if (!hasException && !hasMessage) return null;

  return event;
}
