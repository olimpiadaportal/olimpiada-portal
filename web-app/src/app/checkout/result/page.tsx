import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { safeResultKind } from "@/lib/payments/azericard/resultPage";

// WHERE THE BANK SENDS A PARENT BACK TO.
//
// The callback route (app/api/payments/azericard/callback) records the payment
// and then 303s a PLAN checkout here. The owner's protocol test keeps landing on
// the bare, chrome-free page inside that route instead — this one exists because
// a parent mid-purchase needs a way back into the product, and "you can close
// this window" is a dead end for them.
//
// IT REFLECTS NOTHING. Its only input is `status`, whitelisted down to the three
// literal ResultKind strings by safeResultKind() before it is used, and every
// character it renders comes from our own trilingual catalog. No order id, no
// amount, no reference and no gateway text reaches this page, so there is no
// path from an attacker-controlled callback field into rendered HTML — and
// nothing here is worth forging a link to.
//
// IT TALKS ABOUT MONEY, NEVER ABOUT ACCESS. The AzeriCard layer grants nothing
// (docs/STORE_PAYMENTS_COMPLIANCE.md section 4.1 puts access in `entitlements`),
// so this page says a payment was recorded, is not yet confirmed, or did not go
// through — and never that a subject was unlocked or taken away. A page that
// promised access the payment layer does not grant would be wrong in exactly the
// way a parent would notice.
//
// PUBLIC ON PURPOSE, and safe to be: it is landed on from a CROSS-SITE POST, so
// requiring a session would send a parent whose cookie lapsed to the login page
// with their result lost. It personalises nothing, so there is nothing to
// protect. No site nav, no price and no purchase call to action — a store
// reviewer following the return URL finds a result notice and a link home
// (section 5 DO-6).

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  // Anything unrecognised resolves to PENDING, never "ok": an unreadable result
  // must not be reported to a payer as a completed payment.
  const kind = safeResultKind(raw);
  const t = await getT();

  return (
    <section className="prose" style={{ maxWidth: 520, margin: "48px auto", padding: "0 20px" }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{t(`checkout.res.${kind}.title`)}</h1>
        <p>{t(`checkout.res.${kind}.body`)}</p>
        {kind === "pending" && <p className="muted">{t("checkout.res.pending.hint")}</p>}
        <Link className="btn" href="/dashboard">
          {t("checkout.res.back")}
        </Link>
      </div>
    </section>
  );
}
