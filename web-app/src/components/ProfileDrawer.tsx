"use client";

// Parent profile drawer (Round 5 — parent shell). Renders a round
// .drawer-trigger profile-icon button in the parent top nav; clicking it opens
// a right slide-in .drawer (with a dimming .drawer-overlay). The drawer is now a
// lightweight launcher — profile EDITING lives on the dedicated /profile page, so
// the drawer only groups quick account controls into labelled sections:
//   ACCOUNT  → .drawer-link → /profile (opens the full-width profile page)
//   LANGUAGE → <LanguageDropdown/>
//   THEME    → <ThemeToggle/>
//   (footer) → .drawer-logout row (parentLogout form)
//
// The layout (server) fetches only what the trigger + labels need (avatar public
// URL / initials, locale, drawer chrome copy). Closes on: overlay click, the
// .drawer-close button, Escape, or navigating via the profile link. Uses the
// shared contract classes verbatim (.drawer-trigger, .drawer-overlay(.open),
// .drawer(.open), .drawer-head, .drawer-title, .drawer-close, .drawer-section,
// .drawer-section-label, .drawer-link, .drawer-logout).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageDropdown } from "@/components/LanguageDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { parentLogout } from "@/lib/auth/parentService";
import type { Locale } from "@/i18n/config";

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
  // Drawer chrome copy: { title, account, language, theme, close, profileBtn, logout }.
  drawer: {
    title: string;
    account: string;
    language: string;
    theme: string;
    close: string;
    profileBtn: string;
    logout: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
          <span className="drawer-section-label">{drawer.account}</span>
          <Link
            href="/profile"
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

        <form action={parentLogout} className="drawer-section">
          <button type="submit" className="drawer-logout">
            {drawer.logout}
          </button>
        </form>
      </aside>
    </>
  );
}
