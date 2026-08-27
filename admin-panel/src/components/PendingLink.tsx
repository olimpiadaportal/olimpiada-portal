"use client";

// A <Link> that says it was clicked.
//
// WHY THIS EXISTS. /questions is a server component paginated through
// searchParams, and `loading.tsx` does NOT cover that. Next's route-level
// loading boundary fires when you navigate to a different SEGMENT; changing
// `?page=3` to `?page=4` stays on the same segment, so the boundary never
// re-suspends and the existing page simply sits there — fully interactive,
// completely stale — until the server responds. The comment at the top of
// questions/loading.tsx claimed "every filter change, page step and search
// keystroke navigates and lands here first". It does not, and that mistaken
// belief is why the pager had no feedback at all: an admin clicked a page
// number and watched nothing happen for several seconds.
//
// `useLinkStatus` (Next 15.3+) is the supported answer. It reports the pending
// state of the Link it is rendered inside, so the control the admin actually
// clicked is the control that responds — better than a page-wide spinner,
// which cannot tell you WHICH page number is loading.
//
// Purely presentational: no text, so nothing to translate. The dots are marked
// aria-hidden and the pending state is announced through aria-busy on the
// anchor, so a screen reader hears one status change rather than an animation.
import Link from "next/link";
import { useLinkStatus } from "next/link";

/** The dots. Must live INSIDE the Link — useLinkStatus reads its parent. */
function PendingDots() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="pl-dots" aria-hidden="true" />;
}

/** Applies the pending class to the anchor itself. Also inside the Link. */
function PendingMarker() {
  const { pending } = useLinkStatus();
  // A no-op element whose only job is to let CSS style the parent anchor via
  // :has() — cheaper than lifting state and keeps the anchor server-rendered.
  return pending ? <span className="pl-pending-flag" hidden /> : null;
}

export function PendingLink({
  href,
  className,
  children,
  ariaCurrent,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  ariaCurrent?: "page";
}) {
  return (
    <Link href={href} className={className} aria-current={ariaCurrent} prefetch={false}>
      {children}
      <PendingMarker />
      <PendingDots />
    </Link>
  );
}
