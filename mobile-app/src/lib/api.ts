// Typed client for the web-app mobile BFF (/api/mobile/v1/*). Privileged flows
// (child login, registration, later: add-child/subscribe/purchase) run there —
// wrapped around the same audited service functions the web uses. Responses are
// {ok:true, data} | {error: <i18nKey>, retryable} and errors are ALWAYS i18n
// keys translated locally, never raw server text.
import { bffUrl, isBffConfigured } from "./env";
import { supabase } from "./supabase";

/** Why a call failed. Diagnostic metadata — the USER only ever sees `error`. */
export type BffFailureKind =
  | "unconfigured"
  | "network"
  | "timeout"
  | "unauthorized"
  | "server"
  | "rejected";

export type BffResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      /** Optional (call sites may build their own failures): see BffFailureKind. */
      kind?: BffFailureKind;
      /** Every validation key the server sent, when it sent more than one. */
      errors?: string[];
    };

const TIMEOUT_MS = 12_000;
// A photo on cellular legitimately needs more than the JSON budget; hanging
// forever is what made the avatar failures feel unlike the others.
const MULTIPART_TIMEOUT_MS = 30_000;

// Transport-level keys. Anything the SERVER decided keeps the server's own key.
const ERR_NETWORK = "mob.err.network";
const ERR_SERVER = "mob.err.serverUnavailable";
const ERR_SESSION = "mob.session.expired";

type BffFailure = {
  kind: BffFailureKind;
  error: string;
  retryable: boolean;
  errors?: string[];
};

/**
 * Classifies a RESPONSE that is not a success envelope. Splitting the classes
 * apart is the whole point: an unreachable origin, an undeployed route, an
 * expired session and a real per-field rejection used to collapse into one
 * "could not be saved", which is why four unrelated root causes once looked
 * identical.
 *
 * `body` is null when the response was not JSON at all (a Next HTML 404 page,
 * a proxy error page). `authed` marks Bearer calls: there a 401 means the
 * TOKEN was rejected, so the server's generic "wrong email or password" key
 * would be actively misleading on an edit-child screen. On the unauthenticated
 * endpoints (child login, register) a 401 IS a credential rejection and the
 * server's key is the correct thing to show.
 *
 * Pure (status, body, …) → failure so the mapping is unit-testable.
 */
