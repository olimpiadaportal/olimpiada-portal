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

  return {
    subject_id: await named("subjects"),
    grade_id: await named("grades", "level"),
    topic_id: await named("topics"),
    subtopic_id: await named("subtopics"),
    type_id: await coded("question_types", "qtype", "code"),
    difficulty_id: await coded("difficulty_levels", "diff", "weight"),
    olympiad_type_id: await coded("olympiad_types", "olympiad", "code"),
    source_id: await named("sources"),
  };
}
