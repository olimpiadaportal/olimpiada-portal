import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";

// Round 10 — server-side list filters (status select + debounced title search)
// following the questions-page pattern: searchParams validated server-side,
// title search resolved via news_translations → ids → .in().
const NEWS_STATUSES = ["in_review", "published", "rejected"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function statusPill(s: string): string {
  if (s === "published") return "pill-ok";
  if (s === "rejected") return "pill-warn";
  return "pill-muted"; // in_review
}

export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const q = first(sp, "q").trim().slice(0, 200);
  const statusRaw = first(sp, "status");
  const status = (NEWS_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";

  // ---- Title search: resolve matching news ids first ----------------------
  let searchIds: string[] | null = null;
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) {
    const { data: trs } = await supabase
      .from("news_translations")
      .select("news_id")
      .ilike("title", `%${escaped}%`)
      .limit(2000);
    searchIds = Array.from(
      new Set(((trs ?? []) as { news_id: string }[]).map((r) => r.news_id)),
    );
  }
  const emptySearch = searchIds !== null && searchIds.length === 0;

  let list: any[] = [];
  if (!emptySearch) {
    let qb = supabase
      .from("news")
      .select("id, slug, status, created_at, news_translations(locale, title)");
    if (searchIds) qb = qb.in("id", searchIds);
    if (status) qb = qb.eq("status", status);
    const { data: rows } = await qb
      .order("created_at", { ascending: false })
      .limit(100);
    list = (rows ?? []) as any[];
  }
  const azTitle = (r: any): string =>
    (r.news_translations ?? []).find((x: any) => x.locale === "az")?.title ?? "—";

  const hasFilters = Boolean(q || status);

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

      <FilterBar
        basePath="/news"
        search={{ value: q, placeholder: t("flt.titleSearch") }}
        selects={[
          {
            key: "status",
            value: status,
            allLabel: t("qfilter.allStatuses"),
            ariaLabel: t("news.statusLabel"),
            options: NEWS_STATUSES.map((s) => ({
              value: s,
              label: t(`news.status.${s}`),
            })),
          },
        ]}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        <div className="table-wrap">
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
                    {hasFilters ? t("flt.noMatches") : t("news.none")}
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{azTitle(r)}</td>
                  <td className="muted">{r.slug}</td>
                  <td className="nowrap">
                    <span className={`pill ${statusPill(r.status)}`}>
                      {t(`news.status.${r.status}`)}
                    </span>
                  </td>
                  <td className="row-actions nowrap">
                    <Link href={`/news/${r.id}/edit`}>{t("action.edit")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