export function classifyBffResponse(input: {
  status: number;
  body: Record<string, unknown> | null;
  fallbackErrorKey: string;
  authed: boolean;
}): BffFailure {
  const { status, body, fallbackErrorKey, authed } = input;
  if (status >= 500) return { kind: "server", error: ERR_SERVER, retryable: true };
  // 404/405 = the route does not exist at this origin (stale deployment, wrong
  // host) — never a business outcome; no BFF endpoint answers with either.
  if (status === 404 || status === 405) {
    return { kind: "server", error: ERR_SERVER, retryable: true };
  }
  if (status === 401 && authed) {
    return { kind: "unauthorized", error: ERR_SESSION, retryable: false };
  }
  if (body === null) return { kind: "server", error: ERR_SERVER, retryable: true };
  const key = typeof body.error === "string" && body.error.length > 0 ? body.error : "";
  const errors = Array.isArray(body.errors)
    ? body.errors.filter((e): e is string => typeof e === "string" && e.length > 0)
    : [];
  return {
    kind: "rejected",
    error: key || fallbackErrorKey,
    retryable: body.retryable === true,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/** Classifies a fetch that threw: our own abort is a timeout, anything else is
 *  the transport (DNS, refused, TLS, no route). Both read the same to the user. */
export function classifyBffThrow(err: unknown): BffFailure {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  return {
    kind: name === "AbortError" ? "timeout" : "network",
    error: ERR_NETWORK,
    retryable: true,
  };
}

/**
 * Dev-only failure trace. The resolved origin is printed with every failure
 * because "the app is talking to a host it cannot reach" is this project's
 * most expensive recurring bug (see the student-login incident in STATUS.md)
 * and it is otherwise invisible from the UI. Never logs the Authorization
 * header, the token, the request body or the response body. `__DEV__` is a
 * compile-time constant, so release bundles drop this entirely.
 */
function devLogFailure(path: string, failure: BffFailure, status: number | null): void {
  if (!__DEV__) return;
  console.warn(
    `[bff] POST ${path} → ${failure.kind}${status === null ? "" : ` ${status}`}` +
      ` (${failure.error}) origin=${bffUrl || "(unset)"}`,
  );
}

function unconfiguredFailure(path: string): BffFailure {
  const failure: BffFailure = { kind: "unconfigured", error: ERR_SERVER, retryable: false };
  devLogFailure(path, failure, null);
  return failure;
}

/** Reads a response body as a JSON object, or null when it is not JSON. */
async function readEnvelope(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const json: unknown = await res.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Shared JSON POST — bffPost (anonymous) and bffAuthedPost (Bearer) differ
 *  only in the headers they send and in what a 401 means. */
async function bffJsonPost<T>(
  path: string,
  body: unknown,
  fallbackErrorKey: string,
  authed: boolean,
  extraHeaders?: Record<string, string>,
): Promise<BffResult<T>> {
  if (!isBffConfigured) return { ok: false, ...unconfiguredFailure(path) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${bffUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authed ? await bearer() : {}),
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const envelope = await readEnvelope(res);
    if (res.ok && envelope?.ok === true) {
      return { ok: true, data: (envelope.data ?? null) as T };
    }
    const failure = classifyBffResponse({
      status: res.status,
      body: envelope,
      fallbackErrorKey,
      authed,
    });
    devLogFailure(path, failure, res.status);
    return { ok: false, ...failure };
  } catch (err) {
    const failure = classifyBffThrow(err);
    devLogFailure(path, failure, null);
    return { ok: false, ...failure };
  } finally {
    clearTimeout(timer);
  }
}

export function bffPost<T>(
  path: string,
  body: unknown,
  fallbackErrorKey: string,
  extraHeaders?: Record<string, string>,
): Promise<BffResult<T>> {
  return bffJsonPost<T>(path, body, fallbackErrorKey, false, extraHeaders);
}

// ---- endpoint payload shapes (mirror web-app/src/app/api/mobile/v1/*) ----

export type SessionTokens = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user_id: string;
  role: "parent" | "student";
};

export type RegisterData = SessionTokens | { verify_email: true };

export function bffChildLogin(childId: string, password: string) {
  return bffPost<SessionTokens>(
    "/api/mobile/v1/auth/child-login",
    { child_id: childId, password },
    "auth.child.err.serverError",
  );
}

export function bffRegisterParent(fields: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
}) {
  return bffPost<RegisterData>(
    "/api/mobile/v1/auth/register",
    fields,
    "parent.err.createFailed",
  );
}

/**
 * Resend the SIGNUP confirmation email (pre-auth: no token, no session, no
 * entitlement). Goes through the BFF and never through supabase.auth.resend
 * from the app — the client-side call would bypass the house rate limiter, and
 * this is an outbound-email trigger with a real per-day cost.
 *
 * ANTI-ENUMERATION: the server answers the identical 200 for an unknown
 * address, an already-confirmed one and a per-address GoTrue rejection, so
 * `ok: true` means "handled", NOT "a mail was delivered" — the copy shown for
 * it stays hedged. Failures are 400 (malformed address), 429 (throttled) and
 * 500 (the mail rail itself is down — address-independent, so reporting it
 * leaks nothing and beats a false "sent").
 * Send the address AS TYPED; the server trims and lowercases it.
 *
 * The x-olympiq-client header is what keeps a random web page from driving
 * this money-spending endpoint from a visitor's browser: it makes the request
 * non-simple, so a cross-origin browser must preflight, and the route answers
 * no OPTIONS. Native fetch is not subject to CORS, so this costs the app
 * nothing.
 */
export function bffResendConfirmation(email: string) {
  return bffPost<{ sent: true }>(
    "/api/mobile/v1/auth/resend",
    { email },
    "verify.resendFailed",
    { "x-olympiq-client": "mobile" },
  );
}

// ---- M2 endpoints (parent, Bearer-authenticated) --------------------------------
// The BFF resolves the parent from the Supabase access token; attach it here.

async function bearer(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function bffAuthedPost<T>(
  path: string,
  body: unknown,
  fallbackErrorKey: string,
  extraHeaders?: Record<string, string>,
): Promise<BffResult<T>> {
  return bffJsonPost<T>(path, body, fallbackErrorKey, true, extraHeaders);
}

/**
 * Repair a parent account whose provisioning never finished.
 *
 * Registration is signUp THEN setup_parent, so a failure between the two leaves
 * an auth user with no roles: the password works, but every role check says the
 * caller is nobody, and the app lands on "unknown" with only a retry button.
 * The web self-heals this inside its login action; mobile cannot, because it
 * signs in against Supabase directly and holds no service-role key.
 *
 * Called ONLY after a password has already verified — the endpoint re-verifies
 * the token itself and repairs the account that token belongs to, so there is
 * nothing to pass. `healed:false` means the account was already fine (the role
 * lookup simply failed), which is not an error.
 */
export function bffHealParentAccount() {
  return bffAuthedPost<{ healed: boolean }>(
    "/api/mobile/v1/auth/heal",
    {},
    "parent.err.incompleteAccount",
  );
}

export type AddChildFields = {
  first_name: string;
  last_name: string;
  grade_id: string;
  /** NAMING TRAP (web parity): district_id = the CITY (historic naming). */
  district_id: string;
  /** Round 21: the intra-city rayon (city_districts.id). Required by the
   *  server when the chosen city has active rayons; "" → null server-side. */
  city_district_id?: string;
  school_id: string;
  password: string;
  city?: string;
  school_name?: string;
  class_grade?: string;
};

export const bffAddChild = (fields: AddChildFields) =>
  bffAuthedPost<{ student_profile_id: string }>(
    "/api/mobile/v1/children",
    fields,
    "auth.child.err.createFailed",
  );

/** A per-subject basket (migration 109). Sent as `items`; when it is omitted
 *  the endpoint keeps its legacy `{subject_ids}` shape — which is exactly what
 *  already-shipped binaries post and what the BFF still accepts, so an OTA is
 *  never required to keep an older build working.
 *
 *  The BUYING endpoints (`/quote`, `/subscribe`) are deliberately absent: the
 *  app is purchase-silent (docs/STORE_PAYMENTS_COMPLIANCE.md) and starting a
 *  plan is a web action. Only the change/quote pair below survives, because a
 *  parent must always be able to remove a subject and stop paying. */
export type BffPlanItem = { subject_id: string; interval: string };

export const bffUpdateSubjects = (
  childId: string,
  subjectIds: string[],
  items?: BffPlanItem[],
) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/subjects`,
    items && items.length > 0 ? { items } : { subject_ids: subjectIds },
    "sub.err.failed",
  );

/** Mid-cycle plan-change quote (web parity contract). PRORATION IS RETIRED
 *  (owner, 2026-08-17): every subject is billed on its OWN cycle starting the
 *  day it is added, so an addition is charged its FULL first period
 *  (`due_now`, sibling discount applied) and nothing is split by days. A trial
 *  still charges nothing now. Removals never refund — each removed subject
 *  keeps access to ITS OWN period end (`removals_effective`). Read-only —
 *  never applies anything; the apply step is still bffUpdateSubjects. */
export type SubjectChangeQuote = {
  subscription_id: string;
  status: string;
  interval: string;
  currency: string;
  discount_percent: number;
  current_recurring_total: number;
  new_recurring_total: number;
  due_now: number;
  effective_from: string;
  removals_effective_at: string | null;
  // Migration 118 removed the six proration fields this type used to mirror
  // (prorated, proration_waived, added_base, remaining_ratio, days_remaining,
  // period_days): the BFF no longer returns them, no screen ever read them,
  // and each one described a shared child cycle that no longer exists.
  // `renewals` replaces the single recurring figure, which cannot describe a
  // plan whose subjects run on different cycles.
  items?: { subject_id: string; interval: string; price: number | null }[];
  groups?: Record<string, { count: number; base: number; discount: number; total: number }>;
  renewals?: { interval: string; next_at: string | null; total: number }[];
  // Per-subject removal dates. `removals_effective_at` above is ONE scalar and
  // cannot describe a plan whose subjects run to different dates — dropping a
  // yearly subject from a plan that also holds a weekly one was reported as
  // "ends in 7 days" while the database granted a year.
  removals_effective?: { subject_id: string; remove_at: string | null }[];
  // Migration 120 — UN-CANCELS. A subject whose scheduled removal is withdrawn
  // BEFORE its coverage lapses keeps its cycle, its price and its period and is
  // charged NOTHING, so it is deliberately absent from `due_now`. Optional: an
  // older server simply omits it and every subject stays classified as an add,
  // which is the pre-120 behaviour rather than a crash.
  reinstatements?: { subject_id: string; interval: string; renews_at: string | null }[];
  plan_changes?: {
    subject_id: string;
    from: string;
    to: string;
    effective_at: string | null;
  }[];
  mixed?: boolean;
};

export const bffQuoteSubjectChange = (
  childId: string,
  add: string[],
  remove: string[],
  items?: BffPlanItem[],
) =>
  bffAuthedPost<SubjectChangeQuote>(
    `/api/mobile/v1/children/${childId}/subjects/quote`,
    items && items.length > 0 ? { items } : { add, remove },
    "sub.err.failed",
  );

export const bffActivateFree = (childId: string) =>
  bffAuthedPost<{ child_unique_id: string }>(
    `/api/mobile/v1/children/${childId}/activate-free`,
    {},
    "sub.err.failed",
  );

export const bffEditChild = (childId: string, fields: Omit<AddChildFields, "password">) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/edit`,
    fields,
    "childedit.err.generic",
  );

export const bffResetChildPassword = (childId: string, password: string) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/reset-password`,
    { password },
    "auth.child.err.updateFailed",
  );

export const bffCancelSubscription = (
  subscriptionId: string,
  studentId: string,
  reason?: string,
) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/subscriptions/${subscriptionId}/cancel`,
    { student_id: studentId, reason },
    "cancel.err",
  );

