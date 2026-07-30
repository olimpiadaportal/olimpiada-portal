import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { DeleteButton } from "@/components/DeleteButton";
import { getT, type T } from "@/i18n/server";
import { localizeFields, resourceTitle } from "@/i18n/resources-i18n";
import { FilterBar, type FilterBarSelect } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";

// Round 10 — generic server-side list filters for every managed resource:
// name search (.ilike) + status select (only for resources that HAVE a status
// column). Every searchParam is validated server-side (status whitelist,
// capped + LIKE-escaped search).
//
// Round 52: the topics/subtopics special-casing that used to live here (the
// subject → topic cascade, the Rüb filter, the exam-scope restriction on
// parent-topic dropdowns and the parent-topic term map) was REMOVED together
// with those two resources. The Subject › Topic › Subtopic tree is its own
// screen now (/curriculum), and this page is generic again — nothing in it
// knows about any particular resource.
const STATUS_VALUES = ["active", "inactive", "archived"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function renderCell(t: T, res: Resource, row: any, col: string): React.ReactNode {
  const f = res.fields.find((x) => x.name === col);
  if (f?.type === "reference" && f.ref) {
    return row[f.ref.table]?.[f.ref.labelColumn] ?? "—";
  }
  if (f?.type === "boolean") return row[col] ? t("boolean.yes") : t("boolean.no");
  if (f?.name === "status" && row[col]) return t(`status.${row[col]}`);
  const v = row[col];
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export default async function ManageResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { resource } = await params;
  const res = getResource(resource);
  if (!res) notFound();

  if (res.adminOnly) await requireAdmin();
  else await requirePanelAccess();

  const t = await getT();
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const hasStatusField = res.fields.some((f) => f.name === "status");
  const q = first(sp, "q").trim().slice(0, 200);
  const statusRaw = first(sp, "status");
  const status =
    hasStatusField && (STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : "";

  const refFields = res.fields.filter((f) => f.type === "reference" && f.ref);
  const optionsByField: Record<string, { value: string; label: string }[]> = {};
  for (const f of refFields) {
    const ref = f.ref!;
    const { data } = await supabase
      .from(ref.table)
      .select(`id, ${ref.labelColumn}`)
      .order(ref.orderBy ?? ref.labelColumn);
    optionsByField[f.name] = (data ?? []).map((r: any) => ({
      value: r.id,
      label: String(r[ref.labelColumn]),
    }));
  }

  // ---- Filtered list query -------------------------------------------------
  const embeds = refFields
    .map((f) => `${f.ref!.table}(${f.ref!.labelColumn})`)
    .join(", ");
  const selectStr = embeds ? `*, ${embeds}` : "*";

  let qb = supabase.from(res.table).select(selectStr);
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) qb = qb.ilike("name", `%${escaped}%`);
  if (status) qb = qb.eq("status", status);
  const { data: rows } = await qb.order(res.orderBy);
  const list: any[] = (rows as any[] | null) ?? [];

  const localizedFields = localizeFields(t, res.fields);
  const headerByName = new Map(localizedFields.map((f) => [f.name, f.label]));

  // ---- Filter bar config ---------------------------------------------------
  const selects: FilterBarSelect[] = [];
  if (hasStatusField) {
    selects.push({
      key: "status",
      value: status,
      allLabel: t("qfilter.allStatuses"),
      ariaLabel: t("field.status"),
      options: STATUS_VALUES.map((s) => ({
        value: s,
        label: t(`status.${s}`),
      })),
    });
  }
  const hasFilters = Boolean(q || status);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{resourceTitle(t, res.slug, true)}</h1>
        <p className="muted">{t("manage.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("manage.addHeading")}</h3>
        <ResourceForm
          slug={res.slug}
          fields={localizedFields}
          optionsByField={optionsByField}
          submitLabel={t("manage.add")}
          savingLabel={t("manage.saving")}
          selectPlaceholder={t("manage.select")}
        />
      </section>

      <FilterBar
        basePath={`/manage/${res.slug}`}
        search={{ value: q, placeholder: t("flt.nameSearch") }}
        selects={selects}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {res.listColumns.map((c) => (
                  <th key={c}>{headerByName.get(c) ?? c}</th>
                ))}
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={res.listColumns.length + 1} className="muted">
                    {hasFilters ? t("flt.noMatches") : t("manage.noRecords")}
                  </td>
                </tr>
              )}
              {list.map((row) => (
                <tr key={row.id}>
                  {res.listColumns.map((c) => (
                    <td key={c} className={c === "status" ? "nowrap" : undefined}>
                      {renderCell(t, res, row, c)}
                    </td>
                  ))}
                  <td className="row-actions nowrap">
                    <Link href={`/manage/${res.slug}/${row.id}/edit`}>
                      {t("action.edit")}
                    </Link>
                    <DeleteButton
                      slug={res.slug}
                      id={row.id}
                      label={t("action.delete")}
                      confirmText={t("action.confirmDelete")}
                      pendingLabel={t("pend.deleting")}
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
