"use client";

// Enable/disable toggle for a sticker theme. The DB trigger blocks enabling a
// theme with < 6 stickers; the action maps that to the "err.needsFive" code,
// which is shown here as a friendly localized message (passed as a prop).
import { useActionState } from "react";
import {
  setStickerThemeEnabled,
  type StickerActionState,
} from "@/lib/admin/stickers";

type Strings = {
  enable: string;
  disable: string;
  saving: string;
  errNeedsFive: string;
  errGeneric: string;
};

export function StickerThemeToggle({
  id,
  enabled,
  strings,
}: {
  id: string;
  enabled: boolean;
  strings: Strings;
}) {
  const [state, action, pending] = useActionState<StickerActionState, FormData>(
    setStickerThemeEnabled,
    null,
  );

  const msg = state?.error
    ? state.error === "err.needsFive"
      ? strings.errNeedsFive
      : strings.errGeneric
    : null;

  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__enabled" value={String(!enabled)} />
      <button type="submit" className="link-button" disabled={pending}>
        {pending ? strings.saving : enabled ? strings.disable : strings.enable}
      </button>
      {msg && (
        <span className="form-error" style={{ display: "block", marginTop: 4 }}>
          {msg}
        </span>
      )}
    </form>
  );
}
