"use server";

// Character Sticker themes — Administrator-only management of the sticker sets
// children pick from (Round 11: replaces the retired Wallpapers module).
//
// Data model (migration 2026_07_04_026):
//   * sticker_themes  — a named theme (e.g. "Ben 10"); created DISABLED and can
//     only be enabled once it has >= 6 images (DB trigger enforces this).
//   * sticker_images  — metadata rows linking a theme to media_assets; the
//     binaries live in the public `sticker-assets` bucket (PNG/WebP only, 2 MB).
//   * DB guard triggers raise check_violation (23514) when enabling a theme
//     with < 6 images or when deleting an image that would drop an ENABLED
//     theme below 6 — those errors are surfaced as friendly codes, everything
//     else returns the generic error code (never raw DB text).
//
// Security: every action calls requireAdmin() FIRST; ids are UUID-shape
// checked; the attach step verifies the stored object server-side and derives
// mime/size from Storage metadata (client claims are ignored); every mutation
// writes an audit row.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { splitStoragePath, verifyStorageObject } from "@/lib/admin/media-verify";

export type StickerActionState = { ok?: boolean; error?: string } | null;

export type StickerThemeRow = {
  id: string;
  name: string;
  isEnabled: boolean;
  imageCount: number;
  createdAt: string;
};

export type StickerThemeList = { rows: StickerThemeRow[]; loadError: boolean };

export type StickerImageRow = {
  id: string;
  orderIndex: number;
  url: string | null;
  mime: string;
  sizeBytes: number;
};

export type StickerThemeDetail = {
  id: string;
  name: string;
  isEnabled: boolean;
  createdAt: string;
  images: StickerImageRow[];
};

// Constraints — mirror the sticker-assets bucket (migration 026): PNG/WebP
// only (stickers must support transparency; SVG is banned platform-wide), 2 MB.
const BUCKET = "sticker-assets";
const ALLOWED_MIME = ["image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024;
// Strict final path segment: single safe stem + png/webp extension only.
const FILENAME_RE = /^[A-Za-z0-9_-]+\.(png|webp)$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MIN = 2;
const NAME_MAX = 60;

// The DB guard triggers raise with errcode 'check_violation' (23514). P0001
// (raise_exception) is checked too, defensively.
const GUARD_CODES = new Set(["23514", "P0001"]);

function s(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function isGuardError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" && GUARD_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listStickerThemes(): Promise<StickerThemeList> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sticker_themes")
    .select("id, name, is_enabled, created_at, sticker_images(count)")
    .order("name");
  if (error) {
    // A failed list load is VISIBLE — never a silent empty list.
    console.error("[admin] sticker themes list failed", error.message);
    return { rows: [], loadError: true };
  }
  const rows = ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    isEnabled: Boolean(r.is_enabled),
    imageCount: r.sticker_images?.[0]?.count ?? 0,
    createdAt: r.created_at as string,
  }));
  return { rows, loadError: false };
}

export async function getStickerTheme(
  id: string,
): Promise<StickerThemeDetail | null> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  // Explicit FK-COLUMN hint on the media_assets embed (avoids PGRST201
  // ambiguity — same lesson as the old wallpapers module).
  const { data, error } = await supabase
    .from("sticker_themes")
    .select(
      "id, name, is_enabled, created_at, sticker_images(id, order_index, media_assets:media_asset_id(bucket, path, mime_type, file_size_bytes))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin] sticker theme load failed", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as any;
  const images: StickerImageRow[] = ((row.sticker_images ?? []) as any[])
    .map((img) => {
      const m = img.media_assets;
      const url =
        m?.bucket && m?.path
          ? supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl
          : null;
      return {
        id: img.id as string,
        orderIndex: Number(img.order_index ?? 0),
        url,
        mime: (m?.mime_type as string) ?? "",
        sizeBytes: Number(m?.file_size_bytes ?? 0),
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    id: row.id,
    name: row.name,
    isEnabled: Boolean(row.is_enabled),
    createdAt: row.created_at,
    images,
  };
}

// ---------------------------------------------------------------------------
// Theme mutations
// ---------------------------------------------------------------------------

// Creates a theme. Themes always start DISABLED — they may only be enabled
// once >= 6 sticker images exist (DB-enforced).
export async function createStickerTheme(
  _prev: StickerActionState,
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const name = s(formData, "name").slice(0, NAME_MAX + 1);
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { error: "err.name" };
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("sticker_themes")
    .insert({ name, is_enabled: false, created_by: ctx.profileId })
    .select("id")
    .single();
  if (error) {
    // unique index on lower(name)
    if ((error as { code?: string }).code === "23505") {
      return { error: "err.duplicate" };
    }
    console.error("[admin] sticker theme insert failed", error.message);
    return { error: "err.server" };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_theme.create",
    targetTable: "sticker_themes",
    targetId: created?.id ?? null,
    metadata: { name },
  });

  revalidatePath("/stickers");
  return { ok: true };
}

export async function renameStickerTheme(
  _prev: StickerActionState,
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  const name = s(formData, "name").slice(0, NAME_MAX + 1);
  if (!UUID_RE.test(id)) return { error: "err.server" };
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { error: "err.name" };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("sticker_themes")
    .update({ name })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { error: "err.duplicate" };
    }
    console.error("[admin] sticker theme rename failed", error.message);
    return { error: "err.server" };
  }
  if (!updated) return { error: "err.server" };

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_theme.rename",
    targetTable: "sticker_themes",
    targetId: id,
    metadata: { name },
  });

  revalidatePath("/stickers");
  revalidatePath(`/stickers/${id}`);
  return { ok: true };
}

