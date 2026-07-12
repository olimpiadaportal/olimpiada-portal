// TEST ENGINE (M3) — the Supabase layer. Attempts talk to the SECURITY DEFINER
// test RPCs DIRECTLY (child JWT + in-RPC owner checks + RLS — no BFF), exactly
// like the web testActions:
//   start_topic_test_attempt → get_test_attempt → save_test_answers (30s
//   autosave + deadline resync; SQLSTATE 23514 = deadline passed → the caller
//   auto-submits) → submit_test_attempt (idempotent; p_answers:null fetches/
//   finalizes) → cancel_test_attempt → get_test_review (graded + owner only).
// Raw Postgres/Supabase error text NEVER reaches the UI — callers receive
// i18n keys / typed flags only. Anti-cheat: nothing here ever selects
// answer_options or any is_correct outside the graded review payload.
import { supabase } from "@/lib/supabase";
import type { Locale } from "@/i18n";
import type {
  AnswerItem,
  AttemptListRow,
  AttemptMeta,
  AttemptRowMeta,
  BreakdownRow,
  ChildSubject,
  ResultPayload,
  ReviewPayload,
  SaveResult,
  SetupSubtopic,
  SetupTopic,
  StartTestResult,
  SubjectAccess,
  TestAttemptData,
} from "./types";

const PG_CHECK_VIOLATION = "23514";
const PG_NO_DATA_FOUND = "P0002";

// ---------------------------------------------------------------------------
// Access set — EXACT mirror of web getChildSubjectAccess (childSubjects.ts):
// covered subjects from live trialing/active subscriptions; during a giveaway
// window or an active per-child free-access interval, every subject with
// active pricing merges in on top. The start RPC re-checks server-side.
// ---------------------------------------------------------------------------
export async function fetchSubjectAccess(
  profileId: string,
  giveawayActive: boolean,
): Promise<SubjectAccess> {
  const [freeAccessRes, studentRes, subsRes] = await Promise.all([
    supabase.rpc("my_free_access_active"),
    supabase
      .from("students")
      .select("access_status")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("child_subscriptions")
      .select("status, subscription_subjects(subjects(id, name))")
      .eq("student_profile_id", profileId)
      .in("status", ["trialing", "active"]),
  ]);
  if (studentRes.error) throw studentRes.error;
  if (subsRes.error) throw subsRes.error;

  // Safe fallback = inactive: an RPC hiccup never opens free access.
  const freeNow = giveawayActive || freeAccessRes.data === true;
  const access =
    ((studentRes.data as { access_status?: string | null } | null)?.access_status ??
      "inactive") as string;
  const hasAccess = access === "trialing" || access === "active" || freeNow;

  const subjMap = new Map<string, string>();
  for (const s of (subsRes.data ?? []) as any[]) {
    for (const ss of s.subscription_subjects ?? []) {
      if (ss.subjects) subjMap.set(ss.subjects.id, ss.subjects.name);
    }
  }
  if (freeNow) {
    const { data: priced, error } = await supabase
      .from("subjects_pricing")
      .select("subjects(id, name)")
      .eq("status", "active");
    if (!error) {
      for (const row of (priced ?? []) as any[]) {
        if (row.subjects) subjMap.set(row.subjects.id, row.subjects.name);
      }
    }
  }
  const subjects: ChildSubject[] = Array.from(subjMap, ([id, name]) => ({ id, name }));
  return { freeNow, access, hasAccess, subjects };
}

