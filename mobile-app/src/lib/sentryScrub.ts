// SENTRY PAYLOAD SCRUBBER — the last gate before anything leaves this device.
//
// WHY THIS FILE IS PURE, AND WHY IT LIVES APART FROM `sentry.ts`
// -------------------------------------------------------------
// `@sentry/react-native` is a NATIVE module. Importing it pulls in the RN
// bridge, which jest cannot load without a full native mock, and a control this
// important must be testable without one. So the rules live here as plain
// (input) -> (output) functions over the SDK's TYPES ONLY (`import type` is
// erased at compile time and never reaches the bundler or jest), and
// `src/lib/sentry.ts` does nothing but hand them to `Sentry.init`.
//
// WHAT THIS APP HOLDS, AND WHY THE DEFAULT POSTURE IS NOT ENOUGH
// --------------------------------------------------------------
// The people using this binary are CHILDREN. Their first and last names, the
// 8-digit login ID they sign in with, their school, city and rayon, grade, an
// optional gender, an avatar and every quiz answer they have ever given are all
// in this process's memory. Their parents' emails and phone numbers are too.
// Sentry is a THIRD-PARTY RECIPIENT that neither store's data-safety
// declaration mentions (see `markdowns/STORE_LAUNCH_PACK.md` section 2), so the
// question is not "is this field sensitive" but "can we prove this field cannot
// leave". `sendDefaultPii: false` answers part of it — it keeps the IP address,
// request headers and the native `device.name` (which on BOTH platforms is
// routinely a PERSON'S NAME: "Aysel's Galaxy", "Kamil's iPhone") out of the
// payload. It does NOT answer the rest:
//
//   * An EXCEPTION MESSAGE is never filtered by any option. A Postgres
//     unique-violation DETAIL carries the offending VALUE, and the child's
//     Supabase Auth email is literally `c<8-digit-id>@children.invalid`
//     (minted by `childSyntheticEmail` on the web side), so any auth error text
//     contains the login ID verbatim.
//   * A BREADCRUMB from `console.*` carries whatever was logged — ours are few
//     and dev-gated, but react-query, expo-* and the Supabase client all log.
//   * An XHR breadcrumb carries the URL, and Supabase REST URLs end in
//     `?...=eq.<uuid>` filters.
//
// SO THE RULE IS DENY-BY-DEFAULT ON THE FREE-TEXT SURFACES: every string that
// could have come from a database row, a log line or a URL is run through
// `redact()`, and the fields that exist only to carry identity (`user`,
// `request`, `extra`, `device.name`) are DELETED rather than redacted.
//
// OVER-REDACTION IS THE INTENDED FAILURE MODE. `\d{8}` also matches a date like
// 20260911 and `[uuid]` also eats a question id. A redacted stack trace is
// still readable; a child's login ID in an issue title is not recoverable.
//
// WHAT THIS FILE CANNOT DO — stated plainly rather than implied away:
//   1. NATIVE CRASHES BYPASS IT. Both native bridges install their OWN
//      `beforeSend` (`ios/RNSentry.mm` line 201,
//      `android/.../RNSentryModuleImpl.java` line 333) and neither calls back
//      into JS, so a hard SIGSEGV/ANR event is assembled and sent by the native
//      SDK alone. What still protects it: `sendDefaultPii: false` IS forwarded
//      to both native SDKs, we never call `Sentry.setUser`, and JS breadcrumbs
//      reach the native scope only AFTER passing `scrubBreadcrumb` (the client
//      applies `beforeBreadcrumb` before the scope sync). What does not: iOS's
//      own network breadcrumbs. Our URLs carry UUIDs, never names and never the
//      8-digit ID — every `/api/mobile/v1/children/<id>/...` path takes
//      `students.profile_id` — which is why that residue is acceptable, and why
//      it must stay that way.
//   2. IT CANNOT RECOGNISE A NAME. "Aysel Məmmədova" is indistinguishable from
//      any other string. The defence there is structural, not textual: never
//      call `Sentry.setUser`, attach no screenshot, no view hierarchy and no
//      store state, and drop console breadcrumbs wholesale.
import type { Breadcrumb, Event } from "@sentry/react-native";

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

