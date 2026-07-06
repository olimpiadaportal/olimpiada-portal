"use client";

// Parent profile drawer (Round 8 redesign — parent shell). Renders a round
// .drawer-trigger profile-icon button in the parent top nav; clicking it opens
// a right slide-in .drawer (with a dimming .drawer-overlay). The drawer is a
// lightweight launcher — profile EDITING lives on the dedicated /profile page.
// Round 8 section order (muted .drawer-section-label titles):
//   ACCOUNT    → .drawer-link → /profile (user icon; chevron comes from the
//                CSS ::after — no inline chevron SVG)
//   LANGUAGE   → segmented [AZ][EN][RU] on desktop, <LanguageDropdown/> on
//                mobile (CSS display switch inside .drawer2-lang)
//   APPEARANCE → <ThemeToggle variant="segmented"/> ([Light][Dark] buttons)
//   SESSION    → .drawer-logout row (parentLogout form), calm danger
//
// The layout (server) fetches only what the trigger + labels need (avatar public
// URL / initials, locale, drawer chrome copy). New labels (appearance, session,
// themeLight, themeDark) are OPTIONAL on the drawer prop so the existing layout
// keeps compiling; until it passes them they resolve from the i18n catalog
// (drawer2.*) with graceful static fallbacks. Closes on: overlay click, the
// .drawer-close button, Escape, or navigating via the profile link. Uses the
// shared contract classes (.drawer-trigger, .drawer-overlay(.open),
// .drawer(.open) + .drawer2, .drawer-head, .drawer-title, .drawer-close,
// .drawer-section, .drawer-section-label, .drawer-link, .drawer-logout).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LanguageDropdown,
  LanguageSegmented,
} from "@/components/LanguageDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTFirst } from "@/i18n/I18nProvider";
import { parentLogout } from "@/lib/auth/parentService";
import type { Locale } from "@/i18n/config";

// Static last-resort fallback for the Session section title (used only until
// the drawer2.* strings are merged into the catalog / passed by the layout).
const SESSION_FALLBACK: Record<Locale, string> = {
  az: "Sessiya",
  en: "Session",
  ru: "Сеанс",
};

// Parent top-nav links (client — needs usePathname to mark the active link).
// Rendered by the server layout inside <nav className="pnav-links">. Order is
// fixed by the shared contract: Home, Analytics, Subscription, FAQ, Contact.
// The first item carries a compact .pnav-brand mark (NO wordmark) + the Home label.
export function ParentNavLinks({
  items,
}: {
  // `exact` opts a link out of prefix matching — needed when one item's href is
  // a prefix of the others (the student shell's "/child" home tab).
  items: { href: string; label: string; brand?: boolean; exact?: boolean }[];
}) {
  const pathname = usePathname();
  const isActive = (it: { href: string; exact?: boolean }) =>
    it.exact
      ? pathname === it.href
      : pathname === it.href || pathname.startsWith(`${it.href}/`);
  return (
    <nav className="pnav-links">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`pnav-link${isActive(it) ? " active" : ""}`}
          aria-current={isActive(it) ? "page" : undefined}
        >
          {it.brand ? (
            <>
              <span className="pnav-brand" aria-hidden="true" />
              {it.label}
            </>
          ) : (
            it.label
          )}
        </Link>
      ))}
    </nav>
  );
}

// Only what the drawer trigger needs to paint the avatar / initials mark.
export type ProfileDrawerData = {
  initials: string;
  avatarUrl: string | null;
};

export function ProfileDrawer({
  locale,
  availableLocales,
  profile,
  drawer,
}: {
  locale: Locale;
  // Admin-enabled locales, forwarded to the language dropdown.
  availableLocales?: Locale[];
  profile: ProfileDrawerData;
  // Drawer chrome copy. The optional Round-8 fields (appearance/session/
  // themeLight/themeDark) fall back to the i18n catalog when the layout does
  // not pass them yet, so the existing layout keeps working unchanged.
  drawer: {
    title: string;
    account: string;
    language: string;
    theme: string;
    close: string;
    profileBtn: string;
    logout: string;
    appearance?: string;
    session?: string;
    themeLight?: string;
    themeDark?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tf = useTFirst();

  // Section titles: explicit prop → merged drawer2.* catalog string → fallback
  // (override-aware via the I18nProvider dict).
  const appearanceLabel =
    drawer.appearance ?? tf(["drawer2.appearance"], drawer.theme);
  const sessionLabel =
    drawer.session ?? tf(["drawer2.session"], SESSION_FALLBACK[locale] ?? "Session");

  // Close on Escape; restore focus to the trigger when the drawer closes.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel for keyboard/screen-reader users.
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Return focus to the trigger after closing.
  useEffect(() => {
    if (!open) triggerRef.current?.focus?.();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="drawer-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={drawer.title}
        onClick={() => setOpen(true)}
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="avatar-img" />
        ) : (
          <span aria-hidden="true">{profile.initials}</span>
        )}
      </button>

      <div
        className={`drawer-overlay${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <aside
        ref={panelRef}
        className={`drawer drawer2${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={drawer.title}
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="drawer-head">
          <span className="drawer-title">{drawer.title}</span>
          <button
            type="button"
            className="drawer-close"
            aria-label={drawer.close}
            onClick={() => setOpen(false)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-section">
          <span className="drawer-section-label">{drawer.account}</span>
          {/* Exactly ONE arrow: the trailing chevron comes from the
              .drawer-link::after CSS — no inline chevron SVG here. */}
          <Link
            href="/profile"
            className="drawer-link"
            onClick={() => setOpen(false)}
          >
            <svg
              className="drawer2-row-ic"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{drawer.profileBtn}</span>
          </Link>
        </div>

        <div className="drawer-section">
          <span className="drawer-section-label">{drawer.language}</span>
          <div className="drawer2-lang">
            <LanguageSegmented current={locale} available={availableLocales} />
            <div className="drawer2-lang-dd">
              <LanguageDropdown current={locale} available={availableLocales} />
            </div>
          </div>
        </div>

        <div className="drawer-section">
          <span className="drawer-section-label">{appearanceLabel}</span>
          <ThemeToggle
            locale={locale}
            variant="segmented"
            labels={{ light: drawer.themeLight, dark: drawer.themeDark }}
          />
        </div>

        <div className="drawer-section drawer2-session">
          <span className="drawer-section-label">{sessionLabel}</span>
          <form action={parentLogout}>
            <button type="submit" className="drawer-logout">
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              {drawer.logout}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
