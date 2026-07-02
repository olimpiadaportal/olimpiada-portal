"use client";

import { selectWallpaper, resetWallpaper } from "@/lib/auth/childActions";

type WP = {
  id: string;
  name: string;
  kind: string;
  value: string | null;
  imageUrl?: string | null;
};

// Arena-styled predefined wallpaper picker. Renders solid colors and photo
// (image-kind) wallpapers, plus a leading "reset to theme default" swatch.
// Logic (server actions) is unchanged apart from the new reset path.
export function WallpaperPicker({
  wallpapers,
  currentId,
  defaultLabel,
}: {
  wallpapers: WP[];
  currentId: string | null;
  defaultLabel: string;
}) {
  return (
    <div className="arena-wp">
      {/* Reset-to-theme-default swatch (follows light/dark automatically). */}
      <div className="arena-wp-item">
        <form action={resetWallpaper}>
          <button
            type="submit"
            title={defaultLabel}
            aria-label={defaultLabel}
            className={`arena-wp-swatch wp-default${currentId === null ? " current" : ""}`}
          />
        </form>
        <span className="arena-wp-name">{defaultLabel}</span>
      </div>

      {wallpapers.map((w) => (
        <div className="arena-wp-item" key={w.id}>
          <form action={selectWallpaper}>
            <input type="hidden" name="wallpaper_id" value={w.id} />
            {w.kind === "image" && w.imageUrl ? (
              <button
                type="submit"
                title={w.name}
                aria-label={w.name}
                className={`arena-wp-swatch wp-image${w.id === currentId ? " current" : ""}`}
                style={{ backgroundImage: `url(${w.imageUrl})` }}
              />
            ) : (
              <button
                type="submit"
                title={w.name}
                aria-label={w.name}
                className={`arena-wp-swatch${w.id === currentId ? " current" : ""}`}
                style={{ background: w.kind === "solid_color" ? w.value ?? "#1a2542" : "#1a2542" }}
              />
            )}
          </form>
          <span className="arena-wp-name">{w.name}</span>
        </div>
      ))}
    </div>
  );
}
