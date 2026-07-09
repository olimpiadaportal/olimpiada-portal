"use server";

// Notifications module — Administrator-only (requires the notifications.send
// permission, which only administrators hold). Compose/broadcast, audience
// preview and template CRUD.
//
// SECURITY POSTURE (identical to the other Admin-only modules):
//   1) requireAdmin() ALWAYS runs first — before any FormData is read.
//   2) Sends go through the request-scoped SESSION client (createClient), so the
//      SECURITY DEFINER RPCs (admin_send_notification / get_notification_target_count)
//      resolve the acting admin via current_profile_id() and re-check the
//      permission in-body. The service-role client is used ONLY by the audit
//      helper and never leaves the server.
//   3) Every client-supplied value is validated server-side (length caps, enum
//      whitelists, UUID shapes). Raw DB errors are never returned to the client.
//   4) Sends are audited with METADATA ONLY — never the notification body.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-side caps mirror the DB (admin_send_notification left(title,200)/
// left(body,2000)); the UI also limits these — client limits are UX, not security.
const TITLE_MAX = 200;
const BODY_MAX = 2000;
const SUBJECT_MAX = 200;
const CODE_MAX = 60;
const CODE_RE = /^[a-z0-9_]+$/;

const LOCALES = ["az", "en", "ru"] as const;
const AUDIENCE_TYPES = new Set([
  "all_parents",
  "all_children",
  "parent",
  "by_subject",
]);
// Hard cap on how many parents one "specific parent(s)" send may target.
const PROFILE_IDS_MAX = 500;
// in_app is always forced on; email/push only deliver when their master flag is
// enabled (enforced in create_notification), but the request may still list them.
const CHANNELS = ["in_app", "email", "push"] as const;

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

// =====================================================================
// sendNotification — compose/broadcast (immediate or scheduled).
// =====================================================================
export type SendNotificationState =
  | { ok?: boolean; error?: string; recipients?: number; status?: string }
  | null;

export async function sendNotification(
  _prev: SendNotificationState,
  formData: FormData,
): Promise<SendNotificationState> {
  const ctx = await requireAdmin(); // authorize FIRST — before touching FormData
  const t = await getT();

  // ---- Validate every client-supplied field (server-side, hard) -------------
  const title = f(formData, "title");
  const body = f(formData, "body");
  if (!title || title.length > TITLE_MAX) return { error: t("ntfadmin.err.title") };
  if (!body || body.length > BODY_MAX) return { error: t("ntfadmin.err.body") };

  const audienceType = f(formData, "audience_type");
  if (!AUDIENCE_TYPES.has(audienceType)) {
    return { error: t("ntfadmin.err.audience") };
  }

  // Channels: whitelist subset of in_app/email/push, with in_app forced on.
  const claimed = new Set(
    formData
      .getAll("channel")
      .map((v) => (typeof v === "string" ? v : ""))
      .filter(Boolean),
  );
  claimed.add("in_app");
  const channels = CHANNELS.filter((c) => claimed.has(c));

  // Audience filter — { profile_ids: [...] } for parent (one or more selected
  // parents; the DB lb_notify_audience resolves the uuid array), { subject_id }
  // for by_subject, {} otherwise. Every id is UUID-validated before it reaches
  // the RPC, deduped, and the count is capped.
  let filter: Record<string, unknown> = {};
  if (audienceType === "parent") {
    const ids = Array.from(
      new Set(
        f(formData, "profile_ids")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    const valid = ids.filter((id) => UUID_RE.test(id));
    if (valid.length === 0 || valid.length !== ids.length) {
      return { error: t("ntfadmin.err.target") };
    }
    if (valid.length > PROFILE_IDS_MAX) return { error: t("ntfadmin.err.target") };
    filter = { profile_ids: valid };
  } else if (audienceType === "by_subject") {
    const subjectId = f(formData, "subject_id");
    if (!UUID_RE.test(subjectId)) return { error: t("ntfadmin.err.subject") };
    filter = { subject_id: subjectId };
  }

  // Optional schedule — the client already converted the datetime-local value to
  // a UTC ISO string (interpreted in the admin's own tz, like FreeAccessManager).
  // A provided time MUST be in the future; blank means "send now".
  const scheduledRaw = f(formData, "scheduled_at");
  let scheduledIso: string | null = null;
  if (scheduledRaw) {
    const d = new Date(scheduledRaw);
    if (Number.isNaN(d.getTime())) return { error: t("ntfadmin.err.schedule") };
    if (d.getTime() <= Date.now()) return { error: t("ntfadmin.err.schedulePast") };
    scheduledIso = d.toISOString();
  }

  // Optional template code (metadata only — the composer already copied the
  // template's subject/body into the fields). Ignore an invalid-shaped code.
  const rawCode = f(formData, "template_code");
  const templateCode =
    rawCode && rawCode.length <= CODE_MAX && CODE_RE.test(rawCode)
      ? rawCode
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_send_notification", {
    p_title: title,
    p_body: body,
    p_channels: channels,
    p_audience_type: audienceType,
    p_audience_filter: filter,
    p_scheduled_at: scheduledIso,
    p_template_code: templateCode,
    p_action_url: null,
  });
  if (error || !data) {
    console.error("[admin] notification send failed", error?.message);
    return { error: t("err.server") };
  }

  const result = data as { id?: string; status?: string; recipients?: number };
  const recipients =
    typeof result.recipients === "number" ? result.recipients : 0;
  const status = typeof result.status === "string" ? result.status : "sent";

  // Audit METADATA ONLY — never the notification body.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.notification.send",
    targetTable: "admin_notifications",
    targetId: result.id ?? null,
    metadata: {
      audience_type: audienceType,
      channels: channels.join(","),
      recipients,
      template_code: templateCode ?? undefined,
      scheduled: !!scheduledIso,
    },
  });

  revalidatePath("/notifications");
  return { ok: true, recipients, status };
}

