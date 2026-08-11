// Client-side bulk-import helpers shared by the BulkUploadModal (general
// question bank + olympiad create flow) and the New-Package create flow.
// Plain client-safe module (no "use server"): everything here is a UX
// pre-check only — the SECURITY DEFINER bulk RPCs and the server actions in
// src/lib/admin remain the authority (assert_question_type_rules etc.).
//
// v3 (Round 21):
//   * GENERAL rows REQUIRE meta.topic + meta.subtopic + meta.term (1..4);
//     meta.type is optional (defaults to single_choice — exactly 5 options,
//     exactly 1 correct). Optional meta.media_asset_id (uuid of a pre-uploaded
//     question-media asset) attaches the primary locale's image.
//   * OLYMPIAD rows keep topic/subtopic/term OPTIONAL; 5 options still apply.
//
// Round 52 (§6): the mirror also learned the CURRICULUM check — when the caller
// passes the topic tree for the batch's (subject, grade), an unknown
// meta.topic / meta.subtopic is flagged in the browser before the upload, and a
// present-but-invalid meta.term reports "Invalid term value" instead of the
// "required" message. Same rules as src/lib/admin/bulk-validate.ts; that server
// copy (and the DB) stay the authority. The two files cannot share code — the
// server one imports the server-only i18n module.

// Relative on purpose: this module is unit-tested and the vitest config has no
// "@/" alias.
import { foldName } from "./admin/curriculum-shared";
import { BULK_MEDIA_TOTAL_MAX_BYTES } from "./bulk-media-shared";
import { normalizeZipPath } from "./zipRead";
import { buildStoredZip } from "./zipWrite";

export type BulkClientMode = "general" | "olympiad";

export type ClientTypeRule = {
  code: string;
  name: string;
  options_required: number | null;
  correct_required: number | null;
};

export type RowIssue = { row: number; message: string };

export const BULK_MAX_FILE_BYTES = 2 * 1024 * 1024;

