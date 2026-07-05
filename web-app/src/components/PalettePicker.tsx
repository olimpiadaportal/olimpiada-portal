"use client";

import { useActionState, useState } from "react";
import { selectPalette } from "@/lib/auth/childProfileActions";
import type { ChildProfileState } from "@/lib/auth/childProfileActions";

// Round 12 — child-friendly LIGHT-MODE palette picker on the child profile, sitting
// next to the Character Stickers picker. Six swatch cards (Default + 5 palettes);
// clicking one saves students.palette and re-skins the whole student panel in light
// mode (dark mode is unaffected — the palette CSS is scoped to [data-theme="light"]).
// Reuses the sticker picker's .stk-* card design; adds a small colour swatch.
type PaletteId = "" | "sky" | "bubblegum" | "mint" | "sunset" | "rainbow";

// Preview colours per palette (bg, accent, secondary) — must visually match the
// globals.css palette blocks. "" = the default OlympIQ light look.
const PREVIEWS: { id: PaletteId; bg: string; a: string; b: string }[] = [
  { id: "", bg: "#fffbf5", a: "#7c3aed", b: "#ff8a00" },
  { id: "sky", bg: "#f2f8ff", a: "#1e88e5", b: "#f6b93b" },
  { id: "bubblegum", bg: "#fff2fb", a: "#e0399e", b: "#9b34e0" },
  { id: "mint", bg: "#f0fbf6", a: "#12b886", b: "#f6b93b" },
  { id: "sunset", bg: "#fff8f0", a: "#f5731f", b: "#ffb23e" },
  { id: "rainbow", bg: "#fbf6ff", a: "#7c5cff", b: "#ff6bad" },
];

function CheckBadge() {
  return (
    <span className="stk-check" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M4.5 12.5l5 5L19.5 6.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function PalettePicker({
  selected,
  dict,
}: {
  selected: PaletteId | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const cur: PaletteId = selected ?? "";
  const [clickedId, setClickedId] = useState<PaletteId | null>(null);
  const [state, formAction, pending] = useActionState<ChildProfileState, FormData>(
    (prev, fd) => selectPalette(prev, fd),
    null,
  );

  const selSuffix = ` — ${tt("prof2.selected")}`;

  return (
    <>
      <div className="stk-grid pal-grid" role="list">
        {PREVIEWS.map((p) => {
          const isSel = cur === p.id;
          const label = tt(`pal.${p.id || "default"}`);
          return (
            <form
              action={formAction}
              className="stk-item"
              role="listitem"
              key={p.id || "default"}
              onSubmit={() => setClickedId(p.id)}
            >
              <input type="hidden" name="palette" value={p.id} />
              <button
                type="submit"
                className={`stk-card${isSel ? " stk-selected" : ""}`}
                disabled={pending}
                title={label}
                aria-label={`${label}${isSel ? selSuffix : ""}`}
                aria-pressed={isSel}
                aria-busy={pending && clickedId === p.id}
              >
                <span
                  className="pal-sw"
                  aria-hidden="true"
                  style={{ background: p.bg }}
                >
                  <span className="pal-dot" style={{ background: p.a }} />
                  <span className="pal-dot" style={{ background: p.b }} />
                  {pending && clickedId === p.id && <span className="stk-spin" />}
                </span>
                <span className="stk-name">{label}</span>
                {isSel && <CheckBadge />}
              </button>
            </form>
          );
        })}
      </div>
      {state?.error && !pending && (
        <p className="stk-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}
