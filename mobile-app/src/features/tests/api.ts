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
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import {
  CHILD_COVERAGE_SELECT,
  liveCoveredSubjects,
  parseAccessibleSubjectIds,
} from "@/lib/coverage";
import { fetchTaughtSubjectIds, keepTaughtSubjects } from "@/lib/data";
import { fallbackExplanationIds } from "@/lib/explanationFallback";
import { pickName } from "@/lib/localizedName";
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
  StartRoundResult,
  StartTestResult,
  SubjectAccess,
  TestAttemptData,
} from "./types";

const PG_CHECK_VIOLATION = "23514";
const PG_NO_DATA_FOUND = "P0002";
const PG_UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Access set — EXACT mirror of web getChildSubjectAccess (childSubjects.ts):
// covered subjects from live trialing/active subscriptions, plus whatever the
// database itself says this child may play; during a giveaway window or an
// active per-child free-access interval, every PUBLISHED subject merges in on
// top. The start RPC re-checks server-side.
// ---------------------------------------------------------------------------
export async function fetchSubjectAccess(
  profileId: string,
  giveawayActive: boolean,
): Promise<SubjectAccess> {
  const [freeAccessRes, trialRes, accessibleRes, studentRes, subsRes, taught] = await Promise.all([
    supabase.rpc("my_free_access_active"),
    // A trial writes NO access_status -- it grants subject-scoped entitlements
    // and nothing else -- so without this a trial-only child reads as inactive
    // and is offered no subjects at all, while the server happily allows them.
    supabase.rpc("my_free_trial"),
    // Migration 124 — the same has_subject_access() the attempt RPCs enforce,
    // caller-scoped to this child. An Apple in-app purchase writes ONE row, in
    // `entitlements`: no access_status, no child_subscriptions row, no trial.
    // Without this read the engine would start the attempt while every screen
    // told the child the app was locked — i.e. a reviewer pays and gets nothing.
    supabase.rpc("my_accessible_subjects"),
    supabase
      .from("students")
      .select("access_status")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("child_subscriptions")
      .select(CHILD_COVERAGE_SELECT)
      .eq("student_profile_id", profileId)
      .in("status", ["trialing", "active"]),
    // Migration 155 — the grade-availability rule, answered by the database and
    // caller-scoped, so a student session needs no grade lookup of its own.
    fetchTaughtSubjectIds(),
  ]);
  if (studentRes.error) throw studentRes.error;
  if (subsRes.error) throw subsRes.error;

  // Safe fallback = inactive: an RPC hiccup never opens free access.
  const freeNow = giveawayActive || freeAccessRes.data === true;
  const access =
    ((studentRes.data as { access_status?: string | null } | null)?.access_status ??
      "inactive") as string;
  const trial = (trialRes.data ?? null) as { active?: boolean; subjects?: unknown } | null;
  const trialNow = !trialRes.error && trial?.active === true;
  // Safe fallback = nothing accessible: an RPC hiccup never invents access. Not
  // lib/data's taughtSubjectSet() — it answers `null`/"do not filter" on error,
  // the opposite fallback direction from the one an access read needs.
  //
  // The PARSE itself is shared with the arena gate (lib/coverage): the two
  // readers of this one RPC used to decode its rows differently, so an encoding
  // change would have locked the arena while this tab still reported access —
  // the app disagreeing with itself about whether a family has paid.
  const accessibleIds = new Set<string>(
    accessibleRes.error ? [] : parseAccessibleSubjectIds(accessibleRes.data),
  );
  // An entitlement writes no access_status and no subscription row, exactly like
  // a trial, so a purchase-only child reads "inactive" here and would be shown
  // the locked app while the attempt RPCs let them play.
  const hasAccess =
    access === "trialing" ||
    access === "active" ||
    freeNow ||
    trialNow ||
    accessibleIds.size > 0;

  // Per-subject periods: the subscription outlives its shortest-cycle
  // subject, so the status filter alone would offer a lapsed one that
  // start_topic_test_attempt then refuses.
  const subjMap = new Map<string, { code: string | null; name: string }>();
  for (const s of liveCoveredSubjects(subsRes.data as any[])) {
    subjMap.set(s.id, { code: s.code, name: s.name });
  }
  // A free window unlocks every PUBLISHED subject, read from `subjects`; an
  // entitled child unlocks exactly the ones my_accessible_subjects() named. Both
  // need the same lookup — the RPC returns ids only, and code+name live here.
  //
  // This used to read `subjects_pricing`, which made PRICING decide what a child
  // may open — and the database disagrees in both directions: during a giveaway
  // has_subject_access() returns true for EVERY subject, so an unpriced one was
  // playable server-side and missing from this list, while an ARCHIVED subject
  // keeps its price rows and stayed on offer. `subjects.status` is the admin's
  // publish switch and `subjects` is world-readable (policy subjects_select is
  // USING (true)); web parity with lib/childSubjects.ts.
  if (freeNow || accessibleIds.size > 0) {
    const { data: published, error } = await supabase
      .from("subjects")
      .select("id, code, name")
      .eq("status", "active");
    if (!error) {
      for (const row of (published ?? []) as any[]) {
        if (!row?.id) continue;
        const id = String(row.id);
        // During a giveaway the RPC already names every subject, so the two arms
        // agree; the filter matters for a child whose access is an entitlement
        // alone, where merging the whole catalogue would offer subjects the
        // start RPC then refuses.
        if (!freeNow && !accessibleIds.has(id)) continue;
        subjMap.set(id, {
          code: row.code ?? null,
          name: String(row.name ?? ""),
        });
      }
    }
  }
  // EXACTLY the trial's subjects. Unlike a giveaway or an admin free-access
  // window, a trial is subject-scoped -- merging the whole priced catalogue
  // would offer subjects the start RPC then refuses.
  if (trialNow && Array.isArray(trial?.subjects)) {
    for (const row of trial.subjects as Record<string, unknown>[]) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) continue;
      subjMap.set(id, {
        code: typeof row.code === "string" ? row.code : null,
        name: typeof row.name === "string" ? row.name : "",
      });
    }
  }

  // SCOPED TO THE CHILD'S GRADE, after every merge above. Fizika is a grades
  // 7-11 subject and this list is what the Tests home offers, so a grade-3
  // child was tapping through to an empty "no questions" screen. Applied
  // OUTSIDE the free/trial branches: a subscribed child must be filtered too —
  // the web's first version of this rule lived inside `if (freeNow)` and so
  // never reached anyone who was actually paying.
  const subjects: ChildSubject[] = keepTaughtSubjects(
    Array.from(subjMap, ([id, v]) => ({ id, code: v.code, name: v.name })),
    taught,
  );
  return { freeNow, access, hasAccess, subjects };
}

