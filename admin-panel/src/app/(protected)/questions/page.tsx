import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { localeNames, locales, type Locale } from "@/i18n/config";

function statusPill(s: string): string {
  if (s === "published") return "pill-ok";
  if (s === "archived" || s === "rejected") return "pill-warn";
  return "pill-muted";
}

function langName(loc: string): string {
  return (locales as readonly string[]).includes(loc)
    ? localeNames[loc as Locale]
    : loc;
}

export default async function QuestionsPage() {
  // Admin or Content Manager (content.create) may access the questions area.
  await requirePermission("content.create");
  const t = await getT();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("questions")
    .select(
      "id, status, primary_locale, created_at, subjects(name), grades(name), question_types(code, name), question_translations(locale, body)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (rows ?? []) as any[];

  function bodySnippet(r: any): string {
    const tr = (r.question_translations ?? []).find(
      (x: any) => x.locale === r.primary_locale,
    );
    const b: string = tr?.body ?? "";
    if (!b) return "—";
    return b.length > 60 ? b.slice(0, 60) + "…" : b;
  }

  function typeLabel(r: any): string {
    const code = r.question_types?.code;
    if (!code) return "—";
    const key = `qtype.${code}`;
    const translated = t(key);
    return translated === key ? (r.question_types?.name ?? "—") : translated;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.questions")}</h1>
            <p className="muted">{t("questions.subtitle")}</p>
          </div>
          <Link className="btn" href="/questions/new">
            {t("questions.new")}
          </Link>
        </div>
      </div>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("qfield.subject")}</th>
              <th>{t("qfield.grade")}</th>
              <th>{t("qfield.language")}</th>
              <th>{t("qfield.type")}</th>
              <th>{t("qfield.bodyAz")}</th>
              <th>{t("qfield.status")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  {t("questions.none")}
                </td>
              </tr>
            )}
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.subjects?.name ?? "—"}</td>
                <td>{r.grades?.name ?? "—"}</td>
                <td>{langName(r.primary_locale)}</td>
                <td>{typeLabel(r)}</td>
                <td>{bodySnippet(r)}</td>
                <td>
                  <span className={`pill ${statusPill(r.status)}`}>
                    {t(`qstatus.${r.status}`)}
                  </span>
                </td>
                <td className="row-actions">
                  <Link href={`/questions/${r.id}/edit`}>{t("action.edit")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
