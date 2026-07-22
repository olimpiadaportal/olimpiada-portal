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
): Promise<BffResult<T>> {
  return bffJsonPost<T>(path, body, fallbackErrorKey, false);
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

export const bffQuote = (childId: string, interval: string, subjectIds: string[]) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/quote`,
    { interval, subject_ids: subjectIds },
    "sub.err.failed",
  );

export const bffSubscribe = (childId: string, interval: string, subjectIds: string[]) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/subscribe`,
    { interval, subject_ids: subjectIds },
    "sub.err.failed",
  );

export const bffUpdateSubjects = (childId: string, subjectIds: string[]) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/subjects`,
    { subject_ids: subjectIds },
    "sub.err.failed",
  );

/** Round-24 mid-cycle proration quote (web parity contract): additions are
 *  charged a prorated top-up for the days left in the period (rate rises from
 *  now on); removals never refund — access + the old rate continue until
 *  `removals_effective_at`. No proration during a trial or on weekly plans;
 *  amounts under 0.50 AZN are waived (`due_now` comes back 0). Read-only —
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
  prorated: boolean;
  proration_waived: boolean;
  added_base: number;
  remaining_ratio: number;
  days_remaining: number;
  period_days: number;
  effective_from: string;
  removals_effective_at: string | null;
};

export const bffQuoteSubjectChange = (childId: string, add: string[], remove: string[]) =>
  bffAuthedPost<SubjectChangeQuote>(
    `/api/mobile/v1/children/${childId}/subjects/quote`,
    { add, remove },
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

export const bffRemoveAvatar = () =>
  bffAuthedPost<Record<string, any>>(
    "/api/mobile/v1/profile/avatar",
    { remove: true },
    "prof2.err.generic",
  );

export const bffPurchaseOlympiad = (
  packageId: string,
  studentProfileId: string,
  idempotencyKey: string,
) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/olympiads/${packageId}/purchase`,
    { student_profile_id: studentProfileId },
    "poly.err.generic",
    { "Idempotency-Key": idempotencyKey },
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

/** Avatar upload: multipart with the sniffed-on-server file. */
export function bffUploadAvatar(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<BffResult<{ url: string }>> {
  return bffMultipartPost<{ url: string }>(
    "/api/mobile/v1/profile/avatar",
    file,
    "prof2.err.generic",
  );
}
