import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { TestRunner, type TestAttemptData } from "@/components/TestRunner";
import { ChildNavActive } from "@/components/ChildNav";

const KEYS = [
  "test.run.title", "test.run.timeLeft", "test.run.resumed", "test.run.palette",
  "test.run.answered", "test.run.flagged", "test.run.unanswered", "test.run.current",
  "test.run.subject", "test.run.topic",
  "test.run.flag", "test.run.unflag", "test.run.next", "test.run.submit",
  "test.run.submitting", "test.run.cancel", "test.run.canceling", "test.run.saving",
  "test.run.saved", "test.run.saveError", "test.run.submitTitle", "test.run.submitMsg",
  "test.run.submitConfirm", "test.run.back", "test.run.cancelTitle", "test.run.cancelMsg",
  "test.run.cancelConfirm", "test.run.keepGoing", "test.run.timeUp",
  "test.run.leaveTitle", "test.run.leaveMsg", "test.run.leaveStay", "test.run.leaveConfirm",
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

  // Since migration 047 purchased-olympiad attempts run on this SAME player
  // (kind:'olympiad'); their list/notice home is /child/olympiads, not the
  // test home.
  const isOlympiad = attempt.kind === "olympiad";
  const homeHref = isOlympiad ? "/child/olympiads" : "/child/test";

  // Already finished attempts never open the player.
  if (attempt.status === "graded") redirect(`/child/test/result/${attemptId}`);
  if (attempt.status !== "in_progress") redirect(`${homeHref}?notice=closed`);

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);
  // Olympiad attempts title the top bar "Olympiad" instead of "Test".
  if (isOlympiad) dict["test.run.title"] = t("test.run.olympiad");

  // The RPC payload carries subject_id + questions[].topic_id but NO names, so
  // resolve them here (public-read taxonomy) for the player header. Any read
  // failure degrades to no label rather than blocking the attempt. Olympiad
  // attempts skip the topic line (their header shows the package label instead).
  let subjectName = "";
  let topicNames: string[] = [];
  const topicIds = isOlympiad
    ? []
    : Array.from(
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

  // Olympiad header label: the attempt row carries no package id, but every
  // question in the draw is PRIVATE to exactly one package, so two indexed
  // lookups resolve the (active-package, RLS-readable) title cheaply. Any miss
  // (archived package, RLS) degrades to the generic trilingual label.
  let modeLabel = "";
  if (isOlympiad) {
    modeLabel = t("test.run.olympiad");
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
        if (title) modeLabel = `${t("test.run.olympiad")}: ${title}`;
      }
    }
  }

  return (
    <div className="tst-run">
      {/* Kind-aware nav highlight: olympiad attempts light up Olimpiadalar,
          not the shared /child/test route's Exams tab. */}
      <ChildNavActive href={homeHref} />
      <TestRunner
        attemptId={attemptId}
        data={attempt}
        resumed={resumed === "1"}
        dict={dict}
        subjectName={subjectName}
        topicNames={topicNames}
        modeLabel={modeLabel}
        exitHref={homeHref}
      />
    </div>
  );
}
