import Link from "next/link";
import { PublicOlympiadDetailsButton } from "@/components/PublicOlympiadDetailsButton";
import { buildPublicOlympiadRows } from "@/components/OlympiadDetails";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getParent, maySeePurchaseUi } from "@/lib/auth/session";
import { getPublicOlympiads } from "@/lib/olympiadPublic";
import { OlympiadCover } from "@/components/OlympiadCover";

// Public "active olympiad packages" section — ONE shared server component used
// by the landing page, the /services page and the full /olympiad-packages
// listing. All data + filtering live in the typed service
// (`@/lib/olympiadPublic`), which is SERVER-filtered by the canonical
// on-sale predicate; this file only renders. No service-role anywhere.
//
// CTA auth state: the ROLE decides the link target — signed-out visitors get
// /register, parents get their catalog (/olympiads, itself re-gated by
// requireParent), and a signed-in CHILD gets NO purchase-adjacent CTA at all
// (children can never purchase). "Ətraflı" is always available and always
// public: it opens /olympiad-packages/<code>, which works signed-out.

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  );
}

// Round 49: the `limit` prop and its "see all" affordance were REMOVED. Change
// A deleted the landing-page band, which was the only caller that ever passed a
// limit, leaving `showSeeAll` permanently false — dead code plus three comments
// asserting the opposite. Both remaining callers (/services and the full
// /olympiad-packages listing) render the complete feed. The listing route is
// still reachable: the landing hero's "Olimpiadalara bax" button links to it.
export async function PublicOlympiadPackages() {
  const t = await getT();

  // getParent/getChild are request-cached (the public layout already resolved
  // them), so the role check costs nothing extra here.
  const [result, parent, mayPurchase, { mode }] = await Promise.all([
    getPublicOlympiads(),
    getParent(),
    maySeePurchaseUi(),
    getPaymentModeInfo(),
  ]);
  const rows = result.status === "ok" ? result.items : [];

  // Never a BUY button on a public surface: purchases are parent-only and
  // happen inside the parent panel.
  // Round 50: fails CLOSED — a child OR an unresolved role gets no CTA.
  // Round 51 (audit F4): the payment kill switch also drops the CTA — the DB
  // rejects the eventual purchase write in mode 'off'.
  const cta =
    !mayPurchase || mode === "off"
      ? null
      : parent
        ? { href: "/olympiads", label: t("polyPub.ctaParent") }
        : { href: "/register", label: t("polyPub.cta") };

  return (
    <section className="polypub" aria-labelledby="polypub-title">
      <p className="polypub-eyebrow">{t("polyPub.eyebrow")}</p>
      <h2 className="polypub-title" id="polypub-title">
        {t("polyPub.title")}
      </h2>
      <p className="polypub-sub">{t("polyPub.sub")}</p>

      {result.status === "error" ? (
        <div className="polypub-panel">
          <p className="polypub-empty">{t("polyPub.error")}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="polypub-panel">
          <p className="polypub-empty">{t("polyPub.empty")}</p>
        </div>
      ) : (
        <div className="poly-grid polypub-grid">
          {rows.map((o) => {
            const href = `/olympiad-packages/${encodeURIComponent(o.slug)}`;
            return (
              <article className="poly-card polypub-card" key={o.id}>
                <OlympiadCover url={o.coverUrl} />
                <div className="poly-body">
                  <div className="poly-chips">
                    {/* Only on-sale packages reach this feed (server-side
                        predicate), so the status chip is always "on sale". */}
                    <span className="poly-chip polypub-status">
                      {t("polyPub.statusOnSale")}
                    </span>
                    {o.subject && <span className="poly-chip">{o.subject}</span>}
                    {o.gradeLabel && (
                      <span className="poly-chip">{o.gradeLabel}</span>
                    )}
                  </div>
                  <h3 className="poly-title">
                    <Link className="polypub-title-link" href={href}>
                      {o.title}
                    </Link>
                  </h3>
                  {o.description && <p className="poly-desc">{o.description}</p>}
                  <div className="poly-meta polypub-meta">
                    {o.saleEndText && (
                      <span className="poly-meta-item polypub-deadline">
                        <ClockIcon />
                        {t("polyPub.salesUntil").replace("{date}", o.saleEndText)}
                      </span>
                    )}
                    {o.eventText && (
                      <span className="poly-meta-item">
                        <CalendarIcon />
                        {t("polyPub.eventAt").replace("{date}", o.eventText)}
                      </span>
                    )}
                    {o.questionCount > 0 && (
                      <span className="poly-meta-item">
                        {o.questionCount} {t("poly.questions")}
                      </span>
                    )}
                  </div>
                  <div className="poly-foot">
                    <span className="poly-price">{o.priceText}</span>
                    <div className="poly-foot-actions">
                      {/* Round 49 (owner): Ətraflı opens a MODAL here, exactly
                          like the parent catalog — it must not navigate away
                          from the listing. The standalone details page still
                          exists for direct links / SEO (the title links to it). */}
                      <PublicOlympiadDetailsButton
                        title={o.title}
                        rows={buildPublicOlympiadRows(t, o)}
                        description={o.description}
                        labels={{
                          open: t("poly.details"),
                          close: t("drawer.close"),
                          description: t("poly.det.description"),
                        }}
                      />
                      {cta && (
                        <Link className="btn polypub-cta" href={cta.href}>
                          {cta.label}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

    </section>
  );
}