// ---------------------------------------------------------------------------
// Tests home — recent timed tests (kind='test'; own rows under RLS).
// ---------------------------------------------------------------------------
export async function fetchRecentAttempts(profileId: string): Promise<AttemptListRow[]> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select("id, status, score, max_score, started_at, submitted_at, deadline_at, subjects(name)")
    .eq("student_profile_id", profileId)
    .eq("kind", "test")
    .order("started_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    status: r.status,
    score: r.score,
    max_score: r.max_score,
    started_at: r.started_at,
    submitted_at: r.submitted_at,
    deadline_at: r.deadline_at,
    subject_name: r.subjects?.name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Setup taxonomy — EXAM-scoped topics only (migration 050: olympiad-scoped
// topics must never surface in the test picker), grade-filtered when both the
// child and the topic carry a grade (web setup page parity).
// ---------------------------------------------------------------------------
export async function fetchSetupTopics(
  subjectId: string,
  profileId: string,
): Promise<SetupTopic[]> {
  const { data: student } = await supabase
    .from("students")
    .select("grade_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  const gradeId = (student as { grade_id?: string | null } | null)?.grade_id ?? null;

  const { data: topicsRaw, error } = await supabase
    .from("topics")
    .select("id, name, grade_id, order_index")
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .eq("scope", "exam")
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  const topics = ((topicsRaw ?? []) as any[]).filter(
    (tp) => !tp.grade_id || !gradeId || tp.grade_id === gradeId,
  );
  if (topics.length === 0) return [];

  const { data: subsRaw, error: subsErr } = await supabase
    .from("subtopics")
    .select("id, topic_id, name, order_index")
    .in("topic_id", topics.map((tp) => tp.id))
    .eq("status", "active")
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });
  if (subsErr) throw subsErr;

  const byTopic = new Map<string, SetupSubtopic[]>();
  for (const st of (subsRaw ?? []) as any[]) {
    const list = byTopic.get(st.topic_id) ?? [];
    list.push({ id: st.id, name: st.name });
    byTopic.set(st.topic_id, list);
  }
  return topics.map((tp) => ({
    id: tp.id,
    name: tp.name,
    subtopics: byTopic.get(tp.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// start_topic_test_attempt — errors map to i18n KEYS (web startTopicTest):
// P0002 → no questions in the selection; 23514 → no access.
// ---------------------------------------------------------------------------
export async function startTopicTestAttempt(
  subjectId: string,
  topicIds: string[],
  subtopicIds: string[],
): Promise<StartTestResult> {
  const { data, error } = await supabase.rpc("start_topic_test_attempt", {
    p_subject_id: subjectId,
    p_topic_ids: topicIds,
    p_subtopic_ids: subtopicIds,
  });
  if (error) {
    if (error.code === PG_NO_DATA_FOUND) return { ok: false, errorKey: "test.err.noQuestions" };
    if (error.code === PG_CHECK_VIOLATION) return { ok: false, errorKey: "test.err.noAccess" };
    return { ok: false, errorKey: "test.err.generic" };
  }
  const d = data as { attempt_id?: unknown; resumed?: unknown; deadline_at?: unknown; duration_seconds?: unknown; count?: unknown } | null;
  const attemptId = typeof d?.attempt_id === "string" ? d.attempt_id : "";
  if (!attemptId) return { ok: false, errorKey: "test.err.generic" };
  return {
    ok: true,
    data: {
      attempt_id: attemptId,
      resumed: d?.resumed === true,
      deadline_at: typeof d?.deadline_at === "string" ? d.deadline_at : null,
      duration_seconds:
        typeof d?.duration_seconds === "number" ? d.duration_seconds : null,
      count: typeof d?.count === "number" ? d.count : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// get_test_attempt + display names (subject/topics or the olympiad package
// title). Name lookups degrade to empty labels rather than blocking the run.
// ---------------------------------------------------------------------------
export async function fetchTestAttempt(
  attemptId: string,
  locale: Locale,
): Promise<{ attempt: TestAttemptData; meta: AttemptMeta }> {
  const { data, error } = await supabase.rpc("get_test_attempt", {
    p_attempt_id: attemptId,
    p_locale: locale,
  });
  if (error || !data) throw error ?? new Error("empty attempt payload");
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    throw new Error("malformed attempt payload");
  }
  const attempt = payload as TestAttemptData;
  const meta = await fetchAttemptMeta(attempt, locale);
  return { attempt, meta };
}

async function fetchAttemptMeta(
  attempt: TestAttemptData,
  locale: Locale,
): Promise<AttemptMeta> {
  const isOlympiad = attempt.kind === "olympiad";
  const meta: AttemptMeta = { subjectName: "", topicNames: [], olympiadTitle: null };
  try {
    // Subject name (public-read taxonomy).
    const { data: subjectRow } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", attempt.subject_id)
      .maybeSingle();
    meta.subjectName = ((subjectRow as { name?: string } | null)?.name ?? "").trim();

    if (!isOlympiad) {
      // Distinct topic names in question order (web run page parity).
      const topicIds = Array.from(
        new Set(
          (attempt.questions ?? [])
            .map((q) => q.topic_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );
      if (topicIds.length > 0) {
        const { data: topicsRes } = await supabase
          .from("topics")
          .select("id, name")
          .in("id", topicIds);
        const nameById = new Map<string, string>(
          (((topicsRes ?? []) as { id: string; name: string }[]) || []).map((r) => [
            r.id,
            r.name,
          ]),
        );
        const seen = new Set<string>();
        for (const id of topicIds) {
          const nm = nameById.get(id);
          if (nm && !seen.has(nm)) {
            seen.add(nm);
            meta.topicNames.push(nm);
          }
        }
      }
    } else {
      // Every olympiad question is PRIVATE to exactly one package → two indexed
      // lookups resolve the title; any miss degrades to the generic label.
      const firstQid = attempt.questions[0]?.question_id;
      if (firstQid) {
        const { data: qRow } = await supabase
          .from("questions")
          .select("olympiad_package_id")
          .eq("id", firstQid)
          .maybeSingle();
        const pkgId = (qRow as { olympiad_package_id?: string | null } | null)
          ?.olympiad_package_id;
        if (pkgId) {
          const { data: trs } = await supabase
            .from("olympiad_package_translations")
            .select("locale, title")
            .eq("olympiad_package_id", pkgId);
          const rows = (trs ?? []) as { locale: string; title: string | null }[];
          const title = (
            rows.find((x) => x.locale === locale) ?? rows.find((x) => x.locale === "az")
          )?.title?.trim();
          if (title) meta.olympiadTitle = title;
        }
      }
    }
  } catch {
    // Labels are cosmetic — never block the attempt on a lookup failure.
  }
  return meta;
}

// ---------------------------------------------------------------------------
// save_test_answers — autosave + deadline resync. 23514 = the server clock ran
// out (or the attempt closed) → the caller auto-submits (web parity).
// ---------------------------------------------------------------------------
export async function saveTestAnswers(
  attemptId: string,
  answers: AnswerItem[],
): Promise<SaveResult> {
  const { data, error } = await supabase.rpc("save_test_answers", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) {
    if (error.code === PG_CHECK_VIOLATION) return { ok: false, deadline: true };
    throw error;
  }
  const d = data as { remaining_seconds?: number | null } | null;
  const remaining =
    typeof d?.remaining_seconds === "number" && Number.isFinite(d.remaining_seconds)
      ? Math.max(0, Math.floor(d.remaining_seconds))
      : null;
  return { ok: true, remaining };
}

// ---------------------------------------------------------------------------
// submit_test_attempt — idempotent; p_answers:null fetches a graded result /
// finalizes a deadline-passed attempt (the web result page contract).
// ---------------------------------------------------------------------------
export async function submitTestAttempt(
  attemptId: string,
  answers: AnswerItem[] | null,
): Promise<ResultPayload> {
  const { data, error } = await supabase.rpc("submit_test_attempt", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error || !data) throw error ?? new Error("empty submit payload");
  return data as ResultPayload;
}

// ---------------------------------------------------------------------------
// cancel_test_attempt — counts for NOTHING. An already-closed attempt (23514)
// is fine for the caller's UX (web parity).
// ---------------------------------------------------------------------------
export async function cancelTestAttempt(attemptId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc("cancel_test_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) {
    if (error.code === PG_CHECK_VIOLATION) return { ok: true };
    return { ok: false };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// get_test_review — the ONLY payload with answer keys (owner + graded only).
// The caller keeps it in the in-memory query cache exclusively.
// ---------------------------------------------------------------------------
export async function fetchTestReview(
  attemptId: string,
  locale: Locale,
): Promise<ReviewPayload> {
  const { data, error } = await supabase.rpc("get_test_review", {
    p_attempt_id: attemptId,
    p_locale: locale,
  });
  if (error || !data) throw error ?? new Error("empty review payload");
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    throw new Error("malformed review payload");
  }
  return payload as ReviewPayload;
}

// ---------------------------------------------------------------------------
// Result/review guards + time context: the own attempt row (RLS-scoped).
// ---------------------------------------------------------------------------
export async function fetchAttemptRow(
  attemptId: string,
  profileId: string,
): Promise<AttemptRowMeta | null> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select(
      "id, kind, status, deadline_at, started_at, submitted_at, duration_seconds, subjects(name)",
    )
    .eq("id", attemptId)
    .eq("student_profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as any;
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    deadline_at: r.deadline_at,
    started_at: r.started_at,
    submitted_at: r.submitted_at,
    duration_seconds: r.duration_seconds,
    subject_name: r.subjects?.name ?? null,
  };
}

/**
 * Own answer rows AFTER grading — selections + graded flags only (never any
 * answer-key data). Feeds the correct/wrong/SKIPPED result breakdown.
 */
export async function fetchBreakdownRows(attemptId: string): Promise<BreakdownRow[]> {
  const { data, error } = await supabase
    .from("test_attempt_answers")
    .select("selected_option_ids, is_correct")
    .eq("attempt_id", attemptId);
  if (error) throw error;
  return (data ?? []) as BreakdownRow[];
}
