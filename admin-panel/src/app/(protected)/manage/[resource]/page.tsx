import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { DeleteButton } from "@/components/DeleteButton";
import { getT, type T } from "@/i18n/server";
import { localizeFields, resourceTitle } from "@/i18n/resources-i18n";

function renderCell(t: T, res: Resource, row: any, col: string): string {
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
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  const res = getResource(resource);
  if (!res) notFound();

  if (res.adminOnly) await requireAdmin();
  else await requirePanelAccess();

  const t = await getT();
  const supabase = await createClient();

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

  const embeds = refFields
    .map((f) => `${f.ref!.table}(${f.ref!.labelColumn})`)
    .join(", ");
  const selectStr = embeds ? `*, ${embeds}` : "*";
  const { data: rows } = await supabase
    .from(res.table)
    .select(selectStr)
    .order(res.orderBy);
  const list: any[] = rows ?? [];

  const localizedFields = localizeFields(t, res.fields);
  const headerByName = new Map(localizedFields.map((f) => [f.name, f.label]));

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

      <section className="card">
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
                  {t("manage.noRecords")}
                </td>
              </tr>
            )}
            {list.map((row) => (
              <tr key={row.id}>
                {res.listColumns.map((c) => (
                  <td key={c}>{renderCell(t, res, row, c)}</td>
                ))}
                <td className="row-actions">
                  <Link href={`/manage/${res.slug}/${row.id}/edit`}>
                    {t("action.edit")}
                  </Link>
                  <DeleteButton
                    slug={res.slug}
                    id={row.id}
                    label={t("action.delete")}
                    confirmText={t("action.confirmDelete")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
