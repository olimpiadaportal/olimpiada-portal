import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { olympiadLocalStrings } from "@/lib/admin/olympiad-strings";
import {
  olympiadLifecycleState,
  lifecyclePillClass,
} from "@/lib/admin/olympiad-lifecycle";

// Round 10 — server-side list filters (status + subject selects, debounced
// title search over olympiad_package_translations) + F4 aligned-table fix
// (.table-wrap/.nowrap so price/status/action cells stay on one line).
const PACKAGE_STATUSES = ["active", "inactive", "archived"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function OlympiadListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const lt = olympiadLocalStrings(await getLocale());
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const q = first(sp, "q").trim().slice(0, 200);
  const subjectRaw = first(sp, "subject").trim();
  const subject = UUID_RE.test(subjectRaw) ? subjectRaw : "";
  const statusRaw = first(sp, "status");
  const status = (PACKAGE_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";

  // ---- Title search: resolve matching package ids first -------------------
  let searchIds: string[] | null = null;
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) {
    const { data: trs } = await supabase
      .from("olympiad_package_translations")
      .select("olympiad_package_id")
      .ilike("title", `%${escaped}%`)
      .limit(2000);
    searchIds = Array.from(
      new Set(
        ((trs ?? []) as { olympiad_package_id: string }[]).map(
          (r) => r.olympiad_package_id,
        ),
      ),
    );
  }
  const emptySearch = searchIds !== null && searchIds.length === 0;

  const loadRows = async (): Promise<any[]> => {
    if (emptySearch) return [];
    let qb = supabase
      .from("olympiad_packages")
      .select(
        "id, status, price_amount, sale_starts_at, sale_ends_at, subjects(name), olympiad_package_translations(locale, title)",
      );
    if (searchIds) qb = qb.in("id", searchIds);
    if (subject) qb = qb.eq("subject_id", subject);
    if (status) qb = qb.eq("status", status);
    const { data } = await qb
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as any[];
  };

  const [list, { data: subjects }] = await Promise.all([
    loadRows(),
    supabase.from("subjects").select("id, name").order("name"),
  ]);

  const az = (r: any): string =>
    (r.olympiad_package_translations ?? []).find((x: any) => x.locale === "az")?.title ?? "—";

  const hasFilters = Boolean(q || subject || status);

  // Derived lifecycle chip (Archived / Scheduled / Active / Expired), computed
  // ONCE against server time — the client clock is never trusted. Note: the
  // list intentionally shows ALL packages (admins read everything via RLS);
  // no status/date filter is applied unless the admin picks one above.
  const now = Date.now();

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

      <FilterBar
        basePath="/olympiad"
        search={{ value: q, placeholder: t("flt.titleSearch") }}
        selects={[
          {
            key: "subject",
            value: subject,
            allLabel: t("qfilter.allSubjects"),
            ariaLabel: t("oly2.subject"),
            options: ((subjects ?? []) as any[]).map((s) => ({
              value: s.id,
              label: String(s.name),
            })),
          },
          {
            key: "status",
            value: status,
            allLabel: t("qfilter.allStatuses"),
            ariaLabel: t("oly2.statusLabel"),
            options: PACKAGE_STATUSES.map((s) => ({
              value: s,
              label: t(`oly2.status.${s}`),
            })),
          },
        ]}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        {/* F4: horizontal scroll on narrow screens + one-line cells keep the
            rows level instead of crooked wrapped cells. */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("oly2.title")}</th><th>{t("oly2.subject")}</th>
                <th>{t("oly2.price")}</th><th>{t("oly2.statusLabel")}</th><th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {hasFilters ? t("flt.noMatches") : t("oly2.none")}
                  </td>
                </tr>
              )}
              {list.map((r) => {
                const state = olympiadLifecycleState(
                  {
                    status: String(r.status),
                    sale_starts_at: r.sale_starts_at ?? null,
                    sale_ends_at: r.sale_ends_at ?? null,
                  },
                  now,
                );
                return (
                  <tr key={r.id}>
                    <td>{az(r)}</td>
                    <td>{r.subjects?.name ?? "—"}</td>
                    <td className="nowrap">{r.price_amount} AZN</td>
                    <td className="nowrap">
                      <span className={`pill ${lifecyclePillClass(state)}`}>
                        {lt(`oly2.state.${state}`)}
                      </span>
                    </td>
                    <td className="row-actions nowrap"><Link href={`/olympiad/${r.id}/edit`}>{t("action.edit")}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
