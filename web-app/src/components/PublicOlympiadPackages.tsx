import Link from "next/link";
import { getLocale, getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectLabel } from "@/lib/subjectLabel";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";

// Public "active olympiad packages" section — ONE shared server component used
// by the landing page and the /services page. Data comes from the anon-safe
// `get_public_olympiad_packages()` RPC (server-filtered: only active + on-sale
// rows ever return; en/ru text is already az-fallback; ordered by soonest
// ending/event). No service-role anywhere — the plain anon/server client is
// enough by design.
//
// CTA auth state: a lightweight cookie-session PRESENCE check only picks the
// LINK TARGET (signed-out → /register, signed-in → /olympiads). No privilege
// is derived from it — /olympiads re-gates server-side (requireParent).

// get_public_olympiad_packages() row (migration: sale window + public listing).
type PubPkgRow = {
  id: string;
  code: string | null;
  title_az: string | null;
  title_en: string | null;
  title_ru: string | null;
  description_az: string | null;
  description_en: string | null;
  description_ru: string | null;
  price_amount: number | string | null;
  currency: string | null;
  subject_code: string | null;
  subject_name: string | null;
  grade_level: number | null;
  grade_label: string | null;
  /** Round 34: FULL target-grade set (multi-grade packages); null = legacy. */
  grade_levels: number[] | null;
  sale_ends_at: string | null;
  event_at: string | null;
  question_count: number | null;
};

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
  const locale = await getLocale();

  // Any failure degrades to the empty state — a public page must never break
  // because of this band.
  let rows: PubPkgRow[] = [];
  let signedIn = false;
  try {
    const supabase = await createClient();
    const [{ data, error }, sessionRes] = await Promise.all([
      supabase.rpc(
        "get_public_olympiad_packages",
        typeof limit === "number" ? { p_limit: limit } : undefined,
      ),
      supabase.auth.getSession(),
    ]);
    if (!error && Array.isArray(data)) {
      rows = (data as PubPkgRow[]).filter((r) => !!r?.id);
    }
    signedIn = !!sessionRes?.data?.session;
  } catch {
    // graceful: render the empty state
  }

  // Heuristic: the RPC has no total-count return, so a capped call (landing
  // uses limit=6) that comes back FULL (rows.length === limit) is treated as
  // "there may be more" and gets a "see all" link to the unlimited
  // /olympiad-packages page. A false positive (exactly `limit` packages exist
  // and no more) just links to a page showing the same rows again — harmless.
  const showSeeAll = typeof limit === "number" && rows.length === limit;

  // Localized pick with az fallback (the RPC already az-falls-back en/ru, the
  // extra ?? guards keep empty strings out either way).
  const pick = (az: string | null, en: string | null, ru: string | null): string => {
    const v = locale === "en" ? en : locale === "ru" ? ru : az;
    return (v ?? "").trim() || (az ?? "").trim();
  };

  // Sale/event deadlines are date-only, in the product's home timezone.
  const fmtDate = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Baku",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateText = (iso: string | null): string | null => {
    if (!iso) return null;
    const ts = Date.parse(iso);
    return Number.isFinite(ts) ? fmtDate.format(new Date(ts)) : null;
  };

  const ctaHref = signedIn ? "/olympiads" : "/register";
  const ctaLabel = signedIn ? t("polyPub.ctaParent") : t("polyPub.cta");

  return (
    <section className="polypub" aria-labelledby="polypub-title">
      <p className="polypub-eyebrow">{t("polyPub.eyebrow")}</p>
      <h2 className="polypub-title" id="polypub-title">
        {t("polyPub.title")}
      </h2>
      <p className="polypub-sub">{t("polyPub.sub")}</p>

      {rows.length === 0 ? (
        <div className="polypub-panel">
          <p className="polypub-empty">{t("polyPub.empty")}</p>
        </div>
      ) : (
        <div className="poly-grid polypub-grid">
          {rows.map((r) => {
            const title = pick(r.title_az, r.title_en, r.title_ru) || "—";
            const desc = pick(r.description_az, r.description_en, r.description_ru);
            const subject =
              r.subject_code || r.subject_name
                ? subjectLabel(t, r.subject_code, r.subject_name)
                : null;
            // Round 34: prefer the full multi-grade set ("4–6" chips read as
            // one range chip); the legacy single grade covers old rows.
            const levels = Array.isArray(r.grade_levels)
              ? r.grade_levels.filter((n) => Number.isInteger(n))
              : [];
            const grade =
              levels.length > 1
                ? formatGradeRangeLabel(levels, locale)
                : levels.length === 1
                  ? formatGradeLabel(levels[0], locale, r.grade_label)
                  : r.grade_level != null || r.grade_label
                    ? formatGradeLabel(r.grade_level, locale, r.grade_label)
                    : null;
            const saleEnds = dateText(r.sale_ends_at);
            const eventAt = dateText(r.event_at);
            const price = Number(r.price_amount ?? 0);
            const priceText =
              price > 0 ? `${price} ${r.currency ?? "AZN"}` : t("poly.free");
            const questions = Number(r.question_count ?? 0) || 0;
            return (
              <article className="poly-card polypub-card" key={r.id}>
                <div className="poly-body">
                  {(subject || grade) && (
                    <div className="poly-chips">
                      {subject && <span className="poly-chip">{subject}</span>}
                      {grade && grade !== "—" && (
                        <span className="poly-chip">{grade}</span>
                      )}
                    </div>
                  )}
                  <h3 className="poly-title">{title}</h3>
                  {desc && <p className="poly-desc">{desc}</p>}
                  <div className="poly-meta polypub-meta">
                    {saleEnds && (
                      <span className="poly-meta-item polypub-deadline">
                        <ClockIcon />
                        {t("polyPub.salesUntil").replace("{date}", saleEnds)}
                      </span>
                    )}
                    {eventAt && (
                      <span className="poly-meta-item">
                        <CalendarIcon />
                        {t("polyPub.eventAt").replace("{date}", eventAt)}
                      </span>
                    )}
                    <span className="poly-meta-item">
                      {questions} {t("poly.questions")}
                    </span>
                  </div>
                  <div className="poly-foot">
                    <span className="poly-price">{priceText}</span>
                    <Link className="btn polypub-cta" href={ctaHref}>
                      {ctaLabel}
                    </Link>
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
