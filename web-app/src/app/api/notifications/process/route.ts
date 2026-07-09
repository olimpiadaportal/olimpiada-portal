// Notification DELIVERY PROCESSOR (BFF, service-role) — the email/push fan-out.
//
// Called by a scheduler (pg_cron + pg_net, or an external cron) with a shared
// secret header. It claims pending notification_deliveries (FOR UPDATE SKIP
// LOCKED, via the service-role RPC), dispatches each to its channel provider,
// and records the result. In-app notifications need NO processing — the row IS
// the delivery, and Realtime pushes it live. So with notifications_email and
// notifications_push OFF (no delivery rows are created), this endpoint is a
// no-op: fully wired, waiting only for a provider / the mobile app.
//
// Security: service-role client stays server-only; the endpoint is guarded by a
// constant-time comparison against NOTIFICATIONS_PROCESSOR_KEY. No user session.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  sendEmailDelivery,
  sendPushDelivery,
} from "@/lib/notifications/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROCESSOR_KEY = process.env.NOTIFICATIONS_PROCESSOR_KEY ?? "";

function keyOk(provided: string | null): boolean {
  if (!PROCESSOR_KEY || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(PROCESSOR_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: "in_app" | "email" | "push";
};

export async function POST(req: Request): Promise<Response> {
  if (!keyOk(req.headers.get("x-processor-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
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
    // Load the notification body + recipient for this delivery.
    const { data: n } = await admin
      .from("notifications")
      .select("recipient_profile_id, title, body, data_json")
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

    let result: { ok: boolean; providerRef?: string; error?: string };
    if (d.channel === "email") {
      // PII-safe: the email is fetched on demand, never stored on the notification.
      const email = await recipientEmail(admin, n.recipient_profile_id as string);
      result = email
        ? await sendEmailDelivery(email, (n.title as string) ?? "", (n.body as string) ?? "")
        : { ok: false, error: "no_email" };
    } else if (d.channel === "push") {
      const tokens = await recipientPushTokens(admin, n.recipient_profile_id as string);
      result =
        tokens.length > 0
          ? await sendPushDelivery(tokens, (n.title as string) ?? "", (n.body as string) ?? "", (n.data_json as Record<string, unknown>) ?? {})
          : { ok: false, error: "no_token" };
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

async function recipientPushTokens(admin: ReturnType<typeof getAdminClient>, profileId: string): Promise<string[]> {
  const { data } = await admin
    .from("push_tokens")
    .select("token")
    .eq("profile_id", profileId)
    .eq("is_valid", true);
  return ((data ?? []) as { token: string }[]).map((r) => r.token);
}
