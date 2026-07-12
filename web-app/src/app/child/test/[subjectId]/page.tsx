import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { getChildSubjectAccess } from "@/lib/childSubjects";
import { TestSetup, type SetupTopic } from "@/components/TestSetup";

// Strings resolved server-side into an explicit-KEYS dict for the client
// picker (client components never touch getT).
const KEYS = [
  "test.setup.topicsTitle", "test.setup.pickHint", "test.setup.noTopics",
  "test.setup.topic", "test.setup.subtopic", "test.setup.topicPh",
  "test.setup.subtopicPh", "test.setup.noSubtopics", "test.setup.selectWarn",
  "test.setup.rulesTitle", "test.setup.qCount",
  "test.setup.duration", "test.setup.rule1", "test.setup.rule2",
  "test.setup.rule3", "test.setup.rule4", "test.setup.scoringTitle",
  "test.setup.scoring", "test.setup.consent", "test.setup.start",
  "test.setup.starting",
];

// TEST ENGINE (T1) — topic/subtopic picker + instructions gate for a subject.
export default async function TestSetupPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const child = await requireChild();
  const { subjectId } = await params;
  if (!isUuid(subjectId)) redirect("/child/test");

  // Server-side availability check: the subject must be in the child's
  // covered/free set (the start RPC re-checks; this keeps the UI honest).
  const { hasAccess, subjects } = await getChildSubjectAccess(child.profileId);
  const subject = subjects.find((s) => s.id === subjectId);
  if (!hasAccess || !subject) redirect("/child/test?err=noaccess");

  const t = await getT();
  const supabase = await createClient();

  // Child grade (topics are grade-filtered when BOTH sides have a grade).
  const { data: student } = await supabase
    .from("students")
    .select("grade_id")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const gradeId = (student as any)?.grade_id ?? null;

  // Module separation (migration 050): only EXAM-scoped topics belong in this
  // picker — olympiad-package topics must never surface here.
  const { data: topicsRaw } = await supabase
    .from("topics")
    .select("id, name, grade_id, order_index")
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .eq("scope", "exam")
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });

  // Show a topic when it has no grade, the child has no grade, or they match.
  const topics = ((topicsRaw ?? []) as any[]).filter(
    (tp) => !tp.grade_id || !gradeId || tp.grade_id === gradeId,
  );

  let subtopicsByTopic = new Map<string, { id: string; name: string }[]>();
  if (topics.length > 0) {
    const { data: subsRaw } = await supabase
      .from("subtopics")
      .select("id, topic_id, name, order_index")
      .in("topic_id", topics.map((tp) => tp.id))
      .eq("status", "active")
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });
    for (const st of (subsRaw ?? []) as any[]) {
      const list = subtopicsByTopic.get(st.topic_id) ?? [];
      list.push({ id: st.id, name: st.name });
      subtopicsByTopic.set(st.topic_id, list);
    }
  }

  const pickerTopics: SetupTopic[] = topics.map((tp) => ({
    id: tp.id,
    name: tp.name,
    subtopics: subtopicsByTopic.get(tp.id) ?? [],
  }));

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  return (
    <>
      <section style={{ marginBottom: 22 }}>
        <p className="arena-eyebrow">{t("test.setup.eyebrow")}</p>
        <h1>{subject.name}</h1>
      </section>
      <TestSetup subjectId={subjectId} topics={pickerTopics} dict={dict} />
    </>
  );
}
