import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { SubjectLifecycle } from "@/components/SubjectLifecycle";
import { SubjectDeleteButton } from "@/components/SubjectDeleteButton";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { PRICE_INTERVALS } from "@/app/(protected)/pricing/shared";
import { loadSubjects } from "./data";
import { subjectDeleteStrings, subjectLifecycleDict } from "./strings";

// Subjects — a dedicated screen, not the generic /manage/[resource] registry.
//
// The registry can express a table and its columns. A subject is a table AND a
// child table: `subjects_pricing`, one row per (subject_id, interval). Every
// family-facing surface — /services, /register, Add-Child, the per-child
// subscribe screen, and even the admin Free Access picker — builds its subject
// list from PRICED rows rather than from `subjects`, so a subject that is
// 'active' with an incomplete price set is published and invisible at the same
// time. That happened to Elm and Fizika and nothing on this screen said so;
// the "not sellable" flag existed only on the separate Pricing page.
//
// This static route SHADOWS /manage/[resource] for the `subjects` slug (Next
// resolves a literal segment before a dynamic one), which is why the subjects
// branches still sitting in that generic page are now unreachable.
//
// Admin-only, like every taxonomy screen — a Content Manager must never reach
// pricing.
const STATUS_VALUES = ["active", "inactive", "archived"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const sp = await searchParams;

  // Validated searchParams: capped + LIKE-escaped search, whitelisted status.
  const q = first(sp, "q").trim().slice(0, 200);
  const statusRaw = first(sp, "status");
  const status = (STATUS_VALUES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";

  const { rows, failed } = await loadSubjects({
    search: sanitizeSearchTerm(q),
    status,
  });

  const deleteStrings = subjectDeleteStrings(t);
  const lifecycleDict = subjectLifecycleDict(t);
  const hasFilters = Boolean(q || status);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("subj.title")}</h1>
            <p className="muted">{t("subj.subtitle")}</p>
          </div>
          <Link className="btn" href="/manage/subjects/new">
            {t("subj.new")}
          </Link>
        </div>
      </div>

      {/* A refused publish must not look like a publish. transitionSubject
          redirects here with this flag when the subject has no complete price
          set, rather than returning silently as it used to. */}
      {first(sp, "publishBlocked") === "1" && (
        <p className="form-error" role="alert">
          {t("subj.publishBlocked")}
        </p>
      )}

      <FilterBar
        basePath="/manage/subjects"
        search={{ value: q, placeholder: t("flt.nameSearch") }}
        selects={[
          {
            key: "status",
            value: status,
            allLabel: t("qfilter.allStatuses"),
            ariaLabel: t("subj.field.status"),
            options: STATUS_VALUES.map((s) => ({
              value: s,
              label: t(`status.${s}`),
            })),
          },
        ]}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        {failed ? (
          <p className="form-error" role="alert">
            {t("err.server")}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("subj.field.name")}</th>
                  <th>{t("subj.field.status")}</th>
                  <th>{t("subj.col.pricing")}</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {hasFilters ? t("flt.noMatches") : t("subj.noRecords")}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="nowrap">{t(`status.${row.status}`)}</td>
                    <td className="nowrap">
                      {/* THE MISSING SIGNAL. This is the screen where subjects
                          are created and published, and it used to say nothing
                          about whether the thing could be sold. */}
                      {PRICE_INTERVALS.map((iv) => row.prices[iv] ?? "—").join(
                        " / ",
                      )}
                      {!row.sellable && (
                        <span
                          className="pricing-unsold"
                          title={t("subj.notSellableHint")}
                        >
                          {t("subj.notSellable")}
                        </span>
                      )}
                    </td>
                    <td className="row-actions nowrap">
                      <SubjectLifecycle
                        id={row.id}
                        status={row.status}
                        dict={lifecycleDict}
                        sellable={row.sellable}
                      />
                      <Link href={`/manage/subjects/${row.id}/edit`}>
                        {t("action.edit")}
                      </Link>
                      {/* Subjects never use the generic delete: the cascade is a
                          paid subscription line, a curriculum tree and a SET
                          NULL across the question bank. Migration 111's
                          previewed, confirmed flow is the only route, and
                          deleteRow() refuses the slug server-side too. */}
                      <SubjectDeleteButton id={row.id} strings={deleteStrings} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
