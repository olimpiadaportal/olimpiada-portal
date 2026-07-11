// Typed client for the web-app mobile BFF (/api/mobile/v1/*). Privileged flows
// (child login, registration, later: add-child/subscribe/purchase) run there —
// wrapped around the same audited service functions the web uses. Responses are
// {ok:true, data} | {error: <i18nKey>, retryable} and errors are ALWAYS i18n
// keys translated locally, never raw server text.
import { bffUrl, isBffConfigured } from "./env";

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