/** Remove the signed-in user's own avatar. For a STUDENT this deletes the
 *  private storage object as well — a child's photo must be withdrawable, not
 *  merely unlinked. */
export const bffRemoveAvatar = () =>
  bffAuthedPost<Record<string, any>>(
    "/api/mobile/v1/profile/avatar",
    { remove: true },
    "prof2.err.generic",
  );

export const bffDeleteAccount = () =>
  bffAuthedPost<Record<string, any>>(
    "/api/mobile/v1/account/delete",
    { confirm: true },
    "prof2.err.generic",
  );

/** Parent phone change. E.164 only — the server revalidates with the same
 *  PHONE_RE registration uses, so the client never decides what is valid. */
export const bffUpdateParentPhone = (phone: string) =>
  bffAuthedPost<{ phone: string }>(
    "/api/mobile/v1/profile/phone",
    { phone },
    "profile.err.updateFailed",
  );

/** Student self-service name change (BFF twin of web childUpdateOwnName). */
export const bffUpdateStudentName = (firstName: string, lastName: string) =>
  bffAuthedPost<Record<string, any>>(
    "/api/mobile/v1/profile/name",
    { first_name: firstName, last_name: lastName },
    "profile.err.updateFailed",
  );

/**
 * Own password change — BOTH roles (the BFF resolves the caller from the
 * bearer and applies the rules that role gets).
 *
 * Replaces a direct `supabase.auth.updateUser({ password })` from the app. That
 * call went straight to GoTrue, so the ONLY strength rule that ever ran on a
 * self-service password change was GoTrue's own minimum: the client checked
 * `length < 8` and the server checked nothing the product had decided. The
 * password policy has to live where the client cannot skip it.
 *
 * The screens read only `ok` — the payload is an acknowledgement, not data.
 */
