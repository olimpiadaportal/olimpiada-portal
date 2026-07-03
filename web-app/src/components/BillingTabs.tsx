"use client";

// R8 billing — internal section tabs for the one-page subscription center.
// Clicking a tab smooth-scrolls to the matching section anchor on the SAME
// page (never navigates) and highlights the clicked tab. A lightweight
// IntersectionObserver keeps the highlight in sync while the user scrolls;
// observer updates are suppressed briefly after a click so the smooth scroll
// doesn't fight the explicit selection. All labels arrive pre-translated.
import { useEffect, useRef, useState } from "react";

export type BillingTab = { id: string; label: string };

export function BillingTabs({
  tabs,
  ariaLabel,
}: {
  tabs: BillingTab[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const suppressUntil = useRef(0);

  useEffect(() => {
    const sections = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntil.current) return;
        const visible = new Set(
          entries.filter((e) => e.isIntersecting).map((e) => e.target),
        );
        // First section (in DOM order) inside the focus band wins.
        const first = sections.find((s) => visible.has(s));
        if (first) setActive(first.id);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [tabs]);

  const go = (id: string) => {
    setActive(id);
    suppressUntil.current = Date.now() + 900;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="billing-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`billing-tab${active === tab.id ? " active" : ""}`}
          onClick={() => go(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
