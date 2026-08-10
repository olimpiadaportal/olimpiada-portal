"use server";

// Verify ONE browser-uploaded import image and record it as a media_assets row.
//
// WHY THE BROWSER UPLOADS AND THE SERVER ONLY VERIFIES
// ---------------------------------------------------
// Sending base64 inside the import request makes the request size O(image
// bytes): a package with several image-heavy grades exceeds any body limit we
// could pick, and it fails at the framework layer — before the action's first
// statement — so nothing is logged and no translated message is shown.
//
// Uploading each image as its own request from the browser makes the import
// request O(question count) instead, permanently. Images then fail and retry
// individually rather than taking a whole package down with them.
//
// This is NOT a second storage mechanism: it is the pattern the manual question
// image already uses (QuestionMediaUploader uploads, media-verify.ts checks the
// stored bytes). This action is the import-flow twin of attachQuestionMedia.
//
// WHY VERIFICATION IS NOT OPTIONAL
// --------------------------------
// The browser writes the object AND could write the media_assets row itself —
// RLS policy `media_insert` allows it for any content.create user. So the row
// this action creates is the only one anybody should trust, and the import
// action refuses uuids that were not minted here (claimableMediaIds). Storage
// `mimetype` metadata comes from the uploader's own contentType, so it is
// attacker-controlled; the recorded mime is always the SNIFFED one.
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
import {
  IMAGE_FILENAME_RE,
  sniffVerifiedImage,
  splitStoragePath,
  verifyStorageObject,
} from "@/lib/admin/media-verify";
import {
  BULK_MEDIA_BUCKET,
  BULK_MEDIA_MAX_BYTES,
  IMPORT_MEDIA_PREFIX,
} from "@/lib/admin/bulk-media";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Objects older than this with no owner reference are treated as abandoned. */
const SWEEP_AGE_HOURS = 24;
/** Bounded so one import never turns into an unbounded delete. */
const SWEEP_LIMIT = 200;

export type VerifyImportImageState =
  | { ok: true; mediaAssetId: string }
  | { ok: false; error: string };

/**
 * The batch path a browser must upload to. Exported so the client builds the
 * exact key this action will accept — a mismatch is the difference between a
 * verified asset and an orphan.
 */
export async function importMediaPath(batchId: string, ext: string): Promise<string> {
  return `${IMPORT_MEDIA_PREFIX}${batchId}/${randomUUID()}.${ext}`;
}

export async function verifyImportImage(
  batchId: string,
  path: string,
): Promise<VerifyImportImageState> {
  // Authorize FIRST — before touching storage or reading any input.
  const ctx = await requirePermission("content.create");
  const t = withLocalStrings(await getT(), await getLocale());

  if (!UUID_RE.test(batchId)) return { ok: false, error: t("bulk.err.imageUpload") };

  // The path is client-supplied. Confining it to this batch's directory means a
  // caller cannot point the verifier at `questions/<id>/…` and mint a second
  // media_assets row for an image that already belongs to a question.
  const dir = `${IMPORT_MEDIA_PREFIX}${batchId}`;
  const filename = splitStoragePath(path, `${dir}/`);
  if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
    return { ok: false, error: t("bulk.err.imageUpload") };
  }

  const obj = await verifyStorageObject(await createClient(), BULK_MEDIA_BUCKET, dir, filename);
  if (!obj) return { ok: false, error: t("bulk.err.imageUpload") };

  // SIZE CAP BEFORE THE DOWNLOAD. sniffVerifiedImage fetches the whole object;
  // checking afterwards would mean pulling an unbounded file into memory to
  // discover it was too big. This ordering is the contract media-verify.ts
  // documents, and it is load-bearing rather than stylistic.
  if (obj.size > BULK_MEDIA_MAX_BYTES) {
    return { ok: false, error: t("bulk.err.imageTooLarge") };
  }

  const supabase = await createClient();
  const sniffed = await sniffVerifiedImage(supabase, BULK_MEDIA_BUCKET, path, obj.mime);
  if (!sniffed) return { ok: false, error: t("bulk.err.imageType") };

  const { data: media, error } = await supabase
    .from("media_assets")
    .insert({
      bucket: BULK_MEDIA_BUCKET,
      path,
      owner_profile_id: ctx.profileId,
      // Server-derived only: the SNIFFED mime and the size storage reports,
      // never anything the uploader claimed.
      mime_type: sniffed,
      file_size_bytes: obj.size,
      visibility: "public",
    })
    .select("id")
    .single();

  if (error || !media) {
    console.error("[admin] import media row insert failed", error?.message);
    return { ok: false, error: t("bulk.err.imageUpload") };
  }

  // Opportunistic sweep, deliberately AFTER the success path so a sweep problem
  // can never fail a good verification. See sweepAbandonedImportMedia.
  void sweepAbandonedImportMedia(ctx.profileId);

  return { ok: true, mediaAssetId: media.id as string };
}

