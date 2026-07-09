// SERVER-ONLY notification delivery seams (email + push).
//
// This is the single place a real provider plugs in. Today both channels are
// UNCONFIGURED: create_notification only creates email/push delivery rows when
// the corresponding feature flag is on (notifications_email / notifications_push),
// so with the flags off there is nothing to deliver and these functions are never
// exercised. When the owner adds an SMTP provider (email) or ships the mobile app
// (Expo push), fill in the marked TODO body — the processor route, claim/mark
// RPCs, idempotency and history all already work.
import "server-only";

export type DeliveryResult = {
  ok: boolean;
  providerRef?: string;
  error?: string; // short machine reason (e.g. 'not_configured'); never raw provider text to clients
};

// ---- Email (SMTP / transactional provider) ----------------------------------
// Configure by setting NOTIFICATIONS_SMTP_URL (or a provider API key) in the
// server env; until then this reports not_configured so the delivery is marked
// failed with a clear reason instead of silently stuck.
const SMTP_URL = process.env.NOTIFICATIONS_SMTP_URL ?? "";
export const isEmailConfigured = SMTP_URL.length > 0;

export async function sendEmailDelivery(
  _to: string,
  _subject: string,
  _body: string,
): Promise<DeliveryResult> {
  if (!isEmailConfigured) return { ok: false, error: "not_configured" };
  // TODO(email): send via the configured SMTP/provider and return its message id
  // as providerRef. Keep bodies trilingual (render from notification_templates).
  return { ok: false, error: "not_configured" };
}

// ---- Push (Expo, mobile stage M7) -------------------------------------------
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? "";
export const isPushConfigured = EXPO_ACCESS_TOKEN.length > 0;

export async function sendPushDelivery(
  _tokens: string[],
  _title: string,
  _body: string,
  _data: Record<string, unknown>,
): Promise<DeliveryResult> {
  if (!isPushConfigured) return { ok: false, error: "not_configured" };
  // TODO(push): POST to the Expo push API; on DeviceNotRegistered, invalidate the
  // token via a DB call. Return the Expo receipt id as providerRef.
  return { ok: false, error: "not_configured" };
}
