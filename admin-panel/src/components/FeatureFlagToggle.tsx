"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFeatureFlag } from "@/lib/admin/settings";

// Optimistic On/Off switch. Clicking flips the visual immediately (useOptimistic)
// inside a transition, then calls the existing server action to persist. The
// server revalidation reconciles the real value back into `enabled`. The
// __key/__enabled contract is preserved via the FormData sent to the action.
// The ON/OFF status pill renders here too so it stays in sync with the
// optimistic state instead of waiting for revalidation.
export function FeatureFlagToggle({
  flagKey,
  enabled,
  enableLabel,
  disableLabel,
  onText,
  offText,
}: {
  flagKey: string;
  enabled: boolean;
  enableLabel: string;
  disableLabel: string;
  onText: string;
  offText: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);

  function onToggle() {
    const next = !optimisticEnabled;
    startTransition(async () => {
      setOptimisticEnabled(next);
      const fd = new FormData();
      fd.set("__key", flagKey);
      fd.set("__enabled", next ? "true" : "false");
      await toggleFeatureFlag(fd);
    });
  }

  return (
    <>
      <span
        className={`pill pill-inline ${
          optimisticEnabled ? "pill-ok" : "pill-muted"
        }`}
      >
        {optimisticEnabled ? onText : offText}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={optimisticEnabled}
        aria-label={optimisticEnabled ? disableLabel : enableLabel}
        title={optimisticEnabled ? disableLabel : enableLabel}
        disabled={isPending}
        onClick={onToggle}
        className={`switch switch-sm ${optimisticEnabled ? "switch-on" : "switch-off"}`}
      >
        <span className="switch-knob" />
      </button>
    </>
  );
}
