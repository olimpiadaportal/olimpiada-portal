"use server";

// Question reports (migration 115) — Administrator-only triage. Content
// Managers have no path here: there is no permission code to grant, the nav
// entry is adminOnly, every export starts with requireAdmin(), and the
// qreports_* policies gate the rows independently of all three.
//
// The detail loader deliberately reuses the query SHAPE of
// lib/admin/questions.ts → loadQuestionForEdit (translations + explanations +
// answer_options with answer_option_translations). Plain admin queries already
// reach everything an admin may see; no new RPC is needed on the read side.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import type { ReportStatus } from "@/lib/admin/question-report-status";

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

export type ReportTranslation = { locale: string; body: string; prompt: string | null };
export type ReportOption = {
  option_id: string;
  is_correct: boolean;
  text: string | null;
  textLocale: string | null;
};

export type QuestionReportDetail = {
  report: {
    id: string;
    question_id: string;
    attempt_id: string | null;
    attempt_kind: string | null;
    olympiad_package_id: string | null;
    olympiad_package_title: string | null;
    reporter_profile_id: string | null;
    reporter_label: string | null;
    message: string;
    locale: string;
    platform: string;
    app_version: string | null;
    status: string;
    admin_note: string | null;
    handled_by_label: string | null;
    handled_at: string | null;
    created_at: string;
  };
  /** null when the question was deleted since the report was filed. */
  question: {
    id: string;
    status: string;
    primary_locale: string;
    olympiad_package_id: string | null;
    subject: string | null;
    grade: string | null;
    topic: string | null;
    subtopic: string | null;
    /** Body/prompt in the REPORTER's locale, or the az fallback. */
    body: string;
    prompt: string | null;
    /** Which locale the body above actually came from. */
    bodyLocale: string | null;
    explanation: string | null;
    explanationLocale: string | null;
    options: ReportOption[];
  } | null;
};

function pick<T extends { locale: string }>(rows: T[], locale: string): T | null {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "az") ?? null;
}

export async function loadQuestionReport(
  rawId: string,
): Promise<QuestionReportDetail | null> {
  await requireAdmin(); // authorize FIRST — before touching the id
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("question_reports")
    .select(
      "id, question_id, attempt_id, attempt_kind, olympiad_package_id, reporter_profile_id, message, locale, platform, app_version, status, admin_note, handled_by, handled_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;

  const profileIds = [r.reporter_profile_id, r.handled_by].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const [profilesRes, pkgRes, questionRes] = await Promise.all([
    profileIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", profileIds)
      : Promise.resolve({ data: [] as any[] }),
    r.olympiad_package_id
      ? supabase
          .from("olympiad_packages")
          .select("id, code, olympiad_package_translations(locale, title)")
          .eq("id", r.olympiad_package_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("questions")
      .select(
        "id, status, primary_locale, olympiad_package_id, subjects(name), grades(name), topics(name), subtopics(name), question_translations(locale, body, prompt), question_explanations(locale, explanation_body), answer_options(id, is_correct, order_index, answer_option_translations(locale, text))",
      )
      .eq("id", r.question_id)
      .maybeSingle(),
  ]);

  const profileById = new Map<string, any>(
    ((profilesRes.data ?? []) as any[]).map((p) => [p.id, p]),
  );
  const label = (pid: string | null): string | null => {
    if (!pid) return null;
    const p = profileById.get(pid);
    return p?.display_name || p?.email || null;
  };

  const pkg = pkgRes.data as any;
  const pkgTitle = pkg
    ? ((pkg.olympiad_package_translations ?? []).find((x: any) => x.locale === "az")
        ?.title ?? pkg.code ?? null)
    : null;

  const q = questionRes.data as any;
  let question: QuestionReportDetail["question"] = null;
  if (q) {
    // The report's locale first, az as the fallback — and the CALLER is told
    // which one it got, so an admin reading a Russian report is never left
    // guessing whether the Azerbaijani text in front of them is the bug.
    const tr = pick((q.question_translations ?? []) as any[], r.locale);
    const ex = pick((q.question_explanations ?? []) as any[], r.locale);
    const opts = ((q.answer_options ?? []) as any[])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((o) => {
        const ot = pick((o.answer_option_translations ?? []) as any[], r.locale);
        return {
          option_id: o.id as string,
          is_correct: !!o.is_correct,
          text: (ot?.text as string | undefined) ?? null,
          textLocale: (ot?.locale as string | undefined) ?? null,
        };
      });
    question = {
      id: q.id,
      status: String(q.status),
      primary_locale: String(q.primary_locale ?? "az"),
      olympiad_package_id: q.olympiad_package_id ?? null,
      subject: q.subjects?.name ?? null,
      grade: q.grades?.name ?? null,
      topic: q.topics?.name ?? null,
      subtopic: q.subtopics?.name ?? null,
      body: (tr?.body as string | undefined) ?? "",
      prompt: (tr?.prompt as string | undefined) ?? null,
      bodyLocale: (tr?.locale as string | undefined) ?? null,
      explanation: (ex?.explanation_body as string | undefined) ?? null,
      explanationLocale: (ex?.locale as string | undefined) ?? null,
      options: opts,
    };
  }

  return {
    report: {
      id: r.id,
      question_id: r.question_id,
      attempt_id: r.attempt_id ?? null,
      attempt_kind: r.attempt_kind ?? null,
      olympiad_package_id: r.olympiad_package_id ?? null,
      olympiad_package_title: pkgTitle,
      reporter_profile_id: r.reporter_profile_id ?? null,
      reporter_label: label(r.reporter_profile_id ?? null),
      message: String(r.message ?? ""),
      locale: String(r.locale),
      platform: String(r.platform),
      app_version: r.app_version ?? null,
      status: String(r.status),
      admin_note: r.admin_note ?? null,
      handled_by_label: label(r.handled_by ?? null),
      handled_at: r.handled_at ?? null,
      created_at: r.created_at,
    },
    question,
  };
}

// Status transition. Modelled on transitionNews: guard first, whitelist the
// action, write through the USER-SESSION client (qreports_update is the real
// gate, and trg_question_report_freeze stamps handled_by/handled_at and
// protects the evidence), then audit ids and statuses only.
export async function transitionQuestionReport(formData: FormData): Promise<void> {
  const ctx = await requireAdmin(); // authorize FIRST (before any FormData read)

  const rawId = formData.get("__id");
  const rawAction = formData.get("__action");
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const action = typeof rawAction === "string" ? rawAction.trim() : "";
  const to = TRANSITIONS[action];
  if (!UUID_RE.test(id) || !to) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("question_reports")
    .select("status, question_id")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.status === to) return;

  const { error } = await supabase
    .from("question_reports")
    .update({ status: to })
    .eq("id", id);
  if (error) {
    console.error("[admin] question report transition failed", error.code);
    return;
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.question_report.status",
    targetTable: "question_reports",
    targetId: id,
    // Ids and statuses only. The report BODY never enters an audit row — it is
    // user-supplied free text and audit metadata is a small, capped payload.
    metadata: { from: current.status, to, question_id: current.question_id },
  });

  revalidatePath("/question-reports");
  revalidatePath(`/question-reports/${id}`);
}
