import { describe, it, expect } from "vitest";
import {
  makeZipMediaResolver,
  makeZipRefChecker,
  parseBulkZipFile,
  unreferencedZipImages,
  type ZipBulkParsed,
} from "../zip-bulk";
import { buildStoredZip } from "../zipWrite";
import { bulkTemplateFor, validateBulkRowsClient } from "../bulk-client";

const tt = (k: string) => k;
const enc = (s: string) => new TextEncoder().encode(s);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const ROW = (image?: string, optionImage?: string) => ({
  primary_locale: "az",
  meta: image ? { image } : {},
  translations: { az: { body: "2 + 2 = ?" } },
  options: optionImage
    ? [{ is_correct: true, order_index: 0, text: { az: "" }, image: { az: optionImage } }]
    : [{ is_correct: true, order_index: 0, text: { az: "4" } }],
});

/** A File over a ZIP built in memory — jsdom's File accepts the bytes directly. */
function zipFile(
  files: { path: string; bytes: Uint8Array }[],
  name = "mixed.zip",
): File {
  return new File([buildStoredZip(files)], name, { type: "application/zip" });
}

const jsonOf = (rows: unknown[]) => enc(JSON.stringify(rows));

async function parsed(
  files: { path: string; bytes: Uint8Array }[],
): Promise<ZipBulkParsed> {
  const res = await parseBulkZipFile(zipFile(files), tt);
  if ("error" in res) throw new Error(`unexpected error: ${res.error}`);
  return res;
}

describe("parseBulkZipFile — locating questions.json", () => {
  it("reads it at the archive root", async () => {
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf([ROW("images/q1.png")]) },
      { path: "images/q1.png", bytes: PNG },
    ]);
    expect(p.root).toBe("");
    expect(p.items).toHaveLength(1);
  });

  it("reads it one folder down — the Windows 'zip this folder' shape", async () => {
    const p = await parsed([
      { path: "mixed_questions/questions.json", bytes: jsonOf([ROW("images/q1.png")]) },
      { path: "mixed_questions/images/q1.png", bytes: PNG },
    ]);
    expect(p.root).toBe("mixed_questions");
    expect(makeZipRefChecker(p)("images/q1.png")).toBe("ok");
  });

  it("reports a missing and a duplicated questions.json distinctly", async () => {
    expect(
      await parseBulkZipFile(zipFile([{ path: "images/q1.png", bytes: PNG }]), tt),
    ).toEqual({ error: "bulk.err.zipNoJson" });

    expect(
      await parseBulkZipFile(
        zipFile([
          { path: "questions.json", bytes: jsonOf([ROW()]) },
          { path: "a/questions.json", bytes: jsonOf([ROW()]) },
        ]),
        tt,
      ),
    ).toEqual({ error: "bulk.err.zipManyJson" });
  });

  it("ignores a questions.json buried deeper than one folder", async () => {
    expect(
      await parseBulkZipFile(
        zipFile([{ path: "a/b/questions.json", bytes: jsonOf([ROW()]) }]),
        tt,
      ),
    ).toEqual({ error: "bulk.err.zipNoJson" });
  });
});

describe("parseBulkZipFile — the JSON itself reports with the TEXT path's keys", () => {
  it("uses bulk.invalidJson / notArray / emptyArray", async () => {
    const cases: [Uint8Array, string][] = [
      [enc("{not json"), "bulk.invalidJson"],
      [enc('{"a":1}'), "bulk.notArray"],
      [enc("[]"), "bulk.emptyArray"],
    ];
    for (const [bytes, key] of cases) {
      expect(
        await parseBulkZipFile(zipFile([{ path: "questions.json", bytes }]), tt),
      ).toEqual({ error: key });
    }
  });

  it("caps the DECOMPRESSED json at the same 2 MB as the text path", async () => {
    const huge = enc(`[${'"x",'.repeat(600_000)}"x"]`);
    expect(
      await parseBulkZipFile(zipFile([{ path: "questions.json", bytes: huge }]), tt),
    ).toEqual({ error: "bulk.tooLarge" });
  });

  it("rejects a file that is not a ZIP at all", async () => {
    const notZip = new File([enc("plain text, definitely not a zip")], "x.zip");
    expect(await parseBulkZipFile(notZip, tt)).toEqual({ error: "bulk.err.zipUnreadable" });
  });
});

