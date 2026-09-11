// =====================================================================
// SENTRY PAYLOAD SCRUBBER — ADMIN PANEL
//
// WHY THIS FILE EXISTS AT ALL. The admin panel is the one surface where
// STAFF read real family data: a child's first and last name, the 8-digit
// login id, school, city, rayon, grade, gender, and the parent's email and
// phone number. The Accounts export builds a spreadsheet of exactly that,
// and bulk question import posts a multi-megabyte body through a Server
// Action. None of it may ever reach Sentry — Sentry is a third-party
// recipient that neither store data-safety declaration mentions.
//
// The SDK options (dataCollection in sentry.*.config.ts) are the FIRST line
// of defence and they turn off the categories by name. This module is the
// SECOND line: it runs on every event, after every integration, and it
// assumes the first line failed. Two independent controls, because a single
// mistyped option key is otherwise the whole protection.
//
// DESIGN NOTE — NO SDK IMPORT. The types below are structural subsets of
// Sentry's own Event/Breadcrumb, not imports of them. That keeps this module
// unit-testable without booting the SDK, and the generic signatures still
// accept (and return) the real ErrorEvent the SDK hands to beforeSend.
// =====================================================================

// ---------------------------------------------------------------------
// Structural types — deliberately loose supersets of what Sentry sends.
// ---------------------------------------------------------------------
export type ScrubFrame = { vars?: Record<string, unknown> };
export type ScrubStacktrace = { frames?: ScrubFrame[] };
export type ScrubException = {
  type?: string;
  value?: string;
  stacktrace?: ScrubStacktrace;
};
export type ScrubBreadcrumb = {
  category?: string;
  type?: string;
  message?: string;
  data?: { [key: string]: unknown };
};
export type ScrubRequest = {
  url?: string;
  method?: string;
  data?: unknown;
  cookies?: unknown;
  headers?: unknown;
  query_string?: unknown;
  env?: unknown;
};
export type ScrubEvent = {
  message?: string;
  logentry?: { message?: string; params?: unknown };
  transaction?: string;
  server_name?: string;
  exception?: { values?: ScrubException[] };
  breadcrumbs?: ScrubBreadcrumb[];
  request?: ScrubRequest;
  user?: unknown;
  extra?: { [key: string]: unknown };
  contexts?: { [key: string]: unknown };
  tags?: { [key: string]: unknown };
};

// ---------------------------------------------------------------------
// TEXT REDACTION
//
// ORDER IS LOAD-BEARING, twice over:
//   * secrets before everything, so a token is never partially rewritten
//     into something that no longer looks like a token;
//   * UUIDs BEFORE the 8-digit rule, because a UUID's first group is eight
//     hex characters and an all-numeric one would otherwise be shredded
//     into an unrecognisable half-redaction.
//
// No lookbehind assertions anywhere: this module is bundled into the
// BROWSER build, and Safari only learned lookbehind in 16.4. A regex the
// engine cannot parse is a module-level SyntaxError, i.e. a blank admin
// panel — a far worse outcome than a slightly blunter pattern.
// ---------------------------------------------------------------------