// =====================================================================
// previewCount — live audience size for the composer. Read-only, not audited.
// =====================================================================
export async function previewCount(
  audienceType: string,
  filter: { profile_ids?: string[]; subject_id?: string },
): Promise<number> {
  await requireAdmin(); // authorize FIRST
  if (!AUDIENCE_TYPES.has(audienceType)) return 0;

  let resolved: Record<string, unknown> = {};
  if (audienceType === "parent") {
    const ids = Array.from(new Set(filter?.profile_ids ?? [])).filter((id) =>
      UUID_RE.test(id),
    );
    if (ids.length === 0) return 0;
    resolved = { profile_ids: ids.slice(0, PROFILE_IDS_MAX) };
  } else if (audienceType === "by_subject") {
    const sid = filter?.subject_id ?? "";
    if (!UUID_RE.test(sid)) return 0;
    resolved = { subject_id: sid };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_target_count", {
    p_type: audienceType,
    p_filter: resolved,
  });
  if (error || typeof data !== "number") return 0;
  return data;
}

// =====================================================================
// Template CRUD — upsert on (code, locale); admin-only (RLS: is_admin all).
// =====================================================================
export type TemplateState = { ok?: boolean; error?: string } | null;

export async function saveTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const ctx = await requireAdmin();
  const t = await getT();

  const code = f(formData, "code").toLowerCase();
  const locale = f(formData, "locale");
  const subject = f(formData, "subject");
  const body = f(formData, "body");

  if (!code || code.length > CODE_MAX || !CODE_RE.test(code)) {
    return { error: t("ntfadmin.err.tplCode") };
  }
  if (!(LOCALES as readonly string[]).includes(locale)) {
    return { error: t("ntfadmin.err.tplLocale") };
  }
  if (subject.length > SUBJECT_MAX) return { error: t("err.tooLong") };
  if (!body || body.length > BODY_MAX) return { error: t("ntfadmin.err.tplBody") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_templates")
    .upsert({ code, locale, subject: subject || null, body }, { onConflict: "code,locale" });
  if (error) {
    console.error("[admin] notification template upsert failed", error.message);
    return { error: t("err.server") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.notification.template.upsert",
    targetTable: "notification_templates",
    metadata: { code, locale },
  });

  revalidatePath("/notifications");
  return { ok: true };
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("notification_templates")
    .select("code, locale")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("notification_templates")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[admin] notification template delete failed", error.message);
    return;
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.notification.template.delete",
    targetTable: "notification_templates",
    targetId: id,
    metadata: row
      ? { code: (row as { code: string }).code, locale: (row as { locale: string }).locale }
      : undefined,
    severity: "warning",
  });

  revalidatePath("/notifications");
}
