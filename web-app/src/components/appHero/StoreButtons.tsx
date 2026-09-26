import s from "./appHero.module.css";

// Store download links for the landing-page app showcase. Server-safe: no
// hooks, no state — the copy arrives already translated.

type StoreButtonProps = {
  href: string;
  /** Small upper line, e.g. "Download on the". */
  kicker: string;
  /** Large lower line, e.g. "App Store". */
  label: string;
  /** Full sentence for assistive tech, including that it opens a new tab. */
  ariaLabel: string;
};

/** The Apple mark (Simple Icons, CC0). Decorative: the link carries the label. */
function AppleGlyph() {
  return (
    <svg className={s.storeGlyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

/** A four-colour play triangle, drawn rather than imported (strict CSP). */
function PlayGlyph() {
  return (
    <svg className={s.storeGlyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#00d7fe" d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.3-.6-.8-.6-1.3V3.1c0-.5.2-1 .6-1.3z" />
      <path fill="#ffce00" d="m17 8.3 3.3 1.9c1.2.7 1.2 2.9 0 3.6L17 15.7 13.4 12z" />
      <path fill="#ff3a44" d="M17 15.7 5.2 22.5c-.6.3-1.2.2-1.6-.3L13.4 12z" />
      <path fill="#00f076" d="M3.6 1.8c.4-.5 1-.6 1.6-.3L17 8.3 13.4 12z" />
    </svg>
  );
}

function StoreLink({ href, kicker, label, ariaLabel, glyph }: StoreButtonProps & { glyph: React.ReactNode }) {
  return (
    // A download badge leaves the site, so it opens a new tab; noopener +
    // noreferrer per the web-app security rules for every target="_blank".
    <a className={s.store} href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel}>
      {glyph}
      <span className={s.storeText}>
        <span className={s.storeKicker}>{kicker}</span>
        <span className={s.storeLabel}>{label}</span>
      </span>
    </a>
  );
}

export function AppStoreButton(props: StoreButtonProps) {
  return <StoreLink {...props} glyph={<AppleGlyph />} />;
}

export function GooglePlayButton(props: StoreButtonProps) {
  return <StoreLink {...props} glyph={<PlayGlyph />} />;
}

/** A stylised Android head — decorative. */
function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M4 18a8 8 0 0 1 16 0z" />
      <path d="M7.4 7.6 5.8 5.2M16.6 7.6l1.6-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="14" r="1.1" fill="var(--bg)" />
      <circle cx="15" cy="14" r="1.1" fill="var(--bg)" />
    </svg>
  );
}

/**
 * The Android status line. Not a button, on purpose: until the Play listing is
 * public there is nothing honest to link to, and a download button that goes
 * nowhere reads as a broken site. See PLAY_STORE_URL in lib/appShowcase.ts.
 */
export function AndroidComingSoon({ lead, rest }: { lead: string; rest: string }) {
  return (
    <p className={`${s.android} ${s.rise}`} style={{ "--d": "300ms" } as React.CSSProperties}>
      <span className={s.androidIcon}>
        <AndroidGlyph />
      </span>
      <span>
        <strong>{lead}</strong> {rest}
      </span>
    </p>
  );
}
