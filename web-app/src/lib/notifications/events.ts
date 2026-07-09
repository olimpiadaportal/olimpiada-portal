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

async function packageTitleAz(packageId: string): Promise<string> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("olympiad_packages")
      .select("olympiad_package_translations(locale, title)")
      .eq("id", packageId)
      .maybeSingle();
    const rows =
      ((data as { olympiad_package_translations?: { locale: string; title: string }[] } | null)
        ?.olympiad_package_translations) ?? [];
    const az = rows.find((r) => r.locale === "az")?.title?.trim();
    const any = rows.find((r) => (r.title ?? "").trim().length > 0)?.title?.trim();
    return (az && az.length > 0 ? az : any) ?? "";
  } catch {
    return "";
  }
}

/**
 * Olympiad package purchased → notify BOTH the child (their arena inbox) and the
 * owning parent. Distinct idempotency suffixes so both rows are created (the key
 * is globally unique). Best-effort; failures are swallowed.
 */
export async function notifyOlympiadPurchased(input: {
  studentProfileId: string;
  parentProfileId: string;
  packageId: string;
}): Promise<void> {
  const [child, pkg] = await Promise.all([
    childFirstName(input.studentProfileId),
    packageTitleAz(input.packageId),
  ]);
  const pkgLabel = pkg || "Olimpiada paketi";
  const base = `oly:${input.studentProfileId}:${input.packageId}`;
  const data = {
    student_profile_id: input.studentProfileId,
    package_id: input.packageId,
    package_title: pkg,
    child_name: child,
  };

  // Child (informal, arena voice).
  await safeCreate({
    recipient: input.studentProfileId,
    type: "olympiad_purchased",
    title: "Yeni olimpiada paketi",
    body: `${pkgLabel} paketi artıq sənin üçün açıqdır.`,
    data,
    idempotencyKey: `${base}:child`,
    priority: 4,
    actionUrl: "/child/olympiads",
    category: "olympiad",
  });

  // Parent.
  await safeCreate({
    recipient: input.parentProfileId,
    type: "olympiad_purchased",
    title: "Olimpiada paketi alındı",
    body: child
      ? `${pkgLabel} paketi ${child} üçün aktivdir.`
      : `${pkgLabel} paketi övladınız üçün aktivdir.`,
    data,
    idempotencyKey: `${base}:parent`,
    priority: 4,
    actionUrl: `/children/${input.studentProfileId}/olympiads`,
    category: "olympiad",
  });
}

/**
 * Test attempt graded → notify the child with their score. Idempotent per
 * attempt. Best-effort.
 */
export async function notifyAttemptGraded(input: {
  studentProfileId: string;
  attemptId: string;
  score: number;
  max: number;
}): Promise<void> {
  await safeCreate({
    recipient: input.studentProfileId,
    type: "attempt_graded",
    title: "Nəticə hazırdır",
    body: `Sınağın qiymətləndirildi: ${input.score}/${input.max}.`,
    data: {
      attempt_id: input.attemptId,
      score: input.score,
      max: input.max,
    },
    idempotencyKey: `attempt:${input.attemptId}`,
    priority: 5,
    actionUrl: `/child/test/result/${input.attemptId}`,
    category: "progress",
  });
}

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