// Enables/disables a theme. The DB trigger blocks enabling with < 6 images —
// that error is mapped to the friendly "needs at least 6" code, never leaked.
export async function setStickerThemeEnabled(
  _prev: StickerActionState,
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  const enabledRaw = s(formData, "__enabled");
  if (!UUID_RE.test(id)) return { error: "err.server" };
  if (enabledRaw !== "true" && enabledRaw !== "false") {
    return { error: "err.server" };
  }
  const enabled = enabledRaw === "true";

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("sticker_themes")
    .update({ is_enabled: enabled })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isGuardError(error)) return { error: "err.needsFive" };
    console.error("[admin] sticker theme toggle failed", error.message);
    return { error: "err.server" };
  }
  if (!updated) return { error: "err.server" };

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_theme.toggle",
    targetTable: "sticker_themes",
    targetId: id,
    metadata: { enabled },
  });

  revalidatePath("/stickers");
  revalidatePath(`/stickers/${id}`);
  return { ok: true };
}

// Typed-confirm delete (the operator must type the exact theme name). Deleting
// the theme cascades the sticker_images rows; the media_assets rows and the
// storage binaries are then removed BEST-EFFORT — a cleanup failure never
// fails the action (it is logged server-side; orphans are harmless).
export async function deleteStickerTheme(
  _prev: StickerActionState,
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  const confirm = s(formData, "confirm");
  if (!UUID_RE.test(id)) return { error: "err.server" };

  const supabase = await createClient();
  const { data: theme, error: loadErr } = await supabase
    .from("sticker_themes")
    .select(
      "id, name, sticker_images(id, media_asset_id, media_assets:media_asset_id(bucket, path))",
    )
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !theme) {
    if (loadErr) {
      console.error("[admin] sticker theme delete load failed", loadErr.message);
    }
    return { error: "err.server" };
  }
  // Server-side typed-confirm check (the disabled submit button is UX only).
  if (confirm !== (theme as any).name) return { error: "err.confirm" };

  const images = (((theme as any).sticker_images ?? []) as any[]).map((i) => ({
    mediaAssetId: i.media_asset_id as string,
    bucket: (i.media_assets?.bucket as string) ?? BUCKET,
    path: (i.media_assets?.path as string) ?? "",
  }));

  const { error: delErr } = await supabase
    .from("sticker_themes")
    .delete()
    .eq("id", id);
  if (delErr) {
    console.error("[admin] sticker theme delete failed", delErr.message);
    return { error: "err.server" };
  }

  // Best-effort cleanup: sticker_images rows are gone (CASCADE), which frees
  // the media_assets RESTRICT FK — remove binaries + metadata rows now.
  const paths = images.filter((i) => i.path).map((i) => i.path);
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) {
      console.error("[admin] sticker storage cleanup failed", rmErr.message);
    }
  }
  const assetIds = images.map((i) => i.mediaAssetId).filter(Boolean);
  if (assetIds.length) {
    const { error: maErr } = await supabase
      .from("media_assets")
      .delete()
      .in("id", assetIds);
    if (maErr) {
      console.error("[admin] sticker media_assets cleanup failed", maErr.message);
    }
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_theme.delete",
    targetTable: "sticker_themes",
    targetId: id,
    metadata: { name: (theme as any).name, imageCount: images.length },
    severity: "warning",
  });

  revalidatePath("/stickers");
  redirect("/stickers");
}

// ---------------------------------------------------------------------------
// Image mutations
// ---------------------------------------------------------------------------

