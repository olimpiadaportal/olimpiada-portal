// The per-OPTION rules of the browser pre-check.
//
// The regression these pin down: the "an option must carry text or an image"
// rule briefly had TWO emission sites — validateClientOptionMedia and a second
// az-text loop — so one empty option produced the SAME numbered error twice on
// every file, including text-only files, which the ZIP change was required not
// to touch at all.
import { describe, expect, it } from "vitest";
import {
  validateBulkRowsClient,
  validateClientOptionMedia,
  type ClientTypeRule,
  type ZipRefState,
} from "../bulk-client";

const tt = (k: string) => k;

const rules: ClientTypeRule[] = [
  { code: "single_choice", name: "Single choice", options_required: 5, correct_required: 1 },
];

/** Five options with exactly one correct; `patch` replaces option `at`. */
function row(at: number, patch: unknown) {
  const options: unknown[] = [
    { is_correct: true, order_index: 0, text: { az: "4" } },
    { is_correct: false, order_index: 1, text: { az: "3" } },
    { is_correct: false, order_index: 2, text: { az: "5" } },
    { is_correct: false, order_index: 3, text: { az: "6" } },
    { is_correct: false, order_index: 4, text: { az: "7" } },
  ];
  options[at] = patch;
  return {
    primary_locale: "az",
    meta: { topic: "T", subtopic: "S", term: 1 },
    translations: { az: { body: "2 + 2 = ?" } },
    options,
  };
}

describe("an empty option is reported EXACTLY once", () => {
  it("text-only mode, no mediaOpts at all — the legacy caller shape", () => {
    const issues = validateBulkRowsClient(
      [row(2, { is_correct: false, order_index: 2, text: { az: "" } })],
      tt,
      rules,
      "olympiad",
    );
    const optionText = issues.filter((i) => i.message === "bulk.err.optionText");
    expect(optionText).toHaveLength(1);
    expect(optionText[0].row).toBe(1);
  });

  it("text-only mode with mediaOpts.mixed = false", () => {
    const issues = validateBulkRowsClient(
      [row(0, { is_correct: true, order_index: 0, text: { az: "   " } })],
      tt,
      rules,
      "general",
      null,
      { mixed: false },
    );
    expect(issues.filter((i) => i.message === "bulk.err.optionText")).toHaveLength(1);
  });

  it("mixed mode, option with neither text nor image", () => {
    const issues = validateBulkRowsClient(
      [row(4, { is_correct: false, order_index: 4, text: { az: "" } })],
      tt,
      rules,
      "olympiad",
      null,
      { mixed: true },
    );
    expect(issues.filter((i) => i.message === "bulk.err.optionText")).toHaveLength(1);
  });

  it("stops at the FIRST bad option rather than listing every one", () => {
    const item = row(1, { is_correct: false, order_index: 1, text: { az: "" } });
    (item.options as unknown[])[3] = { is_correct: false, order_index: 3, text: { az: "" } };
    const issues = validateBulkRowsClient([item], tt, rules, "olympiad");
    expect(issues.filter((i) => i.message === "bulk.err.optionText")).toHaveLength(1);
  });
});

describe("an image-only option is valid in mixed mode and reported in text-only mode", () => {
  it("accepts the shape the mixed template itself ships", () => {
    const issues = validateBulkRowsClient(
      [
        row(0, {
          is_correct: true,
          order_index: 0,
          text: { az: "" },
          image: { az: "images/q1_option_1.png" },
        }),
      ],
      tt,
      rules,
      "olympiad",
      null,
      { mixed: true },
    );
    expect(issues).toEqual([]);
  });

  it("reports the image once — not once as media and once as missing text", () => {
    const issues = validateBulkRowsClient(
      [
        row(0, {
          is_correct: true,
          order_index: 0,
          text: { az: "" },
          image: { az: "images/q1_option_1.png" },
        }),
      ],
      tt,
      rules,
      "olympiad",
      null,
      { mixed: false },
    );
    expect(issues).toEqual([{ row: 1, message: "bulk.err.mediaNotAllowed" }]);
  });
});

describe("validateClientOptionMedia checks EVERY locale's image path", () => {
  // collectMediaRefs queues every locale for upload, so a typo in en/ru used to
  // survive this pre-check and fail inside the ZIP resolver mid-upload — after
  // other images had already been uploaded and had to be discarded.
  const has = (ref: string): ZipRefState =>
    ref === "images/ok.png" ? "ok" : ref === "images/dup.png" ? "ambiguous" : "missing";

  const opt = (image: Record<string, unknown>) => ({ text: { az: "" }, image });

  it("accepts a row whose every locale resolves", () => {
    expect(
      validateClientOptionMedia(
        opt({ az: "images/ok.png", en: "images/ok.png" }),
        tt,
        true,
        0,
        has,
      ),
    ).toBeNull();
  });

  it("catches a missing file named only in ru", () => {
    expect(
      validateClientOptionMedia(
        opt({ az: "images/ok.png", ru: "images/typo.png" }),
        tt,
        true,
        0,
        has,
      ),
    ).toBe("bulk.err.imageMissing");
  });

  it("catches an ambiguous file and a bad path named only in en", () => {
    expect(
      validateClientOptionMedia(opt({ az: "images/ok.png", en: "images/dup.png" }), tt, true, 0, has),
    ).toBe("bulk.err.imageAmbiguous");
    expect(
      validateClientOptionMedia(opt({ az: "images/ok.png", en: "../secret.png" }), tt, true, 0, has),
    ).toBe("bulk.err.badImagePath");
    expect(
      validateClientOptionMedia(opt({ az: "images/ok.png", en: "images/x.svg" }), tt, true, 0, has),
    ).toBe("bulk.err.imageType");
  });

  it("ignores an absent or blank locale entry", () => {
    expect(
      validateClientOptionMedia(
        opt({ az: "images/ok.png", en: "", ru: null }),
        tt,
        true,
        0,
        has,
      ),
    ).toBeNull();
  });
});
