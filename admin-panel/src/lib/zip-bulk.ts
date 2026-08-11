// Bridge between the raw ZIP reader and the existing bulk-import helpers: find
// questions.json inside the archive, parse it with the SAME error keys the
// text-only path uses, and expose the archive as a media source for the upload
// phase.
//
// No supabase import on purpose — this stays a pure module so the resolution
// rules (which are where a mixed import actually goes wrong) are unit-testable
// without a network.
import {
  BULK_MAX_FILE_BYTES,
  BULK_MAX_ZIP_BYTES,
  ZIP_IMAGE_EXT_RE,
  ZIP_JSON_NAME,
  collectMediaRefs,
  type ZipRefState,
} from "./bulk-client";
// Type-only: erased at build time, so importing the browser-upload module here
// pulls in no supabase client.
import type { MediaResolver, MediaSource } from "./bulk-upload-media";
import { normalizeZipPath, openZip, type ZipArchive, type ZipFailure } from "./zipRead";

export { BULK_MAX_ZIP_BYTES as BULK_ZIP_MAX_BYTES, ZIP_JSON_NAME };

export type ZipBulkParsed = {
  items: unknown[];
  zip: ZipArchive;
  /** The directory questions.json sits in — "" at the archive root. Every
   *  image reference in the file is resolved relative to it. */
  root: string;
  /** The archive's own spelling of the JSON entry, so the unreferenced-image
   *  report can exclude exactly that member whatever its casing. */
  jsonPath: string;
};

/** One failure key per reason. A generic "broken file" would leave the admin
 *  guessing between an encrypted archive, a huge one and a corrupt one. */
const FAILURE_KEY: Record<ZipFailure, string> = {
  notZip: "bulk.err.zipUnreadable",
  corrupt: "bulk.err.zipUnreadable",
  unsupported: "bulk.err.zipUnsupported",
  badPath: "bulk.err.zipBadPath",
  tooManyEntries: "bulk.err.zipEntries",
  entryTooLarge: "bulk.err.imageTooLarge",
  totalTooLarge: "bulk.err.imageTotal",
};

export async function parseBulkZipFile(
  f: File,
  tt: (k: string) => string,
): Promise<{ error: string } | ZipBulkParsed> {
  if (f.size > BULK_MAX_ZIP_BYTES) return { error: tt("bulk.err.zipTooLarge") };

  const opened = await openZip(await f.arrayBuffer());
  if (!opened.ok) return { error: tt(FAILURE_KEY[opened.reason]) };
  const zip = opened.zip;

  // Accept questions.json at the archive root OR one folder down. Depth 1 is
  // deliberate: Windows "Send to → Compressed (zipped) folder" on a FOLDER
  // produces mixed_questions/questions.json, and rejecting that shape would be
  // the single most common support ticket this feature could generate.
  const candidates = zip.entries.filter((e) => {
    const segs = e.path.split("/");
    return segs.length <= 2 && segs[segs.length - 1].toLowerCase() === ZIP_JSON_NAME;
  });
  if (candidates.length === 0) return { error: tt("bulk.err.zipNoJson") };
  if (candidates.length > 1) return { error: tt("bulk.err.zipManyJson") };

  const jsonPath = candidates[0].path;
  const root = jsonPath.includes("/") ? jsonPath.slice(0, jsonPath.lastIndexOf("/")) : "";

  const read = await zip.read(jsonPath);
  if (!read.ok) return { error: tt(FAILURE_KEY[read.reason]) };
  // The 2 MB cap applies to the DECOMPRESSED JSON, which is what the server
  // action will receive — the compressed size in the ZIP says nothing about it.
  if (read.bytes.length > BULK_MAX_FILE_BYTES) return { error: tt("bulk.tooLarge") };

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8").decode(read.bytes));
  } catch {
    return { error: tt("bulk.invalidJson") };
  }
  if (!Array.isArray(data)) return { error: tt("bulk.notArray") };
  if (data.length === 0) return { error: tt("bulk.emptyArray") };

  return { items: data, zip, root, jsonPath };
}

/** Resolve one reference the way the file means it: relative to the folder
 *  holding questions.json. */
function resolveRef(
  p: ZipBulkParsed,
  ref: string,
): { ok: true; path: string } | { ok: false; reason: "missing" | "ambiguous" } {
  const clean = normalizeZipPath(ref);
  // A reference that cannot be a relative path is a path error, not a miss —
  // but the callers here only report presence, and the path shape is already
  // rejected by validateClientItemMedia with its own message.
  if (clean === null) return { ok: false, reason: "missing" };
  const joined = p.root === "" ? clean : `${p.root}/${clean}`;
  const normalized = normalizeZipPath(joined);
  if (normalized === null) return { ok: false, reason: "missing" };
  return p.zip.find(normalized);
}

export function makeZipRefChecker(p: ZipBulkParsed): (ref: string) => ZipRefState {
  return (ref: string) => {
    const hit = resolveRef(p, ref);
    return hit.ok ? "ok" : hit.reason;
  };
}

/**
 * A media source for uploadEmbeddedMedia: hands it the ZIP entry's bytes.
 *
 * `used` records the archive paths actually consumed, so a caller can tell an
 * unused image apart from one that merely resolved.
 */
export function makeZipMediaResolver(p: ZipBulkParsed): {
  resolve: MediaResolver;
  used: Set<string>;
} {
  const used = new Set<string>();
  const resolve: MediaResolver = async (ref: string): Promise<MediaSource> => {
    const hit = resolveRef(p, ref);
    if (!hit.ok) {
      return {
        ok: false,
        messageKey:
          hit.reason === "ambiguous" ? "bulk.err.imageAmbiguous" : "bulk.err.imageMissing",
        file: ref,
      };
    }
    const read = await p.zip.read(hit.path);
    if (!read.ok) {
      return {
        ok: false,
        messageKey:
          read.reason === "entryTooLarge"
            ? "bulk.err.imageTooLarge"
            : read.reason === "totalTooLarge"
              ? "bulk.err.imageTotal"
              : "bulk.err.badImage",
        file: ref,
      };
    }
    used.add(hit.path);
    return { ok: true, bytes: read.bytes };
  };
  return { resolve, used };
}

/**
 * Image entries the JSON never points at.
 *
 * Reported because the usual cause is a typo: the row error names the missing
 * path and this names the file that is actually there, and the two together
 * say what to fix. Importing anyway would silently drop a picture the admin
 * meant to include.
 */
export function unreferencedZipImages(p: ZipBulkParsed, items: unknown[]): string[] {
  const referenced = new Set<string>();
  for (const r of collectMediaRefs(items)) {
    const hit = resolveRef(p, r.ref);
    if (hit.ok) referenced.add(hit.path);
  }
  return p.zip.entries
    .filter(
      (e) =>
        e.path !== p.jsonPath &&
        ZIP_IMAGE_EXT_RE.test(e.path) &&
        !referenced.has(e.path),
    )
    .map((e) => e.path)
    .sort();
}
