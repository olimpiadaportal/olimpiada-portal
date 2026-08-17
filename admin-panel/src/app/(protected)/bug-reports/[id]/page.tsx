import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { loadBugReport } from "@/lib/admin/bugReports";
import { reportStatusPill } from "@/lib/admin/question-report-status";
import { bugPriorityPill } from "@/lib/admin/bug-report-meta";
import { BugReportTriage } from "@/components/BugReportTriage";

// One bug report in full: what the reporter wrote, and the environment the
// server derived around it.
//
// EVERY field below is rendered as a React TEXT CHILD. That is not a style
// preference here — a bug report can be filed by an UNAUTHENTICATED visitor, so
// this page displays the least-trusted text in the whole admin panel. One
// dangerouslySetInnerHTML, or one pass through lib/notif-markdown.ts, would turn
// the public contact form into stored XSS with an administrator session as the
// target. route_path is shown as text for the same reason — never as an <a>.
export default async function BugReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);

  const report = await loadBugReport(id);
  if (!report) notFound();

  const dict: Record<string, string> = {};
  for (const k of [
    "pend.processing",
    "brep.act.in_review",
    "brep.act.resolve",
    "brep.act.dismiss",
    "brep.act.reopen",
    "brep.act.savePriority",
    "brep.act.saveNote",
    "brep.field.priority",
    "brep.field.adminNote",
    "brep.detail.notePlaceholder",
    "brep.priority.low",
    "brep.priority.normal",
    "brep.priority.high",
    "brep.priority.critical",
  ]) {
    dict[k] = t(k);
  }

  const reporterName =
    report.reporter_role === "anonymous"
      ? t("brep.role.anonymous")
      : (report.reporter_label ?? t("brep.deletedAccount"));

  // An email typed into the PUBLIC form is a claim, not an identity. The one
  // copied from a resolved session's profile is trustworthy. The row says which,
  // so nobody replies to an unverified address as if it identified the sender.
  const emailLine = report.reporter_email
    ? report.reporter_email_verified
      ? report.reporter_email
      : `${report.reporter_email} · ${t("brep.detail.unverified")}`
    : "—";

  const optional = (v: string | null) => (v && v.trim() !== "" ? v : null);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("brep.detail.title")}</h1>
            <p className="muted">
              {formatBakuDateTime(report.created_at, locale)}
              {" · "}
              <span className="mono">{report.id.slice(0, 8)}</span>
            </p>
          </div>
          <Link className="btn-ghost" href="/bug-reports">
            {t("brep.detail.back")}
          </Link>
        </div>
      </div>

      <section className="card qrep-card">
        <div className="head-row">
          <div className="brep-head-title">
            <h2>{report.title}</h2>
          </div>
          <div className="brep-pills">
            <span className={`pill ${bugPriorityPill(report.priority)}`}>
              {t(`brep.priority.${report.priority}`)}
            </span>
            <span className={`pill ${reportStatusPill(report.status)}`}>
              {t(`brep.status.${report.status}`)}
            </span>
          </div>
        </div>

        <h3 className="brep-section">{t("brep.field.description")}</h3>
        <p className="qrep-message">{report.description}</p>

        <h3 className="brep-section">{t("brep.field.steps")}</h3>
        <p className={optional(report.steps_to_reproduce) ? "qrep-message" : "muted"}>
          {optional(report.steps_to_reproduce) ?? t("brep.detail.notProvided")}
        </p>

        <div className="brep-split">
          <div>
            <h3 className="brep-section">{t("brep.field.expected")}</h3>
            <p className={optional(report.expected_behavior) ? "qrep-message" : "muted"}>
              {optional(report.expected_behavior) ?? t("brep.detail.notProvided")}
            </p>
          </div>
          <div>
            <h3 className="brep-section">{t("brep.field.actual")}</h3>
            <p className={optional(report.actual_behavior) ? "qrep-message" : "muted"}>
              {optional(report.actual_behavior) ?? t("brep.detail.notProvided")}
            </p>
          </div>
        </div>
      </section>

      <section className="card qrep-card">
        <h2>{t("brep.detail.metaHeading")}</h2>
        <dl className="qrep-meta">
          <div>
            <dt>{t("brep.field.reporter")}</dt>
            <dd>{reporterName}</dd>
          </div>
          <div>
            <dt>{t("brep.field.role")}</dt>
            <dd>{t(`brep.role.${report.reporter_role}`)}</dd>
          </div>
          <div>
            <dt>{t("brep.field.email")}</dt>
            <dd>{emailLine}</dd>
          </div>
          <div>
            <dt>{t("brep.field.severity")}</dt>
            <dd>{t(`brep.priority.${report.reported_severity}`)}</dd>
          </div>
          <div>
            <dt>{t("brep.field.route")}</dt>
            {/* TEXT, never a link. The path is client-declared, and the query
                string and fragment were stripped in the database before this
                row was written (that is where auth codes live). */}
            <dd className="mono brep-wrap">{report.route_path ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("brep.field.locale")}</dt>
            <dd className="mono">{report.locale}</dd>
          </div>
          <div>
            <dt>{t("brep.field.platform")}</dt>
            <dd>{t(`brep.platform.${report.platform}`)}</dd>
          </div>
          <div>
            <dt>{t("brep.field.appVersion")}</dt>
            <dd className="mono">{report.app_version ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("brep.field.userAgent")}</dt>
            <dd className="mono brep-wrap">{report.user_agent ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("brep.field.handledBy")}</dt>
            <dd>
              {report.handled_by_label ?? "—"}
              {report.handled_at ? ` · ${formatBakuDateTime(report.handled_at, locale)}` : ""}
            </dd>
          </div>
          <div>
            <dt>{t("brep.field.resolvedAt")}</dt>
            <dd>
              {report.resolved_at ? formatBakuDateTime(report.resolved_at, locale) : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("brep.field.updated")}</dt>
            <dd>{formatBakuDateTime(report.updated_at, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="card qrep-card">
        <h2>{t("brep.detail.triageHeading")}</h2>
        <BugReportTriage
          id={report.id}
          status={report.status}
          priority={report.priority}
          note={report.admin_note}
          dict={dict}
        />
      </section>
    </div>
  );
}
