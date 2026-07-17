// Notification DELIVERY PROCESSOR (BFF, service-role) — the email/push fan-out.
//
// Two schedulers can drive it, both running the SAME core: POST with the
// `x-processor-key` header (pg_cron + pg_net, or an external cron) and GET from
// Vercel Cron (`Authorization: Bearer ${CRON_SECRET}`, see vercel.json). It
// claims pending notification_deliveries (FOR UPDATE SKIP LOCKED, via the
// service-role RPC), dispatches each to its channel provider, and records the
// result. In-app notifications need NO processing — the row IS the delivery,
// and Realtime pushes it live. create_notification only creates email/push
// delivery rows when the feature flag + recipient prefs allow, so everything
// claimed here SHOULD be sent.
//
// Security: service-role client stays server-only; both entrypoints are guarded
// by constant-time secret comparisons. No user session. 401 bodies stay generic.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  sendEmailDelivery,
  sendPushDelivery,
  type DeliveryResult,
  type PushTokenRow,
} from "@/lib/notifications/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROCESSOR_KEY = process.env.NOTIFICATIONS_PROCESSOR_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// Android notification channels the mobile app registers; anything else falls
// back to "default" so an unknown category can never break a send.
const ANDROID_CHANNELS = new Set([
  "olympiad",
  "progress",
  "billing",
  "announcement",
  "news",
]);

function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function keyOk(provided: string | null): boolean {
  if (!PROCESSOR_KEY || !provided) return false;
  return constantTimeEqual(provided, PROCESSOR_KEY);
}

// Vercel Cron sends GET with `Authorization: Bearer ${CRON_SECRET}` when the
// CRON_SECRET env var is set. Unset secret = endpoint closed (never open).
function cronOk(authorization: string | null): boolean {
  if (!CRON_SECRET || !authorization) return false;
  return constantTimeEqual(authorization, `Bearer ${CRON_SECRET}`);
}

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: "in_app" | "email" | "push";
};

// External cron / pg_net entrypoint (shared-secret header).
export async function POST(req: Request): Promise<Response> {
  if (!keyOk(req.headers.get("x-processor-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return processDeliveries();
}

// Vercel Cron entrypoint — same core as POST so the two schedulers can never
// drift; either (or both) may be enabled, claiming keeps them from colliding.
export async function GET(req: Request): Promise<Response> {
  if (!cronOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return processDeliveries();
}

async function processDeliveries(): Promise<Response> {
  if (!isServiceRoleConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = getAdminClient();

  // Also promote any due scheduled broadcasts (idempotent, cheap).
  await admin.rpc("dispatch_scheduled_notifications");

  const { data: claimed, error } = await admin.rpc("claim_pending_deliveries", {
    p_limit: 50,
    p_worker: "bff",
  });
  if (error) {
    console.error("[notify] claim failed", error.message);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  const rows = (claimed ?? []) as DeliveryRow[];
  let sent = 0;
  let failed = 0;

  for (const d of rows) {
    // Load the notification body + recipient + routing fields for this delivery.
    const { data: n } = await admin
      .from("notifications")
      .select("id, recipient_profile_id, title, body, data_json, type, action_url, category")
      .eq("id", d.notification_id)
      .maybeSingle();
    if (!n) {
      await admin.rpc("mark_delivery_result", {
        p_id: d.id,
        p_status: "failed",
        p_error: "notification_missing",
      });
      failed++;
      continue;
    }

    let result: DeliveryResult;
    if (d.channel === "email") {
      // PII-safe: the email is fetched on demand, never stored on the notification.
      const email = await recipientEmail(admin, n.recipient_profile_id as string);
      result = email
        ? await sendEmailDelivery(email, (n.title as string) ?? "", (n.body as string) ?? "")
        : { ok: false, error: "no_email" };
    } else if (d.channel === "push") {
      const profileId = n.recipient_profile_id as string;
      const tokens = await recipientPushTokens(admin, profileId);
      if (tokens.length === 0) {
        result = { ok: false, error: "no_token" };
      } else {
        const category = (n.category as string | null) ?? null;
        result = await sendPushDelivery(tokens, {
          title: (n.title as string) ?? "",
          body: (n.body as string) ?? "",
          // Small routing payload for the mobile tap handler — ids + a relative
          // action_url only, never PII and never the raw data_json blob.
          data: {
            action_url: (n.action_url as string | null) ?? null,
            notification_id: d.notification_id,
            category,
            type: (n.type as string | null) ?? null,
          },
          channelId: category && ANDROID_CHANNELS.has(category) ? category : "default",
          badge: await recipientUnreadCount(admin, profileId),
        });
      }
    } else {
      // in_app never reaches the delivery queue; nothing to do.
      result = { ok: true };
    }

    await admin.rpc("mark_delivery_result", {
      p_id: d.id,
      p_status: result.ok ? "sent" : "failed",
      p_ref: result.providerRef ?? null,
      p_error: result.ok ? null : result.error ?? "send_failed",
    });
    result.ok ? sent++ : failed++;
  }

  return NextResponse.json({ claimed: rows.length, sent, failed });
}

async function recipientEmail(admin: ReturnType<typeof getAdminClient>, profileId: string): Promise<string | null> {
  const { data: prof } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("id", profileId)
    .maybeSingle();
  const authId = (prof as { auth_user_id?: string } | null)?.auth_user_id;
  if (!authId) return null;
  const { data } = await admin.auth.admin.getUserById(authId);
  return data.user?.email ?? null;
}

async function recipientPushTokens(admin: ReturnType<typeof getAdminClient>, profileId: string): Promise<PushTokenRow[]> {
  const { data } = await admin
    .from("push_tokens")
    .select("token, platform, failure_count")
    .eq("profile_id", profileId)
    .eq("is_valid", true);
  return (data ?? []) as PushTokenRow[];
}

// iOS badge = the recipient's unread, non-expired notification count. head:true
// keeps it a count-only query. On error, send without a badge rather than fail.
async function recipientUnreadCount(
  admin: ReturnType<typeof getAdminClient>,
  profileId: string,
): Promise<number | undefined> {
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error || typeof count !== "number") return undefined;
  return count;
}
