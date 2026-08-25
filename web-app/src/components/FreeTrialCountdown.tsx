"use client";

// The Free Trial countdown (migrations 139-141).
//
// DERIVED, NEVER STORED. The server passes the resolved `endsAt` from
// child_free_trial / my_free_trial and this component re-derives the remainder
// from Date.now() every second. Nothing touches localStorage, so the timer
// "survives logout/login" for the only reason that actually holds: it was never
// client state to begin with. A new session on another device re-reads the same
// server timestamp and shows the same figure.
//
// Same shape as GiveawayBanner's countdown, deliberately: one ticking pattern in
// this codebase, not two.
import { useEffect, useState } from "react";
import { splitRemaining } from "@/lib/freeTrialShared";

type Props = {
  /** ISO timestamp from the server. */
  endsAt: string;
  /** Already-translated unit suffixes — this component holds no i18n. */
  units: { h: string; m: string; s: string };
  /** Rendered in place of the clock once the trial has elapsed on screen. */
  endedLabel: string;
  className?: string;
};

// Two-digit pad so the pills keep a stable width and the row does not jitter as
// 9 -> 10 -> 9.
const pad2 = (n: number): string => String(n).padStart(2, "0");

export function FreeTrialCountdown({ endsAt, units, endedLabel, className }: Props) {
  const endsAtMs = new Date(endsAt).getTime();

  // Seeded from the same derivation the interval uses, so the first paint after
  // hydration is already correct rather than flashing a placeholder.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(endsAtMs)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  if (!Number.isFinite(endsAtMs)) return null;

  const { h, m, s, done } = splitRemaining(endsAtMs - now);
  if (done) {
    return <span className={className ?? "ftrial-countdown is-over"}>{endedLabel}</span>;
  }

  return (
    <span
      className={className ?? "ftrial-countdown"}
      // A live region would re-announce every second, which is hostile with a
      // screen reader. The static label carries the meaning; the digits are
      // decorative reinforcement.
      aria-label={`${h} ${units.h} ${m} ${units.m}`}
    >
      <span className="ftrial-tick">
        {h}
        <i>{units.h}</i>
      </span>
      <span className="ftrial-tick">
        {pad2(m)}
        <i>{units.m}</i>
      </span>
      <span className="ftrial-tick">
        {pad2(s)}
        <i>{units.s}</i>
      </span>
    </span>
  );
}
