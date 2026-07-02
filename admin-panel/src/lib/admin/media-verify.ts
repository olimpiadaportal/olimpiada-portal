import "server-only";

// Server-side verification of browser-uploaded storage objects (security fix:
// never trust client-supplied mime/size form fields when recording
// media_assets rows).
//
// PLAIN module (no "use server") so it can export sync helpers/types and be
// imported by "use server" action files.
import type { createClient } from "@/lib/supabase/server";

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
