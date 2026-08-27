"use client";

import { useOptimistic, useState, useTransition } from "react";
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
  // A refusal has to be visible. Some flags depend on others -- the
  // giveaway cannot run while payments are off -- and without this the
  // switch appeared to undo itself for no stated reason.
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    const next = !optimisticEnabled;
    setError(null);
    startTransition(async () => {
      setOptimisticEnabled(next);
      const fd = new FormData();
      fd.set("__key", flagKey);
      fd.set("__enabled", next ? "true" : "false");
      const res = await toggleFeatureFlag(fd);
      // The optimistic value is discarded by the transition either way; what
      // was missing was the REASON.
      if (res && res.ok === false) setError(res.error);
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
      {/* The reason, beside the switch that refused. `role="alert"` because the
          switch has already snapped back by the time this appears, and a silent
          revert is what made this look like a bug in the first place. */}
      {error ? (
        <span className="form-error" role="alert" style={{ flexBasis: "100%" }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
