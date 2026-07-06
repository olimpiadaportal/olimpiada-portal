"use client";

// Student (child) profile drawer — mirrors <ProfileDrawer/> (the parent shell)
// but scoped to the dark arena student area. Renders a round .drawer-trigger
// avatar button in the child top nav; clicking it opens a right slide-in
// .drawer (with a dimming .drawer-overlay). Round 8 section order (identical
// to the parent drawer, muted .drawer-section-label titles):
//   ACCOUNT    → .drawer-link → /child/profile (user icon; chevron comes from
//                the CSS ::after — no inline chevron SVG)
//   LANGUAGE   → segmented [AZ][EN][RU] on desktop, <LanguageDropdown/> on
//                mobile (CSS display switch inside .drawer2-lang)
//   APPEARANCE → <ThemeToggle variant="segmented"/> ([Light][Dark] buttons)
//   SESSION    → .drawer-logout row (childLogoutAction), calm danger
//
// The child has NO email / delete-account here; the full editable profile
// (avatar + change password + wallpaper) lives on the /child/profile page.
// New labels (account/appearance/session/themeLight/themeDark) are OPTIONAL on
// the drawer prop so the existing layout keeps compiling; until it passes them
// they resolve from the i18n catalog (drawer2.* → drawer.*) with graceful
// static fallbacks. Closes on: overlay click, the .drawer-close button, or
// Escape. Uses the shared contract classes (.drawer-trigger,
// .drawer-overlay(.open), .drawer(.open) + .drawer2, .drawer-head,
// .drawer-title, .drawer-close, .drawer-section, .drawer-section-label,
// .drawer-link, .drawer-logout) plus the arena-aware .seg-*/.drawer2-* rules.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LanguageDropdown,
  LanguageSegmented,
} from "@/components/LanguageDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTFirst } from "@/i18n/I18nProvider";
import { childLogoutAction } from "@/lib/auth/childActions";
import type { Locale } from "@/i18n/config";

// Static last-resort fallback for the Session section title (used only until
// the drawer2.* strings are merged into the catalog / passed by the layout).
const SESSION_FALLBACK: Record<Locale, string> = {
  az: "Sessiya",
  en: "Session",
  ru: "Сеанс",
};

export type ChildDrawerProfile = {
  initials: string;
  avatarUrl: string | null;
};

export function ChildProfileDrawer({
  locale,
  availableLocales,
  profile,
  drawer,
}: {
  locale: Locale;
  // Admin-enabled locales, forwarded to the language controls.
  availableLocales?: Locale[];
  profile: ChildDrawerProfile;
  // Drawer chrome copy. The optional Round-8 fields (account/appearance/
  // session/themeLight/themeDark) fall back to the i18n catalog when the
  // layout does not pass them yet, so the existing layout keeps working.
  drawer: {
    title: string;
    profileBtn: string;
    language: string;
    theme: string;
    logout: string;
    close: string;
    account?: string;
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
  const accountLabel =
    drawer.account ?? tf(["drawer2.account", "drawer.account"], drawer.title);
  const appearanceLabel =
    drawer.appearance ?? tf(["drawer2.appearance"], drawer.theme);
  const sessionLabel =
    drawer.session ?? tf(["drawer2.session"], SESSION_FALLBACK[locale] ?? "Session");

  // Close on Escape; move focus into the panel when opened.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
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
          <span className="drawer-section-label">{accountLabel}</span>
          {/* Exactly ONE arrow: the trailing chevron comes from the
              .drawer-link::after CSS — no inline chevron SVG here. */}
          <Link
            href="/child/profile"
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
          <form action={childLogoutAction}>
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