// ---------------------------------------------------------------------------
// Tests home — recent rounds + practice tests (web Round-20 parity: kind in
// daily|test; own rows under RLS). subject_id/is_rated feed the per-subject
// "attempted today → result link" card state and the rated chip in history.
// ---------------------------------------------------------------------------
export async function fetchRecentAttempts(profileId: string): Promise<AttemptListRow[]> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select(
      "id, kind, is_rated, status, score, max_score, started_at, submitted_at, deadline_at, subject_id, subjects(code, name)",
    )
    .eq("student_profile_id", profileId)
    .in("kind", ["daily", "test"])
    .order("started_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    kind: r.kind ?? "test",
    is_rated: r.is_rated === true,
    status: r.status,
    score: r.score,
    max_score: r.max_score,
    started_at: r.started_at,
    submitted_at: r.submitted_at,
    deadline_at: r.deadline_at,
    subject_id: r.subject_id ?? null,
    subject_code: r.subjects?.code ?? null,
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
  locale: Locale,
): Promise<SetupTopic[]> {
  const { data: student } = await supabase
    .from("students")
    .select("grade_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  const gradeId = (student as { grade_id?: string | null } | null)?.grade_id ?? null;

  const { data: topicsRaw, error } = await supabase
    .from("topics")
    // Ordering stays on order_index + the AZ name: the curriculum teaching order
    // must not shuffle when the child switches language (migration 114).
    .select("id, name, grade_id, order_index, topic_translations(locale, name)")
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
    .select("id, topic_id, name, order_index, subtopic_translations(locale, name)")
    .in("topic_id", topics.map((tp) => tp.id))
    .eq("status", "active")
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });
  if (subsErr) throw subsErr;

  const byTopic = new Map<string, SetupSubtopic[]>();
  for (const st of (subsRaw ?? []) as any[]) {
    const list = byTopic.get(st.topic_id) ?? [];
    list.push({ id: st.id, name: pickName(st.subtopic_translations, locale, st.name) });
    byTopic.set(st.topic_id, list);
  }
  return topics.map((tp) => ({
    id: tp.id,
    name: pickName(tp.topic_translations, locale, tp.name),
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
// start_daily_round_attempt — the web startDailyRound error mapping
// (testActions.ts), as i18n keys:
//   day='today'     → RATED round (UNTIMED since Round 42; per-student set).
//                     Round 43 (migrations 086/087): the day is consumed AT
//                     CREATION — a partial unique index allows ONE live/graded
//                     rated round per subject per Baku day; a live in_progress
//                     attempt TRUE-resumes, and a <25-question pool raises
//                     BEFORE any row is created, so a failed start never
//                     consumes the day (a canceled row sits outside the
//                     index, so it does not lock the day either).
//   day='yesterday' → unlimited UNTIMED practice on the student's locked
//                     per-student set (never affects points/streak/boards).
//   unique_violation → day already consumed by today's rated round (caller
//                      flips the card to done);
//   no_data_found    → today: pool can't build the round yet;
//                      yesterday: no round set exists (web ?err=noyest);
//   check_violation  → 'grade' in the message = no grade, else no access.
// Raw Postgres text never reaches the UI.
// ---------------------------------------------------------------------------
export async function startDailyRoundAttempt(
  subjectId: string,
  day: "today" | "yesterday" = "today",
): Promise<StartRoundResult> {
  const { data, error } = await supabase.rpc("start_daily_round_attempt", {
    p_subject_id: subjectId,
    p_day: day,
  });
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, already: true, errorKey: "test.rounds.alreadyNote" };
    }
    if (error.code === PG_NO_DATA_FOUND) {
      return {
        ok: false,
        errorKey: day === "yesterday" ? "test.rounds.noYesterday" : "test.rounds.noRoundYet",
      };
    }
    if (error.code === PG_CHECK_VIOLATION) {
      const noGrade = String(error.message ?? "").includes("grade");
      return { ok: false, errorKey: noGrade ? "test.rounds.noGrade" : "test.err.noAccess" };
    }
    return { ok: false, errorKey: "test.err.generic" };
  }
  const d = data as { attempt_id?: unknown; resumed?: unknown } | null;
  const attemptId = typeof d?.attempt_id === "string" ? d.attempt_id : "";
  if (!attemptId) return { ok: false, errorKey: "test.err.generic" };
  return { ok: true, data: { attempt_id: attemptId, resumed: d?.resumed === true } };
}

