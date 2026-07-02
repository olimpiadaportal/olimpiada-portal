// About Us section for the public home page.
// Server component: translated strings are passed in via getT() from the page.
// All illustrations are inline SVG / CSS — NO external image files.
// Uses L1 contract classes: .about-hero/.about-hero-art/.about-block/.about-illus/
// .about-values/.value-card/.value-ico and L1 i18n keys about.hero.*/about.vision.*/
// about.values.title/about.value1..4.*.

import type { T } from "@/i18n/server";

// Decorative hero illustration (learning / growth theme).
function HeroArt() {
  return (
    <svg
      className="about-hero-art"
      viewBox="0 0 240 200"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="au-hero-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent-2, var(--accent))" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="100" r="88" fill="url(#au-hero-g)" opacity="0.12" />
      {/* graduation cap */}
      <path
        d="M120 52 L188 84 L120 116 L52 84 Z"
        fill="url(#au-hero-g)"
      />
      <path
        d="M84 100 L84 132 Q120 152 156 132 L156 100"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line x1="188" y1="84" x2="188" y2="128" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="188" cy="132" r="6" fill="var(--accent)" />
      {/* rising bars = growth */}
      <rect x="176" y="150" width="10" height="18" rx="3" fill="var(--accent)" opacity="0.6" />
      <rect x="192" y="140" width="10" height="28" rx="3" fill="var(--accent)" opacity="0.8" />
      <rect x="208" y="128" width="10" height="40" rx="3" fill="var(--accent)" />
    </svg>
  );
}

// Small block illustration for the vision block (compass / direction).
function VisionArt() {
  return (
    <svg
      className="about-illus"
      viewBox="0 0 120 120"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--accent)" strokeWidth="6" opacity="0.35" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray="70 220" />
      <polygon points="60,34 72,60 60,54 48,60" fill="var(--accent)" />
      <polygon points="60,86 48,60 60,66 72,60" fill="var(--accent)" opacity="0.5" />
      <circle cx="60" cy="60" r="6" fill="var(--accent)" />
    </svg>
  );
}

type ValueIco = "target" | "spark" | "shield" | "chart";

function ValueIcon({ kind }: { kind: ValueIco }) {
  const common = {
    className: "value-ico",
    viewBox: "0 0 48 48",
    role: "img" as const,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };
  switch (kind) {
    case "target":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="3" fill="currentColor" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path
            d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z"
            fill="currentColor"
          />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path
            d="M24 6 L40 12 V24 C40 33 33 40 24 43 C15 40 8 33 8 24 V12 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M17 24 L22 29 L32 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M8 40 H42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <rect x="12" y="26" width="7" height="12" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="22" y="18" width="7" height="20" rx="2" fill="currentColor" opacity="0.8" />
          <rect x="32" y="10" width="7" height="28" rx="2" fill="currentColor" />
        </svg>
      );
  }
}

export default function AboutUs({ t }: { t: T }) {
  const values: { key: string; ico: ValueIco }[] = [
    { key: "value1", ico: "target" },
    { key: "value2", ico: "spark" },
    { key: "value3", ico: "shield" },
    { key: "value4", ico: "chart" },
  ];

  return (
    <section className="about-hero">
      <div className="about-block">
        <div>
          <h2>{t("about.hero.title")}</h2>
          <p className="lead">{t("about.hero.body")}</p>
        </div>
        <HeroArt />
      </div>

      <div className="about-block about-block-reverse">
        <VisionArt />
        <div>
          <h2>{t("about.vision.title")}</h2>
          <p>{t("about.vision.body")}</p>
        </div>
      </div>

      <div>
        <h2 className="about-values-title">{t("about.values.title")}</h2>
        <div className="about-values">
          {values.map(({ key, ico }) => (
            <div className="value-card" key={key}>
              <ValueIcon kind={ico} />
              <strong>{t(`about.${key}.title`)}</strong>
              <p className="muted">{t(`about.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
