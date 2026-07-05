"use client";

// Create-theme form for the Character Stickers module. Themes always start
// DISABLED (they may only be enabled at >= 6 stickers, DB-enforced). The
// server action returns error CODES; the localized strings arrive as props
// (resolved server-side on the page).
import { useActionState, useRef } from "react";
import {
  createStickerTheme,
  type StickerActionState,
} from "@/lib/admin/stickers";

type Strings = {
  name: string;
  hint: string;
  submit: string;
  saving: string;
  saved: string;
  errName: string;
  errDuplicate: string;
  errGeneric: string;
};

function errorText(code: string, strings: Strings): string {
  if (code === "err.name") return strings.errName;
  if (code === "err.duplicate") return strings.errDuplicate;
  return strings.errGeneric;
}

export function StickerThemeForm({ strings }: { strings: Strings }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<StickerActionState, FormData>(
    async (prev, formData) => {
      const res = await createStickerTheme(prev, formData);
      if (res?.ok && inputRef.current) inputRef.current.value = "";
      return res;
    },
    null,
  );

  return (
    <form action={action} className="form">
      <label className="field">
        <span className="field-label">{strings.name}</span>
        <input
          ref={inputRef}
          type="text"
          name="name"
          minLength={2}
          maxLength={60}
          required
          disabled={pending}
        />
      </label>
      <p className="hint">{strings.hint}</p>
      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.saving : strings.submit}
        </button>
        {state?.ok && <span className="form-ok">{strings.saved}</span>}
        {state?.error && (
          <span className="form-error">{errorText(state.error, strings)}</span>
        )}
      </div>
    </form>
  );
}
