import "server-only";

// Base64 data URLs in an imported JSON file -> objects in the question-media
// bucket + media_assets rows, returning the uuid the importers already accept
// as `meta.media_asset_id`.
//
// WHY THIS EXISTS
// ---------------
// `meta.media_asset_id` has been advertised by the client (bulk-client.ts) and
// error-mapped by the validator since Round 21, but nothing could ever produce
// a value for it: `attachQuestionMedia` hard-requires the path prefix
// `questions/<questionId>/`, and bulk question ids are generated INSIDE the
// import RPC. So the field was documented and unusable. Embedding the image in
// the JSON is what closes that chicken-and-egg gap — the asset is created
// first, and the question is inserted already pointing at it.
//
// It also removes the manual step the whole feature exists to avoid: no
// extracting images from a PDF, no renaming, no ZIP, no separate upload.
//
// WHY IT IS A NEW MODULE RATHER THAN A REUSE
// ------------------------------------------
// Every existing upload in admin-panel is BROWSER-side with a `File`
// (QuestionForm, QuestionMediaUploader, OlympiadQuestionForm, …), and
// `media-verify.ts` only inspects objects ALREADY in the bucket. There is no
// bytes-in path here. web-app has two (`avatarCore`, `childAvatarCore`) but
// they are a different Next app with no shared package. So the bytes path is
// written once, here, and both importers use it.
//
// SECURITY POSTURE — identical to the manual path, deliberately
//   * the mime is SNIFFED from the decoded bytes; the data URL's declared type
//     is used only to reject early and is NEVER trusted for storage or for the
//     media_assets row. A file claiming image/png but carrying an SVG or a
//     script is rejected on its bytes.
//   * SVG stays banned (it is not in SniffedImageMime) — stored-XSS vector.
//   * the object path is generated SERVER-side from a fresh uuid. Nothing from
//     the file influences it, so a crafted name cannot traverse or collide.
//   * the size cap is applied to DECODED bytes, not the base64 string.
//   * no base64 payload is ever logged. Errors carry indices, never content.
import { randomUUID } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
// Relative on purpose: this module is unit-tested and the vitest config has no
// "@/" alias (same reason bulk-validate.ts imports ./curriculum-shared).
import { EXT_BY_SNIFFED, sniffImageMime } from "../imageSniff";

/** Same bucket and cap the manual attach path uses (lib/admin/media.ts). */
export const BULK_MEDIA_BUCKET = "question-media";
export const BULK_MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MB decoded, per image

/**
 * Total decoded image bytes accepted from ONE import. Independent of the
 * per-image cap and of the transport limit: a file could hold 200 small images
 * and still exhaust memory and the bucket. 40 MB is ~8 images at the per-image
 * ceiling, well above any real question batch.
 */
export const BULK_MEDIA_TOTAL_MAX_BYTES = 40 * 1024 * 1024;

/** Shape shared with the validators; `data` is the raw base64 payload. */
export type ParsedDataUrl = {
  declaredMime: string;
  data: string;
};

// Deliberately strict: `data:` + a mime that looks like a mime + `;base64,`.
// Anything else (a bare URL, a `data:` without base64, a whitespace-mangled
// paste) is rejected before we spend memory decoding it.
const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** Split a data URL without decoding. Returns null when the shape is wrong. */
export function parseDataUrl(value: unknown): ParsedDataUrl | null {
  if (typeof value !== "string") return null;
  const m = DATA_URL_RE.exec(value.trim());
  if (!m) return null;
  return { declaredMime: m[1].toLowerCase(), data: m[2] };
}

/**
 * Decoded byte length of a base64 payload WITHOUT allocating it.
 *
 * The point is to reject an oversized image before materializing it: decoding
 * first and measuring afterwards is how a pasted 300 MB payload becomes an
 * out-of-memory crash rather than a validation error.
 */