// Records a sticker the browser just uploaded to sticker-assets. The stored
// object is VERIFIED server-side and mime/size are derived from Storage
// metadata (client-submitted claims are ignored) — R7 attach pattern.
export async function attachStickerImage(
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const themeId = s(formData, "theme_id");
  const path = s(formData, "path");
  if (!UUID_RE.test(themeId)) return { error: "err.server" };

  // Strict path shape: <themeId>/<single safe png/webp filename>.
  const filename = splitStoragePath(path, `${themeId}/`);
  if (!filename || !FILENAME_RE.test(filename)) return { error: "err.server" };

  const supabase = await createClient();

  // The theme must exist before we attach anything to it.
  const { data: theme, error: themeErr } = await supabase
    .from("sticker_themes")
    .select("id")
    .eq("id", themeId)
    .maybeSingle();
  if (themeErr || !theme) return { error: "err.server" };

  // Verify the object actually exists in the bucket and derive size + mime
  // SERVER-side; reject anything outside the png/webp whitelist or over 2 MB.
  const obj = await verifyStorageObject(supabase, BUCKET, themeId, filename);
  if (!obj) return { error: "err.server" };
  if (!ALLOWED_MIME.includes(obj.mime)) return { error: "err.type" };
  if (obj.size > MAX_SIZE) return { error: "err.size" };

  const { data: media, error: mediaErr } = await supabase
    .from("media_assets")
    .insert({
      bucket: BUCKET,
      path,
      owner_profile_id: ctx.profileId,
      // Server-derived values only.
      mime_type: obj.mime,
      file_size_bytes: obj.size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (mediaErr || !media) {
    console.error("[admin] sticker media insert failed", mediaErr?.message);
    return { error: "err.server" };
  }

  // Append at the end of the theme's ordering.
  const { data: last } = await supabase
    .from("sticker_images")
    .select("order_index")
    .eq("theme_id", themeId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = Number((last as any)?.order_index ?? -1) + 1;

  const { data: created, error: insErr } = await supabase
    .from("sticker_images")
    .insert({
      theme_id: themeId,
      media_asset_id: media.id,
      order_index: nextIndex,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    // Roll back the orphaned binary + metadata row (best effort).
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from("media_assets").delete().eq("id", media.id);
    console.error("[admin] sticker image insert failed", insErr?.message);
    return { error: "err.server" };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_image.add",
    targetTable: "sticker_images",
    targetId: created.id,
    metadata: { theme_id: themeId, path, mime: obj.mime, size: obj.size },
  });

  revalidatePath(`/stickers/${themeId}`);
  revalidatePath("/stickers");
  return { ok: true };
}

// Deletes one sticker. The DB guard blocks removing an image that would drop
// an ENABLED theme below 6 — mapped to a friendly code. Storage/metadata
// cleanup is best-effort and never fails the action.
export async function deleteStickerImage(
  _prev: StickerActionState,
  formData: FormData,
): Promise<StickerActionState> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  if (!UUID_RE.test(id)) return { error: "err.server" };

  const supabase = await createClient();
  const { data: row, error: loadErr } = await supabase
    .from("sticker_images")
    .select("id, theme_id, media_asset_id, media_assets:media_asset_id(bucket, path)")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) {
    if (loadErr) {
      console.error("[admin] sticker image load failed", loadErr.message);
    }
    return { error: "err.server" };
  }

  const themeId = (row as any).theme_id as string;
  const mediaAssetId = (row as any).media_asset_id as string;
  const path = ((row as any).media_assets?.path as string) ?? "";

  const { error: delErr } = await supabase
    .from("sticker_images")
    .delete()
    .eq("id", id);
  if (delErr) {
    if (isGuardError(delErr)) return { error: "err.keepFive" };
    console.error("[admin] sticker image delete failed", delErr.message);
    return { error: "err.server" };
  }

  // Best-effort cleanup of the binary + metadata row.
  if (path) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) {
      console.error("[admin] sticker storage cleanup failed", rmErr.message);
    }
  }
  if (mediaAssetId) {
    const { error: maErr } = await supabase
      .from("media_assets")
      .delete()
      .eq("id", mediaAssetId);
    if (maErr) {
      console.error("[admin] sticker media_assets cleanup failed", maErr.message);
    }
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.sticker_image.delete",
    targetTable: "sticker_images",
    targetId: id,
    metadata: { theme_id: themeId, path },
  });

  revalidatePath(`/stickers/${themeId}`);
  revalidatePath("/stickers");
  return { ok: true };
}
