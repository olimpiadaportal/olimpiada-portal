// Two defects that together produced "the import succeeded but the exam shows
// no picture", both reproduced here so neither can come back.
//
// 1. WINDOWS-NATIVE ARCHIVES WERE REFUSED. PowerShell `Compress-Archive` and
//    older .NET ZipArchive write member names with BACKSLASHES ("images\q1.png").
//    normalizeZipPath rejected any backslash outright, so openZip returned
//    "badPath" and the whole archive — the one an admin makes by right-clicking
//    a folder — was refused.
//
// 2. A 1x1 PLACEHOLDER IMPORTED CLEANLY. The mixed template ships
//    images/q1.png as a 70-byte 1x1 transparent PNG. It has genuine PNG magic,
//    is under every size cap and uploads with HTTP 200, so nothing in the
//    pipeline could tell it from a real picture — it just rendered as nothing.
import { describe, expect, it } from "vitest";
import { crc32, normalizeZipPath, openZip } from "../zipRead";
import { imageDimensions, isDegenerateImage, sniffImageMime } from "../imageSniffCore";

// ---------------------------------------------------------------------------
// A minimal STORED-entry ZIP writer that can emit any member name, including
// the non-conformant ones real Windows tools produce. Deliberately local to
// this test: production must never write a backslash name.
// ---------------------------------------------------------------------------
function buildZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);

    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.bytes.length, true);
    lv.setUint32(22, f.bytes.length, true);
    lv.setUint16(26, name.length, true);

    const local = new Uint8Array(lh.length + name.length + f.bytes.length);
    local.set(lh, 0);
    local.set(name, lh.length);
    local.set(f.bytes, lh.length + name.length);
    locals.push(local);

    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); // stored
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.bytes.length, true);
    cv.setUint32(24, f.bytes.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);

    const central = new Uint8Array(ch.length + name.length);
    central.set(ch, 0);
    central.set(name, ch.length);
    centrals.push(central);

    offset += local.length;
  }

  const cdBytes = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdBytes, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdBytes + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const l of locals) {
    out.set(l, at);
    at += l.length;
  }
  for (const c of centrals) {
    out.set(c, at);
    at += c.length;
  }
  out.set(eocd, at);
  return out;
}

/** A real PNG of the given size — IHDR is all these assertions read. */
function pngOf(width: number, height: number): Uint8Array {
  const out = new Uint8Array(64);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const v = new DataView(out.buffer);
  v.setUint32(8, 13); // IHDR length
  out.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  v.setUint32(16, width);
  v.setUint32(20, height);
  return out;
}

describe("normalizeZipPath — Windows separators", () => {
  it("treats a backslash as a separator instead of refusing the archive", () => {
    expect(normalizeZipPath("images\\q1.png")).toBe("images/q1.png");
    expect(normalizeZipPath("a\\b\\c.png")).toBe("a/b/c.png");
  });

  it("still rejects traversal written with backslashes", () => {
    expect(normalizeZipPath("..\\..\\etc\\passwd")).toBeNull();
    expect(normalizeZipPath("images\\..\\..\\x.png")).toBeNull();
  });

  it("keeps every other rejection intact", () => {
    expect(normalizeZipPath("/images/q1.png")).toBeNull();
    expect(normalizeZipPath("C:/images/q1.png")).toBeNull();
    expect(normalizeZipPath("images/../q1.png")).toBeNull();
    expect(normalizeZipPath("")).toBeNull();
  });
});

describe("openZip — an archive made by Compress-Archive", () => {
  const image = pngOf(300, 200);

  it("opens it and returns the image bytes EXACTLY", async () => {
    // The precise shape PowerShell produces: backslash separators.
    const zipBytes = buildZip([
      { name: "questions.json", bytes: new TextEncoder().encode("[]") },
      { name: "images\\q1.png", bytes: image },
    ]);

    const opened = await openZip(zipBytes.buffer as ArrayBuffer);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    // The reference in questions.json uses forward slashes; it must still match.
    const hit = opened.zip.find("images/q1.png");
    expect(hit).toEqual({ ok: true, path: "images/q1.png" });
    if (!hit.ok) return;

    const read = await opened.zip.read(hit.path);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    // Byte-for-byte: the bug this guards against is silent substitution.
    expect(read.bytes.length).toBe(image.length);
    expect(Array.from(read.bytes)).toEqual(Array.from(image));
    expect(sniffImageMime(read.bytes)).toBe("image/png");
  });

  it("refuses an archive that escapes its own root", async () => {
    const zipBytes = buildZip([
      { name: "questions.json", bytes: new TextEncoder().encode("[]") },
      { name: "..\\..\\evil.png", bytes: pngOf(4, 4) },
    ]);
    const opened = await openZip(zipBytes.buffer as ArrayBuffer);
    expect(opened).toEqual({ ok: false, reason: "badPath" });
  });
});

