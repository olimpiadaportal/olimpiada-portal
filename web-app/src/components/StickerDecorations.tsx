import { getChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// R11 — Character-sticker decorative layer for the child (arena) shell.
// SELF-CONTAINED async server component: it resolves the child session itself
// (renders null for non-child sessions), reads the child's own theme selection
// and that theme's images with the request-scoped RLS client, and renders a
// fixed, aria-hidden layer of EXACTLY 6 UNIQUE playful stickers — 3 down the
// left side gutter, 3 down the right — in a triangular / staggered arrangement
// (the middle sticker on each side pokes slightly toward the content, the top
// and bottom hug the outer edge). Every enabled theme is guaranteed ≥ 6 images
// by the DB guard (migration 028), so we always have 6 distinct stickers.
//
// RLS makes the off-switches automatic: no selection row → null; a DISABLED
// theme → sticker_images returns zero rows → null.
//
// Placement is DETERMINISTIC per student (seed = hash of profileId) so the
// same child sees the same six stickers in the same slots on every reload.
// The gutter geometry, min()-enforced no-overlap boundary, responsive hiding
// (side gutters only exist on desktop widths — hidden below ~1180px so the
// stickers can never touch content or cause horizontal scroll) and the hover
// wiggle / float / reduced-motion rules all live in the stk-* CSS (globals.css).
// The six fixed slot classes; index 1 (…-mid) is the content-ward one per side.
const SLOTS = [
  "stk-l-top",
  "stk-l-mid",
  "stk-l-bot",
  "stk-r-top",
  "stk-r-mid",
  "stk-r-bot",
] as const;

// FNV-1a 32-bit — tiny, stable string hash for the per-child seed.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — deterministic PRNG over the seed (stable across reloads).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function StickerDecorations() {
  const child = await getChild();
  if (!child) return null;

  const supabase = await createClient();
  const { data: sel } = await supabase
    .from("child_sticker_selections")
    .select("theme_id")
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  const themeId = (sel as { theme_id?: string } | null)?.theme_id ?? null;
  if (!themeId) return null;

  const { data: imgs } = await supabase
    .from("sticker_images")
    .select("order_index, media_assets:media_asset_id(bucket, path)")
    .eq("theme_id", themeId)
    .order("order_index");
  const urls: string[] = [];
  for (const r of (imgs ?? []) as any[]) {
    const m = r.media_assets;
    if (m?.bucket && m?.path) {
      urls.push(supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl);
    }
  }
  if (urls.length === 0) return null;

  const rng = mulberry32(hash32(child.profileId));

  // Pick 6 UNIQUE stickers: deterministic Fisher–Yates shuffle of all images,
  // then take the first 6 (no repeats on the page). Enabled themes always have
  // ≥ 6 (DB guard), so `picked.length === 6` in practice; if a theme somehow
  // has fewer we render what's available (still unique) rather than repeating.
  const pool = urls.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(6, pool.length));

  return (
    <div className="stk-layer" aria-hidden="true">
      {picked.map((url, i) => {
        const rot = Math.round(rng() * 20 - 10); // -10°..10° base tilt
        const scale = (88 + Math.round(rng() * 22)) / 100; // 0.88..1.10
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={SLOTS[i]}
            src={url}
            alt=""
            className={`stk-sticker ${SLOTS[i]}`}
            style={{
              ["--stk-rot" as any]: `${rot}deg`,
              ["--stk-scale" as any]: String(scale),
              ["--stk-i" as any]: String(i),
            }}
            loading="lazy"
            draggable={false}
          />
        );
      })}
    </div>
  );
}
