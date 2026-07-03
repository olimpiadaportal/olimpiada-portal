import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { listCityOptions } from "@/lib/admin/schools";
import { SchoolForm } from "@/components/SchoolForm";
import { SchoolDeleteButton } from "@/components/SchoolDeleteButton";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "../cities/labels";
import { FilterBar } from "@/components/FilterBar";

// Round 10 — server-side list filters (city select on district_id, status
// select, debounced name search). The filtered read-only query lives here
// (mirrors listSchools' shape); mutations still use the guarded lib actions.
const SCHOOL_STATUSES = ["active", "inactive"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function SchoolsPage({
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
  const cityRaw = first(sp, "city").trim();
  const city = UUID_RE.test(cityRaw) ? cityRaw : "";
  const statusRaw = first(sp, "status");
  const status = (SCHOOL_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";

  // Filtered list (same shape as lib/admin/schools.listSchools, plus filters).
  const loadSchools = async () => {
    let qb = supabase
      .from("schools")
      .select("id, name, district_id, status, districts(name)");
    if (q) {
      const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
      qb = qb.ilike("name", `%${escaped}%`);
    }
    if (city) qb = qb.eq("district_id", city);
    if (status) qb = qb.eq("status", status);
    const { data } = await qb.order("name");
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      status: r.status as string,
      city_name: (r.districts?.name as string) ?? "—",
    }));
  };

  const [schools, cityOptions, { data: allCities }] = await Promise.all([
    loadSchools(),
    listCityOptions(), // form dropdown: active cities only (existing rule)
    // Filter dropdown: ALL cities, so schools of inactive cities stay findable.
    supabase.from("districts").select("id, name").order("name"),
  ]);

  const hasFilters = Boolean(q || city || status);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.schools")}</h1>
        <p className="muted">{lt("schools.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("schools.addHeading")}</h3>
        <SchoolForm
          cityOptions={cityOptions}
          labels={{
            name: lt("schools.schoolName"),
            city: lt("schools.city"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            selectPlaceholder: t("manage.select"),
            submit: t("action.create"),
            saving: t("manage.saving"),
            errMissingName: lt("schools.errMissingName"),
            errMissingCity: lt("schools.errMissingCity"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>

      <FilterBar
        basePath="/schools"
        search={{ value: q, placeholder: t("flt.nameSearch") }}
        selects={[
          {
            key: "city",
            value: city,
            allLabel: t("flt.allCities"),
            ariaLabel: lt("schools.city"),
            options: ((allCities ?? []) as any[]).map((c) => ({
              value: c.id,
              label: String(c.name),
            })),
          },
          {
            key: "status",
            value: status,
            allLabel: t("qfilter.allStatuses"),
            ariaLabel: t("field.status"),
            options: SCHOOL_STATUSES.map((s) => ({
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
                <th>{lt("schools.schoolName")}</th>
                <th>{lt("schools.city")}</th>
                <th>{t("field.status")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {hasFilters ? t("flt.noMatches") : lt("schools.noRecords")}
                  </td>
                </tr>
              )}
              {schools.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city_name}</td>
                  <td className="nowrap">{t(`status.${s.status}`)}</td>
                  <td className="row-actions nowrap">
                    <Link href={`/schools/${s.id}/edit`}>{t("action.edit")}</Link>
                    <SchoolDeleteButton
                      id={s.id}
                      label={t("action.delete")}
                      confirmText={t("action.confirmDelete")}
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
