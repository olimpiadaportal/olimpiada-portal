import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";

function pill(s: string): string {
  return s === "active" ? "pill-ok" : s === "archived" ? "pill-warn" : "pill-muted";
}

export default async function OlympiadListPage() {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from("olympiad_packages")
    .select("id, status, price_amount, subjects(name), olympiad_package_translations(locale, title)")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (data ?? []) as any[];
  const az = (r: any): string =>
    (r.olympiad_package_translations ?? []).find((x: any) => x.locale === "az")?.title ?? "—";

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.olympiad")}</h1>
            <p className="muted">{t("oly2.subtitle")}</p>
          </div>
          <Link className="btn" href="/olympiad/new">{t("oly2.new")}</Link>
        </div>
      </div>
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("oly2.title")}</th><th>{t("oly2.subject")}</th>
              <th>{t("oly2.price")}</th><th>{t("oly2.statusLabel")}</th><th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={5} className="muted">{t("oly2.none")}</td></tr>
            )}
            {list.map((r) => (
              <tr key={r.id}>
                <td>{az(r)}</td>
                <td>{r.subjects?.name ?? "—"}</td>
                <td>{r.price_amount} AZN</td>
                <td><span className={`pill ${pill(r.status)}`}>{t(`oly2.status.${r.status}`)}</span></td>
                <td className="row-actions"><Link href={`/olympiad/${r.id}/edit`}>{t("action.edit")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
