"use client";

// The parent dashboard's "your child's free trial has expired" banners
// (owner, 2026-10-10). One per child whose trial is over and who has no other
// access; each has Subscribe Now and an X.
//
// DISMISSAL IS PER CHILD AND PER TRIAL WINDOW. The X stores the window's end
// (`endsAt`) under the child's id, so a dismissed banner stays dismissed — and
// a later extension that ends in its turn brings a fresh banner back, because
// its end is a different value. Browser storage is a convenience here: if it
// is unavailable the banner simply shows again, which is the safe direction.
//
// Rendered only after mount, so a dismissed banner never flashes in from the
// server render.
import Link from "next/link";
import { useEffect, useState } from "react";

export type ExpiredTrialItem = { childId: string; name: string; endsAt: string };

const KEY = (childId: string) => `olympiq.trialExpiredBanner.${childId}`;

function readDismissed(childId: string): string | null {
  try {
    return window.localStorage.getItem(KEY(childId));
  } catch {
    return null;
  }
}

export function TrialExpiredBanner({
  items,
  d,
}: {
  items: ExpiredTrialItem[];
  d: Record<string, string>;
}) {
  const [visible, setVisible] = useState<ExpiredTrialItem[] | null>(null);

  useEffect(() => {
    setVisible(items.filter((i) => readDismissed(i.childId) !== i.endsAt));
  }, [items]);

  if (!visible || visible.length === 0) return null;

  function dismiss(item: ExpiredTrialItem) {
    try {
      window.localStorage.setItem(KEY(item.childId), item.endsAt);
    } catch {
      // Storage blocked: dismiss for this visit only.
    }
    setVisible((prev) => (prev ?? []).filter((i) => i.childId !== item.childId));
  }

  return (
    <div className="trial-banners">
      {visible.map((item) => (
        <div className="trial-banner" role="status" key={item.childId}>
          <p className="trial-banner-text">{d["parent.trialBanner.body"].replace("{name}", item.name)}</p>
          <div className="trial-banner-actions">
            <Link className="btn" href={`/children/${item.childId}/subscribe`}>
              {d["parent.trialBanner.cta"]}
            </Link>
            <button
              type="button"
              className="trial-banner-x"
              aria-label={d["parent.trialBanner.dismiss"]}
              title={d["parent.trialBanner.dismiss"]}
              onClick={() => dismiss(item)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
