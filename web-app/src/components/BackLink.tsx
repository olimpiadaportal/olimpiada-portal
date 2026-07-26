"use client";

// Round 51 (audit 4.1): Round 45 gave every mobile secondary screen a back
// arrow; the web auth pages had no back affordance at all — only sideways
// links (login ↔ register). One shared component so the glyph, hit target and
// behavior can't drift per page. Browser BACK when there is history to go to,
// else the fallback route (a cold deep link straight onto /register would
// otherwise dead-end the button).
import { useRouter } from "next/navigation";

export function BackLink({
  label,
  fallbackHref = "/",
}: {
  /** Translated "Back" (nav.back). */
  label: string;
  /** Where to go when this page IS the start of history (cold deep link). */
  fallbackHref?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="back-link"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