// ---------------------------------------------------------------------------
// get_test_attempt + display names (subject/topics or the olympiad package
// title). Name lookups degrade to empty labels rather than blocking the run.
// Questions carry an optional locale-aware `image` {bucket,path} ref
// (migration 057) — resolved to a public URL at render (web run-page parity).
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
  const meta: AttemptMeta = {
    subjectName: "",
    subjectCode: null,
    topicNames: [],
    olympiadTitle: null,
  };
  try {
    // Subject name + code (public-read taxonomy). The screen resolves the
    // display label via subjectLabel(t, code, name).
    const { data: subjectRow } = await supabase
      .from("subjects")
      .select("code, name")
      .eq("id", attempt.subject_id)
      .maybeSingle();
    const subjRow = subjectRow as { code?: string | null; name?: string } | null;
    meta.subjectName = (subjRow?.name ?? "").trim();
    meta.subjectCode = subjRow?.code ?? null;

    if (!isOlympiad && attempt.kind !== "daily") {
      // Distinct topic names in question order (web run page parity). Daily
      // rounds SKIP this: the web hides the topic list for a daily draw — 25
      // subtopic-balanced questions would flood the header with topic names.
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
          .select("id, name, topic_translations(locale, name)")
          .in("id", topicIds);
        const nameById = new Map<string, string>(
          (((topicsRes ?? []) as any[]) || []).map((r) => [
            r.id,
            pickName(r.topic_translations, locale, r.name),
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
  locale: Locale,
): Promise<ResultPayload> {
  const { data, error } = await supabase.rpc("submit_test_attempt", {
    p_attempt_id: attemptId,
    p_answers: answers,
    // Migration 114: the payload feeds the result screen per-topic bars, so the
    // names have to come back in the reader's language, not always Azerbaijani.
    p_locale: locale,
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
  const review = payload as ReviewPayload;

  // ---- Honest explanation fallback (web review-page parity) ----------------
  // The RPC coalesces the reader's locale onto az and hands back ONE string
  // with no hint of which one produced it. Ask question_explanations which of
  // these questions actually has one in `locale`; the rest are showing
  // Azerbaijani and get labelled. az is fetched alongside on purpose — see
  // fallbackExplanationIds: an RLS-hidden (archived) question returns no rows
  // at all, and that must stay unlabelled rather than be declared untranslated.
  //
  // Failure here is deliberately NON-FATAL: a review that renders without the
  // label is today's behaviour, whereas throwing would cost the child the whole
  // graded review over a cosmetic disclosure.
  const explainedIds = review.questions
    .filter((q) => (q.explanation ?? "").trim() !== "")
    .map((q) => q.question_id);
  // The az guard only SKIPS the round-trip — fallbackExplanationIds would
  // return an empty set for an az reader anyway, so the two can never disagree.
  if (locale !== "az" && explainedIds.length > 0) {
    try {
      // Chunked: an olympiad attempt may serve up to 500 questions
      // (questions_per_attempt) and a 500-uuid .in() list would blow past the
      // gateway's URL limit.
      const chunks: string[][] = [];
      for (let i = 0; i < explainedIds.length; i += 100) {
        chunks.push(explainedIds.slice(i, i + 100));
      }
      const results = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from("question_explanations")
            .select("question_id, locale")
            .in("question_id", ids)
            .in("locale", ["az", locale]),
        ),
      );
      const rows = results.flatMap(
        (r) => (r.data ?? []) as { question_id: string; locale: string }[],
      );
      const fallbackIds = fallbackExplanationIds(rows, locale, explainedIds);
      for (const q of review.questions) {
        if (fallbackIds.has(q.question_id)) q.explanationIsFallback = true;
      }
    } catch {
      // Label omitted, review intact.
    }
  }
  return review;
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
      "id, kind, is_rated, status, deadline_at, started_at, submitted_at, duration_seconds, subjects(code, name)",
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
    is_rated: r.is_rated === true,
    status: r.status,
    deadline_at: r.deadline_at,
    started_at: r.started_at,
    submitted_at: r.submitted_at,
    duration_seconds: r.duration_seconds,
    subject_code: r.subjects?.code ?? null,
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

// ---------------------------------------------------------------------------
// submit_question_report — "Report a problem" (migration 115).
//
// Same posture as every other call in this file: the child JWT talks to the
// SECURITY DEFINER RPC directly, and the DATABASE owns everything that matters.
// Reporter, status, olympiad package and attempt context are derived by
// trg_question_report_derive, which also carries the authoritative 5/hour +
// 20/day throttle — precisely because this path never passes through a web
// server where an app-tier limiter could sit.
//
// `platform` and `locale` are self-reported diagnostics: the database cannot
// observe which UI language a phone was rendering. Both are enum-constrained
// server-side and are never used for authorization.
// ---------------------------------------------------------------------------
export type ReportResult = { ok: true } | { ok: false; errorKey: string };

export async function submitQuestionReport(input: {
  questionId: string;
  attemptId: string | null;
  message: string;
  locale: Locale;
}): Promise<ReportResult> {
  const message = input.message.trim();
  if (message === "") return { ok: false, errorKey: "test.report.emptyErr" };
  // Refused, never truncated — the same cap the column CHECK enforces.
  if (message.length > 1000) return { ok: false, errorKey: "test.report.err.generic" };

  const { error } = await supabase.rpc("submit_question_report", {
    p_question_id: input.questionId,
    p_attempt_id: input.attemptId,
    p_message: message,
    p_locale: input.locale,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    // Constants.expoConfig.version is expo.version from app.json — the single
    // source AppVersion.tsx reads too. Never a hardcoded string.
    p_app_version: Constants.expoConfig?.version ?? null,
  });
  if (!error) return { ok: true };

  // The open-report unique index: not an error state, the report already exists.
  if (error.code === PG_UNIQUE_VIOLATION) {
    return { ok: false, errorKey: "test.report.err.duplicate" };
  }
  // 23514 here means the throttle: this caller supplies a valid locale and
  // platform and has already trimmed and capped the body.
  if (error.code === PG_CHECK_VIOLATION) {
    return { ok: false, errorKey: "test.report.err.tooMany" };
  }
  if (error.code === PG_NO_DATA_FOUND) {
    return { ok: false, errorKey: "test.report.err.generic" };
  }
  return { ok: false, errorKey: "test.report.err.generic" };
}