describe("imageDimensions / isDegenerateImage", () => {
  it("reads PNG dimensions", () => {
    expect(imageDimensions(pngOf(300, 200), "image/png")).toEqual({ width: 300, height: 200 });
  });

  it("flags the 1x1 template placeholder", () => {
    // The exact bytes downloadBulkTemplate writes into images/q1.png.
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bin = Buffer.from(b64, "base64");
    const bytes = new Uint8Array(bin);
    expect(bytes.length).toBeLessThan(100); // ~70 bytes, as reported
    expect(sniffImageMime(bytes)).toBe("image/png"); // genuinely a PNG — that is why it slipped through
    expect(imageDimensions(bytes, "image/png")).toEqual({ width: 1, height: 1 });
    expect(isDegenerateImage(bytes, "image/png")).toBe(true);
  });

  it("flags 1xN and Nx1 strips too", () => {
    expect(isDegenerateImage(pngOf(1, 500), "image/png")).toBe(true);
    expect(isDegenerateImage(pngOf(500, 1), "image/png")).toBe(true);
  });

  it("passes a real picture", () => {
    expect(isDegenerateImage(pngOf(300, 200), "image/png")).toBe(false);
    expect(isDegenerateImage(pngOf(2, 2), "image/png")).toBe(false);
  });

  it("passes when dimensions cannot be read, rather than rejecting", () => {
    // Unknown must never mean invalid, or a future encoder stops importing.
    const truncated = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(imageDimensions(truncated, "image/png")).toBeNull();
    expect(isDegenerateImage(truncated, "image/png")).toBe(false);
  });

  it("reads GIF and JPEG dimensions", () => {
    const gif = new Uint8Array(16);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
    gif[6] = 0x2c; // 300 LE
    gif[7] = 0x01;
    gif[8] = 0xc8; // 200 LE
    gif[9] = 0x00;
    expect(imageDimensions(gif, "image/gif")).toEqual({ width: 300, height: 200 });

    // SOI + SOF0 carrying 200x300.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03,
    ]);
    expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ width: 300, height: 200 });
  });
});

// ---------------------------------------------------------------------------
// End to end through the layer that actually feeds the uploader: the bytes
// handed to uploadEmbeddedMedia must be the ZIP entry's bytes, unchanged.
// ---------------------------------------------------------------------------
describe("zip-bulk resolver — the bytes that reach the uploader", () => {
  it("hands back the entry's exact bytes for a Compress-Archive ZIP", async () => {
    const image = pngOf(300, 200);
    const optionImage = pngOf(120, 90);
    const json = JSON.stringify([
      {
        primary_locale: "az",
        meta: { image: "images/q1.png" },
        translations: { az: { body: "Sual", prompt: "Seçin", explanation: "İzah" } },
        options: [
          { is_correct: true, order_index: 0, text: { az: "" }, image: { az: "images/q1_option_1.png" } },
          { is_correct: false, order_index: 1, text: { az: "B" } },
        ],
      },
    ]);

    // Backslash names, forward-slash references — the real-world mismatch.
    const zipBytes = buildZip([
      { name: "questions.json", bytes: new TextEncoder().encode(json) },
      { name: "images\\q1.png", bytes: image },
      { name: "images\\q1_option_1.png", bytes: optionImage },
    ]);

    const { makeZipMediaResolver, parseBulkZipFile } = await import("../zip-bulk");
    const file = new File([zipBytes as BlobPart], "mixed_questions.zip", {
      type: "application/zip",
    });
    const parsed = await parseBulkZipFile(file, (k) => k);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;

    const { resolve } = makeZipMediaResolver(parsed);

    const q = await resolve("images/q1.png");
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.bytes.length).toBe(image.length);
      expect(Array.from(q.bytes)).toEqual(Array.from(image));
      expect(isDegenerateImage(q.bytes, "image/png")).toBe(false);
    }

    const o = await resolve("images/q1_option_1.png");
    expect(o.ok).toBe(true);
    if (o.ok) {
      expect(o.bytes.length).toBe(optionImage.length);
      expect(Array.from(o.bytes)).toEqual(Array.from(optionImage));
    }
  });

  it("reports a missing image instead of substituting anything", async () => {
    const json = JSON.stringify([{ primary_locale: "az", meta: { image: "images/nope.png" } }]);
    const zipBytes = buildZip([
      { name: "questions.json", bytes: new TextEncoder().encode(json) },
      { name: "images/q1.png", bytes: pngOf(10, 10) },
    ]);
    const { makeZipMediaResolver, parseBulkZipFile } = await import("../zip-bulk");
    const parsed = await parseBulkZipFile(
      new File([zipBytes as BlobPart], "x.zip", { type: "application/zip" }),
      (k) => k,
    );
    if ("error" in parsed) throw new Error("expected the ZIP to open");
    const { resolve } = makeZipMediaResolver(parsed);
    const r = await resolve("images/nope.png");
    expect(r).toEqual({
      ok: false,
      messageKey: "bulk.err.imageMissing",
      file: "images/nope.png",
    });
  });
});
