// PURE image magic-number sniffing — no imports, no environment assumptions.
//
// Extracted from imageSniff.ts so the BROWSER can sniff too. That is not a
// convenience: the bulk-import upload path must type an image from its bytes
// BEFORE uploading, because the server verifier rejects an object whose stored
// content-type disagrees with its real bytes. Sniffing only on the server would
// mean a mislabelled image uploads, then fails verification, leaving an orphan
// object nobody references.
//
// imageSniff.ts still exists and re-exports all of this, so every server import
// (media-verify.ts, bulk-media.ts) is untouched and keeps its server-only guard.
// Same split, same reason, as lib/admin/curriculum-shared.ts.

export type SniffedImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

export const EXT_BY_SNIFFED: Record<SniffedImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function sniffImageMime(bytes: Uint8Array): SniffedImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 // 8
  ) {
    return "image/gif";
  }
  return null;
}
