// BROWSER-side media phase for bulk import: turn every image REFERENCE in a
// parsed file into a verified `meta.media_asset_id`, uploading each image as
// its OWN request. The bytes come from a caller-supplied resolver — today the
// uploaded ZIP (lib/zip-bulk.ts).
//
// WHY THIS EXISTS
// ---------------
// Carrying the images inside the import request makes its size O(image bytes).
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
// its bytes. If the browser uploaded with the type implied by the file's NAME, a
// mislabelled image would upload successfully and then fail verification,
// leaving bytes in the bucket that nothing references. Typing it here first
// means we upload with the true type, or do not upload at all.
import { createClient } from "@/lib/supabase/client";
// Relative on purpose: this module is unit-tested and the vitest config has no
// "@/" alias for the pure helpers it shares with the server side.
import { EXT_BY_SNIFFED, isDegenerateImage, sniffImageMime } from "./imageSniffCore";
import { collectMediaRefs, type MediaRef } from "./bulk-client";
// The SAME constants the server verifier re-checks the stored object against,
// not a copy of them (see bulk-media-shared.ts).
import {
  BULK_MEDIA_MAX_BYTES as MAX_BYTES_PER_IMAGE,
  BULK_MEDIA_TOTAL_MAX_BYTES as MAX_BYTES_TOTAL,
} from "./bulk-media-shared";

const BUCKET = "question-media";
/** Kept small: parallel uploads help, but a wide fan-out just trades one
 *  timeout for many and makes a partial failure harder to clean up. */
const CONCURRENCY = 4;

/**
 * Cache lifetime for an imported question image, in seconds (one year).
 *
 * WHY SO LONG, AND WHY IT IS SAFE
 * -------------------------------
 * These objects are IMMUTABLE by construction: the key is
 * `imports/<batchId>/<uuid>.<ext>` and every upload passes `upsert: false`, so a
 * given URL can never return different bytes. Replacing a question's picture
 * mints a new uuid and therefore a new URL. That is exactly the condition a long
 * max-age requires — there is no stale-content risk to trade against.
 *
 * WHAT IT BUYS
 * ------------
 * Supabase defaults to `max-age=3600`. At one hour, a student revisiting an
 * exam an hour later re-downloads every image, so egress scales with ATTEMPTS.
 * At a year it scales with DISTINCT IMAGES PER DEVICE instead: the second view
 * is served from the browser cache and issues no request at all. Storage is not
 * the constraint on any Supabase plan — egress is — so this is the one number
 * that decides whether an image-heavy olympiad is cheap or expensive to serve.
 */
const IMAGE_CACHE_SECONDS = 31_536_000;

/** Where the bytes for one reference come from. Returning a message key rather
 *  than throwing keeps a single missing image a numbered row error. */
export type MediaSource =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; messageKey: string; file?: string };
export type MediaResolver = (ref: string) => MediaSource | Promise<MediaSource>;

/** `file` names the exact reference that failed ("images/q1.png"), so a row
 *  error points at a filename instead of at a generic sentence. */
export type MediaUploadFailure = { row: number; messageKey: string; file?: string };

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

/**
 * Upload and verify every referenced image, returning rewritten items.
 *
 * `verify` and `resolve` are injected rather than imported so this module stays
 * free of any server-action import and remains unit-testable without a network.
 */
