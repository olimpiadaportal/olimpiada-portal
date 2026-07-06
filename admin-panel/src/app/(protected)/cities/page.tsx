import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { CityForm } from "@/components/CityForm";
import { CityDeleteButton } from "@/components/CityDeleteButton";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "./labels";
import { FilterBar } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";

// Round 10 — server-side list filters (status select + debounced name search).
// The filtered read-only query lives here (mirrors listCities' shape); all
// mutations still go through the guarded lib/admin/cities server actions.
const CITY_STATUSES = ["active", "inactive"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function CitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const lt = localStrings(await getLocale());
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const q = first(sp, "q").trim().slice(0, 200);
  const statusRaw = first(sp, "status");
  const status = (CITY_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";

  // Filtered list (same shape as lib/admin/cities.listCities, plus filters).
  let qb = supabase
    .from("districts")
    .select("id, name, status, schools(count)");
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) {
    qb = qb.ilike("name", `%${escaped}%`);
  }
  if (status) qb = qb.eq("status", status);
  const { data: rows } = await qb.order("name");
  const cities = ((rows ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    status: r.status as string,
    school_count: r.schools?.[0]?.count ?? 0,
  }));

  const hasFilters = Boolean(q || status);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.cities")}</h1>
        <p className="muted">{lt("cities.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("cities.addHeading")}</h3>
        <CityForm
          labels={{
            name: lt("cities.cityName"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            submit: t("action.create"),
            saving: t("manage.saving"),
            errMissingName: lt("cities.errMissingName"),
            errDuplicate: lt("cities.errDuplicate"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>

      <FilterBar
        basePath="/cities"
        search={{ value: q, placeholder: t("flt.nameSearch") }}
        selects={[
          {
            key: "status",
            value: status,
            allLabel: t("qfilter.allStatuses"),
            ariaLabel: t("field.status"),
            options: CITY_STATUSES.map((s) => ({
              value: s,
              label: t(`status.${s}`),
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
                <th>{lt("cities.cityName")}</th>
                <th>{t("field.status")}</th>
                <th>{lt("cities.schoolCount")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {cities.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {hasFilters ? t("flt.noMatches") : lt("cities.noRecords")}
                  </td>
                </tr>
              )}
              {cities.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="nowrap">{t(`status.${c.status}`)}</td>
                  <td>{c.school_count}</td>
                  <td className="row-actions nowrap">
                    <Link href={`/cities/${c.id}/edit`}>{t("action.edit")}</Link>
                    <CityDeleteButton
                      id={c.id}
                      label={t("action.delete")}
                      confirmText={t("action.confirmDelete")}
                      errInUse={lt("cities.errInUse")}
                      errGeneric={lt("common.errGeneric")}
                    />
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
