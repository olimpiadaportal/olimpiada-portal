"use client";

import Link from "next/link";

// Today's-round card practice entry (Round 38): once the day's rated round is
// SUBMITTED the card dims and the practice CTA stops navigating — the alert
// replaces the topic-setup screen for that subject until tomorrow.
export function PracticeGate({
  href,
  label,
  done,
  doneAlert,
}: {
  href: string;
  label: string;
  done: boolean;
  doneAlert: string;
}) {
  if (!done) {
    return (
      <Link href={href} className="arena-btn-ghost arena-btn-sm">
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="arena-btn-ghost arena-btn-sm"
      onClick={() => window.alert(doneAlert)}
    >
      {label}
    </button>
  );
}
