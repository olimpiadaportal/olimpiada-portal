import { getT } from "@/i18n/server";
import {
  AboutHeroArt,
  StudyArt,
  FamilyArt,
  OlympiadArt,
  AnalyticsArt,
  SafetyArt,
  MissionIcon,
  OfferIcon,
  AudienceIcon,
  TrustIcon,
} from "@/components/AboutVisuals";

// Shared "About us" body — rendered by the public /about page, the in-app
// parent /help/about page and the student /child/help/about page from this
// single source. Server component: getT() resolves the about2.* copy WITH the
// admin Site-Content overrides, so CMS edits reach all three surfaces at once.
// Layout: gradient hero, intro prose, alternating story blocks (illustration +
// copy, sides swap), 4-card value grid; illustrations are original inline SVGs.

const BLOCKS = [
  { key: "b1", Art: StudyArt }, // students studying & daily practice
  { key: "b2", Art: FamilyArt }, // parent dashboard & family model
  { key: "b3", Art: OlympiadArt }, // olympiad preparation (25 server-picked questions)
  { key: "b4", Art: AnalyticsArt }, // progress tracking & analytics
  { key: "b5", Art: SafetyArt }, // secure learning platform
] as const;

const VALUES = [
  { key: "v1", Icon: MissionIcon }, // mission
  { key: "v2", Icon: OfferIcon }, // what we offer
  { key: "v3", Icon: AudienceIcon }, // who it is for
  { key: "v4", Icon: TrustIcon }, // trust & transparency
] as const;

const CHIPS = ["chip1", "chip2", "chip3"] as const;

export async function AboutContent() {
  const t = await getT();
  return (
    <div className="about2">
      <section className="about2-hero">
        <div className="about2-hero-copy">
          <span className="about2-eyebrow">{t("about2.hero.eyebrow")}</span>
          <h1>{t("about2.hero.title")}</h1>
          <p className="about2-lead">{t("about2.hero.lead")}</p>
          <div className="about2-chips">
            {CHIPS.map((c) => (
              <span className="about2-chip" key={c}>
                {t(`about2.hero.${c}`)}
              </span>
            ))}
          </div>
        </div>
        <div className="about2-hero-art">
          <AboutHeroArt />
        </div>
      </section>

      {/* Investor-approved intro prose (docx 2026-07-15) — three paragraphs
          continuing the hero lead; plain text, no new layout machinery. */}
      <section className="about2-prose">
        <p>{t("about2.hero.p2")}</p>
        <p>{t("about2.hero.p3")}</p>
        <p>{t("about2.hero.p4")}</p>
      </section>

      {BLOCKS.map(({ key, Art }, i) => (
        <section
          className={i % 2 === 1 ? "about2-block about2-rev" : "about2-block"}
          key={key}
        >
          <div className="about2-art">
            <Art />
          </div>
          <div className="about2-copy">
            <span className="about2-tag">{t(`about2.${key}.tag`)}</span>
            <h2>{t(`about2.${key}.title`)}</h2>
            <p>{t(`about2.${key}.body`)}</p>
          </div>
        </section>
      ))}

      <section className="about2-values">
        <h2>{t("about2.values.title")}</h2>
        <p className="about2-values-sub">{t("about2.values.sub")}</p>
        <div className="about2-vgrid">
          {VALUES.map(({ key, Icon }) => (
            <div className="about2-vcard" key={key}>
              <span className="about2-vico">
                <Icon />
              </span>
              <h3>{t(`about2.${key}.title`)}</h3>
              <p>{t(`about2.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
