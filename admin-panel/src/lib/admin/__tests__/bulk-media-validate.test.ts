import { describe, it, expect } from "vitest";
import { validateItemMedia, validateOptionMedia } from "../bulk-validate";
import { validateClientItemMedia } from "../../bulk-client";

// The client and server validators are deliberate duplicates: the server copy
// imports the server-only i18n module, so the client mirror cannot share its
// code. They no longer check the SAME thing, though — and that asymmetry is the
// point of the ZIP flow:
//
//   client (before upload)  a relative path that exists in the chosen archive
//   server (after upload)   a uuid the browser phase already had verified
//
// So each side is asserted against its own contract, and the one rule they must
// still agree on — an image in text-only mode is a reported mismatch — is
// asserted against BOTH.
const t = ((k: string) => k) as never;
const tt = (k: string) => k;

const item = (image?: unknown) => ({ meta: image === undefined ? {} : { image } });
const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

describe("validateClientItemMedia — mixed mode takes ZIP PATHS", () => {
  it("accepts a relative path to an image next to questions.json", () => {
    expect(validateClientItemMedia(item("images/q1.png"), tt, true)).toBeNull();
    expect(validateClientItemMedia(item("q1.JPEG"), tt, true)).toBeNull();
    expect(validateClientItemMedia(item("  images/q1.webp  "), tt, true)).toBeNull();
  });

  it("REJECTS a base64 data URL — the format the ZIP flow replaced", () => {
    expect(validateClientItemMedia(item(DATA_URL), tt, true)).toBe("bulk.err.badImagePath");
  });

  it("rejects traversal, absolute and Windows paths", () => {
    for (const bad of ["../secret.png", "/etc/x.png", "C:\\images\\q1.png", "a\\b.png"]) {
      expect(validateClientItemMedia(item(bad), tt, true)).toBe("bulk.err.badImagePath");
    }
  });

  it("rejects a non-string reference", () => {
    expect(validateClientItemMedia(item(12345), tt, true)).toBe("bulk.err.badImagePath");
  });

  it("rejects an extension outside the allowed set — SVG stays banned", () => {
    expect(validateClientItemMedia(item("images/q1.svg"), tt, true)).toBe("bulk.err.imageType");
    expect(validateClientItemMedia(item("images/q1.bmp"), tt, true)).toBe("bulk.err.imageType");
  });

  it("reports a reference the archive cannot resolve", () => {
    const has = (ref: string) =>
      ref === "images/q1.png" ? ("ok" as const) : ref === "images/dup.png" ? ("ambiguous" as const) : ("missing" as const);
    expect(validateClientItemMedia(item("images/q1.png"), tt, true, has)).toBeNull();
    expect(validateClientItemMedia(item("images/q9.png"), tt, true, has)).toBe(
      "bulk.err.imageMissing",
    );
    expect(validateClientItemMedia(item("images/dup.png"), tt, true, has)).toBe(
      "bulk.err.imageAmbiguous",
    );
  });

  it("treats absent media as fine in BOTH modes", () => {
    // A mixed pool is text questions AND image questions together — media is
    // optional even when mixed is selected.
    for (const v of [undefined, "", "   ", null]) {
      expect(validateClientItemMedia(item(v), tt, true)).toBeNull();
    }
    expect(validateClientItemMedia(item(), tt, false)).toBeNull();
  });

  it("is safe on malformed items", () => {
    for (const v of [null, "nonsense", [], {}, { meta: "not an object" }]) {
      expect(validateClientItemMedia(v, tt, true)).toBeNull();
    }
  });
});

describe("text-only mode reports an image — client AND server agree", () => {
  it("returns mediaNotAllowed on both sides", () => {
    // The whole point: importing it silently would drop every image and still
    // report success.
    expect(validateClientItemMedia(item("images/q1.png"), tt, false)).toBe(
      "bulk.err.mediaNotAllowed",
    );
    expect(validateItemMedia(item("images/q1.png"), t, false)).toBe(
      "bulk.err.mediaNotAllowed",
    );
    expect(validateItemMedia(item(DATA_URL), t, false)).toBe("bulk.err.mediaNotAllowed");
  });
});

