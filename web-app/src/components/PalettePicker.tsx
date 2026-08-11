"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { selectPalette } from "@/lib/auth/childProfileActions";
import type { ChildProfileState } from "@/lib/auth/childProfileActions";
import {
  ARENA_PALETTES,
  DEFAULT_LIGHT_ARENA,
  PALETTE_GROUPS,
  type ArenaPaletteTokens,
} from "@/lib/theme/palettes";

// Light-mode palette picker on the child profile, next to the Character
// Stickers gallery. 26 palettes in six labelled groups plus a "Default" card;
// every colour comes from the shared catalogue (lib/theme/palettes.ts), so no
// hex literal appears in this file and a preview can never advertise a colour
// the palette does not use.
//
// One <form> per option with a hidden `palette` input and a useActionState
// wrapper over selectPalette: authorization and validation stay server-side and
// the no-JS path still works.

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

// Miniature of the student panel — nav bar, two cards, a button. Painted purely
// from --p-* custom properties so it re-uses the catalogue values verbatim.
function Preview({ t }: { t: ArenaPaletteTokens }) {
  const vars = {
    "--p-bg": t.bg,
    "--p-panel": t.panel,
    "--p-line": t.line,
    "--p-ink": t.ink,
    "--p-muted": t.muted,
    "--p-accent": t.accent,
  } as React.CSSProperties;
  return (
    <span className="pal2-preview" aria-hidden="true" style={vars}>
      <span className="pal2-pv-bar">
        <span className="pal2-pv-pill" />
        <span className="pal2-pv-pill" />
        <span className="pal2-pv-pill" />
      </span>
      <span className="pal2-pv-body">
        <span className="pal2-pv-card">
          <span className="pal2-pv-line" />
          <span className="pal2-pv-line" />
        </span>
        <span className="pal2-pv-card">
          <span className="pal2-pv-line" />
          <span className="pal2-pv-line" />
        </span>
      </span>
      <span className="pal2-pv-btn" />
    </span>
  );
}

function Dots({ t }: { t: ArenaPaletteTokens }) {
  return (
    <span className="pal2-dots" aria-hidden="true">
      {[t.accent, t.accent2, t.gold, t.bg2, t.line].map((c, i) => (
        <span key={i} className="pal2-dot" style={{ background: c }} />
      ))}
    </span>
  );
}

export function PalettePicker({
  selected,
  dict,
}: {
  selected: string | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const cur = selected ?? "";
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ChildProfileState, FormData>(
    (prev, fd) => selectPalette(prev, fd),
    null,
  );

  // What the DOM looked like before the optimistic flip, so a failed save can be
  // rolled back to exactly the previous appearance.
  const prevRef = useRef<{
    theme: string | undefined;
    palette: string | null;
  } | null>(null);

  // THE DARK-MODE FIX. Palette CSS only matches under [data-theme="light"], so
  // persisting the slug alone left the panel dark and the choice invisible —
  // the reported bug. Flipping BOTH attributes here, before the round-trip,
  // also removes the dark -> light -> palette flicker: by the time the action
  // resolves, the revalidated render carries identical attribute values, so
  // React writes nothing and there is no second flip. Writing data-theme from
  // outside React is the same documented pattern the root layout's boot script
  // uses — hence suppressHydrationWarning on <html>.
  function applyOptimistic(slug: string) {
    const root = document.documentElement;
    const arena = document.querySelector(".arena");
    prevRef.current = {
      theme: root.dataset.theme,
      palette: arena?.getAttribute("data-palette") ?? null,
    };
    if (slug) {
      root.dataset.theme = "light";
      try {
        document.cookie = `theme=light; path=/; max-age=31536000; samesite=lax${
          location.protocol === "https:" ? "; secure" : ""
        }`;
      } catch {
        // Cookies blocked — the attribute still applies for this page.
      }
    }
    if (slug) arena?.setAttribute("data-palette", slug);
    else arena?.removeAttribute("data-palette");
  }

  useEffect(() => {
    if (!state?.error) return;
    const prev = prevRef.current;
    if (!prev) return;
    const root = document.documentElement;
    const arena = document.querySelector(".arena");
    if (prev.theme) {
      root.dataset.theme = prev.theme;
      try {
        document.cookie = `theme=${prev.theme}; path=/; max-age=31536000; samesite=lax${
          location.protocol === "https:" ? "; secure" : ""
        }`;
      } catch {
        // Nothing to restore beyond the attribute.
      }
    }
    if (prev.palette) arena?.setAttribute("data-palette", prev.palette);
    else arena?.removeAttribute("data-palette");
    prevRef.current = null;
  }, [state]);

  const selSuffix = ` — ${tt("prof2.selected")}`;

  // A plain render helper, not a nested component: a component declared in the
  // render body is a NEW type every render, so React would remount all 27 forms
  // — including the one mid-submit.
  function card(slug: string, t: ArenaPaletteTokens, showDots: boolean) {
    const isSel = cur === slug;
    const label = tt(`pal.${slug || "default"}`);
    return (
      <form
        action={formAction}
        className="stk-item"
        role="listitem"
        key={slug || "default"}
        onSubmit={() => {
          setClickedId(slug);
          applyOptimistic(slug);
        }}
      >
        <input type="hidden" name="palette" value={slug} />
        <button
          type="submit"
          className={`pal2-card${isSel ? " is-selected" : ""}`}
          disabled={pending}
          title={label}
          aria-label={`${label}${isSel ? selSuffix : ""}`}
          aria-pressed={isSel}
          aria-busy={pending && clickedId === slug}
        >
          <Preview t={t} />
          {showDots && <Dots t={t} />}
          <span className="pal2-name">{label}</span>
          {isSel && <CheckBadge />}
          {pending && clickedId === slug && <span className="stk-spin" />}
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="pal2-groups">
        {/* "Default" is the ABSENCE of a palette, so it stays theme-neutral —
            it must not force Dark Mode off (mirrors the server action). Its
            preview is the real base light arena, not an approximation. */}
        <div className="pal2-grid" role="list">
          {card("", DEFAULT_LIGHT_ARENA, false)}
        </div>
        {PALETTE_GROUPS.map((g) => {
          const items = ARENA_PALETTES.filter((p) => p.group === g);
          if (items.length === 0) return null;
          return (
            <section className="pal2-group" key={g}>
              <h3 className="pal2-group-h">{tt(`pal.group.${g}`)}</h3>
              <div className="pal2-grid" role="list">
                {items.map((p) => card(p.slug, p.t, true))}
              </div>
            </section>
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
