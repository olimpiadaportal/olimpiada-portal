import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { getSubscriptionDetail } from "@/lib/admin/subscriptions";
import {
  SUBSCRIPTION_ACTIONS,
  allowedSubscriptionActions,
  providerBadgeClass,
  providerKind,
  statusPillClass,
} from "@/lib/admin/subscription-lifecycle";
import { SubscriptionActions } from "../SubscriptionActions";
import { localStrings } from "../labels";

// Subscription detail — Administrator-only. Shows everything the list row
// does plus subjects, sibling-discount record, the honest "no provider
// transaction" note (payments/checkout_sessions are written by NO code today
// — ground truth, Round 31) and the lifecycle action buttons.
export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);

  const sub = await getSubscriptionDetail(id);
  if (!sub) notFound();

  const fmt = (iso: string | null): string =>
    iso ? formatBakuDateTime(iso, locale) : "—";
  const fmtAmount = (n: number | null): string =>
    n === null ? "—" : `${n.toFixed(2)} ${sub.currency}`;

  const kind = providerKind(sub.provider);
  const providerLabel = kind === "other" ? sub.provider : lt(`subs.source.${kind}`);

  const allowed = allowedSubscriptionActions(sub.status);

  const actionStrings = {
    button: Object.fromEntries(
      SUBSCRIPTION_ACTIONS.map((a) => [a, lt(`subs.action.${a}.button`)]),
    ) as Record<(typeof SUBSCRIPTION_ACTIONS)[number], string>,
    title: Object.fromEntries(
      SUBSCRIPTION_ACTIONS.map((a) => [a, lt(`subs.action.${a}.title`)]),
    ) as Record<(typeof SUBSCRIPTION_ACTIONS)[number], string>,
    body: Object.fromEntries(
      SUBSCRIPTION_ACTIONS.map((a) => [a, lt(`subs.action.${a}.body`)]),
    ) as Record<(typeof SUBSCRIPTION_ACTIONS)[number], string>,
    confirm: Object.fromEntries(
      SUBSCRIPTION_ACTIONS.map((a) => [a, lt(`subs.action.${a}.confirm`)]),
    ) as Record<(typeof SUBSCRIPTION_ACTIONS)[number], string>,
    done: Object.fromEntries(
      SUBSCRIPTION_ACTIONS.map((a) => [a, lt(`subs.action.${a}.done`)]),
    ) as Record<(typeof SUBSCRIPTION_ACTIONS)[number], string>,
    daysLabel: lt("subs.action.daysLabel"),
    daysHint: lt("subs.action.daysHint"),
    cancelBtn: t("action.cancel"),
    closeBtn: t("modal.close"),
    submitting: t("manage.saving"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{sub.childName}</h1>
        <p className="muted">
          <Link href="/subscriptions">← {lt("subs.detail.back")}</Link>
        </p>
      </div>

      <div className="form-grid" style={{ marginBottom: 20 }}>
        <section className="card">
          <h3>{lt("subs.detail.childSection")}</h3>
          <p style={{ margin: "4px 0" }}>{sub.childName}</p>
          {sub.childUniqueId && (
            <p className="muted" style={{ margin: "4px 0" }}>
              {lt("subs.detail.childId")}: {sub.childUniqueId}
            </p>
          )}
          {sub.childAccessStatus && (
            <p className="muted" style={{ margin: "4px 0" }}>
              {lt("subs.detail.childAccessStatus")}: {sub.childAccessStatus}
            </p>
          )}
        </section>

        <section className="card">
          <h3>{lt("subs.detail.parentSection")}</h3>
          <p style={{ margin: "4px 0" }}>{sub.parentName}</p>
          {sub.parentEmail && (
            <p className="muted" style={{ margin: "4px 0" }}>
              {lt("subs.detail.email")}: {sub.parentEmail}
            </p>
          )}
        </section>

        <section className="card">
          <h3>{lt("subs.detail.subjectsSection")}</h3>
          {sub.subjectNames.length === 0 ? (
            <p className="muted">{lt("subs.detail.noSubjects")}</p>
          ) : (
            <p style={{ margin: "4px 0" }}>{sub.subjectNames.join(", ")}</p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("subs.detail.billingSection")}</h3>
        <div className="form-grid">
          <p>
            <strong>{lt("subs.detail.status")}:</strong>{" "}
            <span className={`pill ${statusPillClass(sub.status)}`}>
              {lt(`subs.status.${sub.status}`)}
            </span>
          </p>
          <p>
            <strong>{lt("subs.detail.interval")}:</strong>{" "}
            {lt(`subs.interval.${sub.interval}`)}
          </p>
          <p>
            <strong>{lt("subs.detail.baseAmount")}:</strong>{" "}
            {fmtAmount(sub.baseAmount)}
          </p>
          <p>
            <strong>{lt("subs.detail.discount")}:</strong>{" "}
            {sub.discountPercent > 0
              ? `${sub.discountPercent}% (${fmtAmount(sub.discountAmount)})`
              : lt("subs.detail.discountNone")}
          </p>
          <p>
            <strong>{lt("subs.detail.totalAmount")}:</strong>{" "}
            {fmtAmount(sub.totalAmount)}
          </p>
          <p>
            <strong>{lt("subs.detail.trialStart")}:</strong> {fmt(sub.trialStartedAt)}
          </p>
          <p>
            <strong>{lt("subs.detail.trialEnd")}:</strong> {fmt(sub.trialEndsAt)}
          </p>
          <p>
            <strong>{lt("subs.detail.periodStart")}:</strong>{" "}
            {fmt(sub.currentPeriodStart)}
          </p>
          <p>
            <strong>{lt("subs.detail.periodEnd")}:</strong> {fmt(sub.currentPeriodEnd)}
          </p>
          <p>
            <strong>{lt("subs.detail.created")}:</strong> {fmt(sub.createdAt)}
          </p>
          <p>
            <strong>{lt("subs.detail.updated")}:</strong> {fmt(sub.updatedAt)}
          </p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("subs.detail.paymentTitle")}</h3>
        <p>
          <strong>{lt("subs.detail.provider")}:</strong>{" "}
          <span className={`pill pill-sm ${providerBadgeClass(kind)}`}>
            {providerLabel}
          </span>
        </p>
        {sub.providerSubscriptionId && (
          <p className="muted">
            {lt("subs.detail.providerSubId")}: {sub.providerSubscriptionId}
          </p>
        )}
        <p className="hint">{lt("subs.detail.paymentNote")}</p>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("subs.detail.siblingSection")}</h3>
        {sub.siblingDiscount ? (
          <div className="form-grid">
            <p>
              <strong>{lt("subs.detail.siblingRank")}:</strong>{" "}
              {sub.siblingDiscount.childRank}
            </p>
            <p>
              <strong>{lt("subs.detail.siblingPercent")}:</strong>{" "}
              {sub.siblingDiscount.discountPercent}%
            </p>
            <p>
              <strong>{lt("subs.detail.siblingAppliedAt")}:</strong>{" "}
              {fmt(sub.siblingDiscount.appliedAt)}
            </p>
          </div>
        ) : (
          <p className="muted">{lt("subs.detail.siblingNone")}</p>
        )}
      </section>

      <section className="card">
        <h3>{lt("subs.detail.actionsSection")}</h3>
        {allowed.length === 0 ? (
          <p className="muted">{lt("subs.detail.noActions")}</p>
        ) : (
          <SubscriptionActions
            subscriptionId={sub.id}
            allowed={allowed}
            strings={actionStrings}
          />
        )}
      </section>
    </div>
  );
}
