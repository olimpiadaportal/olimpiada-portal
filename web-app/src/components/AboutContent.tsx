import { getT } from "@/i18n/server";
import { CmsProse } from "@/components/CmsProse";
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
  TeamIcon,
} from "@/components/AboutVisuals";

// Shared "About us" body — rendered by the public /about page, the in-app
// parent /help/about page and the student /child/help/about page from this
// single source. Server component: getT() resolves the about2.* copy WITH the
// admin Site-Content overrides, so CMS edits reach all three surfaces at once.
// Layout: gradient hero, intro prose, alternating story blocks (illustration +
// copy, sides swap), 4-card value grid, team/legal card pair; illustrations are
// original inline SVGs.
//
// Every prose string goes through <CmsProse>, so an admin who types blank lines
// in the Website-Content editor gets real paragraphs instead of one run-on
// block. It emits text nodes + <br/> only — no HTML is ever parsed.

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
          <CmsProse className="about2-lead" text={t("about2.hero.lead")} />
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
        <CmsProse text={t("about2.hero.p2")} />
        <CmsProse text={t("about2.hero.p3")} />
        <CmsProse text={t("about2.hero.p4")} />
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
            <CmsProse text={t(`about2.${key}.body`)} />
          </div>
        </section>
      ))}

      <section className="about2-values">
        <h2>{t("about2.values.title")}</h2>
        <CmsProse className="about2-values-sub" text={t("about2.values.sub")} />
        <div className="about2-vgrid">
          {VALUES.map(({ key, Icon }) => (
            <div className="about2-vcard" key={key}>
              <span className="about2-vico">
                <Icon />
              </span>
              <h3>{t(`about2.${key}.title`)}</h3>
              <CmsProse text={t(`about2.${key}.body`)} />
            </div>
          ))}
        </div>
      </section>

      {/* Team & legal info — a continuation of the value grid, not a new visual
          language: both cards keep .about2-vcard, so padding, radius, border,
          shadow and the hover lift are inherited. Desktop = copy + metadata side
          by side; one column from 900px down. The address is a real <address>
          (contact details of the organisation publishing this site) and its
          three lines come from the single CMS string via <CmsProse>. */}
      <section className="about2-team">
        <div className="about2-vcard about2-tcard">
          <span className="about2-vico">
            <TeamIcon />
          </span>
          <h2>{t("about2.team.title")}</h2>
          <CmsProse className="about2-tsub" text={t("about2.team.sub")} />
          <CmsProse text={t("about2.team.body")} />
        </div>
        <div className="about2-vcard about2-tmeta">
          <h3 className="about2-tag">{t("about2.team.addrLabel")}</h3>
          <CmsProse as="address" className="about2-taddr" text={t("about2.team.addrValue")} />
        </div>
      </section>
    </div>
  );
}
