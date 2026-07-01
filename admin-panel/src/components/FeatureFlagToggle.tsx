"use client";

import { toggleFeatureFlag } from "@/lib/admin/settings";

// Submits a plain form action that flips `enabled`. The hidden `__enabled` carries
// the NEXT value (the opposite of the current one).
export function FeatureFlagToggle({
  flagKey,
  enabled,
  enableLabel,
  disableLabel,
}: {
  flagKey: string;
  enabled: boolean;
  enableLabel: string;
  disableLabel: string;
}) {
  return (
    <form action={toggleFeatureFlag} style={{ display: "inline" }}>
      <input type="hidden" name="__key" value={flagKey} />
      <input type="hidden" name="__enabled" value={enabled ? "false" : "true"} />
      <button className="btn-ghost" type="submit">
        {enabled ? disableLabel : enableLabel}
      </button>
    </form>
  );
}