describe("validateItemMedia — the server only ever accepts an ALREADY-UPLOADED image", () => {
  it("refuses a surviving meta.image whatever its shape", () => {
    // The browser phase DELETES meta.image and writes meta.media_asset_id, so
    // anything left here means the request bypassed the import UI — including a
    // uuid, which belongs in the other field.
    expect(validateItemMedia(item("images/q1.png"), t, true)).toBe("bulk.err.imageNotUploaded");
    expect(validateItemMedia(item(DATA_URL), t, true)).toBe("bulk.err.imageNotUploaded");
    expect(validateItemMedia(item(UUID), t, true)).toBe("bulk.err.imageNotUploaded");
  });

  it("still treats absent media as fine", () => {
    expect(validateItemMedia(item(), t, true)).toBeNull();
    expect(validateItemMedia(item(""), t, true)).toBeNull();
    expect(validateItemMedia(null, t, true)).toBeNull();
  });

  it("checks the SHAPE of meta.media_asset_id, in both modes", () => {
    // Why this is not cosmetic: an unchecked value reached claimableMediaIds'
    // .in("id", …) against a uuid column, PostgREST errored, and the gate's
    // fail-closed branch then rejected EVERY media-carrying row in the file —
    // one hand-edited row taking down the whole import.
    const withId = (v: unknown) => ({ meta: { media_asset_id: v } });
    for (const bad of ["not-a-uuid", "images/q1.png", DATA_URL, 12345, "x' or '1'='1"]) {
      expect(validateItemMedia(withId(bad), t, true)).toBe("bulk.err.badMedia");
      expect(validateItemMedia(withId(bad), t, false)).toBe("bulk.err.badMedia");
    }
    expect(validateItemMedia(withId(UUID), t, true)).toBeNull();
    expect(validateItemMedia(withId(UUID.toUpperCase()), t, true)).toBeNull();
    // Absent or blank stays fine — the field is optional.
    for (const v of [undefined, null, "", "   "]) {
      expect(validateItemMedia(withId(v), t, true)).toBeNull();
    }
  });
});

describe("validateOptionMedia — option images arrive as verified uuids", () => {
  const opt = (image: unknown, text = "") => ({ text: { az: text }, image });

  it("ACCEPTS a uuid option image in mixed mode", () => {
    // The regression this fixes: the uuid used to be forwarded into the
    // data-URL check, so every rewritten option image was rejected server-side.
    expect(validateOptionMedia(opt({ az: UUID }), t, true, 0)).toBeNull();
    expect(validateOptionMedia(opt({ az: UUID, en: UUID, ru: UUID }), t, true, 0)).toBeNull();
  });

  it("rejects a non-uuid in ANY locale, not just az", () => {
    // Migration 104 casts every present locale with ::uuid, so a bad en/ru
    // value would abort the whole RPC rather than fail one row.
    expect(validateOptionMedia(opt({ az: UUID, en: "images/q1.png" }), t, true, 0)).toBe(
      "bulk.err.imageNotUploaded",
    );
    expect(validateOptionMedia(opt({ az: UUID, ru: DATA_URL }), t, true, 0)).toBe(
      "bulk.err.imageNotUploaded",
    );
    expect(validateOptionMedia(opt({ az: DATA_URL }), t, true, 0)).toBe(
      "bulk.err.imageNotUploaded",
    );
  });

  it("keeps the text-or-image rule and the text-only rejection", () => {
    expect(validateOptionMedia(opt({ az: "" }), t, true, 2)).toBe("bulk.err.optionText");
    expect(validateOptionMedia({ text: { az: "" } }, t, true, 2)).toBe("bulk.err.optionText");
    expect(validateOptionMedia(opt({ az: UUID }), t, false, 0)).toBe(
      "bulk.err.mediaNotAllowed",
    );
    // Text alone is still a complete option.
    expect(validateOptionMedia({ text: { az: "4" } }, t, true, 0)).toBeNull();
  });
});
