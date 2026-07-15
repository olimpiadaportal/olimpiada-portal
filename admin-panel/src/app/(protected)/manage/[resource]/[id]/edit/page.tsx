import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { getLocale, getT } from "@/i18n/server";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
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

  // Local trilingual strings (Rüb labels) fill the keys messages.ts does not
  // know yet; messages.ts wins once the keys land there.
  const t = withLocalStrings(await getT(), await getLocale());
  const supabase = await createClient();

  const refFields = res.fields.filter((f) => f.type === "reference" && f.ref);
  const optionsByField: Record<string, { value: string; label: string }[]> = {};
  for (const f of refFields) {
    const ref = f.ref!;
    let refQb = supabase.from(ref.table).select(`id, ${ref.labelColumn}`);
    // Module separation: parent-topic dropdowns on the Exams taxonomy pages
    // only ever offer EXAM-scoped topics (olympiad topics are package-internal).
    if (ref.table === "topics") refQb = refQb.eq("scope", "exam");
    const { data } = await refQb.order(ref.orderBy ?? ref.labelColumn);
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

  // Module separation: olympiad-scoped topics (and their subtopics) are
  // created/owned by olympiad-package bulk imports and are never editable
  // from the Exams taxonomy pages — a direct URL gets a 404. Subtopics have
  // no scope column; they inherit it via their parent topic.
  if (res.slug === "topics" && (row as any).scope !== "exam") notFound();
  if (res.slug === "subtopics") {
    const { data: parentTopic } = await supabase
      .from("topics")
      .select("scope")
      .eq("id", (row as any).topic_id)
      .maybeSingle();
    if (parentTopic?.scope !== "exam") notFound();
  }

  // Subtopic form: parent-topic id → term map so the Rüb field shows the
  // value inherited from the (currently selected) parent topic, read-only.
  let termByTopic: Record<string, number | null> | undefined;
  if (res.slug === "subtopics") {
    const { data: tops } = await supabase
      .from("topics")
      .select("id, term")
      .eq("scope", "exam");
    termByTopic = Object.fromEntries(
      ((tops ?? []) as any[]).map((r) => [
        String(r.id),
        r.term == null ? null : Number(r.term),
      ]),
    );
  }

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
          termByTopic={termByTopic}
        />
      </section>
    </div>
  );
}
