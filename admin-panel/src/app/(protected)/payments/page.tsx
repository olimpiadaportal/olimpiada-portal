import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale } from "@/i18n/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { getFinanceAttention, searchFamilies } from "@/lib/admin/finance";
import { classifySearch } from "@/lib/admin/finance-shape";
import { localStrings } from "./labels";

// Payment support — the landing.
//
// WHY A SEARCH BOX AND NOT A PAYMENTS LIST. A support case never starts from an
// order id, because the platform never gives anyone one: the result page
// withholds it, the parent invoices panel is an empty state, and the bank SMS
// descriptor is deliberately generic. What actually arrives is a parent email,
// a child's 8-digit id (the one identifier a child can read off their own
// screen), a name, or a date and an amount. So the landing resolves an
// identifier to a FAMILY.
//
// WHY NOT A REVENUE SUMMARY. It cannot be grounded: renewals are manual by
// owner decision, production has zero customer sales, and the `payments` flag is
// off. A dashboard of zeros teaches nobody anything and invites a "revenue"
// reading of protocol-test rows.
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin(); // authorize FIRST — the layout only checks panel access
  const lt = localStrings(await getLocale());
  const serviceReady = hasServiceRole();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = first(sp.q).slice(0, 120);

  const attention = await getFinanceAttention();
  const results = q.trim().length >= 2 ? await searchFamilies(q) : [];
  // An 8-digit term is BOTH a child id and a plausible order, so the order
  // shortcut is offered beside the family results rather than replacing them.
  const shapes = classifySearch(q);

  return (
    <div className="page finance-page">
      <div className="page-head">
        <h1>{lt("fin.title")}</h1>
        <p className="muted">{lt("fin.subtitle")}</p>
      </div>

      {!serviceReady && <p className="form-error">{lt("fin.serviceMissing")}</p>}

      {/* A live campaign answers every access question at once. Said at the top
          so nobody hunts for a payment that was never made. */}
      {attention.paymentMode === "giveaway" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>{lt("fin.giveaway.banner")}</strong>
        </div>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{lt("fin.attention.title")}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          <li>
            {lt("fin.attention.mode")}: <strong>{attention.paymentMode}</strong>
          </li>
          <li>
            {lt("fin.attention.undelivered")}: <strong>{attention.undelivered}</strong>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              {lt("fin.attention.undeliveredNote")}
            </div>
          </li>
          <li>
            {lt("fin.attention.reviews")}: <strong>{attention.openReviews}</strong>{" "}
            <Link href="/subscriptions/checkouts">{lt("fin.attention.reviewsLink")}</Link>
          </li>
        </ul>
      </section>

      <form method="get" className="audit2-filter" style={{ marginBottom: 16 }}>
        <label htmlFor="fin-q">{lt("fin.search.label")}</label>
        <input id="fin-q" type="text" name="q" defaultValue={q} maxLength={120} />
        <button type="submit" className="btn">
          {lt("fin.search.button")}
        </button>
      </form>

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="muted">{lt("fin.search.hint")}</p>
      )}

      {shapes.includes("order") && (
        <p>
          <Link href={`/payments/order/${encodeURIComponent(q.trim())}`}>
            {lt("fin.order.title")}: {q.trim()}
          </Link>
        </p>
      )}

      <section className="card">
        {results.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {q.trim().length >= 2 ? lt("fin.search.empty") : lt("fin.search.hint")}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{lt("fin.family.title")}</th>
                  <th>{lt("fin.family.children")}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.parentProfileId}>
                    <td>
                      <Link href={`/payments/family/${r.parentProfileId}`}>
                        {r.email || r.displayName || r.parentProfileId}
                      </Link>
                      {r.displayName && r.email && (
                        <div className="muted">{r.displayName}</div>
                      )}
                    </td>
                    {/* Names only. The 8-digit id is half a login credential, so
                        it appears on the drill-down and never in a list. */}
                    <td>{r.children.map((c) => c.name).filter(Boolean).join(", ") || "—"}</td>
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
