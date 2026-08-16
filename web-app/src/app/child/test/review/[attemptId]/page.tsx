import Link from "next/link";
import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { fallbackExplanationIds } from "@/lib/explanationFallback";
import {
  TestReviewList,
  type ReviewListQuestion,
} from "@/components/TestReviewList";
import { ChildNavActive } from "@/components/ChildNav";

type ReviewOption = {
  option_id: string;
  text: string | null;
  /** Round 53: optional per-option figure ref, same shape as the question's. */
  image?: { bucket: string; path: string } | null;
  is_correct: boolean;
};
type ReviewQuestion = {
  question_id: string;
  body: string | null;
  prompt: string | null;
  /** Optional locale-aware figure ref (migration 057). */
  image?: { bucket: string; path: string } | null;
  is_correct: boolean | null;
  selected_option_ids: string[];
  explanation: string | null;
  options: ReviewOption[];
};
type ReviewPayload = {
  attempt_id: string;
  score: number | null;
  max: number | null;
  questions: ReviewQuestion[];
};

// TEST ENGINE (T2) — post-grading answer review. get_test_review is the ONLY
// RPC that reveals answer keys, and only for the owner's GRADED attempt (it
// raises otherwise → we bounce to the test home). The server shapes each
// question (computed state + per-option selected/correct flags) and hands the
// list to <TestReviewList/> which adds client-side All/Correct/Wrong/Skipped
// filter tabs. The score header + bottom links stay in this server page.
export default async function TestReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const child = await requireChild();
  const { attemptId } = await params;
  if (!isUuid(attemptId)) redirect("/child/test");

  const [locale, t, supabase] = await Promise.all([getLocale(), getT(), createClient()]);

  // The review RPC payload has no `kind`, so read it from the own attempt row
  // (RLS-scoped) — olympiad reviews exit to /child/olympiads (migration 047:
  // both timed kinds share this page).
  const [{ data, error }, { data: att }] = await Promise.all([
    supabase.rpc("get_test_review", {
      p_attempt_id: attemptId,
      p_locale: locale,
    }),
    supabase
      .from("test_attempts")
      .select("kind")
      .eq("id", attemptId)
      .eq("student_profile_id", child.profileId)
      .maybeSingle(),
  ]);
  const isOlympiad = (att as { kind?: string } | null)?.kind === "olympiad";
  const homeHref = isOlympiad ? "/child/olympiads" : "/child/test";
  if (error || !data) redirect(homeHref);
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    redirect(homeHref);
  }
  const review = payload as ReviewPayload;

  const score = Math.round(Number(review.score ?? 0));
  const max = Math.round(Number(review.max ?? 0));

  // ---- Honest explanation fallback ---------------------------------------
  // The RPC hands back one `explanation` string with no hint of which locale it
  // came from. Ask question_explanations which of these questions actually has
  // one in the reader's language; everything else is showing Azerbaijani and
  // gets labelled. Only questions that HAVE an explanation are asked about, and
  // az is fetched alongside so an RLS-hidden question stays unlabelled rather
  // than being wrongly declared untranslated (see fallbackExplanationIds).
  //
  // Caveat, deliberate: a LEGACY daily-round attempt (daily_round_id set) reads
  // its explanation from the round's frozen content_snapshot, so this live
  // lookup is a proxy there. It errs the safe way — an explanation translated
  // after the snapshot was taken goes unlabelled, which is today's behaviour.
  const explainedIds = review.questions
    .filter((q) => (q.explanation ?? "").trim() !== "")
    .map((q) => q.question_id);
  let fallbackIds = new Set<string>();
  if (locale !== "az" && explainedIds.length > 0) {
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
    fallbackIds = fallbackExplanationIds(rows, locale, explainedIds);
  }

  // One resolver for every {bucket, path} in the payload — the question's
  // figure and, since Round 53, each option's. getPublicUrl is a pure URL
  // builder (no request), so calling it per option costs nothing.
  const publicUrl = (ref?: { bucket?: string; path?: string } | null) =>
    ref?.bucket && ref?.path
      ? supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl
      : null;

  // Shape each question once (server-side) into the client list's contract:
  // computed state + per-option selected/correct flags (no answer-key RPC or
  // Set crosses the server→client boundary).
  const shaped: ReviewListQuestion[] = review.questions.map((q) => {
    const selected = new Set(q.selected_option_ids ?? []);
    const skipped = selected.size === 0;
    const state = skipped ? "skipped" : q.is_correct ? "correct" : "wrong";
    return {
      question_id: q.question_id,
      body: q.body,
      prompt: q.prompt,
      // Question figure → public URL (getPublicUrl is a pure URL builder).
      image_url: publicUrl(q.image),
      state,
      explanation: q.explanation,
      explanationIsFallback: fallbackIds.has(q.question_id),
      options: q.options.map((o) => ({
        option_id: o.option_id,
        text: o.text,
        image_url: publicUrl(o.image),
        is_correct: o.is_correct,
        is_selected: selected.has(o.option_id),
      })),
    };
  });

  const reviewDict: Record<string, string> = {};
  for (const k of [
    "test.review.correct", "test.review.wrong", "test.review.skipped",
    "test.review.your", "test.review.correctAnswer", "test.review.explanation",
    "test.review.filterAll", "test.review.filterCorrect",
    "test.review.filterWrong", "test.review.filterSkipped",
    "test.review.explAzOnly", "test.review.explAzNote",
    "test.img.alt", "test.img.hint", "test.img.close",
    // Report a problem — the dialog lives inside each review card.
    "test.report.action", "test.report.title", "test.report.intro",
    "test.report.label", "test.report.placeholder", "test.report.remaining",
    "test.report.cancel", "test.report.submit", "test.report.sending",
    "test.report.emptyErr", "test.report.successTitle", "test.report.successBody",
    "test.report.done", "test.report.err.generic", "test.report.err.duplicate",
    "test.report.err.tooMany",
  ]) {
    reviewDict[k] = t(k);
  }

  return (
    <>
      {/* Kind-aware nav highlight (shared route — see ChildNav). */}
      <ChildNavActive href={homeHref} />
      <section style={{ marginBottom: 22 }}>
        <p className="arena-eyebrow">{t("test.result.eyebrow")}</p>
        <h1>{t("test.review.title")}</h1>
        <p className="arena-muted" style={{ margin: "8px 0 0" }}>
          <span className="mono">
            {score}/{max}
          </span>
        </p>
      </section>

      <TestReviewList questions={shaped} dict={reviewDict} attemptId={attemptId} />

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="arena-btn" href={`/child/test/result/${attemptId}`}>
          {t("test.review.backToResult")}
        </Link>
        <Link className="arena-btn-ghost" href={homeHref}>
          {isOlympiad ? t("test.result.backToOlympiads") : t("test.result.newTest")}
        </Link>
      </div>
    </>
  );
}
