"use server";

// Platform bug reports (migration 116) — Administrator-only triage.
//
// Same posture as questionReports.ts, deliberately: Content Managers have no
// path here (no permission code exists to grant, the nav entry is adminOnly,
// every export starts with requireAdmin(), and the bugreports_* policies gate
// the rows independently of all three).
//
// WHAT THIS FILE MAY CHANGE IS NARROW BY DESIGN. trg_bug_report_freeze restores
// every reported field on UPDATE, so status, priority and admin_note are the
// only columns an UPDATE can actually move — a resolved report can never be a
// rewritten one. handled_by/handled_at/resolved_at are stamped by that same
// trigger, which is why they are never sent from here.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import type { ReportStatus } from "@/lib/admin/question-report-status";
import { isBugPriority } from "@/lib/admin/bug-report-meta";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client strings are mapped to enum values HERE, server-side. A client string
// never reaches the status column, and an unknown action is a silent no-op.
const TRANSITIONS: Record<string, ReportStatus> = {
  in_review: "in_review",
  resolve: "resolved",
  dismiss: "dismissed",
  reopen: "new",
};

// Mirrors chk_bug_reports_admin_note. Trimmed and capped here so an oversized
// note is refused by the whitelist rather than by a raw Postgres error.
const NOTE_MAX = 2000;

export type BugReportDetail = {
  id: string;
  title: string;
  description: string;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  reported_severity: string;
  reporter_profile_id: string | null;
  reporter_label: string | null;
  reporter_role: string;
  reporter_email: string | null;
  reporter_email_verified: boolean;
  route_path: string | null;
  user_agent: string | null;
  locale: string;
  platform: string;
  app_version: string | null;
  status: string;
  priority: string;
  admin_note: string | null;
  handled_by_label: string | null;
  handled_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadBugReport(rawId: string): Promise<BugReportDetail | null> {
  await requireAdmin(); // authorize FIRST — before touching the id
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("bug_reports")
    .select(
      "id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, reported_severity, reporter_profile_id, reporter_role, reporter_email, reporter_email_verified, route_path, user_agent, locale, platform, app_version, status, priority, admin_note, handled_by, handled_at, resolved_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;

  // One lookup for both people on the row. Either may be null: the FK is
  // ON DELETE SET NULL, so a deleted account leaves the report intact.
  const profileIds = Array.from(
    new Set(
      [r.reporter_profile_id, r.handled_by].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    ),
  );
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, display_name, email").in("id", profileIds)
    : { data: [] as { id: string; display_name: string | null; email: string | null }[] };

  const profileById = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null; email: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  const label = (pid: string | null): string | null => {
    if (!pid) return null;
    const p = profileById.get(pid);
    return p?.display_name || p?.email || null;
  };

  return {
    id: r.id,
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    steps_to_reproduce: r.steps_to_reproduce ?? null,
    expected_behavior: r.expected_behavior ?? null,
    actual_behavior: r.actual_behavior ?? null,
    reported_severity: String(r.reported_severity ?? "normal"),
    reporter_profile_id: r.reporter_profile_id ?? null,
    reporter_label: label(r.reporter_profile_id ?? null),
    reporter_role: String(r.reporter_role ?? "anonymous"),
    reporter_email: r.reporter_email ?? null,
    reporter_email_verified: r.reporter_email_verified === true,
    route_path: r.route_path ?? null,
    user_agent: r.user_agent ?? null,
    locale: String(r.locale),
    platform: String(r.platform),
    app_version: r.app_version ?? null,
    status: String(r.status),
    priority: String(r.priority),
    admin_note: r.admin_note ?? null,
    handled_by_label: label(r.handled_by ?? null),
    handled_at: r.handled_at ?? null,
    resolved_at: r.resolved_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Triage one report: a status transition, a priority change, or an internal
 * note — one per submit, because each control is its own bare <form> so
 * useFormStatus can report which one is pending.
 *
 * Modelled on transitionQuestionReport: guard first, whitelist the action, write
 * through the USER-SESSION client (bugreports_update is the real gate and
 * trg_bug_report_freeze protects the evidence), then audit ids and statuses.
 */
export async function updateBugReport(formData: FormData): Promise<void> {
  const ctx = await requireAdmin(); // authorize FIRST (before any FormData read)

  const rawId = formData.get("__id");
  const rawAction = formData.get("__action");
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const action = typeof rawAction === "string" ? rawAction.trim() : "";
  if (!UUID_RE.test(id)) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("bug_reports")
    .select("status, priority, admin_note")
    .eq("id", id)
    .maybeSingle();
  if (!current) return;

  // Build the patch from a server-side whitelist. An unrecognised action, or
  // one that would not change anything, is a silent no-op — never a raw value
  // forwarded to the enum column.
  const patch: Record<string, string | null> = {};
  const meta: Record<string, unknown> = {};

  if (action === "priority") {
    const raw = formData.get("priority");
    const next = typeof raw === "string" ? raw.trim() : "";
    if (!isBugPriority(next) || next === current.priority) return;
    patch.priority = next;
    meta.priority_from = current.priority;
    meta.priority_to = next;
  } else if (action === "note") {
    const raw = formData.get("admin_note");
    const text = (typeof raw === "string" ? raw : "").trim().slice(0, NOTE_MAX);
    const next = text === "" ? null : text;
    if (next === (current.admin_note ?? null)) return;
    patch.admin_note = next;
    // The note TEXT never enters the audit row: it is free-form admin prose and
    // audit metadata is a small, capped payload. Whether it changed is enough
    // to reconstruct the timeline.
    meta.note_changed = true;
    meta.note_cleared = next === null;
  } else {
    const to = TRANSITIONS[action];
    if (!to || to === current.status) return;
    patch.status = to;
    meta.from = current.status;
    meta.to = to;
  }

  const { error } = await supabase.from("bug_reports").update(patch).eq("id", id);
  if (error) {
    // Never surface a raw Postgres message; the code is enough to diagnose.
    console.error("[admin] bug report update failed", error.code);
    return;
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.bug_report.update",
    targetTable: "bug_reports",
    targetId: id,
    // Ids, statuses and booleans only. The report BODY and the note text are
    // user/admin free text and never belong in an audit row.
    metadata: meta,
  });

  revalidatePath("/bug-reports");
  revalidatePath(`/bug-reports/${id}`);
}
