import { createClient } from "@/lib/supabase/server";
import type { T } from "@/i18n/server";

// Loads select options for the question editor. Returns a map keyed by the
// question column name (e.g. subject_id) → [{ value, label }].
// Config catalogs (question types, difficulty, olympiad types) are translated by
// their `code` so they read correctly in the AZ/EN/RU interface; user-entered
// taxonomy (subjects/grades/topics/subtopics) uses its stored name.
export async function loadQuestionOptions(
  t: T,
): Promise<Record<string, { value: string; label: string }[]>> {
  const supabase = await createClient();

  async function named(table: string, orderCol?: string) {
    const { data } = await supabase
      .from(table)
      .select("id, name")
      .order(orderCol ?? "name");
    return (data ?? []).map((r: any) => ({
      value: r.id as string,
      label: String(r.name),
    }));
  }

  async function coded(table: string, prefix: string, orderCol: string) {
    const { data } = await supabase
      .from(table)
      .select("id, code, name")
      .order(orderCol);
    return (data ?? []).map((r: any) => {
      const key = `${prefix}.${r.code}`;
      const translated = t(key);
      return {
        value: r.id as string,
        label: translated === key ? String(r.name) : translated,
      };
    });
  }

  // Module separation: the exam question editor only offers EXAM-scoped
  // topics. Olympiad-package bulk imports create scope='olympiad' topics that
  // must never appear on the Exams surfaces. Subtopics carry no scope column —
  // they inherit it via their parent topic, so they are filtered by the
  // exam-scoped topic id set.
  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, name")
    .eq("scope", "exam")
    .order("name");
  const examTopics = ((topicRows ?? []) as any[]).map((r) => ({
    value: r.id as string,
    label: String(r.name),
  }));
  const examTopicIds = new Set(examTopics.map((o) => o.value));
  const { data: subtopicRows } = await supabase
    .from("subtopics")
    .select("id, topic_id, name")
    .order("name");
  const examSubtopics = ((subtopicRows ?? []) as any[])
    .filter((r) => examTopicIds.has(r.topic_id as string))
    .map((r) => ({ value: r.id as string, label: String(r.name) }));

  return {
    subject_id: await named("subjects"),
    grade_id: await named("grades", "level"),
    topic_id: examTopics,
    subtopic_id: examSubtopics,
    type_id: await coded("question_types", "qtype", "code"),
    difficulty_id: await coded("difficulty_levels", "diff", "weight"),
    olympiad_type_id: await coded("olympiad_types", "olympiad", "code"),
  };
}

// Per-type structure rules for the question editor. Maps each question type id
// → its stable `code` (single_choice, multiple_choice, true_false, …) plus the
// per-type structure config columns (status / options_required /
// correct_required). Used to drive type-aware option editing on the client and
// the authoritative validation in saveQuestion. Codes are stable identifiers,
// so validation never depends on translated labels.
export type QuestionTypeRule = {
  code: string;
  status: string; // 'active' = selectable for NEW questions
  options_required: number | null; // exact option count (null = flexible 2..10)
  correct_required: number | null; // exact correct count (null = at least 1)
};

export async function loadQuestionTypeRules(): Promise<
  Record<string, QuestionTypeRule>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("question_types")
    .select("id, code, status, options_required, correct_required");
  const map: Record<string, QuestionTypeRule> = {};
  for (const r of (data ?? []) as ({ id: string } & QuestionTypeRule)[]) {
    map[r.id] = {
      code: r.code,
      status: r.status,
      options_required: r.options_required,
      correct_required: r.correct_required,
    };
  }
  return map;
}
