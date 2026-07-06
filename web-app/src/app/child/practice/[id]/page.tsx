import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import {
  PracticeRunner,
  type PracticeAttemptData,
} from "@/components/PracticeRunner";

const KEYS = [
  "practice.title", "practice.questions", "practice.submit", "practice.submitting",
  "practice.result", "practice.back", "practice.error",
  "arena.quizPrev", "arena.quizConfirm", "arena.quizQuestion", "arena.quizOf",
];

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireChild();
  const { id } = await params;
  const locale = await getLocale();
  const t = await getT();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_practice_attempt", {
    p_attempt_id: id,
    p_locale: locale,
  });
  if (error || !data) notFound();

  // L7: minimal runtime shape check on the RPC payload before treating it as
  // the typed attempt data (a malformed payload 404s instead of crashing the
  // client runner).
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    notFound();
  }
  const attempt = payload as PracticeAttemptData;

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  return (
    <div className="arena-quiz">
      <PracticeRunner attemptId={id} data={attempt} dict={dict} />
    </div>
  );
}
