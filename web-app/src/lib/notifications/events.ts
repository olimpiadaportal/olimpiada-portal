// SERVER-ONLY action-driven notification emitters (N3).
//
// create_notification() is service-role ONLY (a user can never forge a
// notification), so these run through the admin client — but ALWAYS after the
// calling server action has authorized the operation. Each emit is wrapped in
// try/catch so a notification failure can NEVER break the underlying action
// (a purchase / grade / cancel must still succeed if the inbox write fails).
//
// The STORED title/body are Azerbaijani (the product default locale). Structured
// values are also written to p_data so a future locale-aware re-render (or the
// email/push templates) can rebuild the copy in the recipient's own language
// without re-deriving anything. Idempotency keys make every emit at-most-once.
//
// DEFERRED (intentionally not wired here): time-driven events — trial / period
// ending, charge failed, giveaway ending — land when the payment provider and
// the scheduled scanners exist. They will call create_notification exactly the
// same way (their templates are already seeded in migration 042).
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

type CreateArgs = {
  recipient: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
  priority: number;
  actionUrl: string;
  category: string;
};

// Single guarded insert path. Never throws — logs server-side and returns.
async function safeCreate(args: CreateArgs): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.rpc("create_notification", {
      p_recipient: args.recipient,
      p_type: args.type,
      p_title: args.title,
      p_body: args.body,
      p_data: args.data,
      p_channels: ["in_app"],
      p_idempotency_key: args.idempotencyKey,
      p_priority: args.priority,
      p_action_url: args.actionUrl,
      p_category: args.category,
      p_expires_at: null,
    });
  } catch (err) {
    // Swallow — the caller's primary action must not fail on a notification.
    console.error("[notifications] create failed", args.type, err);
  }
}

async function childFirstName(studentProfileId: string): Promise<string> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("students")
      .select("first_name")
      .eq("profile_id", studentProfileId)
      .maybeSingle();
    const n = (data as { first_name?: string } | null)?.first_name?.trim();
    return n && n.length > 0 ? n : "";
  } catch {
    return "";
  }
}

// NOTE: the former notifyOlympiadPurchased emitter was retired — an olympiad
// purchase now notifies via the DB trigger trg_notify_olympiad_purchased
// (migration 128), which mirrors its exact contract (type 'olympiad_purchased',
// az title/body for child and parent, {student_profile_id, package_id,
// package_title, child_name} data, priority 4, category 'olympiad', the
// '/child/olympiads' and '/children/<id>/olympiads' action URLs and the
// identical 'oly:<student>:<package>:child' / ':parent' idempotency keys). It
// moved for the reason below: migration 127 put the PAID purchase on the
// checkout rail, which never reached this emitter, so only free activations
// notified and a family that paid heard nothing. On the table, every producer —
// free activation, bank callback, redeem sweep, admin grant — notifies once.

// NOTE: the former notifyAttemptGraded emitter was retired — grading now
// notifies via the DB trigger trg_notify_attempt_graded (migration 068), which
// mirrors its exact contract (type 'attempt_graded', az title/body,
// {attempt_id, score, max} data, priority 5, category 'progress',
// '/child/test/result/<id>' action URL and the identical 'attempt:<attemptId>'
// idempotency key), so EVERY grading path — web action, mobile direct RPC,
// result-page idempotent submit — notifies exactly once.

/**
 * Subscription canceled by the parent → notify the parent. Idempotent per
 * subscription. Best-effort.
 */
export async function notifySubscriptionCanceled(input: {
  parentProfileId: string;
  studentProfileId: string;
  subscriptionId: string;
}): Promise<void> {
  const child = await childFirstName(input.studentProfileId);
  await safeCreate({
    recipient: input.parentProfileId,
    type: "subscription_canceled",
    title: "Abunə ləğv edildi",
    body: child
      ? `${child} üçün abunə cari dövrün sonunda bitəcək.`
      : `Abunə cari dövrün sonunda bitəcək.`,
    data: {
      subscription_id: input.subscriptionId,
      student_profile_id: input.studentProfileId,
      child_name: child,
    },
    idempotencyKey: `subcancel:${input.subscriptionId}`,
    priority: 3,
    actionUrl: "/subscription",
    category: "billing",
  });
}
