import Link from "next/link";
import { getT } from "@/i18n/server";
import AboutUs from "@/components/AboutUs";

// Stat cards use ILLUSTRATIVE placeholder numbers for the investor review.
// Replace with live figures once analytics/reporting are wired.
const STATS: { key: string; num: string; ico: "test" | "medal" | "users" | "up" }[] = [
  { key: "stats.tests", num: "500+", ico: "test" }, // placeholder
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
  const features = [
    ["home.f1Title", "home.f1Desc"],
    ["home.f2Title", "home.f2Desc"],
    ["home.f3Title", "home.f3Desc"],
    ["home.f4Title", "home.f4Desc"],
  ];
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
