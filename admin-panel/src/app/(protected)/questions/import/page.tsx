import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { BulkImportClient } from "@/components/BulkImportClient";

export default async function QuestionImportPage() {
  await requirePermission("content.create");
  const t = await getT();
  const supabase = await createClient();

  const [
    { data: imports },
    { data: subjects },
    { data: types },
    { data: olympiadTypes },
  ] = await Promise.all([
    // RLS: content managers see their own imports; admins see all.
    supabase
      .from("question_imports")
      .select("id, filename, total, successful, failed, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("subjects").select("name").order("name"),
    supabase.from("question_types").select("name").order("name"),
    supabase.from("olympiad_types").select("name").order("name"),
  ]);
  const history = (imports ?? []) as any[];
  const codes = (rows: any[] | null): string =>
    (rows ?? []).map((r) => r.name).join(", ") || "—";

  const keys = [
    "bulk.title", "bulk.subtitle", "bulk.fileLabel", "bulk.fileHint",
    "bulk.template", "bulk.submit", "bulk.submitting", "bulk.pickFile",
    "bulk.invalidJson", "bulk.notArray", "bulk.tooLarge", "bulk.resultTitle",
    "bulk.total", "bulk.successful", "bulk.failed", "bulk.noErrors", "bulk.row",
  ];
  const dict: Record<string, string> = {};
  for (const k of keys) dict[k] = t(k);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("bulk.title")}</h1>
            <p className="muted">{t("bulk.subtitle")}</p>
          </div>
          <Link className="btn-ghost" href="/questions">
            {t("manage.back")}
          </Link>
        </div>
      </div>

      <BulkImportClient dict={dict} />

      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("bulk.codesRef")}</h3>
        <p className="hint">{t("bulk.codesNote")}</p>
        <ul className="muted" style={{ lineHeight: 1.8 }}>
          <li>
            <b>subject</b> ({t("nav.subjects")}): {codes(subjects)}
          </li>
          <li>
            <b>type</b> ({t("nav.questionTypes")}): {codes(types)}
          </li>
          <li>
            <b>olympiad_type</b> ({t("nav.olympiadTypes")}): {codes(olympiadTypes)}
          </li>
          <li>
            <b>topic</b> / <b>subtopic</b>: {t("bulk.codesByName")}
          </li>
        </ul>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("bulk.history")}</h3>
        {history.length === 0 ? (
          <p className="muted">{t("bulk.historyNone")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("bulk.colWhen")}</th>
                <th>{t("bulk.colFile")}</th>
                <th>{t("bulk.total")}</th>
                <th>{t("bulk.successful")}</th>
                <th>{t("bulk.failed")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((im) => (
                <tr key={im.id}>
                  <td>{new Date(im.created_at).toLocaleString()}</td>
                  <td>{im.filename ?? "—"}</td>
                  <td>{im.total}</td>
                  <td>{im.successful}</td>
                  <td>{im.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