/**
 * Ordered redaction rules. ORDER IS LOAD-BEARING and the comments say why —
 * any rule that can consume a substring of a later rule's match must run first,
 * or the later rule redacts the wrapper and leaves the part inside intact.
 */
const RULES: readonly { readonly re: RegExp; readonly to: string }[] = [
  // FIRST OF ALL, because it is the one shape that carries a WHOLE DATABASE
  // ROW rather than a single value. Postgres puts the offending data in the
  // error DETAIL, and PostgREST forwards it verbatim:
  //
  //   Key (child_unique_id)=(48310277) already exists.
  //   Failing row contains (a1b2…, Aylin, Məmmədova, 48310277, Bakı, Nəsimi,
  //                         female, 7)
  //
  // — a child first name, last name, login ID, city, rayon, gender and grade,
  // in one string. THIS REACHES A CHILD DEVICE: `src/lib/supabase.ts` talks to
  // PostgREST directly, so that text lands in an exception VALUE, which is the
  // Sentry issue TITLE and is filtered by no SDK option.
  //
  // Every other rule below matches a SHAPE, and a name, a school and a city
  // have none — so the parenthesised payload is wiped wholesale. The sentence
  // around it survives, which keeps the constraint name that makes the error
  // diagnosable at all.
  //
  // THE ORDER IS LOAD-BEARING IN BOTH DIRECTIONS. These must run before the
  // phone rule (whose character class contains `(` and `)`) so nothing bites
  // into the payload and leaves the rest of the row behind; and running them
  // before the child-login rule means a synthetic email INSIDE a row detail is
  // wiped with the row instead of being labelled `[child-login]`. That is the
  // right way round — the label is worth less than the guarantee, and the
  // web-app scrubber makes the same trade. Both replacements are fixed points
  // of their own patterns, so `redact` stays idempotent.
  //
  // The patterns are in the shared block at the top of this file, which the two
  // Next apps carry verbatim: a row detail that leaks in one app leaks in all
  // three, so there is one definition and three copies a test compares byte for
  // byte.
  { re: KEY_DETAIL_RE, to: KEY_DETAIL_TO },
  { re: FAILING_ROW_RE, to: FAILING_ROW_TO },
  // FIRST AMONG THE EMAIL RULES. `c12345678@children.invalid` is the child
  // synthetic auth email; the generic email rule below would happily swallow it
  // and report "[email]", which reads like a parent address and hides the fact
  // that an 8-digit LOGIN ID was in the payload.
  { re: /\bc?\d{8}@children\.invalid\b/gi, to: "[child-login]" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, to: "[email]" },
  // A JWT is a live session. The anon key is one too, and so is any access or
  // refresh token that ends up inside an error body.
  { re: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, to: "[jwt]" },
  // Supabase's newer key format, and the shape the service-role key would have
  // if one ever reached this process. It never should — this app is built so it
  // has no privileged key at all — but a scrubber that only removes what it
  // expects to find is not a control.
  { re: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{8,}/g, to: "[key]" },
  // A database URL carries the password in its userinfo segment.
  { re: /\bpostgres(?:ql)?:\/\/\S+/gi, to: "[db-url]" },
  // Before the 8-digit rule: a UUID can begin with eight digits, and the digit
  // rule would otherwise carve it up and leave the remainder behind.
  {
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    to: "[uuid]",
  },
  // E.164, and the spaced forms the UI renders (+994 50 123 45 67).
  { re: /\+\d[\d\s()-]{5,20}\d/g, to: "[phone]" },
  // LAST. A bare eight-digit run is the child login ID. Deliberately broad: it
  // also eats 20260911 and any other 8-digit number, and that is the correct
  // trade in a product whose primary credential is exactly eight digits.
  { re: /\b\d{8}\b/g, to: "[child-login]" },
];

/**
 * Redacts every known-sensitive shape from one string.
 *
 * The rules carry the `g` flag, so `lastIndex` is stateful across calls. They
 * are module constants for cost reasons, so each is reset before use rather
 * than rebuilt — forgetting this makes the scrubber skip every OTHER
 * occurrence, which is the kind of bug that only appears in production
 * payloads.
 */
export function redact(value: string): string {
  let out = value;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    out = out.replace(rule.re, rule.to);
  }
  return out;
}

