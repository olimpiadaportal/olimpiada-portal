import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { DeleteButton } from "@/components/DeleteButton";
import { getLocale, getT, type T } from "@/i18n/server";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
import { localizeFields, resourceTitle } from "@/i18n/resources-i18n";
import { FilterBar, type FilterBarSelect } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";

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

function renderCell(t: T, res: Resource, row: any, col: string): React.ReactNode {
  const f = res.fields.find((x) => x.name === col);
  if (f?.type === "reference" && f.ref) {
    return row[f.ref.table]?.[f.ref.labelColumn] ?? "—";
  }
  if (f?.type === "boolean") return row[col] ? t("boolean.yes") : t("boolean.no");
  if (f?.name === "status" && row[col]) return t(`status.${row[col]}`);
  // Rüb column: "N-ci rüb"; NULL = legacy needs-review badge (excluded from
  // daily-round generation until an admin assigns a term).
  if (f?.name === "term") {
    return row[col] == null ? (
      <span className="pill pill-sm pill-warn">{t("term.review")}</span>
    ) : (
      t(`term.${row[col]}`)
    );
  }
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

  // Local trilingual strings (Rüb labels) fill the keys messages.ts does not
  // know yet; messages.ts wins once the keys land there.
  const t = withLocalStrings(await getT(), await getLocale());
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
  const isTaxonomy = res.slug === "topics" || res.slug === "subtopics";
  const subject = isTaxonomy ? uuidParam("subject") : "";
  const topic = res.slug === "subtopics" ? uuidParam("topic") : "";
  // Rüb filter (topics + subtopics): 1..4 or "none" (NULL = needs review).
  const termRaw = first(sp, "term");
  const term =
    isTaxonomy && ["1", "2", "3", "4", "none"].includes(termRaw) ? termRaw : "";

  const refFields = res.fields.filter((f) => f.type === "reference" && f.ref);
  const optionsByField: Record<string, { value: string; label: string }[]> = {};
  for (const f of refFields) {
    const ref = f.ref!;
    let refQb = supabase.from(ref.table).select(`id, ${ref.labelColumn}`);
    // Module separation: the Exams taxonomy pages only ever offer EXAM-scoped
    // topics (e.g. the subtopic form's parent-topic dropdown). Olympiad-package
    // bulk imports create scope='olympiad' topics that must never appear here.
    if (ref.table === "topics") refQb = refQb.eq("scope", "exam");
    const { data } = await refQb.order(ref.orderBy ?? ref.labelColumn);
    optionsByField[f.name] = (data ?? []).map((r: any) => ({
      value: r.id,
      label: String(r[ref.labelColumn]),
    }));
  }

  // Subtopics cascade needs subjects + subject-scoped topics (light queries;
  // read-only). Topic rows carry subject_id so the topic select can be scoped
  // to the currently selected subject server-side, and term so the subtopic
  // form can show the Rüb inherited from the selected parent topic.
  let subjectOptions: { value: string; label: string }[] = [];
  let topicRows: { id: string; subject_id: string; name: string; term: number | null }[] = [];
  if (res.slug === "subtopics") {
    const [{ data: subs }, { data: tops }] = await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      // Exam-scoped topics only: this set also drives the subtopics list
      // restriction below (subtopics inherit scope via their parent topic).
      supabase
        .from("topics")
        .select("id, subject_id, name, term")
        .eq("scope", "exam")
        .order("name"),
    ]);
    subjectOptions = ((subs ?? []) as any[]).map((r) => ({
      value: r.id,
      label: String(r.name),
    }));
    topicRows = (tops ?? []) as any[];
  } else if (res.slug === "topics") {
    subjectOptions = optionsByField["subject_id"] ?? [];
  }

  // Parent-topic id → term map for the subtopic form's read-only Rüb display.
  const termByTopic: Record<string, number | null> | undefined =
    res.slug === "subtopics"
      ? Object.fromEntries(
          topicRows.map((r) => [r.id, r.term == null ? null : Number(r.term)]),
        )
      : undefined;

  // ---- Filtered list query -------------------------------------------------
  const embeds = refFields
    .map((f) => `${f.ref!.table}(${f.ref!.labelColumn})`)
    .join(", ");
  const selectStr = embeds ? `*, ${embeds}` : "*";

  // A ?topic= id is only honoured when it belongs to the exam-scoped topic
  // set loaded above — a forged olympiad topic id must never list its
  // subtopics here.
  const topicSafe = topic && topicRows.some((r) => r.id === topic) ? topic : "";

  // Subtopics have no subject_id column: a subject-only filter means
  // "subtopics of any topic of that subject" (empty topic set → no rows).
  const topicIdsForSubject = subject
    ? topicRows.filter((r) => r.subject_id === subject).map((r) => r.id)
    : [];
  const subjectHasNoTopics =
    res.slug === "subtopics" && subject !== "" && topicSafe === "" &&
    topicIdsForSubject.length === 0;

  let list: any[] = [];
  if (!subjectHasNoTopics) {
    let qb = supabase.from(res.table).select(selectStr);
    const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
    if (escaped) {
      qb = qb.ilike("name", `%${escaped}%`);
    }
    if (status) qb = qb.eq("status", status);
    // Rüb filter: exact term or the NULL "needs review" bucket. Both topics
    // and subtopics carry their own term column (kept in sync by the DB).
    if (term === "none") qb = qb.is("term", null);
    else if (term) qb = qb.eq("term", Number(term));
    if (res.slug === "topics") {
      // Module separation: olympiad-scoped topics are package-internal and
      // never listed/managed on the Exams taxonomy pages.
      qb = qb.eq("scope", "exam");
      if (subject) qb = qb.eq("subject_id", subject);
    }
    if (res.slug === "subtopics") {
      if (topicSafe) qb = qb.eq("topic_id", topicSafe);
      else if (subject) qb = qb.in("topic_id", topicIdsForSubject);
      // No cascade filter → still restricted to subtopics of exam topics
      // (subtopics inherit scope through their parent topic).
      else qb = qb.in("topic_id", topicRows.map((r) => r.id));
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
        value: topicSafe,
        allLabel: t("qfilter.allTopics"),
        ariaLabel: t("qfield.topic"),
        disabled: !subject,
        options: topicRows
          .filter((r) => r.subject_id === subject)
          .map((r) => ({ value: r.id, label: String(r.name) })),
      },
    );
  }
  if (isTaxonomy) {
    // Rüb filter: 1..4 + the NULL "needs review" bucket.
    selects.push({
      key: "term",
      value: term,
      allLabel: t("qfilter.allTerms"),
      ariaLabel: t("qfield.term"),
      options: [
        ...["1", "2", "3", "4"].map((n) => ({ value: n, label: t(`term.${n}`) })),
        { value: "none", label: t("qfilter.noTerm") },
      ],
    });
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
  const hasFilters = Boolean(q || status || subject || topicSafe || term);

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
          termByTopic={termByTopic}
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