export async function uploadEmbeddedMedia(
  items: unknown[],
  batchId: string,
  buildPath: (ext: string) => string,
  verify: (
    batchId: string,
    path: string,
    expectedBytes: number,
  ) => Promise<{ ok: true; mediaAssetId: string } | { ok: false; error: string }>,
  resolve: MediaResolver,
): Promise<MediaUploadOutcome> {
  const supabase = createClient();
  const failures: MediaUploadFailure[] = [];
  const uploaded: { path: string; mediaAssetId: string }[] = [];
  const out = items.map((it) => it);

  // Every image in the file: the QUESTION's own picture (meta.image) and each
  // OPTION's per-locale picture (options[n].image.<locale>). Both travel the
  // same upload+verify path; only where the resulting uuid is written back
  // differs, which is what `target` records. The scan lives in bulk-client so
  // the unreferenced-image report cannot disagree with it about what counts as
  // a reference.
  const jobs: MediaRef[] = collectMediaRefs(items);
  if (jobs.length === 0) return { items: out, failures, uploaded, batchId };

  let totalBytes = 0;
  let stopped = false;

  async function runOne(job: MediaRef): Promise<void> {
    if (stopped) return;
    const row = job.i + 1;

    const source = await resolve(job.ref);
    if (!source.ok) {
      failures.push({ row, messageKey: source.messageKey, file: source.file ?? job.ref });
      return;
    }
    const bytes = source.bytes;
    if (!bytes || bytes.length === 0) {
      failures.push({ row, messageKey: "bulk.err.badImage", file: job.ref });
      return;
    }
    if (bytes.length > MAX_BYTES_PER_IMAGE) {
      failures.push({ row, messageKey: "bulk.err.imageTooLarge", file: job.ref });
      return;
    }
    // Running total is checked here rather than up front because the real size
    // is only known now; crossing it stops the whole batch, since the remaining
    // uploads would be wasted work either way.
    totalBytes += bytes.length;
    if (totalBytes > MAX_BYTES_TOTAL) {
      stopped = true;
      failures.push({ row, messageKey: "bulk.err.imageTotal", file: job.ref });
      return;
    }

    // Type from the bytes, never from the file extension — see the header.
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      failures.push({ row, messageKey: "bulk.err.imageType", file: job.ref });
      return;
    }

    // A 1x1 is a PLACEHOLDER, and it used to import perfectly: real PNG magic,
    // under every cap, HTTP 200 from storage — and invisible in the exam. The
    // template's own images/q1.png is exactly this, so an admin who edited the
    // template's JSON and kept its pictures shipped blank questions and got no
    // warning anywhere. Refusing here names the file, so the fix is obvious.
    if (isDegenerateImage(bytes, sniffed)) {
      failures.push({ row, messageKey: "bulk.err.imagePlaceholder", file: job.ref });
      return;
    }

    const path = buildPath(EXT_BY_SNIFFED[sniffed]);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: sniffed,
      // `upsert: false` is what makes IMAGE_CACHE_SECONDS safe: together with
      // the uuid in the key it guarantees this URL's bytes never change.
      // Never overwrite: a collision means something is wrong, and silently
      // replacing another import's image is worse than failing.
      upsert: false,
      cacheControl: String(IMAGE_CACHE_SECONDS),
    });
    if (upErr) {
      failures.push({ row, messageKey: "bulk.err.imageUpload", file: job.ref });
      return;
    }

    // The stored object is re-measured against the bytes we sent. Storage
    // reporting a different length means the upload was truncated or re-encoded
    // in transit, which would otherwise surface much later as a broken image in
    // an exam rather than as a failed import.
    const res = await verify(batchId, path, bytes.length);
    if (!res.ok) {
      // The object exists but has no row — remove it now rather than leaving
      // bytes nothing references.
      await supabase.storage.from(BUCKET).remove([path]);
      failures.push({ row, messageKey: "bulk.err.imageUpload", file: job.ref });
      return;
    }

    uploaded.push({ path, mediaAssetId: res.mediaAssetId });

    // Rewrite: the uuid the server will re-check replaces the reference, and
    // the reference is DELETED so the import request carries no ZIP path the
    // server would have to interpret.
    const src = out[job.i] as Record<string, unknown>;

    if (job.target.kind === "question") {
      const meta = { ...((src.meta ?? {}) as Record<string, unknown>) };
      meta.media_asset_id = res.mediaAssetId;
      delete meta.image;
      out[job.i] = { ...src, meta };
      return;
    }

    // Option image: the uuid replaces the path IN PLACE, keeping the
    // per-locale map shape the importer expects (options[n].image.<locale>).
    // Rebuilt rather than mutated because several option images on the same row
    // are uploaded concurrently and would otherwise race on one shared object.
    const opts = [...((src.options ?? []) as unknown[])];
    const target = { ...((opts[job.target.opt] ?? {}) as Record<string, unknown>) };
    const image = { ...((target.image ?? {}) as Record<string, unknown>) };
    image[job.target.locale] = res.mediaAssetId;
    target.image = image;
    opts[job.target.opt] = target;
    out[job.i] = { ...src, options: opts };
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
