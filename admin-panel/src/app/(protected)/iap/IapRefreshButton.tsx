"use client";

// Re-read both halves of the mirror, now.
//
// WHY AN EXPLICIT BUTTON ON A SERVER-RENDERED PAGE. The page reads App Store
// Connect on every render, so a reload already refreshes it — but "reload the
// page" is a browser gesture, not a statement about the data, and an admin
// looking at a row that disagrees with what they just did in App Store Connect
// needs to know whether they are looking at a stale picture. The button and the
// timestamp beside it are one control: the stamp says WHEN this was true, the
// button says HOW to make it true again.
//
// router.refresh() re-runs the server component in place rather than
// re-mounting the page, so the store read happens again (it is uncached) while
// scroll position and any open dialog survive. useTransition gives the pending
// state — without it the click looks like it did nothing for as long as Apple
// takes to answer.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ActionButton } from "@/components/ActionButton";

export function IapRefreshButton({
  label,
  workingLabel,
}: {
  label: string;
  workingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ActionButton
      type="button"
      className="btn btn-sm"
      pending={pending}
      pendingLabel={workingLabel}
      onClick={() => startTransition(() => router.refresh())}
    >
      {label}
    </ActionButton>
  );
}
