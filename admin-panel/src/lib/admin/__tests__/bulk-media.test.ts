import { describe, it, expect } from "vitest";
import {
  BULK_MEDIA_MAX_BYTES,
  base64ByteLength,
  decodeImageDataUrl,
  parseDataUrl,
} from "../bulk-media";

// Minimal real headers — the sniffer reads magic numbers, so these must be the
// actual signatures, not plausible-looking bytes.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");

const url = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString("base64")}`;

describe("parseDataUrl", () => {
  it("accepts a well-formed base64 data URL", () => {
    const p = parseDataUrl(url("image/png", PNG));
    expect(p?.declaredMime).toBe("image/png");
    expect(p?.data.length).toBeGreaterThan(0);
  });

  it("rejects anything that is not a base64 data URL", () => {
    expect(parseDataUrl("https://example.com/a.png")).toBeNull();
    expect(parseDataUrl("data:image/png,notbase64")).toBeNull();
    expect(parseDataUrl("")).toBeNull();
    expect(parseDataUrl(null)).toBeNull();
    expect(parseDataUrl(12345)).toBeNull();
    expect(parseDataUrl({})).toBeNull();
  });
});

describe("base64ByteLength", () => {
  it("matches the real decoded length, so the size gate can run before decoding", () => {
    for (const buf of [PNG, JPEG, GIF, Buffer.alloc(1), Buffer.alloc(2), Buffer.alloc(3)]) {
      expect(base64ByteLength(buf.toString("base64"))).toBe(buf.length);
    }
  });

  it("is unaffected by whitespace in a pasted payload", () => {
    const b64 = PNG.toString("base64");
    const wrapped = b64.replace(/(.{8})/g, "$1\n");
    expect(base64ByteLength(wrapped)).toBe(PNG.length);
  });
});

describe("decodeImageDataUrl", () => {
  it("accepts png, jpeg and gif and reports the SNIFFED mime", () => {
    expect(decodeImageDataUrl(url("image/png", PNG))).toMatchObject({ ok: true, mime: "image/png" });
    expect(decodeImageDataUrl(url("image/jpeg", JPEG))).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(decodeImageDataUrl(url("image/gif", GIF))).toMatchObject({ ok: true, mime: "image/gif" });
  });

  it("types from BYTES, not from the declared mime", () => {
    // A JPEG announcing itself as PNG must still be stored as a JPEG.
    const r = decodeImageDataUrl(url("image/png", JPEG));
    expect(r).toMatchObject({ ok: true, mime: "image/jpeg" });
  });

  it("rejects SVG however it is declared — stored-XSS vector", () => {
    expect(decodeImageDataUrl(url("image/svg+xml", SVG))).toMatchObject({
      ok: false,
      reason: "unsupportedType",
    });
    // The dangerous case: SVG bytes wearing a PNG label.
    expect(decodeImageDataUrl(url("image/png", SVG))).toMatchObject({
      ok: false,
      reason: "unsupportedType",
    });
  });

  it("rejects a payload over the per-image cap", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(BULK_MEDIA_MAX_BYTES)]);
    expect(decodeImageDataUrl(url("image/png", big))).toMatchObject({
      ok: false,
      reason: "tooLarge",
    });
  });

  it("rejects empty and malformed payloads without throwing", () => {
    expect(decodeImageDataUrl("data:image/png;base64,")).toMatchObject({ ok: false });
    expect(decodeImageDataUrl(url("image/png", Buffer.alloc(0)))).toMatchObject({
      ok: false,
      reason: "badDataUrl",
    });
    expect(decodeImageDataUrl("not a data url at all")).toMatchObject({
      ok: false,
      reason: "badDataUrl",
    });
  });

  it("rejects bytes that are not an image at all", () => {
    const text = Buffer.from("this is plain text, not an image", "utf8");
    expect(decodeImageDataUrl(url("image/png", text))).toMatchObject({
      ok: false,
      reason: "unsupportedType",
    });
  });
});
