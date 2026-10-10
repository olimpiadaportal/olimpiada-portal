"use client";

// "Sync store prices" — one subject, or every subject.
//
// Called through a transition rather than a bare <form action>, for the same
// reason SubjectLifecycle is: a tab opened before a deploy holds server-action
// ids that no longer exist, and an unreachable action must read "reload the
// page" here instead of unmounting the screen into the root error boundary.
// The result (summary + any failure lines) stays on screen until the next run;
// the page is refreshed so the live store column re-reads.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import {
  syncAllStorePrices,
  syncSubjectStorePrices,
  type StoreSyncState,
} from "@/lib/admin/storePrices";

export type StoreSyncButtonStrings = {
  syncSubject: string;
  syncAll: string;
  working: string;
  reload: string;
};

export function StoreSyncButton({
  mode,
  subjectId,
  strings,
  compact = false,
}: {
  mode: "subject" | "all";
  subjectId?: string;
  strings: StoreSyncButtonStrings;
  /** In a table row: smaller button, result under it. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StoreSyncState>(null);

  function run() {
    const fd = new FormData();
    if (mode === "subject" && subjectId) fd.set("subject_id", subjectId);
    setResult(null);
    startTransition(async () => {
      try {
        const res =
          mode === "all"
            ? await syncAllStorePrices(null, fd)
            : await syncSubjectStorePrices(null, fd);
        setResult(res);
        router.refresh();
      } catch {
        setResult({ error: strings.reload });
      }
    });
  }

  return (
    <div className={compact ? "store-sync store-sync-compact" : "store-sync"}>
      <ActionButton
        type="button"
        className={compact ? "btn-ghost" : "btn btn-sm"}
        pending={pending}
        pendingLabel={strings.working}
        onClick={run}
      >
        {mode === "all" ? strings.syncAll : strings.syncSubject}
      </ActionButton>
      {result?.error && (
        <span className="inline-status err" role="alert">
          {result.error}
        </span>
      )}
      {result?.summary && (
        <span className={result.ok ? "inline-status ok" : "inline-status err"} role="status">
          {result.summary}
        </span>
      )}
      {result?.failures && result.failures.length > 0 && (
        <ul className="store-sync-failures">
          {result.failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
