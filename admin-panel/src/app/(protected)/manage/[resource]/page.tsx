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

// Round 10 — generic server-side list filters for every managed resource:
// name search (.ilike) + status select (only for resources that HAVE a status
// column). Topics additionally get a subject select, subtopics get a
// subject → topic cascade. All searchParams are validated server-side
// (status whitelist, uuid-shaped ids, capped + LIKE-escaped search).
const STATUS_VALUES = ["active", "inactive", "archived"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

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
  const uuidParam = (key: string): string => {
    const v = first(sp, key).trim();
    return UUID_RE.test(v) ? v : "";
  };
  // Taxonomy cascades: topics filter by subject; subtopics by subject → topic.
  const subject =
    res.slug === "topics" || res.slug === "subtopics" ? uuidParam("subject") : "";
  const topic = res.slug === "subtopics" ? uuidParam("topic") : "";

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

  // Subtopics cascade needs subjects + subject-scoped topics (light queries;
  // read-only). Topic rows carry subject_id so the topic select can be scoped
  // to the currently selected subject server-side.
  let subjectOptions: { value: string; label: string }[] = [];
  let topicRows: { id: string; subject_id: string; name: string }[] = [];
  if (res.slug === "subtopics") {
    const [{ data: subs }, { data: tops }] = await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("topics").select("id, subject_id, name").order("name"),
    ]);
    subjectOptions = ((subs ?? []) as any[]).map((r) => ({
      value: r.id,
      label: String(r.name),
    }));
    topicRows = (tops ?? []) as any[];
  } else if (res.slug === "topics") {
    subjectOptions = optionsByField["subject_id"] ?? [];
  }

  // ---- Filtered list query -------------------------------------------------
  const embeds = refFields
    .map((f) => `${f.ref!.table}(${f.ref!.labelColumn})`)
    .join(", ");
  const selectStr = embeds ? `*, ${embeds}` : "*";

  // Subtopics have no subject_id column: a subject-only filter means
  // "subtopics of any topic of that subject" (empty topic set → no rows).
  const topicIdsForSubject = subject
    ? topicRows.filter((r) => r.subject_id === subject).map((r) => r.id)
    : [];
  const subjectHasNoTopics =
    res.slug === "subtopics" && subject !== "" && topic === "" &&
    topicIdsForSubject.length === 0;

  let list: any[] = [];
  if (!subjectHasNoTopics) {
    let qb = supabase.from(res.table).select(selectStr);
    if (q) {
      const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
      qb = qb.ilike("name", `%${escaped}%`);
    }
    if (status) qb = qb.eq("status", status);
    if (res.slug === "topics" && subject) qb = qb.eq("subject_id", subject);
    if (res.slug === "subtopics") {
      if (topic) qb = qb.eq("topic_id", topic);
      else if (subject) qb = qb.in("topic_id", topicIdsForSubject);
    }
    const { data: rows } = await qb.order(res.orderBy);
    list = (rows as any[] | null) ?? [];
  }

  const localizedFields = localizeFields(t, res.fields);
  const headerByName = new Map(localizedFields.map((f) => [f.name, f.label]));

  // ---- Filter bar config ---------------------------------------------------
  const selects: FilterBarSelect[] = [];
  if (res.slug === "topics") {
    selects.push({
      key: "subject",
      value: subject,
      allLabel: t("qfilter.allSubjects"),
      ariaLabel: t("qfield.subject"),
      options: subjectOptions,
    });
  }
  if (res.slug === "subtopics") {
    selects.push(
      {
        key: "subject",
        value: subject,
        allLabel: t("qfilter.allSubjects"),
        ariaLabel: t("qfield.subject"),
        options: subjectOptions,
        resets: ["topic"],
      },
      {
        key: "topic",
        value: topic,
        allLabel: t("qfilter.allTopics"),
        ariaLabel: t("qfield.topic"),
        disabled: !subject,
        options: topicRows
          .filter((r) => r.subject_id === subject)
          .map((r) => ({ value: r.id, label: String(r.name) })),
      },
    );
  }
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
  const hasFilters = Boolean(q || status || subject || topic);

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
