import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale } from "@/i18n/server";
import { getOrderDetail } from "@/lib/admin/finance";
import {
  deliveryTone,
  moneyTone,
  type DeliveryState,
  type MoneyState,
} from "@/lib/admin/finance-shape";
import { formatMoney } from "@/lib/formatMoney";
import { localStrings } from "../../labels";

// One order: the (session, payment) pair and the event narrative behind it.
//
// WHY THE EVENT LIST MATTERS MORE THAN IT LOOKS. A `cb:` row means the bank's
// SIGNED callback verified. Only a `recon:` row, with no `cb:` sibling, means
// the callback never verified and the reconcile sweep rescued the payment —
// which is what a wrong MPI public key looks like from the outside. That
// distinction is invisible in `payments.status`, which says "succeeded" either
// way.
//
// The bank references sit behind a disclosure, not in the open: they are what a
// dispute needs, and also what a screenshot should not casually carry.
export default async function FinanceOrderPage({
  params,
}: {
  params: Promise<{ order: string }>;
}) {
  await requireAdmin(); // authorize FIRST
  const lt = localStrings(await getLocale());
  const locale = await getLocale();
  const { order } = await params;

  const detail = await getOrderDetail(order);

  if (!detail.found || !detail.row) {
    return (
      <div className="page finance-page">
        <div className="page-head">
          <h1>{lt("fin.order.title")}</h1>
        </div>
        <p className="muted">
          {detail.loadError ? lt("fin.loadError") : lt("fin.order.notFound")}
        </p>
        <Link className="btn-ghost" href="/payments">
          {lt("fin.title")}
        </Link>
      </div>
    );
  }

  const r = detail.row;

  return (
    <div className="page finance-page">
      <div className="page-head">
        <h1 className="fin-mono">{r.order}</h1>
        <div className="row-actions">
          <Link className="btn-ghost" href="/payments">
            {lt("fin.title")}
          </Link>
          {detail.ownerParentProfileId && (
            <Link
              className="btn-ghost"
              href={`/payments/family/${detail.ownerParentProfileId}`}
            >
              {lt("fin.order.backToFamily")}
            </Link>
          )}
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0 }}>
          <span className={`pill pill-sm ${moneyTone(r.money as MoneyState)}`}>
            {lt(`fin.money.${r.money}`)}
          </span>{" "}
          <span className={`pill pill-sm ${deliveryTone(r.delivery as DeliveryState)}`}>
            {lt(`fin.delivery.${r.delivery}`)}
          </span>
        </p>
        {r.needsAttention && (
          <p className="form-error">{lt("fin.flag.undelivered")}</p>
        )}
        <p>
          {lt("fin.col.amount")}: <strong>{formatMoney(r.amount, r.currency, locale)}</strong>
        </p>
        <p className="muted">
          {lt("fin.col.date")}: {r.createdAt.slice(0, 16).replace("T", " ")}
          {r.paidAt && <> · {r.paidAt.slice(0, 16).replace("T", " ")}</>}
        </p>
        {/* Never the words "settled" or "final": beyond 24 hours the gateway
            stops answering a status query, and a card-scheme chargeback arrives
            weeks later and is never seen here. */}
        <p className="hint">{lt("fin.note.settledWindow")}</p>
        {r.redemptionNote && <p className="muted">{r.redemptionNote}</p>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{lt("fin.order.events")}</h2>
        {detail.events.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>—</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {detail.events.map((e) => (
              <li key={e.eventId} style={{ marginBottom: 10 }}>
                <span className="fin-mono">{e.eventId}</span>{" "}
                <span className="muted">{e.createdAt.slice(0, 16).replace("T", " ")}</span>
                {e.fields.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary>{lt("fin.order.refs")}</summary>
                    <p className="muted" style={{ fontSize: "0.82rem" }}>
                      {lt("fin.order.refsNote")}
                    </p>
                    <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                      {e.fields.map((f) => (
                        <li key={f.label}>
                          {f.label}: <span className="fin-mono">{f.value}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
