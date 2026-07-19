import Link from "next/link";
import { getT, getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "@/lib/flags";
import { formatGradeLabel } from "@/lib/gradeLabel";
import AboutUs from "@/components/AboutUs";
import { PublicOlympiadPackages } from "@/components/PublicOlympiadPackages";

// get_public_leaderboard row (migration 058): global all-time points top-10,
// names pre-anonymized server-side ("Şagird XXXX") — rendered verbatim.
type PubLbRow = {
  rank: number;
  display_name: string;
  city: string | null;
  district: string | null;
  school: string | null;
  grade_level: number | null;
  value: number;
};

// Stat cards use ILLUSTRATIVE placeholder numbers (investor-reviewed copy,
// docx 2026-07-15). Replace with live figures once analytics/reporting are wired.
const STATS: { key: string; num: string; ico: "test" | "medal" | "users" | "up" }[] = [
  { key: "stats.tests", num: "25,000+", ico: "test" }, // placeholder
  { key: "stats.olympiads", num: "60+", ico: "medal" }, // placeholder
  { key: "stats.students", num: "3,000+", ico: "users" }, // placeholder
  { key: "stats.successRate", num: "95%", ico: "up" }, // placeholder
];

function StatIcon({ kind }: { kind: "test" | "medal" | "users" | "up" }) {
  const common = {
    className: "stat-ico",
    viewBox: "0 0 32 32",
    role: "img" as const,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };
  switch (kind) {
    case "test":
      return (
        <svg {...common}>
          <rect x="7" y="4" width="18" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M11 12 H21 M11 17 H21 M11 22 H17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "medal":
      return (
        <svg {...common}>
          <circle cx="16" cy="19" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M11 12 L8 3 M21 12 L24 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M16 15 L17.5 18 L21 18.5 L18.5 21 L19 24.5 L16 22.8 L13 24.5 L13.5 21 L11 18.5 L14.5 18 Z" fill="currentColor" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="22" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M5 26 C5 20 19 20 19 26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M20 26 C20 22 27 22 27 26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "up":
      return (
        <svg {...common}>
          <path d="M5 22 L13 14 L18 19 L27 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 8 H27 V15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export default async function HomePage() {
  const t = await getT();
  const locale = await getLocale();
  const features = [
    ["home.f1Title", "home.f1Desc"],
    ["home.f2Title", "home.f2Desc"],
    ["home.f3Title", "home.f3Desc"],
    ["home.f4Title", "home.f4Desc"],
  ];

  // Public leaderboard band (gated by the same `leaderboard` flag as the
  // in-app boards). Fetched with the ANON server client — the RPC is
  // anon-executable by design (hard-capped top-10, pre-anonymized names), so
  // logged-out visitors see it too. Any error degrades to the empty state —
  // the landing page must never break because of the board.
  const lbOn = await isFeatureEnabled("leaderboard");
  let lbRows: PubLbRow[] = [];
  if (lbOn) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("get_public_leaderboard", {
        p_limit: 10,
      });
      if (!error && Array.isArray(data)) {
        lbRows = (data as PubLbRow[]).filter((r) => !!r);
      }
    } catch {
      // graceful: render the empty state
    }
  }
  // Mobile context line (≤760px hides the context columns via .lb-ctx-col).
  const lbCtxOf = (r: PubLbRow): string =>
    [
      r.city?.trim() || null,
      r.district?.trim() || null,
      r.school?.trim() || null,
      r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
    ]
      .filter((p): p is string => !!p)
      .join(" · ");

  return (
    <>
      <section className="hero">
        <h1>{t("home.heroTitle")}</h1>
        <p className="lead">{t("home.heroLead")}</p>
        <div className="site-cta" style={{ marginTop: 16 }}>
          <Link className="btn" href="/register">
            {t("home.ctaStart")}
          </Link>
          <Link className="btn-ghost" href="/subjects">
            {t("home.ctaSubjects")}
          </Link>
        </div>
      </section>

      {/* Public leaderboard — top-10 global all-time points, anonymized
          server-side. Shows ~5 rows; rows 6–10 scroll INTERNALLY under the
          sticky header (reused .lb-scroll/.lb-table + landing height cap). */}
      {lbOn && (
        <section className="pub-lb" aria-labelledby="pub-lb-title">
          <h2 className="pub-lb-title" id="pub-lb-title">
            {t("pub.lb.title")}
          </h2>
          <p className="pub-lb-sub">{t("pub.lb.sub")}</p>
          <div className="pub-lb-panel">
            {lbRows.length === 0 ? (
              <p className="pub-lb-empty">{t("pub.lb.empty")}</p>
            ) : (
              <div className="lb-scroll pub-lb-scroll">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>{t("lb.colNo")}</th>
                      <th>{t("lb.colStudent")}</th>
                      <th className="lb-ctx-col">{t("lb.colCity")}</th>
                      <th className="lb-ctx-col">{t("lb.colDistrict")}</th>
                      <th className="lb-ctx-col">{t("lb.colSchool")}</th>
                      <th className="lb-ctx-col">{t("lb.colGrade")}</th>
                      <th className="num">{t("lb.colPoints")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbRows.map((r) => {
                      const ctx = lbCtxOf(r);
                      return (
                        <tr key={r.rank}>
                          <td className="lb-rank">{r.rank}</td>
                          <td>
                            <span className="plb-part-name">
                              {(r.display_name ?? "").trim() || "—"}
                            </span>
                            {ctx && <span className="lb-part-ctx">{ctx}</span>}
                          </td>
                          <td className="lb-ctx-col">{r.city?.trim() || "—"}</td>
                          <td className="lb-ctx-col">{r.district?.trim() || "—"}</td>
                          <td className="lb-ctx-col">{r.school?.trim() || "—"}</td>
                          <td className="lb-ctx-col">
                            {formatGradeLabel(r.grade_level, locale)}
                          </td>
                          <td className="num plb-val">{Math.round(Number(r.value))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid">
        {features.map(([titleKey, descKey]) => (
          <div className="card" key={titleKey}>
            <strong>{t(titleKey)}</strong>
            <p className="muted">{t(descKey)}</p>
          </div>
        ))}
      </div>

      {/* Stat cards band — illustrative placeholder figures (see STATS above). */}
      <section>
        <h2 className="stat-title">{t("stats.title")}</h2>
        <div className="stat-grid">
          {STATS.map((s) => (
            <div className="stat-card" key={s.key}>
              <StatIcon kind={s.ico} />
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{t(s.key)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Active olympiad packages (public listing) — the shared band the
          /services page renders below its plans. The landing has no pricing
          section of its own, so it sits directly below the offer/stats band.
          Capped to 6 rows here; a full page shows a "see all" link to the
          unlimited /olympiad-packages page (see the component's heuristic
          comment). */}
      <PublicOlympiadPackages limit={6} />

      {/* usp-values-scope: CSS scope for the redesigned "What sets us apart"
          (about.values) card grid. The section markup lives in
          components/AboutUs.tsx; this wrapper only namespaces the usp-
          overrides in globals.css and carries no styles of its own. */}
      <div className="usp-values-scope">
        <AboutUs t={t} />
      </div>
    </>
  );
}
