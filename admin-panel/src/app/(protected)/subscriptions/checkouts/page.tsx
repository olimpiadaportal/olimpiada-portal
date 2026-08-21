import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { hasServiceRole } from "@/lib/supabase/admin";
import { getLocale, getT } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { listCheckoutReviews } from "@/lib/admin/checkouts";
import { localStrings } from "../labels";
import { ResolveCheckout } from "./ResolveCheckout";

// CHECKOUT REVIEW — Administrator-only.
//
// The human end of migration 127 finding 6. `needs_review` means we are holding
// a family's money and have not delivered on it, and until now it reached
// exactly one place: 013 check 118, a validation file somebody runs when they
// ALREADY suspect something. Two things changed: `checkout_alert_admins` files a
// PRIORITY 1 notification the moment such a redemption is recorded, and this
// page is where the administrator lands afterwards.
//
// IT SHOWS BOTH KINDS AND KEEPS THEM APART. A `needs_review` row is money taken
// and nothing delivered. An `applied` row carrying a note is the OTHER problem:
// the plan or package WAS delivered and a follow-up failed — the Auth-admin call
// that activates a child's login, or a payment later reversed at the bank. Two
// problems that need two different answers must not share one word, so the
// status column says which is which.
//
// NOTHING HERE GRANTS ANYTHING. The only write records what an operator did.

export default async function CheckoutReviewPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const serviceReady = hasServiceRole();
  const { rows, open, loadError } = await listCheckoutReviews();

  const kindLabel = (kind: string | null): string => {
    if (kind === "plan_start") return lt("ckrev.kind.plan_start");
    if (kind === "plan_change") return lt("ckrev.kind.plan_change");
    if (kind === "olympiad") return lt("ckrev.kind.olympiad");
    return "—";
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("ckrev.title")}</h1>
        <p className="muted">{lt("ckrev.subtitle")}</p>
        <p>
          <Link className="btn-ghost" href="/subscriptions">
            {t("manage.back")}
          </Link>
        </p>
      </div>

      {!serviceReady && <div className="price-callout">{lt("ckrev.noServiceKey")}</div>}
      {loadError && serviceReady && <div className="price-callout">{t("err.server")}</div>}

      {rows.length === 0 ? (
        <p className="muted">{lt("ckrev.empty")}</p>
      ) : (
        <>
          <p className="muted">{lt("ckrev.openCount").replace("{n}", String(open))}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{lt("ckrev.col.order")}</th>
                  <th>{lt("ckrev.col.what")}</th>
                  <th>{lt("ckrev.col.family")}</th>
                  <th>{lt("ckrev.col.amount")}</th>
                  <th>{lt("ckrev.col.reason")}</th>
                  <th>{lt("ckrev.col.decidedAt")}</th>
                  <th>{lt("ckrev.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.order}>
                    <td className="ckrev-mono">{r.order}</td>
                    <td>
                      {kindLabel(r.intentKind)}
                      <br />
                      <span className="muted">
                        {/* REFUNDED WINS OVER THE REDEMPTION STATUS. A reversal
                            on a row that was decided but delivered nothing
                            leaves redemption_status = 'needs_review', and that
                            label reads "we are holding this family's money and
                            have not delivered" — which invites the operator to
                            grant the access by hand, for money that has already
                            gone home. The payment row is the truth about the
                            money; the redemption status is only the truth about
                            the delivery. */}
                        {r.refunded
                          ? lt("ckrev.status.refunded")
                          : r.status === "needs_review"
                            ? lt("ckrev.status.needs_review")
                            : lt("ckrev.status.applied")}
                      </span>
                    </td>
                    <td>
                      {r.childName ?? "—"}
                      <br />
                      <span className="muted">{r.parentEmail ?? "—"}</span>
                    </td>
                    <td className="ckrev-mono">
                      {r.amount === null ? "—" : `${r.amount} ${r.currency}`}
                    </td>
                    {/* The machine reason, verbatim. It is an enum-shaped token
                        (expired, grade_changed, apply_failed:23514, reversed:…)
                        and translating it would make it impossible to match
                        against the ledger or the SQL that wrote it. */}
                    <td className="ckrev-mono">{r.note ?? "—"}</td>
                    <td>{r.decidedAt ? formatBakuDateTime(r.decidedAt, locale) : "—"}</td>
                    <td>
                      {r.resolved ? (
                        <span className="pill">{lt("ckrev.resolved")}</span>
                      ) : (
                        <ResolveCheckout
                          order={r.order}
                          strings={{
                            placeholder: lt("ckrev.resolvePlaceholder"),
                            submit: lt("ckrev.resolve"),
                            submitting: lt("ckrev.resolving"),
                            hint: lt("ckrev.resolveHint"),
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