// Five A–E options (exactly one correct) — the single_choice shape enforced by
// the DB since migration 055; both templates model exactly that.
const TEMPLATE_OPTIONS = [
  { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
  { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
  { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
  { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
  { is_correct: false, order_index: 4, text: { az: "7", en: "7", ru: "7" } },
];

const TEMPLATE_TRANSLATIONS = {
  az: { body: "2 + 2 = ?", prompt: "Düzgün cavabı seçin", explanation: "2 + 2 = 4" },
  en: { body: "2 + 2 = ?", prompt: "Choose the correct answer" },
  ru: { body: "2 + 2 = ?", prompt: "Выберите правильный ответ" },
};

// GENERAL template: per-item meta has NO subject and NO grade_level — the
// batch supplies both from the modal selects. topic + subtopic + term (1..4)
// are REQUIRED; meta.type is optional (single_choice by default) and
// meta.media_asset_id (uuid of a pre-uploaded question-media asset, primary
// locale's image) is optional — both omitted here on purpose.
export const BULK_TEMPLATE_GENERAL = [
  {
    primary_locale: "az",
    meta: {
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      term: 1,
    },
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS,
  },
];

// OLYMPIAD template: NOTHING the package form already knows appears here.
//
//   subject       <- olympiad_packages.subject_id   (injected by the RPC)
//   grade         <- the upload slot the file was dropped into
//   olympiad type <- olympiad_packages.olympiad_type_id (migration 100 — until
//                    then the RPC read `meta.olympiad_type` by NAME from every
//                    row, so the admin had to retype a value already chosen in
//                    the form, and a typo silently produced NULL)
//
// Everything else the importer accepts is OPTIONAL and deliberately absent:
//   meta.type            defaults to single_choice (5 options, exactly 1 correct)
//   meta.topic/subtopic  optional for package pools — the olympiad draw is
//                        package+grade scoped and never reads them
//   meta.term            ignored entirely for package pools
//   meta.source, meta.media_asset_id
//
// So the file carries ONLY what has to come from the questions themselves.
// Files that still contain the old fields keep importing — they are ignored,
// not rejected.
export const BULK_TEMPLATE_OLYMPIAD = [
  {
    primary_locale: "az",
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS,
  },
];

// MIXED templates — identical to the text-only ones plus ONE optional field,
// `meta.image`: a RELATIVE PATH to a file inside the same ZIP, resolved from
// the folder that holds questions.json. The browser reads the entry, types it
// from its magic bytes, uploads it and rewrites the row to the resulting uuid,
// so the import request never carries image bytes at all.
//
// `meta.image` is OPTIONAL and per question: a mixed pool is text questions and
// image questions TOGETHER, which is the whole point of the mode.
//
// An OPTION may carry `image` too (per locale, same path form). An option is
// valid with text, with an image, or with both — but never with neither, which
// is enforced by a CHECK constraint on the table, not just here.
const TEMPLATE_IMAGE = "images/q1.png";
const TEMPLATE_OPTION_IMAGE = "images/q1_option_1.png";

// One option carries an image so the shape is unambiguous; the rest stay
// text-only, which is what a real mixed pool looks like. An option may have
// text, an image, or both — but never neither.
const TEMPLATE_OPTIONS_MIXED = [
  {
    is_correct: true,
    order_index: 0,
    text: { az: "", en: "", ru: "" },
    image: { az: TEMPLATE_OPTION_IMAGE },
  },
  { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
  { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
  { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
  { is_correct: false, order_index: 4, text: { az: "7", en: "7", ru: "7" } },
];

export const BULK_TEMPLATE_GENERAL_MIXED = [
  {
    primary_locale: "az",
    meta: {
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      term: 1,
      image: TEMPLATE_IMAGE,
    },
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS_MIXED,
  },
];

export const BULK_TEMPLATE_OLYMPIAD_MIXED = [
  {
    primary_locale: "az",
    meta: { image: TEMPLATE_IMAGE },
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS_MIXED,
  },
];

/** The template for a (general|olympiad) x (text|mixed) combination. */
export function bulkTemplateFor(
  mode: BulkClientMode,
  questionMode: "text" | "mixed",
): unknown[] {
  if (questionMode === "mixed") {
    return mode === "olympiad" ? BULK_TEMPLATE_OLYMPIAD_MIXED : BULK_TEMPLATE_GENERAL_MIXED;
  }
  return mode === "olympiad" ? BULK_TEMPLATE_OLYMPIAD : BULK_TEMPLATE_GENERAL;
}

// ---------------------------------------------------------------------------
// Mixed-mode media. Images live in the uploaded ZIP and are referenced by a
// relative path, so the rules here are PATH rules; the bytes are checked by
// the upload phase (magic-byte sniff) and re-checked server-side.
// ---------------------------------------------------------------------------

/** Whole-ZIP cap — the SAME budget the upload phase and the reader spend, so a
 *  file that passes this check cannot fail on a different number later. It is
 *  per ARCHIVE: the olympiad create form submits one ZIP per grade. */
export const BULK_MAX_ZIP_BYTES = BULK_MEDIA_TOTAL_MAX_BYTES;

/** The member a mixed ZIP must contain. Defined here, beside the template that
 *  writes it, so zip-bulk.ts can import it without a cycle. */
export const ZIP_JSON_NAME = "questions.json";

/** Extensions the import treats as image references. The real type always
 *  comes from the bytes; this only decides what LOOKS like an image, for the
 *  reference check and the unreferenced-file report. */
export const ZIP_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;

export type ZipRefState = "ok" | "missing" | "ambiguous";

export type MediaTarget =
  | { kind: "question" }
  | { kind: "option"; opt: number; locale: string };
export type MediaRef = { i: number; ref: string; target: MediaTarget };

/**
 * Every image reference in a parsed file: the QUESTION's own picture
 * (meta.image) and each OPTION's per-locale picture (options[n].image.<locale>).
 *
 * ONE definition of "which strings are image references", shared by the upload
 * phase and the unreferenced-image report — if they disagreed, an image could
 * be uploaded and still be reported as unused, or vice versa.
 */
export function collectMediaRefs(items: unknown[]): MediaRef[] {
  const refs: MediaRef[] = [];
  items.forEach((it, i) => {
    if (!it || typeof it !== "object" || Array.isArray(it)) return;
    const row = it as Record<string, unknown>;

    const meta = row.meta as Record<string, unknown> | undefined;
    const q = meta?.image;
    if (typeof q === "string" && q.trim() !== "") {
      refs.push({ i, ref: q.trim(), target: { kind: "question" } });
    }

    const opts = Array.isArray(row.options) ? (row.options as unknown[]) : [];
    opts.forEach((o, oi) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) return;
      const img = (o as Record<string, unknown>).image;
      if (!img || typeof img !== "object" || Array.isArray(img)) return;
      for (const [locale, v] of Object.entries(img as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() !== "") {
          refs.push({ i, ref: v.trim(), target: { kind: "option", opt: oi, locale } });
        }
      }
    });
  });
  return refs;
}

/**
 * One option's media, and the rule that an option must carry SOMETHING.
 *
 * Returns a message key or null. `index` is 0-based and rendered 1-based, to
 * match how the option-count errors already read.
 */
export function validateClientOptionMedia(
  opt: unknown,
  tt: (k: string) => string,
  mixed: boolean,
  index: number,
  // Optional ZIP lookup — resolves a path against the chosen archive so a
  // typo'd filename is a row error before anything is uploaded.
  has?: (ref: string) => ZipRefState,
): string | null {
  const o =
    opt && typeof opt === "object" && !Array.isArray(opt)
      ? (opt as Record<string, unknown>)
      : {};
  const img = o.image;
  const textObj =
    o.text && typeof o.text === "object" && !Array.isArray(o.text)
      ? (o.text as Record<string, unknown>)
      : {};
  const azText = typeof textObj.az === "string" ? textObj.az.trim() : "";

  const hasImageField = img != null && typeof img === "object" && !Array.isArray(img);
  const imageMap = hasImageField ? (img as Record<string, unknown>) : {};
  const azImage = hasImageField ? String(imageMap.az ?? "").trim() : "";

  if (hasImageField && !mixed) return tt("bulk.err.mediaNotAllowed");

  // The product rule, mirrored from the DB constraint: text OR image, never
  // neither. Checked on az because az is the required primary locale.
  if (!azText && !azImage) {
    return tt("bulk.err.optionText").replace("{i}", String(index + 1));
  }

  // EVERY locale, not just az — the same rule the server applies
  // (validateOptionMedia). collectMediaRefs queues every locale for upload, so
  // a typo in options[n].image.ru used to survive this pre-check and fail
  // inside the ZIP resolver mid-upload, forcing the whole batch down the
  // discard path instead of showing a row error before a byte moved.
  for (const value of Object.values(imageMap)) {
    if (value == null || (typeof value === "string" && value.trim() === "")) continue;
    const res = validateClientItemMedia({ meta: { image: value } }, tt, mixed, has);
    if (res) return res;
  }
  return null;
}

export function validateClientItemMedia(
  item: unknown,
  tt: (k: string) => string,
  mixed: boolean,
  has?: (ref: string) => ZipRefState,
): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const meta = (item as { meta?: unknown }).meta;
  const m =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  const raw = m.image;
  // Absent is fine even in mixed mode: a mixed pool is text questions AND
  // image questions together, not images everywhere.
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;

  if (!mixed) return tt("bulk.err.mediaNotAllowed");
  if (typeof raw !== "string") return tt("bulk.err.badImagePath");

  const ref = raw.trim();
  // Same normalization the reader applies, so "what the file may say" and
  // "what the archive can resolve" are one rule: no absolute path, no drive
  // letter, no ".." segment, no backslash.
  if (normalizeZipPath(ref) === null) return tt("bulk.err.badImagePath");
  if (!ZIP_IMAGE_EXT_RE.test(ref)) return tt("bulk.err.imageType");

  const state = has?.(ref);
  if (state === "missing") return tt("bulk.err.imageMissing").replace("{file}", ref);
  if (state === "ambiguous") return tt("bulk.err.imageAmbiguous").replace("{file}", ref);
  return null;
}

// Case/space-insensitive normalization so "Multiple choice", "multiple_choice"
// and "Multiple  Choice" all resolve to the same active type.
export function normClientTypeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

// A real 1x1 PNG, kept as a base64 LITERAL because it is a template ASSET —
// the only bytes this module ships. It is not a base64 import path: nothing in
// the import flow accepts base64 any more, and imitating this line for image
// DATA would reintroduce exactly what the ZIP format replaced.
const TEMPLATE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function templatePixel(): Uint8Array {
  const bin = atob(TEMPLATE_PIXEL_PNG);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Serializes the mode's template for download in the browser. TEXT mode
// downloads the JSON exactly as before; MIXED downloads a ready-to-edit ZIP
// with the JSON and the two images it references, so the admin sees the layout
// instead of having to infer it from a sentence.
export function downloadBulkTemplate(
  filename: string,
  mode: BulkClientMode = "general",
  questionMode: "text" | "mixed" = "text",
): void {
  const template = bulkTemplateFor(mode, questionMode);
  const json = JSON.stringify(template, null, 2);
  const blob =
    questionMode === "mixed"
      ? new Blob(
          [
            buildStoredZip([
              { path: ZIP_JSON_NAME, bytes: new TextEncoder().encode(json) },
              { path: TEMPLATE_IMAGE, bytes: templatePixel() },
              { path: TEMPLATE_OPTION_IMAGE, bytes: templatePixel() },
            ]),
          ],
          { type: "application/zip" },
        )
      : new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Parses + size-checks the chosen file. Returns either a fatal file-level
// error message key result or the parsed items array.
export async function parseBulkFile(
  f: File,
  tt: (k: string) => string,
): Promise<{ error: string } | { items: unknown[] }> {
  if (f.size > BULK_MAX_FILE_BYTES) return { error: tt("bulk.tooLarge") };
  let data: unknown;
  try {
    data = JSON.parse(await f.text());
  } catch {
    return { error: tt("bulk.invalidJson") };
  }
  if (!Array.isArray(data)) return { error: tt("bulk.notArray") };
  if (data.length === 0) return { error: tt("bulk.emptyArray") };
  return { items: data };
}

// Mirrors the server's 1..4 term parsing (number or numeric string).
function parseClientTerm(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) {
    return v >= 1 && v <= 4 ? v : null;
  }
  if (typeof v === "string" && /^[1-4]$/.test(v.trim())) return Number(v.trim());
  return null;
}

function clientTermAbsent(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// ---- Curriculum index (mirror of bulk-validate.ts) --------------------------
// Both copies fold names through curriculum-shared's foldName, so the browser
// pre-check, the server validator and the Curriculum Structure page's duplicate
// check all agree on what "the same name" means. (curriculum-shared is a plain
// dependency-free module — safe in a client bundle.)
export function normCurriculumNameClient(v: string): string {
  return foldName(v);
}

export type ClientCurriculumTopic = {
  name: string;
  term: number | null;
  subtopics: string[];
};
export type ClientCurriculumIndex = Map<
  string,
  { name: string; term: number | null; subtopics: Map<string, string> }
>;

export function buildClientCurriculumIndex(
  topics: ClientCurriculumTopic[],
): ClientCurriculumIndex {
  const index: ClientCurriculumIndex = new Map();
  for (const tp of topics) {
    const key = normCurriculumNameClient(tp.name);
    if (!key) continue;
    const existing = index.get(key);
    const target = existing ?? {
      name: tp.name,
      term: tp.term,
      subtopics: new Map<string, string>(),
    };
    if (existing && existing.term == null) target.term = tp.term;
    for (const st of tp.subtopics) {
      const stKey = normCurriculumNameClient(st);
      if (stKey && !target.subtopics.has(stKey)) target.subtopics.set(stKey, st);
    }
    index.set(key, target);
  }
  return index;
}

// Per-row structural pre-validation (mirror of the server's bulk-validate
// rules): primary-locale body, GENERAL-mode topic/subtopic/term requirements,
// options array, per-type option/correct counts (single_choice = exactly 5
// options / exactly 1 correct via the active-type rules), non-empty az option
// texts. Returns one issue list for display.
export function validateBulkRowsClient(
  data: unknown[],
  tt: (k: string) => string,
  rules: ClientTypeRule[],
  mode: BulkClientMode = "general",
  // Round 52 §6 — optional curriculum for the chosen (subject, grade).
  curriculum?: ClientCurriculumIndex | null,
  // Mixed mode allows `meta.image` (a path inside the chosen ZIP). Text-only
  // mode REPORTS an image rather than ignoring it: a file with images imported
  // as text-only would drop every one of them and still look successful.
  // `zipHas` resolves a path against the archive so a typo is a row error
  // before any upload; callers that pass nothing keep today's behaviour.
  mediaOpts?: { mixed?: boolean; zipHas?: (ref: string) => ZipRefState },
): RowIssue[] {
  const activeByNorm = new Map<string, ClientTypeRule>();
  for (const r of rules) activeByNorm.set(normClientTypeName(r.name), r);
  // Default for rows that omit meta.type = single_choice (matches the RPCs).
  const defaultType: ClientTypeRule | null =
    rules.find((r) => r.code === "single_choice") ?? rules[0] ?? null;

  const issues: RowIssue[] = [];
  data.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ row, message: tt("bulk.err.notObject") });
      return;
    }
    const it = item as {
      primary_locale?: unknown;
      meta?: { type?: unknown; topic?: unknown; subtopic?: unknown; term?: unknown };
      translations?: Record<string, { body?: unknown } | undefined>;
      options?: unknown;
    };

    // Referenced media. The path shape and the ZIP lookup are checked here; the
    // real type is decided later by the magic-byte sniff, which is what rejects
    // an SVG named .png.
    const mediaMsg = validateClientItemMedia(
      item,
      tt,
      mediaOpts?.mixed === true,
      mediaOpts?.zipHas,
    );
    if (mediaMsg) issues.push({ row, message: mediaMsg });

    // Required primary-locale body (defaults to az).
    const plRaw = typeof it.primary_locale === "string" ? it.primary_locale : "az";
    const pl = ["az", "en", "ru"].includes(plRaw) ? plRaw : "az";
    const body = it.translations?.[pl]?.body;
    if (typeof body !== "string" || body.trim() === "") {
      issues.push({ row, message: tt("bulk.err.noAzBody") });
    }

    // GENERAL mode: topic + subtopic + term (1..4) are required per row and,
    // when a curriculum is supplied, must exist in it.
    if (mode === "general") {
      const topic = it.meta?.topic;
      const topicOk = typeof topic === "string" && topic.trim() !== "";
      if (!topicOk) {
        issues.push({ row, message: tt("bulk.err.topicRequired") });
      }
      const subtopic = it.meta?.subtopic;
      const subtopicOk = typeof subtopic === "string" && subtopic.trim() !== "";
      if (!subtopicOk) {
        issues.push({ row, message: tt("bulk.err.subtopicRequired") });
      }
      const term = parseClientTerm(it.meta?.term);
      if (clientTermAbsent(it.meta?.term)) {
        issues.push({ row, message: tt("bulk.err.termRequired") });
      } else if (term == null) {
        issues.push({ row, message: tt("bulk.err.invalidTerm") });
      }

      if (curriculum && topicOk) {
        const entry = curriculum.get(normCurriculumNameClient(topic as string));
        if (!entry) {
          issues.push({ row, message: tt("bulk.err.topicNotFound") });
        } else {
          if (
            subtopicOk &&
            !entry.subtopics.has(normCurriculumNameClient(subtopic as string))
          ) {
            issues.push({ row, message: tt("bulk.err.subtopicNotFound") });
          }
          if (term != null && entry.term != null && entry.term !== term) {
            issues.push({ row, message: tt("bulk.err.termConflict") });
          }
        }
      }
    }

    if (!Array.isArray(it.options)) {
      issues.push({ row, message: tt("bulk.err.optionsArray") });
      return;
    }
    const opts = it.options as { is_correct?: unknown; text?: { az?: unknown } }[];

    // Resolve the type rule (mirror of the server). Missing/empty type →
    // single_choice; a named type must match an active one.
    const typeRaw = it.meta?.type;
    let rule: ClientTypeRule | null;
    if (typeRaw == null || (typeof typeRaw === "string" && typeRaw.trim() === "")) {
      rule = defaultType;
    } else if (typeof typeRaw === "string") {
      rule = activeByNorm.get(normClientTypeName(typeRaw)) ?? null;
      if (!rule) {
        issues.push({ row, message: tt("bulk.err.unknownType") });
        return;
      }
    } else {
      issues.push({ row, message: tt("bulk.err.unknownType") });
      return;
    }

    if (rule?.options_required != null && opts.length !== rule.options_required) {
      issues.push({
        row,
        message: tt("bulk.err.optionCount")
          .replace("{n}", String(rule.options_required))
          .replace("{got}", String(opts.length)),
      });
    }
    if (rule?.correct_required != null) {
      const correct = opts.filter((o) => o && o.is_correct === true).length;
      if (correct !== rule.correct_required) {
        issues.push({
          row,
          message: tt("bulk.err.correctCount")
            .replace("{n}", String(rule.correct_required))
            .replace("{got}", String(correct)),
        });
      }
    }
    // Per-OPTION media AND the "an option must carry text or an image" rule —
    // ONE emission site. The rule briefly had two: validateClientOptionMedia
    // plus a separate az-text loop, so a single empty option produced the same
    // numbered error TWICE on every text-only file — the mode the ZIP change
    // was required to leave untouched. It now lives only in the helper, which
    // is also the server validator's twin.
    for (let k = 0; k < opts.length; k++) {
      const om = validateClientOptionMedia(
        opts[k],
        tt,
        mediaOpts?.mixed === true,
        k,
        mediaOpts?.zipHas,
      );
      if (om) {
        issues.push({ row, message: om });
        break;
      }
    }
  });
  return issues;
}
