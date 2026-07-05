"use client";

import { useActionState, useState } from "react";
import {
  selectStickerTheme,
  clearStickerTheme,
  type StickerState,
} from "@/lib/auth/stickerActions";

// R11 — Character-sticker theme picker (replaces the wp2 background-templates
// gallery on the child profile). Card grid in the R8 settings-card design
// language: an "off" card first (stickers must be easy to disable), then one
// card per enabled theme showing a small collage of 2–3 sample stickers on a
// soft token-driven backdrop + a sticker-count chip. Selected card gets the
// accent ring + check badge (same pattern the old wp2 cards used). Both server
// actions are dispatched through ONE useActionState so pending/error state
// stays coherent; the clicked card shows a spinner while pending.
export type StickerThemeCard = {
  id: string;
  name: string;
  samples: string[]; // 2–3 public sticker image URLs for the collage
  count: number; // total stickers in the theme
};

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

export function StickerThemePicker({
  themes,
  selectedId,
  dict,
}: {
  themes: StickerThemeCard[];
  selectedId: string | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  // Which card was clicked (theme id, or "" for the off-card) — spinner target.
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<StickerState, FormData>(
    async (prev, fd) =>
      String(fd.get("theme_id") ?? "")
        ? selectStickerTheme(prev, fd)
        : clearStickerTheme(prev, fd),
    null,
  );

  if (themes.length === 0) {
    return <p className="stk-empty">{tt("stk.empty")}</p>;
  }

  const selSuffix = ` — ${tt("prof2.selected")}`;
  const isOff = selectedId === null;

  return (
    <>
      <div className="stk-grid" role="list">
        {/* Off-card first: no theme_id → clearStickerTheme (easy opt-out). */}
        <form
          action={formAction}
          className="stk-item"
          role="listitem"
          onSubmit={() => setClickedId("")}
        >
          <button
            type="submit"
            className={`stk-card${isOff ? " stk-selected" : ""}`}
            disabled={pending}
            title={tt("stk.none")}
            aria-label={`${tt("stk.none")}${isOff ? selSuffix : ""}`}
            aria-pressed={isOff}
            aria-busy={pending && clickedId === ""}
          >
            <span className="stk-collage stk-collage-off" aria-hidden="true">
              {/* crossed-out sparkle = stickers off */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 20L20 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              {pending && clickedId === "" && <span className="stk-spin" />}
            </span>
            <span className="stk-name">{tt("stk.none")}</span>
            {isOff && <CheckBadge />}
          </button>
        </form>

        {themes.map((th) => {
          const selected = th.id === selectedId;
          return (
            <form
              action={formAction}
              className="stk-item"
              role="listitem"
              key={th.id}
              onSubmit={() => setClickedId(th.id)}
            >
              <input type="hidden" name="theme_id" value={th.id} />
              <button
                type="submit"
                className={`stk-card${selected ? " stk-selected" : ""}`}
                disabled={pending}
                title={th.name}
                aria-label={`${th.name}${selected ? selSuffix : ""}`}
                aria-pressed={selected}
                aria-busy={pending && clickedId === th.id}
              >
                <span className="stk-collage" aria-hidden="true">
                  {th.samples.slice(0, 3).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" loading="lazy" draggable={false} />
                  ))}
                  {th.count > 0 && (
                    <span className="stk-count" title={tt("stk.countTitle")}>
                      {th.count}
                    </span>
                  )}
                  {pending && clickedId === th.id && <span className="stk-spin" />}
                </span>
                <span className="stk-name">{th.name}</span>
                {selected && <CheckBadge />}
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
