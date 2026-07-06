import "server-only";

// Server-side verification of browser-uploaded storage objects (security fix:
// never trust client-supplied mime/size form fields when recording
// media_assets rows).
//
// PLAIN module (no "use server") so it can export sync helpers/types and be
// imported by "use server" action files.
import type { createClient } from "@/lib/supabase/server";
import { sniffImageMime, type SniffedImageMime } from "@/lib/imageSniff";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Strict final path segment: single segment, safe stem, image extension only
// (svg is deliberately NOT accepted — SVG can carry scripts).
export const IMAGE_FILENAME_RE = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif)$/;
// Question media additionally supports small audio files (existing feature —
// the question-media bucket allows audio/mpeg, audio/mp4, audio/ogg).
export const QUESTION_MEDIA_FILENAME_RE =
  /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|mp3|mpga|m4a|mp4|ogg|oga)$/;

// Splits a client-submitted storage path into its single final segment after
// validating the expected feature prefix. Returns null when the path does not
// start with the prefix or contains extra segments.
export function splitStoragePath(
  path: string,
  expectedPrefix: string,
): string | null {
  if (!path.startsWith(expectedPrefix)) return null;
  const filename = path.slice(expectedPrefix.length);
  if (!filename || filename.includes("/")) return null;
  return filename;
}

export type VerifiedObject = { size: number; mime: string };

// Confirms the object actually exists in the bucket and derives size + mime
// SERVER-side from storage metadata (the values later written to media_assets).
// Returns null when the object is missing or has no usable metadata.
export async function verifyStorageObject(
  supabase: ServerClient,
  bucket: string,
  dir: string,
  filename: string,
): Promise<VerifiedObject | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(dir, { search: filename });
  if (error || !data) return null;
  const entry = data.find((e) => e.name === filename);
  if (!entry) return null;
  const meta = (entry.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
  const size = Number(meta.size ?? 0);
  const mime = typeof meta.mimetype === "string" ? meta.mimetype : "";
  if (!Number.isFinite(size) || size <= 0 || !mime) return null;
  return { size, mime };
}

// Byte-level verification (audit finding M19). Storage `mimetype` metadata is
// set from the client's upload contentType, so it is attacker-controlled;
// after the metadata + size-cap checks the attach actions download the object
// and type it from its ACTUAL first bytes. Returns the sniffed mime when the
// bytes are one of our accepted raster formats (png/jpeg/webp/gif — SVG stays
// banned) AND they do not contradict the metadata-claimed type; null otherwise.
// Callers MUST enforce their size cap BEFORE calling (never download an
// unbounded object) and must record the SNIFFED mime, not the claimed one.
export async function sniffVerifiedImage(
  supabase: ServerClient,
  bucket: string,
  path: string,
  claimedMime: string,
): Promise<SniffedImageMime | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  let bytes: Uint8Array;
  try {
    // Only the magic-number prefix is needed to type the file.
    bytes = new Uint8Array(await data.slice(0, 16).arrayBuffer());
  } catch {
    return null;
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return null;
  // Reject when the stored/claimed type contradicts the real bytes.
  if (claimedMime && claimedMime !== sniffed) return null;
  return sniffed;
}