/** Anything longer than this is a payload, not a message. */
export const MAX_TEXT_LENGTH = 2000;

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

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // FIRST, AND THE HIGHEST-SEVERITY SHAPE IN THIS FILE: the Postgres error
  // DETAIL. `Key (child_unique_id)=(40318827) already exists` and
  // `Failing row contains (a1b2…, Aylin, Məmmədova, 48310277, Bakı, Nəsimi,
  // female, 7)` are the two shapes that carry a WHOLE DATABASE ROW inside an
  // error message — a child first name, last name, 8-digit login id, city,
  // rayon, gender and grade, verbatim.
  //
  // Nothing else in this file can touch it. Every other rule matches a SHAPE,
  // and a name, a school and a city HAVE no shape. So the parenthesised payload
  // is wiped wholesale and the sentence around it is kept, which leaves the
  // constraint name — the only part anyone debugs from — intact.
  //
  // This panel is exactly where it reaches Sentry: a unique violation on
  // Add-Child or an account edit surfaces the DETAIL through PostgREST, the
  // Accounts export builds a spreadsheet of the same columns, and bulk question
  // import throws on row CONTENT.
  //
  // THEY RUN FIRST ON PURPOSE. Later rules would otherwise bite into the
  // payload from the inside — the phone pattern character class contains
  // `(` and `)`, and the key=value rule matches happily across `password)=(` —
  // and a half-eaten parenthesis leaves the rest of the row behind. Both
  // replacements are fixed points of their own patterns, so redactText stays
  // idempotent.
  //
  // The patterns themselves are in the shared block above, which the web app
  // and the mobile app carry verbatim: a row detail that leaks in one app
  // leaks in all three, so the rule has one definition and three copies that a
  // test compares byte for byte.
  [KEY_DETAIL_RE, KEY_DETAIL_TO],
  [FAILING_ROW_RE, FAILING_ROW_TO],
  // Supabase Storage object paths. This panel writes and reads avatars and
  // question media, and the OBJECT KEY is derived per child — so the path is
  // identifying even when the host is not. Mirrored from
  // web-app/src/lib/observability/sentryScrub.ts, whose absence here was the
  // asymmetry: an avatar URL in an admin stack trace survived every rule below
  // it, because a storage key is not a UUID, not an email and not 8 digits.
  //
  // The lookahead makes the rule a FIXED POINT of its own output: the character
  // class excludes `]`, so without it a second pass matched
  // `/storage/v1/object/[redacted` and appended one more `]` — and this text is
  // re-redacted routinely, because scrubUrl redacts a path and beforeSend then
  // redacts the assembled string again.
  [
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/|upload\/)?(?!\[redacted\])[^\s"'<>)\]]*/gi,
    "/storage/v1/object/[redacted]",
  ],
  // JSON Web Tokens. The Supabase SERVICE-ROLE KEY is a JWT, and so is any
  // parent/child session token. This is the single highest-severity string
  // that could plausibly appear in an admin-panel stack trace.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[redacted:token]"],
  // Supabase's newer non-JWT key formats (sb_secret_, sb_publishable_, sbp_).
  [/\bsb(?:p|_secret|_publishable)_[A-Za-z0-9_-]{8,}/gi, "[redacted:token]"],
  // Postgres connection strings — OLIMPIADA_PROD_DB_URL / _STAGING_DB_URL.
  [/\bpostgres(?:ql)?:\/\/\S+/gi, "[redacted:db-url]"],
  // Any other URL carrying inline credentials (scheme://user:pass@host).
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@\S+/gi, "[redacted:url-credentials]"],
  // key=value / key: value secrets, however they are spelled. The optional
  // quote after the key name is what makes this work on JSON — `"apikey":"…"`
  // puts a quote between the key and the colon, and without it the pattern
  // matches only bare `key=value` text and silently misses every serialized
  // request body.
  [
    /\b(api[_-]?key|apikey|authorization|bearer|access[_-]?token|refresh[_-]?token|service[_-]?role(?:[_-]?key)?|password|passwd|pwd|secret|token)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;"'}\])]+)/gi,
    "$1=[redacted]",
  ],
  // THE SHAPE BACKSTOP: any opaque high-entropy blob of 40+ characters.
  //
  // This is the ONE app that holds the service-role client, so it is the one
  // app where an unrecognised credential format matters most — and every rule
  // above it is a list of formats somebody already knew about. A UUID is 36
  // characters and survives this (the UUID rule below owns those); ordinary
  // prose never contains a 40-character unbroken run of [A-Za-z0-9_-].
  // Mirrored from web-app/src/lib/observability/sentryScrub.ts.
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted:token]"],
  // Email addresses. This one rule covers the parent's real address AND the
  // child's synthetic login address c<8-digit-id>@children.invalid, which is
  // how the 8-digit id leaks out of Supabase Auth error text.
  [/[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[redacted:email]"],
  // E.164 phone numbers — profiles.phone is CHECK-constrained to this shape.
  [/\+[1-9]\d[\d\s().-]{5,17}\d/g, "[redacted:phone]"],
  // UUIDs: profile ids, student profile ids, attempt ids, media ids. Not a
  // name, but a stable per-child identifier, which is the same problem.
  [
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    "[redacted:uuid]",
  ],
  // The 8-digit child login id itself, standing alone.
  [/\b\d{8}\b/g, "[redacted:id]"],
];

/** Redact every known-sensitive pattern from a free-text string, then cap it. */
export function redactText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  if (out.length > MAX_TEXT_LENGTH) {
    out = out.slice(0, MAX_TEXT_LENGTH) + "… [truncated]";
  }
  return out;
}

