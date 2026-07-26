import Link from "next/link";
import { getT } from "@/i18n/server";
import { getChild, getParent } from "@/lib/auth/session";
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

export async function PublicOlympiadPackages({
  limit,
}: { limit?: number } = {}) {
  const t = await getT();

  // getParent/getChild are request-cached (the public layout already resolved
  // them), so the role check costs nothing extra here.
  const [result, parent, child] = await Promise.all([
    getPublicOlympiads(limit),
    getParent(),
    getChild(),
  ]);
  const rows = result.status === "ok" ? result.items : [];

  // Heuristic: the feed has no total-count return, so a capped call (landing
  // uses limit=6) that comes back FULL (rows.length === limit) is treated as
  // "there may be more" and gets a "see all" link to the unlimited
  // /olympiad-packages page. A false positive (exactly `limit` packages exist
  // and no more) just links to a page showing the same rows again — harmless.
  const showSeeAll = typeof limit === "number" && rows.length === limit;

  // Never a BUY button on a public surface: purchases are parent-only and
  // happen inside the parent panel.
  const cta = child
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
                      {/* Same "Ətraflı" pattern as the parent catalog card —
                          here it navigates to the public details page. */}
                      <Link className="poly-details-btn" href={href}>
                        {t("poly.details")}
                      </Link>
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

      {showSeeAll && (
        <div className="polypub-more">
          <Link className="btn-ghost" href="/olympiad-packages">
            {t("polyPub.seeAll")}
          </Link>
        </div>
      )}
    </section>
  );
}
