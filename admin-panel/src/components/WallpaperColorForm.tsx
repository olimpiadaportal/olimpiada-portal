"use client";

// Solid-color wallpaper form (R9, T9a): useActionState over the now
// state-returning createSolidWallpaper so every save shows explicit success or
// error feedback — silent failures are impossible by construction.
import { useActionState } from "react";
import {
  createSolidWallpaper,
  type WallpaperState,
} from "@/lib/admin/wallpapers";

type Strings = {
  name: string;
  hex: string;
  submit: string;
  saving: string;
  saved: string;
};

export function WallpaperColorForm({ strings }: { strings: Strings }) {
  const [state, action, pending] = useActionState<WallpaperState, FormData>(
    createSolidWallpaper,
    null,
  );

  return (
    <form action={action} className="form">
      <label className="field">
        <span className="field-label">
          {strings.name}
          <span className="req"> *</span>
        </span>
        <input type="text" name="name" required maxLength={60} disabled={pending} />
      </label>
      <label className="field">
        <span className="field-label">
          {strings.hex}
          <span className="req"> *</span>
        </span>
        <input
          type="color"
          name="hex"
          defaultValue="#3b82f6"
          required
          className="color-input"
          disabled={pending}
        />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? strings.saving : strings.submit}
      </button>
      {state?.ok && <p className="form-ok">{strings.saved}</p>}
      {state?.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}
