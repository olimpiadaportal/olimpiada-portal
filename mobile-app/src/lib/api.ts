// Typed client for the web-app mobile BFF (/api/mobile/v1/*). Privileged flows
// (child login, registration, later: add-child/subscribe/purchase) run there —
// wrapped around the same audited service functions the web uses. Responses are
// {ok:true, data} | {error: <i18nKey>, retryable} and errors are ALWAYS i18n
// keys translated locally, never raw server text.
import { bffUrl, isBffConfigured } from "./env";
import { supabase } from "./supabase";

export type BffResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean };

const TIMEOUT_MS = 12_000;

export async function bffPost<T>(
  path: string,
  body: unknown,
  fallbackErrorKey: string,
): Promise<BffResult<T>> {
  if (!isBffConfigured) {
    return { ok: false, error: fallbackErrorKey, retryable: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${bffUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // fall through to the generic error below
    }
    const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    if (res.ok && o.ok === true) {
      return { ok: true, data: (o.data ?? null) as T };
    }
    return {
      ok: false,
      error: typeof o.error === "string" && o.error.length > 0 ? o.error : fallbackErrorKey,
      retryable: o.retryable === true,
    };
  } catch {
    // Network failure / timeout — retryable by definition.
    return { ok: false, error: fallbackErrorKey, retryable: true };
  } finally {
    clearTimeout(timer);
  }
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

export async function bffAuthedPost<T>(
  path: string,
  body: unknown,
  fallbackErrorKey: string,
  extraHeaders?: Record<string, string>,
): Promise<BffResult<T>> {
  if (!isBffConfigured) return { ok: false, error: fallbackErrorKey, retryable: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${bffUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await bearer()),
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // generic error below
    }
    const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    if (res.ok && o.ok === true) return { ok: true, data: (o.data ?? null) as T };
    return {
      ok: false,
      error: typeof o.error === "string" && o.error.length > 0 ? o.error : fallbackErrorKey,
      retryable: o.retryable === true,
    };
  } catch {
    return { ok: false, error: fallbackErrorKey, retryable: true };
  } finally {
    clearTimeout(timer);
  }
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
    "sub.err.generic",
  );

export const bffSubscribe = (childId: string, interval: string, subjectIds: string[]) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/subscribe`,
    { interval, subject_ids: subjectIds },
    "sub.err.generic",
  );

export const bffUpdateSubjects = (childId: string, subjectIds: string[]) =>
  bffAuthedPost<Record<string, any>>(
    `/api/mobile/v1/children/${childId}/subjects`,
    { subject_ids: subjectIds },
    "sub.err.generic",
  );

export const bffActivateFree = (childId: string) =>
  bffAuthedPost<{ child_unique_id: string }>(
    `/api/mobile/v1/children/${childId}/activate-free`,
    {},
    "sub.err.generic",
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
    "cancel.err.generic",
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

export async function bffSetChildAvatar(
  childId: string,
  input: ChildAvatarInput,
): Promise<BffResult<ChildAvatarState>> {
  const path = `/api/mobile/v1/children/${childId}/avatar`;
  const fallback = "childedit.err.generic";
  if (!("file" in input)) {
    return bffAuthedPost<ChildAvatarState>(path, input, fallback);
  }
  // Photo branch — multipart (bffUploadAvatar pattern: bearer only, no manual
  // Content-Type so fetch writes the multipart boundary itself).
  if (!isBffConfigured) return { ok: false, error: fallback, retryable: false };
  try {
    const form = new FormData();
    // @ts-expect-error React Native FormData file shape
    form.append("file", input.file);
    const res = await fetch(`${bffUrl}${path}`, {
      method: "POST",
      headers: { ...(await bearer()) },
      body: form,
    });
    const o = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && o.ok === true) {
      return { ok: true, data: (o.data ?? null) as ChildAvatarState };
    }
    return {
      ok: false,
      error: typeof o.error === "string" && o.error.length > 0 ? o.error : fallback,
      retryable: o.retryable === true,
    };
  } catch {
    return { ok: false, error: fallback, retryable: true };
  }
}

/** Avatar upload: multipart with the sniffed-on-server file. */
export async function bffUploadAvatar(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<BffResult<{ url: string }>> {
  if (!isBffConfigured) return { ok: false, error: "prof2.err.generic", retryable: false };
  try {
    const form = new FormData();
    // @ts-expect-error React Native FormData file shape
    form.append("file", file);
    const res = await fetch(`${bffUrl}/api/mobile/v1/profile/avatar`, {
      method: "POST",
      headers: { ...(await bearer()) },
      body: form,
    });
    const o = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && o.ok === true) return { ok: true, data: (o.data ?? null) as { url: string } };
    return {
      ok: false,
      error: typeof o.error === "string" ? o.error : "prof2.err.generic",
      retryable: o.retryable === true,
    };
  } catch {
    return { ok: false, error: "prof2.err.generic", retryable: true };
  }
}