// ---------------------------------------------------------------------
// URL SCRUBBING
//
// The QUERY STRING IS DROPPED WHOLESALE, not filtered. The Accounts screen
// has a search box, and its query lands in the URL: a name typed into it is
// a direct name leak that no allowlist of parameter names would catch,
// because the parameter name ("q") is innocent and the VALUE is the problem.
//
// Path segments that are a UUID or a long digit run collapse to ":id",
// giving the same shape the App Router already uses for transaction names
// so events still group correctly.
// ---------------------------------------------------------------------
const UUID_SEGMENT =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NUMERIC_ID_SEGMENT = /^\d{4,}$/;

export function scrubUrl(rawUrl: string): string {
  const withoutHash = rawUrl.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const collapsed = withoutQuery
    .split("/")
    .map((segment) =>
      UUID_SEGMENT.test(segment) || NUMERIC_ID_SEGMENT.test(segment) ? ":id" : segment,
    )
    .join("/");
  return redactText(collapsed);
}

// ---------------------------------------------------------------------
// BREADCRUMBS
// ---------------------------------------------------------------------

/** Keys whose value is a URL and must be collapsed, not merely redacted. */
const URL_DATA_KEYS = new Set([
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

function isUrlishKey(key: string): boolean {
  return URL_DATA_KEYS.has(key);
}

// ---------------------------------------------------------------------
// STRUCTURED-FIELD REDACTION
//
// The half of the problem redactText CANNOT solve. A child first name, school,
// city, rayon and gender are ordinary words — no regex finds them, and no
// amount of tuning the patterns above ever will. So wherever the SDK hands us
// a KEY and a VALUE (a tag, a context field, a breadcrumb data entry), the
// value is dropped when the KEY says the value is about a person.
//
// This mirrors web-app/src/lib/observability/sentryScrub.ts on purpose. Its
// absence here was a structural asymmetry, not a style difference: without it
// `contexts.device.name` — which on a staff laptop is habitually
// "<a person>s MacBook" — and any tag keyed `child_name`, `school` or
// `gender` walked straight through redactText untouched, because there was
// nothing in the VALUE to match.
//
// IT OVER-REDACTS, AND THAT IS THE ACCEPTED TRADE. `name` also catches
// `contexts.browser.name` and `contexts.os.name`, so "Chrome" and "Windows"
// arrive as [redacted] while their `version` fields survive. A blunter
// debugging session is recoverable; a child name sitting in a Sentry issue is
// not.
// ---------------------------------------------------------------------
const REDACTED = "[redacted]";

const SENSITIVE_KEY_RE =
  /(pass|pwd|secret|token|api[_-]?key|auth|session|cookie|credential|bearer|dsn|name|surname|school|city|district|rayon|region|address|gender|birth|avatar|photo|phone|mobile|tel|email|mail|child|student|parent|query|body|payload|data|url)/i;

// THE VALUE-SHAPED BACKSTOP.
//
// SENSITIVE_KEY_RE is a list of NAMES, and a list of names only ever catches
// the keys somebody already thought of. `{ ref: 40318827 }`,
// `{ contact: "+994501234567" }` and `{ owner: "leyla@example.com" }` name
// nothing personal and sail straight through it. For a STRING that does not
// matter, because redactText sees the value and matches on its shape. For a
// NUMBER it matters completely — redactText is never called on one — so an
// 8-digit child login id arriving as a JSON number travelled verbatim under
// any key at all, and an Accounts payload is full of them.
//
// Only shapes recognisable WITHOUT a key are listed. A first name, a school
// and a city stay undetectable and always will; that residue is structural and
// is documented as such rather than papered over.
const SHAPED_VALUE_RES: ReadonlyArray<RegExp> = [
  /^\d{8}$/, // the 8-digit child login id, standing alone
  /^\+[1-9]\d{6,14}$/, // E.164, the shape profiles.phone is constrained to
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, // an email address
];

/** True when a value identifies a person whatever key it arrived under. */
function isShapedValue(value: number | string): boolean {
  const text = String(value);
  return SHAPED_VALUE_RES.some((pattern) => pattern.test(text));
}

/**
 * Scrub a value of unknown shape, bounded in DEPTH and in BREADTH.
 *
 * The two bounds stop two different failures. `depth` stops a CYCLIC structure
 * — a React fiber, a DOM node, an Error whose `cause` chain loops back — from
 * hanging the SDK inside beforeSend, where there is no timeout and the app is
 * already on an error path. The array slice stops a 250-row bulk-import payload
 * being walked element by element for nothing.
 */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return REDACTED;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number") return isShapedValue(value) ? REDACTED : value;
  if (typeof value === "boolean" || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => scrubValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out: { [key: string]: unknown } = {};
    for (const [key, entry] of Object.entries(value as { [key: string]: unknown })) {
      out[key] = scrubField(key, entry, depth + 1);
    }
    return out;
  }
  // Functions, symbols, bigints — nothing legitimate, never serialize them.
  return REDACTED;
}

/** One key/value pair: URL keys collapse, person keys vanish, the rest recurse. */
function scrubField(key: string, value: unknown, depth = 0): unknown {
  if (isUrlishKey(key)) {
    return typeof value === "string" ? scrubUrl(value) : REDACTED;
  }
  if (SENSITIVE_KEY_RE.test(key)) return REDACTED;
  return scrubValue(value, depth);
}

/**
 * Scrub one breadcrumb, or drop it entirely.
 *
 * CONSOLE BREADCRUMBS ARE DROPPED OUTRIGHT. This app has ~186 console.error
 * call sites; most log an `error.code`, but the ones that log
 * `error.message` hand over Postgres text, and a Postgres unique-violation
 * DETAIL embeds the VALUE that collided — a child_unique_id, or the
 * synthetic child login address. Redacting them would mostly work; not
 * collecting them always works, and console breadcrumbs are low value next
 * to the fetch/navigation trail that is kept.
 */
export function scrubBreadcrumb<T extends ScrubBreadcrumb>(breadcrumb: T): T | null {
  return scrubBreadcrumbInPlace(breadcrumb) ? breadcrumb : null;
}

function scrubBreadcrumbInPlace(breadcrumb: ScrubBreadcrumb): boolean {
  if (breadcrumb.category === "console") return false;

  if (typeof breadcrumb.message === "string") {
    // DOM breadcrumbs put the clicked element's selector here, and an
    // aria-label in this panel can legitimately contain a child's name.
    breadcrumb.message = redactText(breadcrumb.message);
  }

  const data = breadcrumb.data;
  if (data) {
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (value !== null && typeof value === "object") {
        // A nested object on a breadcrumb is a request/response payload. That
        // is precisely the shape an exported account row or an imported
        // question row takes, and none of it is worth the risk. DELETED rather
        // than recursed: no breadcrumb payload on this app is worth keeping.
        delete data[key];
      } else {
        // scrubField rather than redactText, because a crumb keyed
        // `child_name`, `school` or `gender` carries a value with no shape for
        // any pattern above to match.
        data[key] = scrubField(key, value, 1);
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------
// EVENTS
// ---------------------------------------------------------------------

/**
 * Contexts allowed to survive. Everything else is deleted rather than
 * inspected: `contexts` is an open map, and an allowlist is the only form of
 * it that stays correct as the SDK adds new context types. `trace` is kept
 * because dropping it breaks event grouping.
 */
const ALLOWED_CONTEXT_KEYS = new Set([
  "trace",
  "runtime",
  "os",
  "device",
  "browser",
  "culture",
  "app",
  "cloud_resource",
  "react",
  "nextjs",
]);

/**
 * Scrub one event in place, or drop it.
 *
 * Returns `null` for an event that carries neither an exception nor a
 * message — an empty event is unactionable and would still cost one of the
 * 5,000 monthly occurrences the whole org shares.
 */
export function scrubEvent<T extends ScrubEvent>(event: T): T | null {
  return scrubEventInPlace(event) ? event : null;
}

function scrubEventInPlace(event: ScrubEvent): boolean {
  // 1) IDENTITY. Nothing in this repository calls Sentry.setUser(), and
  //    `user` is explicitly exempt from the SDK's own PII controls — so if it
  //    is ever populated, only this line removes it.
  delete event.user;

  // 2) THE REQUEST ENVELOPE. `data` is the Server Action / route-handler
  //    body: the bulk-import JSON, the Add-Child form, a password reset.
  //    `cookies` are the Supabase session itself — a leaked sb-*-auth-token
  //    is a live admin login, not merely a privacy problem.
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.headers;
    delete request.query_string;
    delete request.env;
    if (typeof request.url === "string") request.url = scrubUrl(request.url);
  }

  // 3) ARBITRARY ATTACHMENTS. `extra` is an open bag; nothing here writes to
  //    it, so deleting it costs nothing and closes the largest unknown.
  delete event.extra;

  // 4) CONTEXTS — allowlist, then shallow-redact whatever survived.
  const contexts = event.contexts;
  if (contexts) {
    for (const key of Object.keys(contexts)) {
      if (!ALLOWED_CONTEXT_KEYS.has(key)) {
        delete contexts[key];
        continue;
      }
      const context = contexts[key];
      if (context && typeof context === "object") {
        const bag = context as { [field: string]: unknown };
        for (const field of Object.keys(bag)) {
          // Every field, not only the string ones, and by KEY as well as by
          // shape:
          //   * `contexts.nextjs.request_path` (set by captureRequestError) is
          //     a resolved URL, so it gets the URL treatment — redactText alone
          //     would leave a search query like ?q=<child name> intact;
          //   * `contexts.device.name` is a person name and has no shape, so
          //     only the key denylist removes it;
          //   * a NESTED object used to be skipped outright by a
          //     `typeof value !== "string"` guard, which is how a whole bag of
          //     fields inside an allowed context travelled unscrubbed.
          bag[field] = scrubField(field, bag[field], 1);
        }
      }
    }
  }

  // 5) TAGS.
  const tags = event.tags;
  if (tags) {
    for (const key of Object.keys(tags)) {
      // Tags are INDEXED AND SEARCHABLE in Sentry, which makes a tag the worst
      // place for a name to land. The key check is what catches `child_name`,
      // `school` and `gender`, whose VALUES no pattern can recognise.
      tags[key] = scrubField(key, tags[key], 1);
    }
  }

  // 6) TITLES AND MESSAGES. `server_name` is the machine hostname; not family
  //    data, but infrastructure detail with no diagnostic value on
  //    serverless, so it goes too.
  delete event.server_name;
  if (typeof event.message === "string") event.message = redactText(event.message);
  if (typeof event.transaction === "string") {
    event.transaction = redactText(event.transaction);
  }
  const logentry = event.logentry;
  if (logentry) {
    if (typeof logentry.message === "string") {
      logentry.message = redactText(logentry.message);
    }
    delete logentry.params;
  }

  // 7) EXCEPTIONS — the issue TITLE, which no breadcrumb filter can reach —
  //    and the stack-frame LOCALS, which is where the service-role key or a
  //    rows[] array from an export would be sitting.
  const values = event.exception?.values;
  if (values) {
    for (const value of values) {
      if (typeof value.value === "string") value.value = redactText(value.value);
      if (typeof value.type === "string") value.type = redactText(value.type);
      const frames = value.stacktrace?.frames;
      if (frames) {
        for (const frame of frames) delete frame.vars;
      }
    }
  }

  // 8) BREADCRUMBS.
  const breadcrumbs = event.breadcrumbs;
  if (breadcrumbs) {
    event.breadcrumbs = breadcrumbs.filter((breadcrumb) =>
      scrubBreadcrumbInPlace(breadcrumb),
    );
  }

  // 9) NOISE GATE.
  const hasException = (values ?? []).some(
    (value) => Boolean(value.value) || Boolean(value.type),
  );
  const hasMessage = Boolean(event.message) || Boolean(event.logentry?.message);
  return hasException || hasMessage;
}

// ---------------------------------------------------------------------
// NOISE CONTROLS
//
// The free (Developer) plan is 5,000 EVENTS PER MONTH, counted per
// occurrence, shared across every project in the org, with no overage to
// buy. A loop in this panel therefore blinds the parent-facing web app. The
// per-DSN rate limit configured in the Sentry UI is the only hard cap; these
// lists are the cheap client-side layer above it.
// ---------------------------------------------------------------------

export const IGNORED_ERRORS: (string | RegExp)[] = [
  // Next.js CONTROL FLOW, not failures. redirect() and notFound() throw by
  // design and this app calls both (guards.ts, every [id] page).
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  // Layout thrash, not a bug, and extremely repetitive.
  /^ResizeObserver loop/,
  // Transport noise: a laptop lid closing mid-request produces these forever.
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "AbortError",
  /The operation was aborted/,
  "TypeError: cancelled",
  // Unactionable by construction — no stack, no message.
  "Non-Error promise rejection captured",
  // Browser extensions injecting into a privileged page.
  /extension\//,
  "top.GLOBALS",
];

export const DENIED_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome(-extension)?:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:/i,
];