/**
 * Delete this admin's abandoned import assets.
 *
 * The new failure mode this flow introduces: images are verified BEFORE the
 * import is submitted, so closing the tab in between leaves rows and objects
 * nobody references. Nothing sweeps Storage today — no scheduled job touches
 * it, and pg_cron could not anyway: it can delete the metadata row but not the
 * bytes, which would turn one kind of orphan into a worse, invisible one. So
 * the sweep lives where an HTTP caller already runs: the next import.
 *
 * Scoping is what makes it safe:
 *   * owner_profile_id — a user may only delete their own (RLS enforces this
 *     too, so a wider attempt would silently no-op rather than over-delete);
 *   * the imports/ prefix — never touches staging/, bulk/ or attached
 *     questions/<id>/ objects;
 *   * an age floor — a concurrently-open import is younger than the window;
 *   * unreferenced only — checked against EVERY media_assets consumer, because
 *     the column is plain text and nothing stops cross-use.
 */
async function sweepAbandonedImportMedia(profileId: string | null): Promise<void> {
  if (!profileId) return;
  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - SWEEP_AGE_HOURS * 3600_000).toISOString();

    const { data: candidates } = await supabase
      .from("media_assets")
      .select("id, path")
      .eq("bucket", BULK_MEDIA_BUCKET)
      .eq("owner_profile_id", profileId)
      .like("path", `${IMPORT_MEDIA_PREFIX}%`)
      .lt("created_at", cutoff)
      .limit(SWEEP_LIMIT);

    const rows = (candidates ?? []) as { id: string; path: string }[];
    if (rows.length === 0) return;

    // Referenced anywhere? media_assets has several consumers and the FKs are
    // ON DELETE SET NULL, so deleting a referenced row would silently blank a
    // live image rather than fail. Every consumer is checked.
    const ids = rows.map((r) => r.id);
    const referenced = new Set<string>();
    const consumers: [string, string][] = [
      ["question_translations", "media_asset_id"],
      ["question_explanations", "media_asset_id"],
      ["profiles", "avatar_media_id"],
      ["wallpapers", "media_asset_id"],
      ["sticker_images", "media_asset_id"],
      ["news", "cover_media_id"],
      ["olympiad_packages", "cover_media_id"],
    ];
    for (const [table, col] of consumers) {
      const { data } = await supabase.from(table).select(col).in(col, ids);
      // `as unknown` first: the dynamic column name defeats supabase-js's typed
      // row inference, which then widens to its error union.
      for (const row of ((data ?? []) as unknown) as Record<string, string | null>[]) {
        const v = row?.[col];
        if (v) referenced.add(v);
      }
    }

    const orphans = rows.filter((r) => !referenced.has(r.id));
    if (orphans.length === 0) return;

    // Rows first: a media_assets row pointing at a deleted object is the more
    // confusing half-state of the two.
    await supabase.from("media_assets").delete().in(
      "id",
      orphans.map((o) => o.id),
    );
    await supabase.storage.from(BULK_MEDIA_BUCKET).remove(orphans.map((o) => o.path));
  } catch (e) {
    // Best-effort by construction. A failed sweep is a tracked cost; a sweep
    // that breaks an import is a regression.
    console.error(
      "[admin] import media sweep failed",
      e instanceof Error ? e.message : "unknown",
    );
  }
}
