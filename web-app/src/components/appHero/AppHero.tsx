import Link from "next/link";
import type { T } from "@/i18n/server";
import { APP_SCREENS, APP_STORE_URL, PLAY_STORE_URL, SCREEN_INTERVAL_MS } from "@/lib/appShowcase";
import { AndroidComingSoon, AppStoreButton, GooglePlayButton } from "./StoreButtons";
import { PhoneShowcase, type ShowcaseCard } from "./PhoneShowcase";
import s from "./appHero.module.css";

// The landing page's first screen: the OlympIQ mobile app as a product.
//
// Server-rendered. Every string is translated here and handed down, so the one
// client component (PhoneShowcase) ships no i18n catalogue and no copy logic.

type Props = {
  t: T;
  /** Where "my panel" goes for a signed-in visitor, or null when signed out. */
  panelHref: string | null;
  /** A signed-in CHILD — see the App Store note below. */
  isChild: boolean;
  /** Anchor of the section the secondary CTA scrolls to. */
  exploreId: string;
};

const CARDS: { icon: ShowcaseCard["icon"]; key: string }[] = [
  { icon: "olympiad", key: "olympiads" },
  { icon: "progress", key: "progress" },
  { icon: "news", key: "news" },
];

/** A CSS custom property for the entrance stagger, without a type cast per call. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function AppHero({ t, panelHref, isChild, exploreId }: Props) {
  const screens = APP_SCREENS.map((screen) => ({
    src: screen.src,
    width: screen.width,
    height: screen.height,
    alt: t(screen.altKey),
    topColor: screen.topColor,
  }));
  const cards = CARDS.map(({ icon, key }) => ({
    icon,
    title: t(`appHero.card.${key}.title`),
    body: t(`appHero.card.${key}.body`),
  }));

  return (
    <section className={s.hero} aria-labelledby="app-hero-title">
      <div className={`${s.backdrop} ${s.late}`} aria-hidden="true">
        <span className={s.grid} />
        <span className={s.glowA} />
        <span className={s.glowB} />
      </div>

      <div className={s.copy}>
        <p className={`${s.eyebrow} ${s.rise}`} style={delay(0)}>
          <span className={s.eyebrowDot} aria-hidden="true" />
          {t("appHero.eyebrow")}
        </p>
        <h1 id="app-hero-title" className={`${s.title} ${s.rise}`} style={delay(60)}>
          {t("appHero.title")} <span className={s.titleAccent}>{t("appHero.titleAccent")}</span>
        </h1>
        <p className={`${s.lead} ${s.rise}`} style={delay(140)}>
          {t("appHero.lead")}
        </p>

        <div className={`${s.actions} ${s.rise}`} style={delay(220)}>
          {/* A signed-in CHILD gets no App Store link. The listing shows the
              app's in-app purchase prices, and this site already withholds
              every priced listing from a child session (the "Olimpiadalara bax"
              hero link, Round 51). A child's way into the app is their parent;
              their way forward here is their own panel. */}
          {isChild && panelHref ? (
            <Link className={s.primary} href={panelHref}>
              {t("nav.myPanel")}
            </Link>
          ) : (
            <AppStoreButton
              href={APP_STORE_URL}
              kicker={t("appHero.appStore.kicker")}
              label={t("appHero.appStore.label")}
              ariaLabel={t("appHero.appStore.aria")}
            />
          )}
          {!isChild && PLAY_STORE_URL && (
            <GooglePlayButton
              href={PLAY_STORE_URL}
              kicker={t("appHero.play.kicker")}
              label={t("appHero.play.label")}
              ariaLabel={t("appHero.play.aria")}
            />
          )}
          <a className={s.secondary} href={`#${exploreId}`}>
            {t("appHero.explore")}
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {!PLAY_STORE_URL && <AndroidComingSoon lead={t("appHero.android.lead")} rest={t("appHero.android.rest")} />}
      </div>

      <PhoneShowcase
        screens={screens}
        cards={cards}
        intervalMs={SCREEN_INTERVAL_MS}
        labels={{
          carousel: t("appHero.carousel.label"),
          slide: t("appHero.carousel.slide"),
          show: t("appHero.carousel.show"),
        }}
      />
    </section>
  );
}
