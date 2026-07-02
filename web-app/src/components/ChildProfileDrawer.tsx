"use client";

// Student (child) profile drawer — mirrors <ProfileDrawer/> (the parent shell)
// but scoped to the dark arena student area. Renders a round .drawer-trigger
// avatar button in the child top nav; clicking it opens a right slide-in
// .drawer (with a dimming .drawer-overlay). Sections:
//   PROFILE  → a .drawer-link navigating to /child/profile (drawer.profileBtn)
//   LANGUAGE → <LanguageDropdown/>
//   THEME    → <ThemeToggle/>
// followed by a .drawer-logout row (childLogoutAction).
//
// The child has NO email / delete-account here; the full editable profile
// (avatar + change password + wallpaper) lives on the /child/profile page.
// Closes on: overlay click, the .drawer-close button, or Escape. Uses the
// shared contract classes verbatim (.drawer-trigger, .drawer-overlay(.open),
// .drawer(.open), .drawer-head, .drawer-title, .drawer-close, .drawer-section,
// .drawer-section-label, .drawer-link, .drawer-logout).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LanguageDropdown } from "@/components/LanguageDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { childLogoutAction } from "@/lib/auth/childActions";
import type { Locale } from "@/i18n/config";

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
  // Admin-enabled locales, forwarded to the language dropdown.
  availableLocales?: Locale[];
  profile: ChildDrawerProfile;
  // Drawer chrome copy: { title, profileBtn, language, theme, logout, close }.
  drawer: {
    title: string;
    profileBtn: string;
    language: string;
    theme: string;
    logout: string;
    close: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        className={`drawer${open ? " open" : ""}`}
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
          <Link
            href="/child/profile"
            className="drawer-link"
            onClick={() => setOpen(false)}
          >
            <span>{drawer.profileBtn}</span>
            <svg
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>

        <div className="drawer-section">
          <span className="drawer-section-label">{drawer.language}</span>
          <LanguageDropdown current={locale} available={availableLocales} />
        </div>

        <div className="drawer-section">
          <span className="drawer-section-label">{drawer.theme}</span>
          <ThemeToggle locale={locale} />
        </div>

        <div className="drawer-section">
          <form action={childLogoutAction}>
            <button type="submit" className="drawer-logout">
              {drawer.logout}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
