"use client";

// Round 11 — celebratory giveaway countdown banner (owner item 6).
//
// The server layouts render this ONLY while the giveaway window is active
// (getPaymentModeInfo — server-only, never imported here) and pass the
// resolved `endsAt` plus already-translated strings, so this component holds
// no i18n or payment-mode logic.
//
// Countdown: days / hours / minutes / SECONDS re-derived from Date.now() every
// second, so it ticks live in real time. When the window elapses on screen the
// banner shows the graceful "ended" note briefly, then hides itself; the server
// simply stops rendering it on the next request.
import { useEffect, useState } from "react";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  over: boolean;
};

function remainingUntil(endsAtMs: number, nowMs: number): Remaining {
  const diff = endsAtMs - nowMs;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true };
  const totalSec = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSec / 86_400),
    hours: Math.floor(totalSec / 3_600) % 24,
    minutes: Math.floor(totalSec / 60) % 60,
    seconds: totalSec % 60,
    over: false,
  };
}

// Two-digit pad for hours/minutes/seconds so the ticking pills keep a stable
// width (no layout jitter as 9 → 10 → 9). Days stay natural.
const pad2 = (n: number): string => String(n).padStart(2, "0");

// Gift + sparkle, inline SVG (strict CSP — no external images).
function GiftIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="18" height="4.5" rx="1" />
      <path d="M13 11v14M6 15.5v8.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5" />
      <path d="M13 11c-1.6-3.6-6.2-3.6-6.2-1s4.2 1 6.2 1Zm0 0c1.6-3.6 6.2-3.6 6.2-1s-4.2 1-6.2 1Z" />
      <path
        d="M23.2 2.4l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function GiveawayBanner({
  endsAt,
  strings,
}: {
  /** ISO timestamp the giveaway window ends (from getPaymentModeInfo). */
  endsAt: string;
  /** Translated gvw.* strings, resolved server-side by the mounting layout. */
  strings: Record<string, string>;
}) {
  const endsAtMs = Date.parse(endsAt);
  const [rem, setRem] = useState<Remaining>(() =>
    remainingUntil(endsAtMs, Date.now()),
  );
  // Fully removed a few seconds after the countdown reaches zero.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Stop ticking once the window has elapsed (the "ended" note + hide take
    // over) so no 1s timer keeps running behind a null/hidden banner.
    if (!Number.isFinite(endsAtMs) || rem.over) return;
    const id = window.setInterval(() => {
      setRem(remainingUntil(endsAtMs, Date.now()));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [endsAtMs, rem.over]);

  useEffect(() => {
    if (!rem.over) return;
    const id = window.setTimeout(() => setHidden(true), 6_000);
    return () => window.clearTimeout(id);
  }, [rem.over]);

  if (!Number.isFinite(endsAtMs) || hidden) return null;

  if (rem.over) {
    return (
      <section className="gvw-banner gvw-done">
        <span className="gvw-ic" aria-hidden="true">
          <GiftIcon />
        </span>
        {/* Static status text — announced once, never re-announced. */}
        <p className="gvw-title" role="status">
          {strings["gvw.ended"]}
        </p>
      </section>
    );
  }

  const cells = [
    { v: String(rem.days), u: strings["gvw.days"] },
    { v: pad2(rem.hours), u: strings["gvw.hours"] },
    { v: pad2(rem.minutes), u: strings["gvw.minutes"] },
    { v: pad2(rem.seconds), u: strings["gvw.seconds"] },
  ];

  return (
    <section className="gvw-banner">
      <span className="gvw-ic" aria-hidden="true">
        <GiftIcon />
      </span>
      <div className="gvw-text">
        {/* role="status" (polite live region) sits on the STATIC headline so
            screen readers hear it once on mount; the ticking numbers below
            carry no live semantics and never spam announcements. */}
        <p className="gvw-title" role="status">
          {strings["gvw.title"]}
        </p>
        <p className="gvw-sub">{strings["gvw.sub"]}</p>
      </div>
      <div className="gvw-count">
        <span className="gvw-count-label">{strings["gvw.remaining"]}</span>
        <div className="gvw-pills" aria-live="off">
          {cells.map((c, i) => (
            <span className="gvw-pill" key={i}>
              {/* SSR renders one instant and the client another; the 1s tick
                  reconciles immediately, so the hydration warning is safely
                  suppressed on the ticking numbers. */}
              <span className="gvw-num" suppressHydrationWarning>
                {c.v}
              </span>
              <span className="gvw-unit">{c.u}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