describe("reference resolution", () => {
  it("resolves relative to questions.json's own folder", async () => {
    const p = await parsed([
      { path: "pack/questions.json", bytes: jsonOf([ROW("images/q1.png")]) },
      { path: "pack/images/q1.png", bytes: PNG },
      // Same name at the ROOT: proof the resolution is not archive-wide.
      { path: "images/q1.png", bytes: PNG },
    ]);
    const { resolve } = makeZipMediaResolver(p);
    const got = await resolve("images/q1.png");
    expect(got.ok).toBe(true);
    expect(makeZipRefChecker(p)("images/q1.png")).toBe("ok");
  });

  it("reports a missing reference by name", async () => {
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf([ROW("images/q9.png")]) },
      { path: "images/q1.png", bytes: PNG },
    ]);
    expect(makeZipRefChecker(p)("images/q9.png")).toBe("missing");
    expect(await makeZipMediaResolver(p).resolve("images/q9.png")).toEqual({
      ok: false,
      messageKey: "bulk.err.imageMissing",
      file: "images/q9.png",
    });
  });

  it("hands the raw bytes over and records what was used", async () => {
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf([ROW("images/q1.png")]) },
      { path: "images/q1.png", bytes: PNG },
    ]);
    const { resolve, used } = makeZipMediaResolver(p);
    const got = await resolve("images/q1.png");
    expect(got).toMatchObject({ ok: true });
    if (got.ok) expect(Array.from(got.bytes)).toEqual(Array.from(PNG));
    expect([...used]).toEqual(["images/q1.png"]);
  });

  it("hands SVG bytes over UNCHANGED — the ban is the sniff's job, not the reader's", async () => {
    // zipRead is a container parser: it must not pretend to know what an image
    // is. SVG stays out because sniffImageMime (browser, pre-upload) and
    // sniffVerifiedImage (server, post-upload) both refuse it, and a .svg path
    // never passes validateClientItemMedia's extension check in the first place.
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf([ROW("images/q1.svg")]) },
      { path: "images/q1.svg", bytes: SVG },
    ]);
    const got = await makeZipMediaResolver(p).resolve("images/q1.svg");
    expect(got).toMatchObject({ ok: true });
    if (got.ok) expect(new TextDecoder().decode(got.bytes)).toContain("<svg");
  });
});

describe("the downloadable mixed TEMPLATE imports as-is", () => {
  // The template is the first thing an admin uploads back. If its own shape
  // failed validation the feature would look broken on first contact — and it
  // did: the image-only option tripped the "every option needs az text" rule.
  const rules = [
    { code: "single_choice", name: "Single choice", options_required: 5, correct_required: 1 },
  ];

  it.each(["general", "olympiad"] as const)("passes every client check (%s)", async (mode) => {
    const rows = bulkTemplateFor(mode, "mixed");
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf(rows) },
      { path: "images/q1.png", bytes: PNG },
      { path: "images/q1_option_1.png", bytes: PNG },
    ]);
    const issues = validateBulkRowsClient(p.items, tt, rules, mode, null, {
      mixed: true,
      zipHas: makeZipRefChecker(p),
    });
    expect(issues).toEqual([]);
    expect(unreferencedZipImages(p, p.items)).toEqual([]);
  });

  // The template is DOCUMENTATION: an admin copies it into a chat model and
  // gets back whatever shape it demonstrated. An explanation on `az` only was
  // therefore the reason the bank had no EN/RU explanations at all — every
  // generated file was faithfully reproducing the template.
  it.each(["general", "olympiad"] as const)(
    "teaches an explanation in az, en AND ru (%s, mixed)",
    async (mode) => {
      const rows = bulkTemplateFor(mode, "mixed") as {
        translations: Record<string, { explanation?: string }>;
      }[];
      for (const loc of ["az", "en", "ru"] as const) {
        expect(rows[0].translations[loc].explanation?.trim()).toBeTruthy();
      }
    },
  );
});

describe("unreferencedZipImages", () => {
  it("lists exactly the images no row points at", async () => {
    const rows = [ROW("images/q1.png"), ROW(undefined, "images/opt.png")];
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf(rows) },
      { path: "images/q1.png", bytes: PNG },
      { path: "images/opt.png", bytes: PNG },
      { path: "images/spare.png", bytes: PNG },
      { path: "images/other.JPG", bytes: PNG },
      // Not an image, and the JSON itself — neither is ever reported.
      { path: "notes.txt", bytes: enc("hi") },
    ]);
    expect(unreferencedZipImages(p, rows)).toEqual(["images/other.JPG", "images/spare.png"]);
  });

  it("is empty when every image is referenced", async () => {
    const rows = [ROW("images/q1.png")];
    const p = await parsed([
      { path: "questions.json", bytes: jsonOf(rows) },
      { path: "images/q1.png", bytes: PNG },
    ]);
    expect(unreferencedZipImages(p, rows)).toEqual([]);
  });
});
