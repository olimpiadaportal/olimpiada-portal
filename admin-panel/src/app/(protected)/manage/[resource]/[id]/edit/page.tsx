import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { getT } from "@/i18n/server";
import { localizeFields, resourceTitle } from "@/i18n/resources-i18n";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ resource: string; id: string }>;
}) {
  const { resource, id } = await params;
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

  const { data: row } = await supabase
    .from(res.table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("manage.editTitle")}</h1>
        <p className="muted">
          <Link href={`/manage/${res.slug}`}>
            ← {t("manage.back")} · {resourceTitle(t, res.slug, true)}
          </Link>
        </p>
      </div>

      <section className="card">
        <ResourceForm
          slug={res.slug}
          fields={localizeFields(t, res.fields)}
          optionsByField={optionsByField}
          defaultValues={row as Record<string, unknown>}
          id={id}
          submitLabel={t("manage.save")}
          savingLabel={t("manage.saving")}
          selectPlaceholder={t("manage.select")}
        />
      </section>
    </div>
  );
}
