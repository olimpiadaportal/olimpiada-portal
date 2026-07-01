import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";

function statusPill(s: string): string {
  if (s === "published") return "pill-ok";
  if (s === "archived") return "pill-warn";
  return "pill-muted";
}

export default async function NewsListPage() {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("news")
    .select("id, slug, status, created_at, news_translations(locale, title)")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (rows ?? []) as any[];
  const azTitle = (r: any): string =>
    (r.news_translations ?? []).find((x: any) => x.locale === "az")?.title ?? "—";

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.news")}</h1>
            <p className="muted">{t("news.subtitle")}</p>
          </div>
          <Link className="btn" href="/news/new">
            {t("news.new")}
          </Link>
        </div>
      </div>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("news.field.title")}</th>
              <th>{t("news.field.slug")}</th>
              <th>{t("news.statusLabel")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  {t("news.none")}
                </td>
              </tr>
            )}
            {list.map((r) => (
              <tr key={r.id}>
                <td>{azTitle(r)}</td>
                <td className="muted">{r.slug}</td>
                <td>
                  <span className={`pill ${statusPill(r.status)}`}>
                    {t(`news.status.${r.status}`)}
                  </span>
                </td>
                <td className="row-actions">
                  <Link href={`/news/${r.id}/edit`}>{t("action.edit")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
