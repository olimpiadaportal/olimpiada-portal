import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { ResourceForm } from "@/components/ResourceForm";
import { DeleteButton } from "@/components/DeleteButton";
import {
  SubjectDeleteButton,
  type SubjectDeleteStrings,
} from "@/components/SubjectDeleteButton";
import { SubjectLifecycle } from "@/components/SubjectLifecycle";
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

// The subject-deletion dialog is a client component, so its copy is resolved
// here and passed down (same contract as LeaderboardResetControls).
function subjectDeleteStrings(t: T): SubjectDeleteStrings {
  return {
    open: t("action.delete"),
    title: t("del.subject.title"),
    loading: t("del.loading"),
    loadFailed: t("del.loadFailed"),
    blockedTitle: t("del.blockedTitle"),
    warnTitle: t("del.warnTitle"),
    irreversible: t("del.irreversible"),
    questions: t("del.questions"),
    cascade: t("del.cascade"),
    // Subject-specific: this dialog asks for the WORD SİL, not the row's code
    // (owner spec). The shared del.codeLabel/codeHint still describe a code and
    // are still correct for every other destructive dialog in the panel.
    codeLabel: t("del.subject.wordLabel"),
    codeHint: t("del.subject.wordHint"),
    ackLabel: t("del.ackLabel"),
    purgeTitle: t("del.purgeTitle"),
    purgeDesc: t("del.purgeDesc"),
    purgeAction: t("del.purgeAction"),
    deleteTitle: t("del.subject.deleteTitle"),
    deleteDesc: t("del.subject.deleteDesc"),
    deleteAction: t("del.subject.deleteAction"),
    cancel: t("action.cancel"),
    close: t("modal.close"),
    working: t("pend.deleting"),
  };
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

      {/* deleteRow() used to discard its error, so a delete a database guard
          refused was indistinguishable from one that worked. It now redirects
          here with a flag; the reason itself stays in the server log (never
          leak a raw Postgres message). */}
      {first(sp, "deleteFailed") === "1" && (
        <p className="form-error" role="alert">
          {t("manage.deleteFailed")}
        </p>
      )}

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
                    {/* Publish / hide / archive inline. `subjects.status` has
                        always been the switch that decides whether a subject is
                        sold to families — the public Services page, Add-Child
                        and the per-child subscribe screen all read it — but the
                        only way to change it was to open the edit form and pick
                        from a dropdown. Admin → Subjects is meant to BE the
                        control, so the control lives on the row. */}
                    {res.slug === "subjects" ? (
                      <SubjectLifecycle
                        id={row.id}
                        status={String(row.status ?? "")}
                        dict={{
                          "subj.act.publish": t("subj.act.publish"),
                          "subj.act.unpublish": t("subj.act.unpublish"),
                          "subj.act.archive": t("subj.act.archive"),
                          "pend.processing": t("pend.processing"),
                        }}
                      />
                    ) : null}
                    <Link href={`/manage/${res.slug}/${row.id}/edit`}>
                      {t("action.edit")}
                    </Link>
                    {/* Subjects do NOT use the generic delete. deleteRow() is a
                        bare `.delete()` and the cascade behind a subject is a
                        paid subscription line, a curriculum tree and a SET NULL
                        across the question bank — it needs the previewed,
                        code-confirmed flow of migration 111. deleteRow() also
                        refuses the slug server-side, so this is a matching UI,
                        not the control itself. */}
                    {res.slug === "subjects" ? (
                      <SubjectDeleteButton id={row.id} strings={subjectDeleteStrings(t)} />
                    ) : (
                      <DeleteButton
                        slug={res.slug}
                        id={row.id}
                        label={t("action.delete")}
                        confirmText={t("action.confirmDelete")}
                        pendingLabel={t("pend.deleting")}
                      />
                    )}
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
