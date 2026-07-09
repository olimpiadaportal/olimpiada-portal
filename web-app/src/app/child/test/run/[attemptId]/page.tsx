import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { TestRunner, type TestAttemptData } from "@/components/TestRunner";

const KEYS = [
  "test.run.title", "test.run.timeLeft", "test.run.resumed", "test.run.palette",
  "test.run.answered", "test.run.flagged", "test.run.unanswered", "test.run.current",
  "test.run.subject", "test.run.topic",
  "test.run.flag", "test.run.unflag", "test.run.next", "test.run.submit",
  "test.run.submitting", "test.run.cancel", "test.run.canceling", "test.run.saving",
  "test.run.saved", "test.run.saveError", "test.run.submitTitle", "test.run.submitMsg",
  "test.run.submitConfirm", "test.run.back", "test.run.cancelTitle", "test.run.cancelMsg",
  "test.run.cancelConfirm", "test.run.keepGoing", "test.run.timeUp",
  "test.err.generic", "arena.quizPrev", "arena.quizQuestion", "arena.quizOf",
];

// TEST ENGINE (T1) — timed player. The server page rehydrates the attempt via
// the owner-checked get_test_attempt RPC (questions WITHOUT answer keys, saved
// answers + flags, server-computed remaining seconds) and hands the typed
// payload to the client runner.
export default async function TestRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ resumed?: string }>;
}) {
  await requireChild();
  const [{ attemptId }, { resumed }] = await Promise.all([params, searchParams]);
  if (!isUuid(attemptId)) redirect("/child/test");

  const [locale, t, supabase] = await Promise.all([getLocale(), getT(), createClient()]);

  const { data, error } = await supabase.rpc("get_test_attempt", {
    p_attempt_id: attemptId,
    p_locale: locale,
  });
  if (error || !data) redirect("/child/test?err=1");

  // Minimal runtime shape check before trusting the payload (practice-page
  // pattern): malformed → back to the test home instead of a client crash.
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    redirect("/child/test?err=1");
  }
  const attempt = payload as TestAttemptData;

  // Already finished attempts never open the player.
  if (attempt.status === "graded") redirect(`/child/test/result/${attemptId}`);
  if (attempt.status !== "in_progress") redirect("/child/test?notice=closed");

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  // The RPC payload carries subject_id + questions[].topic_id but NO names, so
  // resolve them here (public-read taxonomy) for the player header. Any read
  // failure degrades to no label rather than blocking the attempt.
  let subjectName = "";
  let topicNames: string[] = [];
  const topicIds = Array.from(
    new Set(
      (attempt.questions ?? [])
        .map((q) => q.topic_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const [{ data: subjectRow }, topicsRes] = await Promise.all([
    supabase.from("subjects").select("name").eq("id", attempt.subject_id).maybeSingle(),
    topicIds.length > 0
      ? supabase.from("topics").select("id, name").in("id", topicIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  subjectName = ((subjectRow as { name?: string } | null)?.name ?? "").trim();
  // Preserve the questions' topic order; de-duplicate names.
  const nameById = new Map<string, string>(
    (((topicsRes.data ?? []) as { id: string; name: string }[]) || []).map((r) => [r.id, r.name]),
  );
  const seen = new Set<string>();
  for (const id of topicIds) {
    const nm = nameById.get(id);
    if (nm && !seen.has(nm)) {
      seen.add(nm);
      topicNames.push(nm);
    }
  }

  return (
    <div className="tst-run">
      <TestRunner
        attemptId={attemptId}
        data={attempt}
        resumed={resumed === "1"}
        dict={dict}
        subjectName={subjectName}
        topicNames={topicNames}
      />
    </div>
  );
}
