"use client";

import { selectWallpaper } from "@/lib/auth/childActions";

type WP = { id: string; name: string; kind: string; value: string | null };

// Arena-styled predefined wallpaper picker. Logic (server action) is unchanged.
export function WallpaperPicker({
  wallpapers,
  currentId,
}: {
  wallpapers: WP[];
  currentId: string | null;
}) {
  return (
    <div className="arena-wp">
      {wallpapers.map((w) => (
        <form action={selectWallpaper} key={w.id}>
          <input type="hidden" name="wallpaper_id" value={w.id} />
          <button
            type="submit"
            title={w.name}
            aria-label={w.name}
            className={`arena-wp-swatch${w.id === currentId ? " current" : ""}`}
            style={{ background: w.kind === "solid_color" ? w.value ?? "#1a2542" : "#1a2542" }}
          />
        </form>
      ))}
    </div>
  );
}
