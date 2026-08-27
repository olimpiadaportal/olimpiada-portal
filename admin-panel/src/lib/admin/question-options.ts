import { createClient } from "@/lib/supabase/server";

// Loads select options for the question editor. Returns a map keyed by the
// question column name (subject_id / grade_id) → [{ value, label }]. Since the
// Round-21 form overhaul the editor no longer offers a question-type or an
// olympiad-type select (the type is resolved server-side to single_choice), and
// topic/subtopic come from loadQuestionTaxonomy below (the form needs their
// subject/grade/term metadata for cascading + the read-only Rüb display).
export async function loadQuestionOptions(): Promise<
  Record<string, { value: string; label: string }[]>
> {
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

  // Promise.all, not two awaits in an object literal. Object properties are
  // evaluated in order, so `subject_id: await ...` fully completed before the
  // grades request was even issued — two serial round trips on every render of
  // the questions list, for two independent lookups.
  const [subject_id, grade_id] = await Promise.all([
    named("subjects"),
    named("grades", "level"),
  ]);
  return { subject_id, grade_id };
}

// EXAM-scoped taxonomy with the metadata the question editor needs: topics
// carry subject/grade/term so the client can cascade subject+grade → topic →
// subtopic and show the topic's Rüb (or ask for one when it is NULL/legacy).
// Module separation: olympiad-package bulk imports create scope='olympiad'
// topics that must never appear on the Exams surfaces; subtopics have no scope
// column — they inherit it via their parent topic.
export type TaxonomyTopic = {
  id: string;
  subject_id: string;
  grade_id: string | null;
  name: string;
  term: number | null;
};
export type TaxonomySubtopic = { id: string; topic_id: string; name: string };
export type QuestionTaxonomy = {
  topics: TaxonomyTopic[];
  subtopics: TaxonomySubtopic[];
};

// PostgREST caps a single response at the project's `max-rows` (1000 by
// default). The 2026 curriculum is 260 topics but 1077 SUBTOPICS, so a bare
// select() would silently drop ~77 of them — and a subtopic missing from this
// list is invisible in the editor's cascade and reads as "Subtopic not found"
// in the bulk-import pre-check. Everything that can exceed 1000 rows is
// therefore fetched in pages until a short page arrives.
const FETCH_PAGE = 1000;

export async function loadQuestionTaxonomy(): Promise<QuestionTaxonomy> {
  const supabase = await createClient();
  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, subject_id, grade_id, name, term")
    .eq("scope", "exam")
    .order("name");
  const topics: TaxonomyTopic[] = ((topicRows ?? []) as any[]).map((r) => ({
    id: String(r.id),
    subject_id: String(r.subject_id),
    grade_id: r.grade_id ? String(r.grade_id) : null,
    name: String(r.name),
    term: r.term == null ? null : Number(r.term),
  }));
  const topicIds = new Set(topics.map((t) => t.id));

  const subtopics: TaxonomySubtopic[] = [];
  for (let offset = 0; ; offset += FETCH_PAGE) {
    const { data, error } = await supabase
      .from("subtopics")
      .select("id, topic_id, name")
      .order("name")
      .order("id") // stable tiebreaker: duplicate names must not reorder pages
      .range(offset, offset + FETCH_PAGE - 1);
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      if (!topicIds.has(String(r.topic_id))) continue; // olympiad-scoped parent
      subtopics.push({
        id: String(r.id),
        topic_id: String(r.topic_id),
        name: String(r.name),
      });
    }
    if (error || rows.length < FETCH_PAGE) break;
  }
  return { topics, subtopics };
}
