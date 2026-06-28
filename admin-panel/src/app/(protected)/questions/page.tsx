import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { localeNames, locales, type Locale } from "@/i18n/config";
import {
  QuestionsTable,
  type QuestionRow,
  type Taxonomy,
} from "@/components/QuestionsTable";

export default async function QuestionsPage() {
  // Admin or Content Manager (content.create) may access the questions area.
  const ctx = await requirePermission("content.create");
  const t = await getT();
  const supabase = await createClient();

  const [{ data: rows }, { data: subjects }, { data: topics }, { data: subtopics }] =
    await Promise.all([
      supabase
        .from("questions")
        .select(
          "id, status, primary_locale, created_at, subjects(name), grades(name), question_types(code, name), question_translations(locale, body)",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("topics").select("id, subject_id, name").order("name"),
      supabase.from("subtopics").select("id, topic_id, name").order("name"),
    ]);
  const list = (rows ?? []) as any[];

  const langName = (loc: string): string =>
    (locales as readonly string[]).includes(loc)
      ? localeNames[loc as Locale]
      : loc;

  const typeLabel = (r: any): string => {
    const code = r.question_types?.code;
    if (!code) return "—";
    const key = `qtype.${code}`;
    const tr = t(key);
    return tr === key ? (r.question_types?.name ?? "—") : tr;
  };

  const bodySnippet = (r: any): string => {
    const tr = (r.question_translations ?? []).find(
      (x: any) => x.locale === r.primary_locale,
    );
    const b: string = tr?.body ?? "";
    if (!b) return "—";
    return b.length > 60 ? b.slice(0, 60) + "…" : b;
  };

  const display: QuestionRow[] = list.map((r) => ({
    id: r.id,
    subject: r.subjects?.name ?? "—",
    grade: r.grades?.name ?? "—",
    lang: langName(r.primary_locale),
    type: typeLabel(r),
    body: bodySnippet(r),
    status: r.status,
  }));

  const taxonomy: Taxonomy = {
    subjects: (subjects ?? []) as Taxonomy["subjects"],
    topics: (topics ?? []) as Taxonomy["topics"],
    subtopics: (subtopics ?? []) as Taxonomy["subtopics"],
  };

  // Strings the client table needs (passed as a dict, like QuestionForm).
  const keys = [
    "qbulk.selected", "qbulk.chooseAction", "qbulk.apply", "qbulk.confirmAction",
    "qbulk.confirmDelete", "qbulk.selectAll", "qbulk.assignTopic", "qbulk.assign",
    "qbulk.confirmAssign", "qbulk.optional",
    "action.delete", "action.edit",
    "qfield.subject", "qfield.grade", "qfield.language", "qfield.type",
    "qfield.topic", "qfield.subtopic", "qfield.bodyAz", "qfield.status",
    "questions.none",
    "qact.submit", "qact.approve", "qact.reject", "qact.publish",
    "qact.unpublish", "qact.archive",
    "qstatus.draft", "qstatus.in_review", "qstatus.approved",
    "qstatus.published", "qstatus.archived", "qstatus.rejected",
  ];
  const dict: Record<string, string> = {};
  for (const k of keys) dict[k] = t(k);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.questions")}</h1>
            <p className="muted">{t("questions.subtitle")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn-ghost" href="/questions/import">
              {t("bulk.title")}
            </Link>
            <Link className="btn" href="/questions/new">
              {t("questions.new")}
            </Link>
          </div>
        </div>
      </div>

      <QuestionsTable
        rows={display}
        taxonomy={taxonomy}
        dict={dict}
        isAdmin={ctx.isAdmin}
        perms={ctx.permissions}
      />
    </div>
  );
}