export const bffChangeOwnPassword = (password: string) =>
  bffAuthedPost<{ updated: true }>(
    "/api/mobile/v1/profile/password",
    { password },
    "profile.err.updateFailed",
  );

// ---- child avatar (parent-managed; POST /children/[id]/avatar) -----------------
// One endpoint, three request shapes (web childAvatarCore twins): multipart
// `file` → photo (byte-sniffed server-side, png/jpeg/webp ≤2MB), JSON
// {"preset":"boy"|"girl"} → bundled preset, JSON {"remove":true} → back to the
// default initials bubble. Ownership is re-verified by the BFF; errors are
// i18n keys.

export type ChildAvatarState = {
  avatar_kind: string;
  avatar_key: string | null;
  has_photo: boolean;
};

export type ChildAvatarInput =
  | { file: { uri: string; name: string; type: string } }
  | { preset: "boy" | "girl" }
  | { remove: true };

/** Multipart POST (bearer only, no manual Content-Type so fetch writes the
 *  boundary itself). Same classification as the JSON path, longer budget. */
async function bffMultipartPost<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fallbackErrorKey: string,
): Promise<BffResult<T>> {
  if (!isBffConfigured) return { ok: false, ...unconfiguredFailure(path) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MULTIPART_TIMEOUT_MS);
  try {
    const form = new FormData();
    // @ts-expect-error React Native FormData file shape
    form.append("file", file);
    const res = await fetch(`${bffUrl}${path}`, {
      method: "POST",
      headers: { ...(await bearer()) },
      body: form,
      signal: controller.signal,
    });
    const envelope = await readEnvelope(res);
    if (res.ok && envelope?.ok === true) {
      return { ok: true, data: (envelope.data ?? null) as T };
    }
    const failure = classifyBffResponse({
      status: res.status,
      body: envelope,
      fallbackErrorKey,
      authed: true,
    });
    devLogFailure(path, failure, res.status);
    return { ok: false, ...failure };
  } catch (err) {
    const failure = classifyBffThrow(err);
    devLogFailure(path, failure, null);
    return { ok: false, ...failure };
  } finally {
    clearTimeout(timer);
  }
}

