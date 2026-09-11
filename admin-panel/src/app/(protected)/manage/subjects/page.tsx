import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { SubjectLifecycle } from "@/components/SubjectLifecycle";
import { SubjectDeleteButton } from "@/components/SubjectDeleteButton";
import { PriceCell } from "@/components/PriceCell";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { PRICE_INTERVALS } from "@/lib/admin/pricing-shared";
import { loadSubjects } from "./data";
import {
  intervalLabels,
  subjectDeleteStrings,
  subjectLifecycleDict,
  subjectPriceCellStrings,
} from "./strings";

// Subjects — a dedicated screen, not the generic /manage/[resource] registry,
// and since 2026-09-10 the ONLY screen for subscription pricing.
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
// THE PRICING PAGE IS GONE. It rendered this same subjects × subjects_pricing
// join, with the same three amounts, and could write them too — two screens,
// two write paths, one pair of tables. Its per-cell editor (components/PriceCell
// + saveSubjectPrice) was LIFTED rather than reimplemented, so the amounts are
// edited here exactly as they were there: one form per cell, one interval per
// save. /pricing redirects here for anyone holding the old bookmark.
//
// THE iOS COLUMN IS NOT DECORATION. A subject sells on the web the moment its
// three prices exist and it is published, but iOS sells through StoreKit and
// will not offer a subject that has no ACTIVE row in iap_products — silently,
// with no error and no log. That asymmetry is invisible everywhere else in the
// panel, so it is stated on the row it applies to.
//
// This static route SHADOWS /manage/[resource] for the `subjects` slug (Next
// resolves a literal segment before a dynamic one), which is why the subjects
// branches still sitting in that generic page are now unreachable.
//
// Admin-only, like every taxonomy screen — a Content Manager must never reach
// pricing. requireAdmin() below, requireAdmin() in every action, and
// admin_upsert_subject_price's own in-body is_admin() guard with no
// has_permission() escape hatch.
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
  const priceStrings = subjectPriceCellStrings(t);
  const intervals = intervalLabels(t);
  const hasFilters = Boolean(q || status);

  return (
    // subjects-page: the 1560px opt-in the other data-table screens use
    // (.admin-content:has(...) in globals.css). The merge took this table from
    // four columns to six, three of them carrying the inline price editor at a
    // 200px minimum, which at the shared 1120px cap pushed the row actions past
    // the edge of the card.
    <div className="page subjects-page">
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

      {/* ONE line, and only what a person scanning this table needs to read
          before touching a price cell: the currency, and that each cell saves
          on its own. The longer notes (what an incomplete price set hides, and
          that checkout always reprices on the server) live on the subject's
          edit page, beside the same cells and with room for them. */}
      <p className="hint">{t("subj.priceListNote")}</p>

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
            <table className="table pricing-table">
              <thead>
                <tr>
                  <th>{t("subj.field.name")}</th>
                  <th>{t("subj.field.status")}</th>
                  {PRICE_INTERVALS.map((iv) => (
                    <th key={iv}>{intervals[iv]}</th>
                  ))}
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={PRICE_INTERVALS.length + 3} className="muted">
                      {hasFilters ? t("flt.noMatches") : t("subj.noRecords")}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="pricing-subject">
                      {/* THE DISPLAY NAME, in the admin's own language. It used
                          to be `subjects.name`, which is now the frozen
                          bulk-import key rather than a label — printing it here
                          would show every renamed subject under the name it was
                          created with, on the screen where the rename happens.
                          The key is still shown, labelled as the key, on the
                          edit form. */}
                      {row.display}
                      {/* THE MISSING SIGNALS, both stated on the row that
                          causes them. An unpriced subject is invisible on the
                          website; a subject with no live App Store product is
                          invisible in the iOS app. Neither raises an error
                          anywhere. */}
                      {!row.sellable && (
                        <span
                          className="pricing-unsold"
                          title={t("subj.notSellableHint")}
                        >
                          {t("subj.notSellable")}
                        </span>
                      )}
                      {row.iosSellable === "no" && (
                        <span
                          className="pricing-unsold"
                          title={t("subj.iosNotSellableHint")}
                        >
                          {t("subj.iosNotSellable")}
                        </span>
                      )}
                      {/* The third state this row used to render as NOTHING
                          while the edit page rendered it as "not sold on iOS" —
                          two screens, opposite claims about one subject. A
                          failed iap_products read is neither answer, and the
                          dashed chip says so rather than staying silent. */}
                      {row.iosSellable === "unknown" && (
                        <span
                          className="pricing-unsold pricing-unknown"
                          title={t("subj.iosUnknownHint")}
                        >
                          {t("subj.iosUnknown")}
                        </span>
                      )}
                    </td>
                    <td className="nowrap">{t(`status.${row.status}`)}</td>
                    {PRICE_INTERVALS.map((iv) => (
                      <td key={iv}>
                        {/* Inline, per-cell, one interval per save. The cell
                            posts a subject id, an interval and an amount and
                            nothing else, so repricing here cannot touch the
                            name or the status in the columns beside it. */}
                        <PriceCell
                          subjectId={row.id}
                          interval={iv}
                          initialAmount={
                            row.prices[iv] === undefined
                              ? null
                              : Number(row.prices[iv])
                          }
                          currency="AZN"
                          strings={{
                            ...priceStrings,
                            ariaLabel: `${row.display} — ${intervals[iv]}`,
                          }}
                        />
                      </td>
                    ))}
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
