import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getChildResolution, getParent, maySeePurchaseUi } from "@/lib/auth/session";
import { getPublicOlympiad } from "@/lib/olympiadPublic";
import { OlympiadCover } from "@/components/OlympiadCover";
import {
  OlympiadDetailsRows,
  buildPublicOlympiadRows,
  type OlympiadDetailRow,
} from "@/components/OlympiadDetails";

// PUBLIC olympiad details page (/olympiad-packages/<code>) — works signed-out.
//
// The route segment is `olympiad_packages.code`, the table's unique slug column
// (the service also accepts a raw id for legacy rows with a blank code).
//
// Everything here is INFORMATIONAL: the public surface shows the price but
// never a buy button — purchases are parent-only and happen inside the parent
// panel, and a signed-in child sees no purchase-adjacent CTA at all.
//
// States: loading (loading.tsx) · not found → notFound() · inactive /
// off-sale / sales-window-closed → also notFound() (the service's feed is the
// canonical public gate) · backend error → an explicit retry notice, so a
// transient failure never renders a misleading 404.

const PARTICIPATION_KEYS = [
  "polyPub.how1",
  "polyPub.how2",
  "polyPub.how3",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  // React-cached: shares the single fetch with the page render below.
  const res = await getPublicOlympiad(code);
  if (res.status !== "ok") return { title: "OlympIQ" };
  return {
    title: `${res.item.title} — OlympIQ`,
    description: res.item.description?.slice(0, 160) || undefined,
  };
}

export default async function PublicOlympiadDetailsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Round 51 (audit F12): a signed-in CHILD is redirected to their own
  // olympiads screen — the arena shows the same packages without prices.
  if ((await getChildResolution()).kind === "yes") redirect("/child/olympiads");

  const t = await getT();
  const [res, parent, mayPurchase, { mode }] = await Promise.all([
    getPublicOlympiad(code),
    getParent(),
    maySeePurchaseUi(),
    getPaymentModeInfo(),
  ]);

  if (res.status === "notFound") notFound();

  if (res.status === "error") {
    return (
      <section className="polydet">
        <Link className="polydet-back" href="/olympiad-packages">
          {t("polyPub.back")}
        </Link>
        <div className="price-callout">{t("polyPub.error")}</div>
      </section>
    );
  }

  const o = res.item;

  // Hide-empty rule lives in <OlympiadDetailsRows/>: a null value drops the
  // whole row. Fields the schema does not have (rules, awards, organizer) are
  // simply not listed — nothing is invented here.
  const rows = buildPublicOlympiadRows(t, o);

  // Purchases are parent-only: children get no purchase-adjacent CTA.
  // Round 50: fails CLOSED — a child OR an unresolved role gets no CTA.
  // Round 51 (audit F4): payments off → no CTA either (the DB kill switch
  // would reject the eventual purchase write anyway).
  const cta =
    !mayPurchase || mode === "off"
      ? null
      : parent
        ? { href: "/olympiads", label: t("polyPub.ctaParent") }
        : { href: "/register", label: t("polyPub.cta") };

  return (
    <section className="polydet">
      <Link className="polydet-back" href="/olympiad-packages">
        {t("polyPub.back")}
      </Link>

      <article className="polydet-card">
        <OlympiadCover url={o.coverUrl} className="polydet-cover" iconSize={72} />

        <div className="polydet-body">
          <div className="poly-chips">
            <span className="poly-chip polypub-status">
              {t("polyPub.statusOnSale")}
            </span>
            {o.subject && <span className="poly-chip">{o.subject}</span>}
            {o.gradeLabel && <span className="poly-chip">{o.gradeLabel}</span>}
          </div>

          <h1 className="polydet-title">{o.title}</h1>

          <OlympiadDetailsRows
            rows={rows}
            description={o.description}
            descriptionLabel={t("poly.det.description")}
          />

          <div className="polydet-how">
            <h2 className="polydet-how-title">{t("polyPub.howTitle")}</h2>
            <ul className="clean polydet-how-list">
              {PARTICIPATION_KEYS.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>

          {cta && (
            <div className="polydet-actions">
              <Link className="btn" href={cta.href}>
                {cta.label}
              </Link>
              <p className="polydet-note">{t("polyPub.parentOnlyNote")}</p>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
