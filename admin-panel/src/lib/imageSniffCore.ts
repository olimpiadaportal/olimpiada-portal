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

// ---------------------------------------------------------------------------
// Pixel dimensions.
//
// WHY THIS EXISTS
// ---------------
// The mixed-import template ships images/q1.png and images/q1_option_1.png as
// 70-byte 1x1 transparent PNGs, so an admin who edits the template's JSON but
// keeps its pictures imports a real, valid, correctly-typed PNG that renders as
// nothing. Every check in the pipeline passed it: the magic bytes are a genuine
// PNG, the size is under every cap, storage returns HTTP 200. The only thing
// that distinguishes it from a real picture is that it is one pixel.
//
// Byte length alone cannot be the test — a small legitimate icon and a 1x1
// placeholder overlap — so the DIMENSIONS are read instead.
// ---------------------------------------------------------------------------

/** Reads big-endian uint32 without a DataView so this stays allocation-free. */
function be32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

/**
 * Pixel dimensions, or null when they cannot be determined.
 *
 * null means "unknown", NEVER "invalid": a format this cannot measure must not
 * be rejected on that basis, or a future encoder silently stops importing.
 */
export function imageDimensions(
  bytes: Uint8Array,
  mime: SniffedImageMime,
): { width: number; height: number } | null {
  if (mime === "image/png") {
    // 8-byte signature + 4-byte length + "IHDR" -> width at 16, height at 20.
    if (bytes.length < 24) return null;
    if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
      return null; // not IHDR-first; not worth guessing
    }
    return { width: be32(bytes, 16), height: be32(bytes, 20) };
  }

  if (mime === "image/gif") {
    if (bytes.length < 10) return null;
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }

  if (mime === "image/webp") {
    if (bytes.length < 30) return null;
    const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (tag === "VP8X") {
      // Canvas size is stored minus one, 24-bit little-endian.
      const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
      const h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
      return { width: w, height: h };
    }
    if (tag === "VP8 ") {
      // Lossy: 3-byte start code at 23..25, then 14-bit width/height.
      if (bytes.length < 30) return null;
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
    if (tag === "VP8L") {
      // Lossless: 14 bits width-1 then 14 bits height-1, after the 0x2f marker.
      if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
      const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // JPEG: walk the segment chain to a Start-Of-Frame marker. SOF0..SOF15 carry
  // the size; DHT/DRI/APPn/etc are skipped by their own declared length, and
  // the two DNL/DAC/RST markers that are NOT frame headers are excluded.
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++; // resync past padding rather than giving up
      continue;
    }
    const marker = bytes[at + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2; // standalone marker, no payload
      continue;
    }
    const segLen = (bytes[at + 2] << 8) | bytes[at + 3];
    if (segLen < 2) return null;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG extension
      marker !== 0xcc; // DAC
    if (isSof) {
      if (at + 9 >= bytes.length) return null;
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
      };
    }
    at += 2 + segLen;
  }
  return null;
}

/**
 * Is this too small to be a real picture?
 *
 * One pixel in either direction is the test. A 1xN strip is as unusable in a
 * question as a 1x1, and no legitimate exam image is either. Unknown dimensions
 * pass — see imageDimensions.
 */
export function isDegenerateImage(bytes: Uint8Array, mime: SniffedImageMime): boolean {
  const dim = imageDimensions(bytes, mime);
  if (!dim) return false;
  return dim.width < 2 || dim.height < 2;
}