/** `redact` for a value that may legitimately be absent or non-string. */
function redactMaybe(value: unknown): string | undefined {
  return typeof value === "string" ? redact(value) : undefined;
}

/**
 * A URL reduced to what a debugger actually needs: origin + path, redacted.
 *
 * The QUERY STRING AND FRAGMENT ARE DROPPED WHOLE rather than redacted. A
 * Supabase REST call is `...?select=*&profile_id=eq.<uuid>&order=...`, and a
 * filter value is by definition a row identifier; keeping a redacted skeleton
 * of it tells nobody anything and only creates one more surface to get wrong.
 * Parsed by hand — `new URL` exists in Hermes but throws on the relative paths
 * our BFF client uses, and a scrubber must never be the thing that throws.
 */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return redact(cut === -1 ? url : url.slice(0, cut));
}

/**
 * Field NAMES whose value is a URL, collapsed by `scrubUrl` rather than blanked.
 *
 * It used to be one key (`url`) on one set of categories (xhr/fetch/http), and
 * the gap that left was not theoretical: a `navigation` crumb's `to`/`from`, an
 * expo-router crumb's `path`, and every `url` outside an HTTP category kept
 * their QUERY STRING. A query string on this product is `?q=<a child's name>`
 * or a PostgREST `?id=eq.<uuid>` filter, and `redact` cannot help with the
 * first — an ordinary word has no shape. Only dropping the query does.
 *
 * Mirrored from web-app/src/lib/observability/sentryScrub.ts, key for key, so
 * a crumb that is safe in the browser is safe on the phone.
 */
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

const REDACTED = "[redacted]";

/**
 * Field NAMES whose value is dropped outright, whatever it looks like.
 *
 * This is the half `redact` cannot do. A child first name, school, city, rayon
 * and gender are ordinary words with no shape to match; the only thing that
 * identifies them is the KEY they arrive under. Mirrored from
 * web-app/src/lib/observability/sentryScrub.ts so the three apps agree.
 *
 * Scope note: it is applied to EVERY key/value bag on the event — breadcrumb
 * `data`, `contexts` and `tags` alike. The old note here said tags were
 * SDK-generated and so `redact` was enough for them. That reasoning was wrong
 * twice over: an integration or a future `setTag` can write any key it likes,
 * and tags are INDEXED AND SEARCHABLE in Sentry, which makes a tag the single
 * worst place for a name to land — searchable is worse than a message. A tag
 * keyed `child_name`, `school` or `gender` carries an ordinary word that no
 * pattern can recognise, and it shipped verbatim until the key denylist
 * reached it.
 */
const SENSITIVE_KEY_RE =
  /(pass|pwd|secret|token|api[_-]?key|auth|session|cookie|credential|bearer|dsn|name|surname|school|city|district|rayon|region|address|gender|birth|avatar|photo|phone|mobile|tel|email|mail|child|student|parent|query|body|payload|data|url)/i;

