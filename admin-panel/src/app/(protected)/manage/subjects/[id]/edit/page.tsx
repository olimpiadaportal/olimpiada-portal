import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { SubjectLifecycle } from "@/components/SubjectLifecycle";
import { SubjectDeleteButton } from "@/components/SubjectDeleteButton";
import { PriceCell } from "@/components/PriceCell";
import { PRICE_INTERVALS } from "@/lib/admin/pricing-shared";
import { SubjectForm } from "../../SubjectForm";
import { IapNotice } from "../../IapNotice";
import { loadSubject } from "../../data";
import {
  intervalLabels,
  subjectDeleteStrings,
  subjectFormStrings,
  subjectLifecycleDict,
  subjectPriceCellStrings,
  subjectStatusOptions,
} from "../../strings";

// Edit Subject.
//
// The generic registry edit page rendered exactly two controls — name and
// status — in a grid that put them side by side and left the rest of the card
// empty. It also could not show or change the thing that decides whether the
// subject is sellable at all, because the price is a row in `subjects_pricing`
// rather than a column here.
//
// FOUR CARDS: the identity form (name, status), the three prices as inline
// per-cycle cells, a short publication panel that states the sellability the
// admin would otherwise have to infer, and a danger zone that mirrors the
// olympiad package edit page. Deliberately not overdesigned — the complaint was
// emptiness, not a missing dashboard.
//
// WHY THE PRICES LEFT THE FORM (2026-09-10, the /pricing merge). They are now
// the same component the Subjects list renders, posting to the same
// saveSubjectPrice action: one subject id, one interval, one amount. Saving the
// NAME therefore cannot re-post three amounts read off a page that may be
// minutes old, which is how a rename could silently undo somebody else's
// reprice. Two actions, two tables, no overlap.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function EditSubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const t = await getT();
  const sp = await searchParams;
  const subject = await loadSubject(id);
  if (!subject) notFound();

  const priceFailed = first(sp, "priceFailed") === "1";
  const nameFailed = first(sp, "nameFailed") === "1";
  const statusFailed = first(sp, "statusFailed") === "1";
  const publishBlocked = first(sp, "publishBlocked") === "1";

  const priceStrings = subjectPriceCellStrings(t);
  const intervals = intervalLabels(t);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("subj.editTitle")}</h1>
            {/* The DISPLAY name in the admin's own language — `subjects.name`
                is the bulk-import key now, and it is printed once, labelled as
                the key, inside the form below. */}
            <p className="muted">{subject.display}</p>
          </div>
          <Link className="btn-ghost" href="/manage/subjects">
            {t("manage.back")}
          </Link>
        </div>
      </div>

      {/* Every one of these is a failure the previous flow reported as success,
          or did not report at all. */}
      {priceFailed && (
        <p className="form-error" role="alert">
          {t("subj.err.priceSave")}
        </p>
      )}
      {nameFailed && (
        <p className="form-error" role="alert">
          {t("subj.err.nameSave")}
        </p>
      )}
      {statusFailed && (
        <p className="form-error" role="alert">
          {t("err.server")}
        </p>
      )}
      {publishBlocked && (
        <p className="form-error" role="alert">
          {t("subj.publishBlocked")}
        </p>
      )}

      <div className="card-stack">
        <section className="card">
          <h3>{t("subj.infoHeading")}</h3>
          <SubjectForm
            mode="edit"
            id={subject.id}
            defaults={{
              names: subject.names,
              status: subject.status,
              prices: subject.prices,
              // The bulk-import key, shown beside the az field because that
              // field no longer writes it: renaming a subject here must not
              // look like it renames the value import files match on.
              internalName: subject.name,
            }}
            statusOptions={subjectStatusOptions(t)}
            strings={subjectFormStrings(t, t("manage.save"))}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("subj.field.prices")}</h3>
            <span
              className={
                subject.sellable
                  ? "pill pill-ok pill-inline"
                  : "pill pill-warn pill-inline"
              }
              title={subject.sellable ? undefined : t("subj.notSellableHint")}
            >
              {subject.sellable ? t("subj.sellable") : t("subj.notSellable")}
            </span>
          </div>
          <p className="section-intro">{t("subj.pricesHint")}</p>
          <p className="hint">{t("subj.priceInlineHint")}</p>
          <div className="table-wrap">
            <table className="table pricing-table">
              <thead>
                <tr>
                  {PRICE_INTERVALS.map((iv) => (
                    <th key={iv}>{intervals[iv]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {PRICE_INTERVALS.map((iv) => (
                    <td key={iv}>
                      <PriceCell
                        subjectId={subject.id}
                        interval={iv}
                        initialAmount={
                          subject.prices[iv] === undefined
                            ? null
                            : Number(subject.prices[iv])
                        }
                        currency="AZN"
                        strings={{
                          ...priceStrings,
                          ariaLabel: `${subject.display} — ${intervals[iv]}`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t("subj.repriceNote")}</p>
          <p className="hint">{t("subj.currencyNote")}</p>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("subj.field.status")}</h3>
            {/* THREE STATES, RENDERED AS THREE. iosSellable is yes / no /
                unknown (data.ts), and "unknown" means the iap_products read
                FAILED — collapsing it into the warn pill turned a failure to
                CHECK into the definite claim "this subject is not sold on
                iOS", about a product that may well be live. It gets a muted
                pill and its own sentence. The list screen renders the same
                three, so the two no longer report opposite facts. */}
            <span
              className={
                subject.iosSellable === "yes"
                  ? "pill pill-ok pill-inline"
                  : subject.iosSellable === "unknown"
                    ? "pill pill-muted pill-inline"
                    : "pill pill-warn pill-inline"
              }
              title={
                subject.iosSellable === "yes"
                  ? undefined
                  : subject.iosSellable === "unknown"
                    ? t("subj.iosUnknownHint")
                    : t("subj.iosNotSellableHint")
              }
            >
              {subject.iosSellable === "yes"
                ? t("subj.iosSellable")
                : subject.iosSellable === "unknown"
                  ? t("subj.iosUnknown")
                  : t("subj.iosNotSellable")}
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: "flex-start" }}>
            <SubjectLifecycle
              id={subject.id}
              status={subject.status}
              dict={subjectLifecycleDict(t)}
              sellable={subject.sellable}
              returnTo="edit"
            />
          </div>
          <p className="hint">
            {t("subj.code")}: <code>{subject.code}</code> · {t("subj.codeHint")}
          </p>
          <p className="hint">
            {t("subj.col.pricing")}:{" "}
            {PRICE_INTERVALS.map((iv) => subject.prices[iv] ?? "—").join(" / ")} AZN
          </p>
        </section>

        {/* Only when it is still true. A subject whose three iOS products are
            live has nothing to act on, and a warning card that never goes away
            is a warning card nobody reads. "unknown" (the product map could not
            be read) shows it too: the honest answer there is "check", not
            silence. */}
        {subject.iosSellable !== "yes" && <IapNotice t={t} />}

        {/* Same shape as the olympiad package edit page's danger zone: the
            destructive control lives at the bottom, in its own card, never
            beside Save. */}
        <section className="card setting-card-warn">
          <div className="card-head">
            <h3>{t("subj.dangerHeading")}</h3>
          </div>
          <p className="section-intro">{t("subj.dangerHint")}</p>
          <SubjectDeleteButton
            id={subject.id}
            strings={subjectDeleteStrings(t)}
            triggerClassName="btn-ghost btn-danger-ghost"
          />
        </section>
      </div>
    </div>
  );
}
