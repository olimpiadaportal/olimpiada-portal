import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { loadQuestionReport } from "@/lib/admin/questionReports";
import { reportStatusPill } from "@/lib/admin/question-report-status";
import { QuestionReportStatus } from "@/components/QuestionReportStatus";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// One report in full: what the user wrote, the context the server derived, and
// the question exactly as that user was reading it.
//
// This page is an ANSWER-KEY surface (it shows which option is correct). It is
// gated by requireAdmin() here, by requireAdmin() inside loadQuestionReport,
// and by RLS on the underlying tables. Do not widen the route to content
// managers without revisiting that.
export default async function QuestionReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);

  const data = await loadQuestionReport(id);
  if (!data) notFound();
  const { report, question } = data;

  const dict: Record<string, string> = {};
  for (const k of [
    "pend.processing",
    "qrep.act.in_review",
    "qrep.act.resolve",
    "qrep.act.dismiss",
    "qrep.act.reopen",
    "qrep.detail.actionsHeading",
    "qrep.notify.hint",
    "qrep.notify.none",
  ]) {
    dict[k] = t(k);
  }

  // A pool question is edited inside its package, never in the general editor —
  // the same split loadQuestionForEdit already encodes with its "olympiadScoped"
  // error. A question deleted since the report leaves no link at all.
  const editHref = !question
    ? null
    : question.olympiad_package_id
      ? `/olympiad/${question.olympiad_package_id}/edit`
      : `/questions?edit=${question.id}`;

  const bodyIsFallback =
    question !== null &&
    question.bodyLocale !== null &&
    question.bodyLocale !== report.locale;
  const explanationIsFallback =
    question !== null &&
    question.explanationLocale !== null &&
    question.explanationLocale !== report.locale;

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("qrep.detail.title")}</h1>
            <p className="muted">
              {formatBakuDateTime(report.created_at, locale)}
              {" · "}
              <span className="mono">{report.id.slice(0, 8)}</span>
            </p>
          </div>
          <Link className="btn-ghost" href="/question-reports">
            {t("qrep.detail.back")}
          </Link>
        </div>
      </div>

      <section className="card qrep-card">
        <div className="head-row">
          <h2>{t("qrep.detail.reportHeading")}</h2>
          <span className={`pill ${reportStatusPill(report.status)}`}>
            {t(`qrep.status.${report.status}`)}
          </span>
        </div>

        {/* THE ONLY PLACE report text is rendered, and always as a React TEXT
            CHILD: React escapes it, so "<script>" renders as those characters.
            Never dangerouslySetInnerHTML, never through notif-markdown.ts. */}
        <p className="qrep-message">{report.message}</p>

        <dl className="qrep-meta">
          <div>
            <dt>{t("qrep.field.reporter")}</dt>
            <dd>{report.reporter_label ?? t("qrep.deletedAccount")}</dd>
          </div>
          <div>
            <dt>{t("qrep.field.locale")}</dt>
            <dd className="mono">{report.locale}</dd>
          </div>
          <div>
            <dt>{t("qrep.field.platform")}</dt>
            <dd>{t(`qrep.platform.${report.platform}`)}</dd>
          </div>
          <div>
            <dt>{t("qrep.field.appVersion")}</dt>
            <dd className="mono">{report.app_version ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("qrep.field.attempt")}</dt>
            <dd>
              {report.attempt_kind
                ? t(`qrep.attempt.${report.attempt_kind}`)
                : t("qrep.detail.noAttempt")}
            </dd>
          </div>
          <div>
            <dt>{t("qrep.field.olympiad")}</dt>
            <dd>{report.olympiad_package_title ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("qrep.field.handledBy")}</dt>
            <dd>
              {report.handled_by_label ?? "—"}
              {report.handled_at
                ? ` · ${formatBakuDateTime(report.handled_at, locale)}`
                : ""}
            </dd>
          </div>
        </dl>

        {/* The trigger behind the notification skips a NULL reporter, so the
            control must say the same thing rather than promise a delivery that
            silently does not happen. */}
        <QuestionReportStatus
          id={report.id}
          status={report.status}
          notifiesReporter={report.reporter_profile_id !== null}
          dict={dict}
        />
      </section>

      <section className="card qrep-card">
        <div className="head-row">
          <h2>{t("qrep.detail.questionHeading")}</h2>
          {editHref ? (
            <Link className="btn-ghost" href={editHref}>
              {question?.olympiad_package_id
                ? t("qrep.detail.openPackage")
                : t("qrep.detail.openQuestion")}
            </Link>
          ) : (
            <span className="muted">{t("qrep.detail.questionGone")}</span>
          )}
        </div>

        {!question ? (
          <p className="muted">{t("qrep.detail.questionGone")}</p>
        ) : (
          <>
            <p className="muted qrep-taxonomy">
              {[question.subject, question.grade, question.topic, question.subtopic]
                .filter(Boolean)
                .join(" › ") || "—"}
            </p>

            {/* The report's locale is what the reporter was reading. When the
                question has no row for it, say so — this is where the missing
                en/ru translation gap becomes visible instead of silent. */}
            {bodyIsFallback && (
              <p className="qrep-fallback">
                {t("qrep.detail.localeFallback")
                  .replace("{want}", report.locale)
                  .replace("{got}", question.bodyLocale ?? "—")}
              </p>
            )}
            <p className="qrep-body">{question.body || "—"}</p>
            {question.prompt && <p className="muted">{question.prompt}</p>}

            <ol className="qrep-options">
              {question.options.map((o, i) => (
                <li
                  key={o.option_id}
                  className={o.is_correct ? "qrep-option correct" : "qrep-option"}
                >
                  <span className="mono qrep-option-key">{LETTERS[i] ?? i + 1}</span>
                  <span>{o.text ?? "—"}</span>
                  {o.is_correct && (
                    <span className="pill pill-ok">{t("qrep.detail.correct")}</span>
                  )}
                </li>
              ))}
            </ol>

            {question.explanation ? (
              <div className="qrep-explain">
                <b>{t("qrep.detail.explanation")}</b>
                {explanationIsFallback && (
                  <span className="qrep-fallback-inline">
                    {t("qrep.detail.localeFallback")
                      .replace("{want}", report.locale)
                      .replace("{got}", question.explanationLocale ?? "—")}
                  </span>
                )}
                <p>{question.explanation}</p>
              </div>
            ) : (
              <p className="muted">{t("qrep.detail.noExplanation")}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