// THE VALUE-SHAPED BACKSTOP.
//
// SENSITIVE_KEY_RE is a list of NAMES, and a list of names only ever catches
// the keys somebody already thought of. `{ ref: 48310277 }`,
// `{ contact: "+994501234567" }` and `{ owner: "leyla@example.com" }` name
// nothing personal and sail straight through it. For a STRING that does not
// matter, because `redact` sees the value and matches on its shape. For a
// NUMBER it matters completely — `redact` is never called on one — so an
// 8-digit child login ID arriving as a JSON number left the device verbatim
// under any key at all.
//
// Only shapes recognisable WITHOUT a key are listed. A first name, a school
// and a city stay undetectable and always will; that residue is structural,
// and is stated at the top of this file rather than papered over.
const SHAPED_VALUE_RES: readonly RegExp[] = [
  /^\d{8}$/, // the 8-digit child login ID, standing alone
  /^\+[1-9]\d{6,14}$/, // E.164, the form the parent's phone is stored in
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
 * WHY A BOUND AND NOT A `seen` SET: the thing this must survive is a CYCLIC
 * structure — a React element, a native event object, an Error whose `cause`
 * chain loops back on itself — reaching `beforeSend`, where a hang is not a
 * slow report but a wedged SDK on a child device, on a code path that is
 * already an error path. A depth cap terminates unconditionally and costs one
 * comparison. The array slice is the same argument for breadth: a 250-entry
 * payload is never worth walking.
 */
function scrubUnknown(value: unknown, depth: number): unknown {
  if (depth > 4) return REDACTED;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number") return isShapedValue(value) ? REDACTED : value;
  if (typeof value === "boolean" || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => scrubUnknown(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubField(key, entry, depth + 1);
    }
    return out;
  }
  // Functions, symbols, bigints — nothing legitimate, never serialize them.
  return REDACTED;
}

/**
 * One key/value pair: a URL key collapses, a person key vanishes, the rest
 * recurse. The URL check runs FIRST and that ordering is load-bearing —
 * SENSITIVE_KEY_RE matches "url" too, so the other order would blank every URL
 * on the event and throw away the route shape, which is the most useful thing
 * a scrubbed crumb can still say.
 */
function scrubField(key: string, value: unknown, depth: number): unknown {
  if (URL_KEYS.has(key)) {
    return typeof value === "string" ? scrubUrl(value) : REDACTED;
  }
  if (SENSITIVE_KEY_RE.test(key)) return REDACTED;
  return scrubUnknown(value, depth);
}

/**
 * `beforeBreadcrumb`. Returns null to DROP the crumb entirely.
 *
 * Console crumbs are dropped wholesale rather than redacted. `redact` can only
 * remove shapes it knows, and a console line is arbitrary application text — a
 * child's name printed by a third-party library is not a pattern, it is a
 * string. Dropping the category is the only answer that does not depend on
 * guessing what a dependency logs. It also removes them as an issue SOURCE,
 * which matters on a 5,000-events/month allowance shared across three projects.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;

  const next: Breadcrumb = { ...breadcrumb };
  const message = redactMaybe(next.message);
  if (message !== undefined) next.message = message;

  if (next.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.data)) {
      // EVERY key through scrubField, with no category special case. A URL key
      // loses its query string wherever it appears — the old code dropped a
      // query only for `url` on an xhr/fetch/http crumb, so a `navigation`
      // crumb's `to` kept `?q=<a child's name>` in full.
      //
      // RECURSE. This used to be `if (typeof value !== "string") { copy }`,
      // which passed every NESTED OBJECT through untouched — and a nested
      // object on a breadcrumb is exactly where a request body, a PostgREST
      // response row or a react-query cache entry sits, i.e. a child name,
      // school and login ID copied verbatim into the payload.
      data[key] = scrubField(key, value, 1);
    }
    next.data = data;
  }

  return next;
}

/**
 * `beforeSend`. Strips the surfaces that can carry identity and hands the event
 * back; it never returns null, because dropping real crashes is the noise
 * control's job (`IGNORED_ERRORS`), not the scrubber's.
 *
 * Note what is deliberately NOT touched: `debug_meta` (its image `debug_id`s
 * are dashed UUIDs, and redacting them breaks native symbolication outright),
 * `contexts.ota_updates.update_id` (same shape, and it is how a crash is tied
 * to the OTA build that caused it), stack-frame filenames, and `sdk`/`modules`.
 * A blind recursive walk over the whole event would have eaten all four, which
 * is why this function names its targets instead.
 *
 * Generic over the event subtype because `beforeSend` is typed as
 * `ErrorEvent -> ErrorEvent`: taking and returning plain `Event` would widen
 * the return and fail to typecheck at the call site.
 */
export function scrubEvent<T extends Event>(event: T): T {
  // IDENTITY-ONLY FIELDS — deleted, not redacted. `user` is where the native
  // SDK parks its per-install id and where `{{auto}}` IP resolution is
  // requested; `request` is headers/cookies/url; `extra` is set by nobody in
  // this app, so anything in it arrived from an integration we did not choose.
  delete event.user;
  delete event.request;
  delete event.extra;
  delete event.server_name;

  // The single worst default on a mobile SDK: on iOS this is
  // `UIDevice.current.name`, on Android `Settings.Global.DEVICE_NAME`, and both
  // are overwhelmingly "<person>'s <phone>". `sendDefaultPii: false` already
  // withholds it at the native layer; this is the belt to that braces, and it
  // additionally covers the Expo Go path, where the SDK's own ExpoContext
  // integration copies `Device.deviceName` in with NO PII gate at all.
  //
  // DELETED rather than redacted, and that distinction is why this line stays
  // even though the walk below would blank it: an absent field reads as a
  // field we never collected, and "[redacted]" reads as one we collected and
  // then cleaned. Only the first is true here.
  if (event.contexts?.device) {
    delete event.contexts.device.name;
  }

  // CONTEXTS ARE WALKED, not trusted. Deleting `device.name` used to be the
  // whole of it, which meant every OTHER context field shipped verbatim —
  // `contexts` is an OPEN MAP that any integration may write, and on this
  // product the values inside one are a child's name, school and login ID.
  // Same treatment as the two Next apps: URL keys collapse through `scrubUrl`,
  // person keys vanish, everything else recurses under the same depth bound.
  //
  // TWO THINGS SURVIVE ON PURPOSE. `contexts.response` is deleted outright
  // because it carries headers, i.e. Set-Cookie. And `ota_updates.update_id` is
  // put back verbatim: it is a dashed UUID, the redactor would eat it, and it
  // is the only thing tying a crash to the OTA build that caused it — the same
  // reason `debug_meta` is not touched at all.
  if (event.contexts) {
    const contexts = { ...event.contexts } as Record<string, unknown>;
    delete contexts.response;
    const updateId = (contexts.ota_updates as { update_id?: unknown } | undefined)
      ?.update_id;
    const scrubbed = scrubUnknown(contexts, 1) as Record<string, unknown>;
    const ota = scrubbed.ota_updates as Record<string, unknown> | undefined;
    if (ota && typeof updateId === "string") ota.update_id = updateId;
    event.contexts = scrubbed as Event["contexts"];
  }

  const message = redactMaybe(event.message);
  if (message !== undefined) event.message = message;

  const transaction = redactMaybe(event.transaction);
  if (transaction !== undefined) event.transaction = transaction;

  if (event.logentry?.message) {
    event.logentry = { ...event.logentry, message: redact(event.logentry.message) };
  }

  // THE ISSUE TITLE. No SDK option filters this, and it is exactly where a
  // Postgres constraint DETAIL or a Supabase auth error lands.
  for (const exception of event.exception?.values ?? []) {
    const value = redactMaybe(exception.value);
    if (value !== undefined) exception.value = value;
    for (const frame of exception.stacktrace?.frames ?? []) {
      // Local variables, per frame. RN's JS stack parser does not produce these
      // today, but a native or future integration can — and a local in scope
      // during a submit is literally the child's answer map.
      delete frame.vars;
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  // TAGS ARE INDEXED AND SEARCHABLE in Sentry, which makes a tag the worst
  // place on an event for a name to land: it is queryable across the whole
  // project, and it is what the issue list groups by. Redacting by SHAPE alone
  // was not a control here — a tag keyed `child_name`, `school` or `gender`
  // carries an ordinary word, and it went out verbatim. The key denylist is
  // what closes that, and it is the same one the other two apps apply.
  if (event.tags) {
    event.tags = scrubUnknown(event.tags, 1) as Event["tags"];
  }

  return event;
}

/**
 * Messages that are NOISE, not bugs, matched by the SDK's `ignoreErrors`.
 *
 * The quota being defended is 5,000 events per MONTH across all three OlympIQ
 * projects, and the free plan cannot buy overage — when it is gone, the parent
 * payment failure this whole exercise exists to capture is the one that gets
 * dropped. `Network request failed` alone would outspend everything else: it is
 * React Native's generic offline fetch error, and testers on Azerbaijani mobile
 * data produce it continuously without a single one being actionable. The app
 * already handles it properly, as a retryable `mob.err.network` toast.
 */
export const IGNORED_ERRORS: readonly (string | RegExp)[] = [
  // Transport. Every one of these means "the phone was not online".
  "Network request failed",
  "Failed to fetch",
  "Load failed",
  "AbortError",
  /The (?:network connection was lost|operation was aborted)/i,
  // expo-updates polling for an OTA over a flaky connection.
  /Failed to download (?:remote update|manifest)/i,
  /No updates are available/i,
  // Non-actionable by construction: no stack, nothing to group on.
  "Non-Error promise rejection captured",
];
