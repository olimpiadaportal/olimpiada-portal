// BROWSER-side media phase for bulk import: turn every `meta.image` base64 data
// URL in a parsed file into a verified `meta.media_asset_id`, uploading each
// image as its OWN request.
//
// WHY THIS EXISTS
// ---------------
// Sending base64 inside the import request makes request size O(image bytes).
// A package with several image-heavy grades exceeds any body limit we could
// pick, and it fails at the framework layer — before the server action's first
// statement — so nothing is logged and no translated message reaches the admin.
//
// Doing the uploads here makes the import request O(question count) instead,
// permanently, and lets one bad image fail on its own instead of taking the
// whole batch down. The server still decides what is real: it re-downloads each
// object, types it from its magic bytes, and only then writes the media_assets
// row (lib/admin/import-media.ts). Nothing here is trusted.
//
// THE SNIFF HERE IS NOT DUPLICATED SECURITY — IT PREVENTS ORPHANS
// ---------------------------------------------------------------
// The server verifier rejects an object whose stored content-type contradicts
// its bytes. If the browser uploaded with the data URL's DECLARED type, a
// mislabelled image would upload successfully and then fail verification,
// leaving bytes in the bucket that nothing references. Typing it here first
// means we upload with the true type, or do not upload at all.
import { createClient } from "@/lib/supabase/client";
// Relative on purpose: this module is unit-tested and the vitest config has no
// "@/" alias for the pure helpers it shares with the server side.
import { EXT_BY_SNIFFED, sniffImageMime } from "./imageSniffCore";

/** Mirrors BULK_MEDIA_MAX_BYTES / BULK_MEDIA_TOTAL_MAX_BYTES on the server. */
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;
const MAX_BYTES_TOTAL = 40 * 1024 * 1024;
const BUCKET = "question-media";
/** Kept small: parallel uploads help, but a wide fan-out just trades one
 *  timeout for many and makes a partial failure harder to clean up. */
const CONCURRENCY = 4;

export type MediaUploadFailure = { row: number; messageKey: string };

export type MediaUploadOutcome = {
  /** The items with `meta.image` replaced by `meta.media_asset_id`. */
  items: unknown[];
  /** Per-row failures, 1-based, using the same message keys as the validators. */
  failures: MediaUploadFailure[];
  /** Every asset created, so an abandoned submit can be cleaned up. */
  uploaded: { path: string; mediaAssetId: string }[];
  /** The batch directory, for a best-effort cleanup of unclaimed objects. */
  batchId: string;
};

function decode(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1).replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Upload and verify every embedded image, returning rewritten items.
 *
 * `verify` is injected rather than imported so this module stays free of any
 * server-action import and remains unit-testable without a network.
 */
export async function uploadEmbeddedMedia(
  items: unknown[],
  batchId: string,
  buildPath: (ext: string) => string,
  verify: (batchId: string, path: string) => Promise<{ ok: true; mediaAssetId: string } | { ok: false; error: string }>,
): Promise<MediaUploadOutcome> {
  const supabase = createClient();
  const failures: MediaUploadFailure[] = [];
  const uploaded: { path: string; mediaAssetId: string }[] = [];
  const out = items.map((it) => it);

  // Index every row that actually carries an image.
  const jobs: { i: number; dataUrl: string }[] = [];
  items.forEach((it, i) => {
    const meta =
      it && typeof it === "object" && !Array.isArray(it)
        ? ((it as { meta?: unknown }).meta as Record<string, unknown> | undefined)
        : undefined;
    const raw = meta?.image;
    if (typeof raw === "string" && raw.trim() !== "") jobs.push({ i, dataUrl: raw.trim() });
  });
  if (jobs.length === 0) return { items: out, failures, uploaded, batchId };

  let totalBytes = 0;
  let stopped = false;

  async function runOne(job: { i: number; dataUrl: string }): Promise<void> {
    if (stopped) return;
    const row = job.i + 1;

    const bytes = decode(job.dataUrl);
    if (!bytes || bytes.length === 0) {
      failures.push({ row, messageKey: "bulk.err.badImage" });
      return;
    }
    if (bytes.length > MAX_BYTES_PER_IMAGE) {
      failures.push({ row, messageKey: "bulk.err.imageTooLarge" });
      return;
    }
    // Running total is checked here rather than up front because the decoded
    // size is only known now; crossing it stops the whole batch, since the
    // remaining uploads would be wasted work either way.
    totalBytes += bytes.length;
    if (totalBytes > MAX_BYTES_TOTAL) {
      stopped = true;
      failures.push({ row, messageKey: "bulk.err.imageTotal" });
      return;
    }

    // Type from the bytes, never from the data URL's label — see the header.
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      failures.push({ row, messageKey: "bulk.err.imageType" });
      return;
    }

    const path = buildPath(EXT_BY_SNIFFED[sniffed]);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: sniffed,
      // Never overwrite: a collision means something is wrong, and silently
      // replacing another import's image is worse than failing.
      upsert: false,
    });
    if (upErr) {
      failures.push({ row, messageKey: "bulk.err.imageUpload" });
      return;
    }

    const res = await verify(batchId, path);
    if (!res.ok) {
      // The object exists but has no row — remove it now rather than leaving
      // bytes nothing references.
      await supabase.storage.from(BUCKET).remove([path]);
      failures.push({ row, messageKey: "bulk.err.imageUpload" });
      return;
    }

    uploaded.push({ path, mediaAssetId: res.mediaAssetId });

    // Rewrite: the uuid the server will re-check replaces the payload, and the
    // payload is DELETED so no base64 can travel in the import request.
    const src = out[job.i] as Record<string, unknown>;
    const meta = { ...((src.meta ?? {}) as Record<string, unknown>) };
    meta.media_asset_id = res.mediaAssetId;
    delete meta.image;
    out[job.i] = { ...src, meta };
  }

  // Bounded fan-out.
  const queue = [...jobs];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      await runOne(job);
    }
  });
  await Promise.all(workers);

  return { items: out, failures, uploaded, batchId };
}

/** Best-effort removal of a batch's objects when the import is abandoned. */
export async function discardUploadedMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(BUCKET).remove(paths);
  } catch {
    // The server-side sweep is the real safety net; this only shortens the
    // window. Never let cleanup failure surface as an import error.
  }
}
