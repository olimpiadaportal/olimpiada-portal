import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { SubjectLifecycle } from "@/components/SubjectLifecycle";
import { SubjectDeleteButton } from "@/components/SubjectDeleteButton";
import { PRICE_INTERVALS } from "@/app/(protected)/pricing/shared";
import { SubjectForm } from "../../SubjectForm";
import { loadSubject } from "../../data";
import {
  subjectDeleteStrings,
  subjectFormStrings,
  subjectLifecycleDict,
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
// Three cards, no more: the form (name, status, the three prices), a short
// identity/publication panel that states the sellability the admin would
// otherwise have to infer, and a danger zone that mirrors the olympiad package
// edit page. Deliberately not overdesigned — the complaint was emptiness, not
// a missing dashboard.
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
  const statusFailed = first(sp, "statusFailed") === "1";
  const publishBlocked = first(sp, "publishBlocked") === "1";

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("subj.editTitle")}</h1>
            <p className="muted">{subject.name}</p>
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
              name: subject.name,
              status: subject.status,
              prices: subject.prices,
            }}
            statusOptions={subjectStatusOptions(t)}
            strings={subjectFormStrings(t, t("manage.save"))}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("subj.field.status")}</h3>
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