export function base64ByteLength(data: string): number {
  const clean = data.replace(/\s/g, "");
  if (clean.length === 0) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export type MediaFailure =
  | "badDataUrl" // not a data: URL, or not base64
  | "unsupportedType" // bytes are not png/jpeg/webp/gif
  | "tooLarge" // over the per-image cap
  | "corrupt" // decodes to nothing / unreadable
  | "uploadFailed";

export type IngestedMedia = {
  mediaAssetId: string;
  bucket: string;
  path: string;
  bytes: number;
};

/**
 * Validate one data URL and, if valid, decode it.
 *
 * PURE except for the decode — no network, no storage — so the validators can
 * run exactly these rules client-side before anything is uploaded, and the
 * server can re-run them without duplicating the logic.
 */
export function decodeImageDataUrl(
  value: unknown,
): { ok: true; bytes: Buffer; mime: keyof typeof EXT_BY_SNIFFED } | { ok: false; reason: MediaFailure } {
  const parsed = parseDataUrl(value);
  if (!parsed) return { ok: false, reason: "badDataUrl" };

  // Cheap rejection first, on the declared length. The declared MIME is not
  // trusted for anything else.
  if (base64ByteLength(parsed.data) > BULK_MEDIA_MAX_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(parsed.data, "base64");
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (bytes.length === 0) return { ok: false, reason: "corrupt" };
  // Re-check on the REAL length: base64ByteLength is an estimate on a string
  // that may contain whitespace or invalid characters Buffer silently drops.
  if (bytes.length > BULK_MEDIA_MAX_BYTES) return { ok: false, reason: "tooLarge" };

  // The only type check that counts.
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return { ok: false, reason: "unsupportedType" };

  return { ok: true, bytes, mime: sniffed };
}

/**
 * Upload one already-decoded image and create its media_assets row.
 *
 * The caller owns cleanup: it collects every returned {bucket, path} and calls
 * removeIngestedMedia() if any later step fails. That compensating delete is
 * the ONLY thing standing between a failed import and a permanently orphaned
 * object, because the images necessarily exist before the questions that would
 * otherwise cascade them away.
 */
export async function uploadIngestedImage(
  supabase: SupabaseClient,
  // Nullable to match the guards' ctx.profileId and the column itself
  // (media_assets.owner_profile_id is nullable, as the manual attach path
  // already relies on). Widened rather than cast at the call site — a cast
  // would only hide the same null.
  ownerProfileId: string | null,
  bytes: Buffer,
  mime: keyof typeof EXT_BY_SNIFFED,
): Promise<{ ok: true; media: IngestedMedia } | { ok: false; reason: MediaFailure }> {
  // Server-generated, flat, collision-free. Nothing from the uploaded file
  // reaches the path — `bulk/` marks the provenance for later auditing, and the
  // uuid satisfies uq_media_bucket_path without ever needing a retry.
  const path = `bulk/${randomUUID()}.${EXT_BY_SNIFFED[mime]}`;

  const { error: upErr } = await supabase.storage
    .from(BULK_MEDIA_BUCKET)
    .upload(path, bytes, {
      // The SNIFFED mime, never the declared one.
      contentType: mime,
      // Never overwrite: a colliding path means something is badly wrong and
      // silently replacing another question's image would be worse than failing.
      upsert: false,
    });
  if (upErr) {
    console.error("[admin] bulk media upload failed", upErr.message);
    return { ok: false, reason: "uploadFailed" };
  }

  const { data: media, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      bucket: BULK_MEDIA_BUCKET,
      path,
      owner_profile_id: ownerProfileId,
      mime_type: mime,
      file_size_bytes: bytes.length,
      visibility: "public",
    })
    .select("id")
    .single();

  if (insErr || !media) {
    console.error("[admin] bulk media row insert failed", insErr?.message);
    // The object is already up but has no row — remove it now rather than
    // leaving an object nothing references.
    await supabase.storage.from(BULK_MEDIA_BUCKET).remove([path]).catch(() => {});
    return { ok: false, reason: "uploadFailed" };
  }

  return {
    ok: true,
    media: {
      mediaAssetId: media.id as string,
      bucket: BULK_MEDIA_BUCKET,
      path,
      bytes: bytes.length,
    },
  };
}

/**
 * Compensating cleanup for a failed import.
 *
 * Best-effort by design: it runs on a path that is ALREADY failing, and
 * throwing here would replace a clear validation error with an opaque one. A
 * leftover object is a tracked cost; a lost error message is a support ticket.
 */
export async function removeIngestedMedia(
  supabase: SupabaseClient,
  media: IngestedMedia[],
): Promise<void> {
  if (media.length === 0) return;
  const ids = media.map((m) => m.mediaAssetId);
  const paths = media.map((m) => m.path);
  try {
    // Rows first: a media_assets row pointing at a deleted object is the more
    // confusing of the two possible half-states.
    await supabase.from("media_assets").delete().in("id", ids);
    await supabase.storage.from(BULK_MEDIA_BUCKET).remove(paths);
  } catch (e) {
    console.error(
      "[admin] bulk media cleanup failed",
      e instanceof Error ? e.message : "unknown",
      `count=${media.length}`,
    );
  }
}
