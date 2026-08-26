import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale } from "@/i18n/server";
import { getFamilyFinance } from "@/lib/admin/finance";
import {
  deliveryTone,
  moneyTone,
  type DeliveryState,
  type MoneyState,
} from "@/lib/admin/finance-shape";
import { formatMoney } from "@/lib/formatMoney";
import { localStrings } from "../../labels";

// One family's money — and, beside it, the access that had no money behind it.
//
// THE SECOND PANEL IS NOT DECORATION. `has_subject_access` ORs three independent
// sources and only one of them has a producer row, so a child can hold perfectly
// legitimate access with no payment anywhere: a comped grant, a school licence,
// an admin free-access window, or the 1-day free trial. Without that panel,
// "no payment found" reads as a defect and the agent goes looking for a bug that
// does not exist.
export default async function FinanceFamilyPage({
  params,
}: {
  params: Promise<{ parentId: string }>;
}) {
  await requireAdmin(); // authorize FIRST
  const lt = localStrings(await getLocale());
  const locale = await getLocale();
  const { parentId } = await params;

  const fam = await getFamilyFinance(parentId);

  if (!fam.found) {
    return (
      <div className="page finance-page">
        <div className="page-head">
          <h1>{lt("fin.family.title")}</h1>
        </div>
        <p className="muted">{fam.loadError ? lt("fin.loadError") : lt("fin.family.notFound")}</p>
        <Link className="btn-ghost" href="/payments">
          {lt("fin.title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="page finance-page">
      <div className="page-head">
        <h1>{fam.email || fam.displayName || lt("fin.family.title")}</h1>
        {fam.displayName && fam.email && <p className="muted">{fam.displayName}</p>}
        <Link className="btn-ghost" href="/payments">
          {lt("fin.title")}
        </Link>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{lt("fin.family.children")}</h2>
        {fam.children.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>—</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {fam.children.map((c) => (
              <li key={c.profileId}>
                {c.name || c.profileId}
                {/* Drill-down only: shown to the parent and the child already,
                    but it is half a login credential, so never in a list. */}
                {c.childUniqueId && <span className="muted"> · {c.childUniqueId}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{lt("fin.family.orders")}</h2>
        {fam.orders.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{lt("fin.family.noOrders")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{lt("fin.col.order")}</th>
                  <th>{lt("fin.col.date")}</th>
                  <th>{lt("fin.col.amount")}</th>
                  <th>{lt("fin.col.money")}</th>
                  <th>{lt("fin.col.delivery")}</th>
                </tr>
              </thead>
              <tbody>
                {fam.orders.map((o) => (
                  <tr key={o.order}>
                    <td className="nowrap">
                      <Link className="fin-mono" href={`/payments/order/${o.order}`}>
                        {o.order}
                      </Link>
                      {/* The state this whole view exists to surface. Stated on
                          the row, not left to be inferred from two pills. */}
                      {o.needsAttention && (
                        <div className="form-error" style={{ fontSize: "0.82rem" }}>
                          {lt("fin.flag.undelivered")}
                        </div>
                      )}
                    </td>
                    <td className="nowrap">{o.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className="nowrap">
                      {formatMoney(o.amount, o.currency, locale)}
                    </td>
                    <td className="nowrap">
                      <span className={`pill pill-sm ${moneyTone(o.money as MoneyState)}`}>
                        {lt(`fin.money.${o.money}`)}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className={`pill pill-sm ${deliveryTone(o.delivery as DeliveryState)}`}>
                        {lt(`fin.delivery.${o.delivery}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{lt("fin.family.grants")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{lt("fin.family.grantsNote")}</p>
        {fam.grants.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>—</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {fam.grants.map((g, i) => (
              <li key={i}>
                {g.label || "—"} · <strong>{g.source}</strong>
                {g.endsAt && <span className="muted"> · {g.endsAt.slice(0, 10)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
