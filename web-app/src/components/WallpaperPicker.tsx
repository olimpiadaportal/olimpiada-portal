"use client";

import { selectWallpaper, resetWallpaper } from "@/lib/auth/childActions";

type WP = {
  id: string;
  name: string;
  kind: string;
  value: string | null;
  imageUrl?: string | null;
};

// "Background templates" gallery — Round 8 redesign of the wallpaper picker.
// Preview cards (~120x80 swatch + name label) in a responsive, touch-friendly
// grid; the reset/theme-default card comes first; the selected card gets an
// accent ring + an inline-SVG check badge. Non-image swatches render with
// `background: value`, which supports BOTH hex colors and the new playful
// CSS-gradient presets (preset_race, preset_space, preset_ocean, ...); image
// wallpapers keep backgroundImage. Server actions (selectWallpaper /
// resetWallpaper) are unchanged.
function CheckBadge() {
  return (
    <span className="wp2-check" aria-hidden="true">
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

export function WallpaperPicker({
  wallpapers,
  currentId,
  defaultLabel,
  selectedLabel,
}: {
  wallpapers: WP[];
  currentId: string | null;
  defaultLabel: string;
  selectedLabel?: string;
}) {
  const selSuffix = selectedLabel ? ` — ${selectedLabel}` : "";
  const isDefault = currentId === null;

  return (
    <div className="wp2-grid" role="list">
      {/* Reset-to-theme-default card first (follows light/dark automatically). */}
      <form action={resetWallpaper} className="wp2-item" role="listitem">
        <button
          type="submit"
          className={`wp2-card${isDefault ? " wp2-selected" : ""}`}
          title={defaultLabel}
          aria-label={`${defaultLabel}${isDefault ? selSuffix : ""}`}
          aria-pressed={isDefault}
        >
          <span className="wp2-swatch wp2-swatch-default" aria-hidden="true">
            {/* reset / back-to-default icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 9a8 8 0 111 7M4 9V4m0 5h5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="wp2-name">{defaultLabel}</span>
          {isDefault && <CheckBadge />}
        </button>
      </form>

      {wallpapers.map((w) => {
        const selected = w.id === currentId;
        const swatchStyle =
          w.kind === "image" && w.imageUrl
            ? { backgroundImage: `url(${w.imageUrl})` }
            : { background: w.value ?? "var(--panel2, #1a2542)" };
        return (
          <form action={selectWallpaper} className="wp2-item" role="listitem" key={w.id}>
            <input type="hidden" name="wallpaper_id" value={w.id} />
            <button
              type="submit"
              className={`wp2-card${selected ? " wp2-selected" : ""}`}
              title={w.name}
              aria-label={`${w.name}${selected ? selSuffix : ""}`}
              aria-pressed={selected}
            >
              <span className="wp2-swatch" aria-hidden="true" style={swatchStyle} />
              <span className="wp2-name">{w.name}</span>
              {selected && <CheckBadge />}
            </button>
          </form>
        );
      })}
    </div>
  );
}