export function bffSetChildAvatar(
  childId: string,
  input: ChildAvatarInput,
): Promise<BffResult<ChildAvatarState>> {
  const path = `/api/mobile/v1/children/${childId}/avatar`;
  const fallback = "childedit.err.generic";
  return "file" in input
    ? bffMultipartPost<ChildAvatarState>(path, input.file, fallback)
    : bffAuthedPost<ChildAvatarState>(path, input, fallback);
}

/**
 * Own-avatar upload: multipart with the sniffed-on-server file.
 *
 * ONE endpoint, TWO destinations — the BFF branches on the bearer's role:
 *   parent  → the public `profile-avatars` bucket, answers `{url}`,
 *   student → their students row + the PRIVATE `child-avatars` bucket, answers
 *             the ChildAvatarState (a child photo must never leave the server
 *             as a public URL).
 * Callers therefore treat the payload as opaque and re-read the profile query;
 * the union exists so nothing can casually `.url` a student's response.
 */
export type OwnAvatarUploadResult = { url: string } | ChildAvatarState | null;

export function bffUploadAvatar(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<BffResult<OwnAvatarUploadResult>> {
  return bffMultipartPost<OwnAvatarUploadResult>(
    "/api/mobile/v1/profile/avatar",
    file,
    "prof2.err.generic",
  );
}
