"use server";

// TEST ENGINE (T1/T2) server actions — the ONLY write path between the timed
// test player and the SECURITY DEFINER test RPCs (037). Every action:
//   1. requireChild() FIRST (guard before reading any input);
//   2. validates every client-supplied id with isUuid + hard array caps;
//   3. calls the RPC through the USER-SESSION supabase client (owner checks +
//      RLS are the real gate — never the service-role client);
//   4. maps RPC failures to generic trilingual messages (raw error.message
//      never reaches the client). Two errors are special-cased:
//      - no_data_found (P0002) on start → friendly "no questions yet";
//      - check_violation (23514) on save → the deadline passed / attempt is
//        no longer in progress → a distinct `deadline` signal the client
//        uses to auto-submit.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { notifyAttemptGraded } from "@/lib/notifications/events";

const PG_CHECK_VIOLATION = "23514";
const PG_NO_DATA_FOUND = "P0002";

// Caps mirror the DB-side limits (037): topics ≤50, subtopics ≤100; the
// answers payload can never legitimately exceed the 25-question draw.
const MAX_TOPICS = 50;
const MAX_SUBTOPICS = 100;
const MAX_ANSWERS = 30;

/** Parse a JSON array of UUIDs from a form field. null = invalid input. */
function parseUuidArray(raw: unknown, cap: number): string[] | null {
  const s = String(raw ?? "[]");
  if (s.length > 8_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > cap) return null;
  const out: string[] = [];
  for (const v of parsed) {
    if (typeof v !== "string" || !isUuid(v)) return null;
    out.push(v);
  }
  return out;
}

export type AnswerItem = {
  question_id: string;
  selected_option_ids: string[];
  is_marked?: boolean;
  time_spent_ms?: number;
};

/** Validate + normalize a client answers array. null = invalid. */
function sanitizeAnswers(raw: unknown): AnswerItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ANSWERS) return null;
  const out: AnswerItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const it = item as Record<string, unknown>;
    const qid = String(it.question_id ?? "");
    if (!isUuid(qid)) return null;
    const selRaw = it.selected_option_ids;
    if (!Array.isArray(selRaw) || selRaw.length > 8) return null;
    const sel: string[] = [];
    for (const o of selRaw) {
      if (typeof o !== "string" || !isUuid(o)) return null;
      sel.push(o);
    }
    const a: AnswerItem = { question_id: qid, selected_option_ids: sel };
    if (typeof it.is_marked === "boolean") a.is_marked = it.is_marked;
    const ts = Number(it.time_spent_ms);
    if (Number.isFinite(ts) && ts >= 0) a.time_spent_ms = Math.min(Math.round(ts), 86_400_000);
    out.push(a);
  }
  return out;
}

// ---------------------------------------------------------------------------
// startTopicTest — instructions-gate form action (useActionState).
// Success = redirect to the player (with ?resumed=1 on a TRUE resume).
// ---------------------------------------------------------------------------
export type StartTestState = { error?: string } | null;

export async function startTopicTest(
  _prev: StartTestState,
  formData: FormData,
): Promise<StartTestState> {
  await requireChild();
  const t = await getT();

  const subjectId = String(formData.get("subject_id") ?? "");
  if (!isUuid(subjectId)) return { error: t("test.err.generic") };
  const topicIds = parseUuidArray(formData.get("topic_ids"), MAX_TOPICS);
  const subtopicIds = parseUuidArray(formData.get("subtopic_ids"), MAX_SUBTOPICS);
  if (topicIds === null || subtopicIds === null) return { error: t("test.err.generic") };

  const supabase = await createClient();

  // Owner fix (2026-07): topic selection is MANDATORY — and when any selected
  // topic has active subtopics, a subtopic selection is mandatory too. Client
  // validation is UX only; this is the real gate (trilingual message, no
  // internals leaked).
  if (topicIds.length === 0) return { error: t("test.setup.selectWarn") };
  if (subtopicIds.length === 0) {
    const { data: subsProbe, error: subsErr } = await supabase
      .from("subtopics")
      .select("id")
      .in("topic_id", topicIds)
      .eq("status", "active")
      .limit(1);
    if (subsErr) return { error: t("test.err.generic") };
    if ((subsProbe ?? []).length > 0) return { error: t("test.setup.selectWarn") };
  }

  const { data, error } = await supabase.rpc("start_topic_test_attempt", {
    p_subject_id: subjectId,
    p_topic_ids: topicIds,
    p_subtopic_ids: subtopicIds,
  });
  if (error) {
    // Never surface raw Postgres text; map the two meaningful cases.
    if (error.code === PG_NO_DATA_FOUND) return { error: t("test.err.noQuestions") };
    if (error.code === PG_CHECK_VIOLATION) return { error: t("test.err.noAccess") };
    return { error: t("test.err.generic") };
  }
  const d = data as { attempt_id?: string; resumed?: boolean } | null;
  if (!d?.attempt_id || !isUuid(String(d.attempt_id))) return { error: t("test.err.generic") };

  redirect(`/child/test/run/${d.attempt_id}${d.resumed ? "?resumed=1" : ""}`);
}

