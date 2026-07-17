// SERVER-ONLY notification delivery seams (email + push).
//
// This is the single place a real provider plugs in. Email is still
// UNCONFIGURED: create_notification only creates email delivery rows when the
// notifications_email flag is on, so nothing reaches the stub until an SMTP
// provider is added. Push is IMPLEMENTED (mobile stage M4): plain fetch to the
// Expo push API — deliberately NO expo-server-sdk dependency, keeping
// `npm audit` at zero. The processor route, claim/mark RPCs, idempotency and
// history all already work.
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

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

// ---- Push (Expo, mobile stage M4) --------------------------------------------
// Ticket-level handling ONLY for v1: the second-phase Expo receipts API is
// explicitly out of scope — DeviceNotRegistered and throttling already surface
// in tickets, and lingering dead tokens self-heal via the failure counter.
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? "";
export const isPushConfigured = EXPO_ACCESS_TOKEN.length > 0;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100; // Expo's documented max messages per request
const PUSH_BODY_MAX = 180; // push bodies must be short; truncate on a word boundary
const MAX_TOKEN_FAILURES = 5; // non-fatal ticket errors before a token is retired
const FETCH_TIMEOUT_MS = 10_000;

export type PushTokenRow = {
  token: string;
  platform: "ios" | "android" | "web";
  failure_count: number;
};

export type PushMessage = {
  title: string;
  body: string;
  data: Record<string, unknown>; // small routing payload (action_url, ids) — never PII
  channelId: string; // Android notification channel (caller validates against the known set)
  badge?: number; // recipient unread count — applied to iOS tokens only
};

// Expo ticket shape: {status:"ok",id} | {status:"error",message,details:{error}}.
type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

function truncateBody(text: string): string {
  if (text.length <= PUSH_BODY_MAX) return text;
  const cut = text.slice(0, PUSH_BODY_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > PUSH_BODY_MAX * 0.6 ? cut.slice(0, lastSpace) : cut;
  return head.trimEnd() + "…";
}

export async function sendPushDelivery(
  tokens: PushTokenRow[],
  message: PushMessage,
): Promise<DeliveryResult> {
  if (!isPushConfigured) return { ok: false, error: "not_configured" };
  if (tokens.length === 0) return { ok: false, error: "no_token" };

  const body = truncateBody(message.body);
  const okIds: string[] = [];
  const okTokens: string[] = [];
  const deadTokens: string[] = []; // DeviceNotRegistered → invalidate immediately
  const errored: { row: PushTokenRow; code: string }[] = [];
  let transportFailures = 0;

  for (let i = 0; i < tokens.length; i += EXPO_CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + EXPO_CHUNK_SIZE);
    const messages = chunk.map((t) => ({
      to: t.token,
      title: message.title,
      body,
      data: message.data,
      sound: "default" as const,
      priority: "high" as const,
      channelId: message.channelId,
      // Badge is an iOS concept; Android badging comes from the channel/launcher.
      ...(t.platform === "ios" && typeof message.badge === "number"
        ? { badge: message.badge }
        : {}),
    }));

    // Tickets come back order-matched to the messages array; null = transport
    // failure (non-200, malformed JSON, timeout) → transient, whole-chunk.
    let tickets: ExpoTicket[] | null = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });
      if (res.ok) {
        const parsed = (await res.json()) as { data?: unknown };
        if (Array.isArray(parsed.data) && parsed.data.length === messages.length) {
          tickets = parsed.data as ExpoTicket[];
        }
      }
    } catch {
      // network error / abort — treated as a transport failure below
    } finally {
      clearTimeout(timer);
    }

    if (!tickets) {
      // Transient: do NOT invalidate or count failures against tokens here —
      // the delivery is marked failed and token hygiene waits for a real ticket.
      transportFailures += chunk.length;
      continue;
    }

    tickets.forEach((ticket, idx) => {
      const row = chunk[idx];
      if (ticket.status === "ok" && typeof ticket.id === "string") {
        okIds.push(ticket.id);
        okTokens.push(row.token);
        return;
      }
      const code = ticket.details?.error ?? "ticket_error";
      if (code === "DeviceNotRegistered") deadTokens.push(row.token);
      else errored.push({ row, code });
    });
  }

  // Token hygiene — best-effort: a DB bookkeeping failure must never flip a
  // successfully sent push to failed. The service-role client bypasses RLS, so
  // these are direct UPDATEs (updated_at is maintained by a trigger).
  try {
    const admin = getAdminClient();
    if (okTokens.length > 0) {
      await admin
        .from("push_tokens")
        .update({ failure_count: 0, last_used_at: new Date().toISOString() })
        .in("token", okTokens);
    }
    if (deadTokens.length > 0) {
      await admin
        .from("push_tokens")
        .update({ is_valid: false })
        .in("token", deadTokens);
    }
    for (const { row } of errored) {
      const next = row.failure_count + 1;
      await admin
        .from("push_tokens")
        .update(
          next >= MAX_TOKEN_FAILURES
            ? { failure_count: next, is_valid: false }
            : { failure_count: next },
        )
        .eq("token", row.token);
    }
  } catch {
    console.error("[notify] push token bookkeeping failed");
  }

  // Compact machine-readable failure summary — never raw provider payloads.
  const counts = new Map<string, number>();
  if (deadTokens.length > 0) counts.set("DeviceNotRegistered", deadTokens.length);
  for (const { code } of errored) counts.set(code, (counts.get(code) ?? 0) + 1);
  if (transportFailures > 0) counts.set("transport", transportFailures);
  const summary = [...counts.entries()]
    .map(([code, n]) => `${code} x${n}`)
    .join(", ")
    .slice(0, 200);

  if (okIds.length > 0) return { ok: true, providerRef: okIds[0] };
  return { ok: false, error: summary || "send_failed" };
}