// ---------------------------------------------------------------------------
// saveTestAnswers — autosave (every 30s + on navigation/flag change).
// `deadline: true` tells the client the server clock ran out → auto-submit.
// ---------------------------------------------------------------------------
export type SaveTestResult =
  | { ok: true; remaining: number | null }
  | { ok: false; deadline: boolean; error: string };

export async function saveTestAnswers(
  attemptId: string,
  answers: AnswerItem[],
): Promise<SaveTestResult> {
  await requireChild();
  const t = await getT();

  if (!isUuid(String(attemptId ?? ""))) {
    return { ok: false, deadline: false, error: t("test.err.generic") };
  }
  const clean = sanitizeAnswers(answers);
  if (clean === null) return { ok: false, deadline: false, error: t("test.err.generic") };
  if (clean.length === 0) return { ok: true, remaining: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_test_answers", {
    p_attempt_id: attemptId,
    p_answers: clean,
  });
  if (error) {
    if (error.code === PG_CHECK_VIOLATION) {
      // Deadline passed / no longer in progress → the client must submit.
      return { ok: false, deadline: true, error: t("test.run.timeUp") };
    }
    return { ok: false, deadline: false, error: t("test.run.saveError") };
  }
  const d = data as { remaining_seconds?: number | null } | null;
  const remaining =
    typeof d?.remaining_seconds === "number" && Number.isFinite(d.remaining_seconds)
      ? Math.max(0, Math.floor(d.remaining_seconds))
      : null;
  return { ok: true, remaining };
}

// ---------------------------------------------------------------------------
// submitTest — final submission (confirm modal / timer-zero auto-submit).
// Idempotent server-side; the client redirects to the results page on ok.
// ---------------------------------------------------------------------------
export type SubmitTestResult = { ok: true } | { ok: false; error: string };

export async function submitTest(
  attemptId: string,
  answers: AnswerItem[],
): Promise<SubmitTestResult> {
  const child = await requireChild();
  const t = await getT();

  if (!isUuid(String(attemptId ?? ""))) return { ok: false, error: t("test.err.generic") };
  const clean = sanitizeAnswers(answers);
  if (clean === null) return { ok: false, error: t("test.err.generic") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_test_attempt", {
    p_attempt_id: attemptId,
    p_answers: clean,
  });
  if (error) {
    // check_violation = canceled/expired attempt → the run page notice flow
    // handles it; return generic (the client falls back to the test home).
    return { ok: false, error: t("test.err.generic") };
  }

  // Attempt graded → notify the child with their score (best-effort; the
  // idempotency key dedupes an idempotent re-submit of an already-graded
  // attempt, so this never double-notifies).
  const result = (data ?? {}) as { score?: unknown; max?: unknown };
  const score = Number(result.score);
  const max = Number(result.max);
  if (Number.isFinite(score) && Number.isFinite(max)) {
    await notifyAttemptGraded({
      studentProfileId: child.profileId,
      attemptId,
      score,
      max,
    });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// cancelTest — explicit abandon: counts for NOTHING.
// ---------------------------------------------------------------------------
export type CancelTestResult = { ok: true } | { ok: false; error: string };

export async function cancelTest(attemptId: string): Promise<CancelTestResult> {
  await requireChild();
  const t = await getT();

  if (!isUuid(String(attemptId ?? ""))) return { ok: false, error: t("test.err.generic") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_test_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) {
    // Already closed (graded/canceled/expired) is fine for the caller's UX —
    // it navigates home either way; report generic only on real failures.
    if (error.code === PG_CHECK_VIOLATION) return { ok: true };
    return { ok: false, error: t("test.err.generic") };
  }
  return { ok: true };
}
