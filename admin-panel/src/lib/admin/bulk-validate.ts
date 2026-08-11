// Shared strict bulk-import validation (general question bank + olympiad private
// pool). Pure module (NOT "use server") so both server-action files can import
// these synchronous helpers. Produces SPECIFIC trilingual per-row messages that
// mirror the DB's assert_question_type_rules + body/option checks, so a failed
// row tells the admin exactly what to fix instead of a generic "row failed".
//
// v3 (Round 21): two modes —
//   * "general"  : meta.topic + meta.subtopic + meta.term (1..4) are REQUIRED
//                  (bulk_insert_questions v3 enforces the same server-side).
//   * "olympiad" : topic/subtopic/term stay OPTIONAL (package-scoped taxonomy).
// meta.type is OPTIONAL in both — it defaults to single_choice (5 options,
// exactly 1 correct), matching the RPCs' default.
//
// Round 52 (§6) — CURRICULUM MATCHING, additive. The 2026 curriculum is a fixed
// tree (260 topics / 1077 subtopics, one term per topic), so a name the file
// invents is a MISTAKE, not a new topic. When the caller passes a curriculum
// index for the batch's (subject, grade), a row whose meta.topic /
// meta.subtopic is not in it is rejected here with the owner's exact wording —
// "Topic not found" / "Subtopic not found" — and a meta.term that is present
// but outside 1..4 reports "Invalid term value" (distinct from the
// still-existing "term is required" for an absent one). The v3 RPC would
// otherwise silently CREATE the misspelled topic, quietly corrupting the tree.
// The schema rules above are untouched; the curriculum argument is optional so
// every existing caller keeps its exact behaviour.
import { type T } from "@/i18n/server";
// Relative on purpose: this module is unit-tested and the vitest config has no
// "@/" alias (the type-only i18n import above is erased before resolution).
import { foldName } from "./curriculum-shared";

// Length caps for bulk-import free text (mirror the manual form + the DB).
export const BULK_BODY_MAX = 8000; // body / prompt / explanation
export const BULK_OPTION_MAX = 2000; // per answer-option text

export const LOCALES3 = ["az", "en", "ru"] as const;

export type BulkMode = "general" | "olympiad";

// The per-type structure rules we validate against (from active question_types).
export type ActiveTypeRule = {
  code: string;
  name: string;
  options_required: number | null;
  correct_required: number | null;
};

// Case/space-insensitive normalization so "Multiple choice", "multiple_choice"
// and "Multiple  Choice" all match the same active type.
export function normTypeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

// The default for items that omit meta.type — single_choice when active (the
// same default the v3 RPCs apply), else the first active type.
export function pickDefaultType<Rule extends { code: string }>(
  activeTypes: Rule[],
): Rule | null {
  return (
    activeTypes.find((r) => r.code === "single_choice") ?? activeTypes[0] ?? null
  );
}

// Accepts 1..4 as a number or numeric string (mirrors the RPC's ::smallint).
function parseTerm(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) {
    return v >= 1 && v <= 4 ? v : null;
  }
  if (typeof v === "string" && /^[1-4]$/.test(v.trim())) {
    return Number(v.trim());
  }
  return null;
}

// "meta.term was left out entirely" vs "meta.term is there but wrong" — the
// two get DIFFERENT messages (term required / Invalid term value).
function termAbsent(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// ---------------------------------------------------------------------------
// Curriculum index (Round 52 §6)
// ---------------------------------------------------------------------------
// Names are compared case- and whitespace-insensitively so "  toplama " matches
// "Toplama"; anything beyond that (a different word, a misspelling, an invented
// topic) is a real mismatch and is reported.
//
// The fold is curriculum-shared's foldName — the SAME rule the Curriculum
// Structure page uses for its duplicate check, so a name that page refuses to
// create twice is a name this importer resolves to one topic. It is Azerbaijani
// locale casing on purpose (İ→i, I→ı); the invariant fold turns "İ" into
// "i"+U+0307 and would never match its own lowercase form.
export function normCurriculumName(v: string): string {
  return foldName(v);
}

export type CurriculumTopicInput = {
  name: string;
  term: number | null;
  subtopics: string[];
};

// Both maps keep the CANONICAL spelling as the value: matching is lenient, but
// what we hand to the RPC must be the DB's exact string — bulk_insert_questions
// looks topics up with `name = ...` and would CREATE "toplama" as a second
// topic next to "Toplama". Leniency without canonicalization would therefore
// fork the tree, which is the very thing this check exists to prevent.
export type CurriculumEntry = {
  name: string;
  term: number | null;
  // normCurriculumName(subtopic) → canonical subtopic name
  subtopics: Map<string, string>;
};
// key = normCurriculumName(topic name)
export type CurriculumIndex = Map<string, CurriculumEntry>;

// Builds the lookup for ONE (subject, grade) pair. Duplicate topic names merge
// their subtopic sets rather than overwriting — a legacy DB could still hold a
// same-named pair and dropping one would produce a false "Subtopic not found".
export function buildCurriculumIndex(
  topics: CurriculumTopicInput[],
): CurriculumIndex {
  const index: CurriculumIndex = new Map();
  for (const tp of topics) {
    const key = normCurriculumName(tp.name);
    if (!key) continue;
    const existing = index.get(key);
    const target: CurriculumEntry = existing ?? {
      name: tp.name,
      term: tp.term,
      subtopics: new Map<string, string>(),
    };
    if (existing && existing.term == null) target.term = tp.term;
    for (const st of tp.subtopics) {
      const stKey = normCurriculumName(st);
      if (stKey && !target.subtopics.has(stKey)) target.subtopics.set(stKey, st);
    }
    index.set(key, target);
  }
  return index;
}

// The DB's exact spelling for a pair the validator already accepted. Returns
// null when either name is unknown, so a caller can never "canonicalize" its
// way past a failed check.
export function canonicalCurriculumNames(
  curriculum: CurriculumIndex,
  topic: string,
  subtopic: string,
): { topic: string; subtopic: string } | null {
  const entry = curriculum.get(normCurriculumName(topic));
  if (!entry) return null;
  const canonicalSubtopic = entry.subtopics.get(normCurriculumName(subtopic));
  if (canonicalSubtopic == null) return null;
  return { topic: entry.name, subtopic: canonicalSubtopic };
}

// Strict per-row schema validation. Returns a LOCALIZED message for the FIRST
// problem found, or null when the row is structurally valid. Rows that fail here
// are never sent to the RPC. Subject is NOT validated here (the general import
// injects it from the modal; the olympiad pool scopes it by package).
export function validateBulkItem(
  item: unknown,
  t: T,
  activeByNorm: Map<string, ActiveTypeRule>,
  defaultType: ActiveTypeRule | null,
  mode: BulkMode,
  // Round 52 §6 — optional curriculum for the batch's (subject, grade). When
  // supplied, GENERAL rows must name a topic/subtopic that exists in it.
  curriculum?: CurriculumIndex | null,
  // Round 53 — mixed mode permits per-option images.
  mixed = false,
): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return t("bulk.err.notObject");
  }
  const it = item as Record<string, unknown>;

  // Primary locale + its required body.
  const plRaw = typeof it.primary_locale === "string" ? it.primary_locale : "az";
  const pl = (LOCALES3 as readonly string[]).includes(plRaw) ? plRaw : "az";
  const translations =
    it.translations && typeof it.translations === "object" && !Array.isArray(it.translations)
      ? (it.translations as Record<string, unknown>)
      : {};
  const primaryTr =
    translations[pl] && typeof translations[pl] === "object" && !Array.isArray(translations[pl])
      ? (translations[pl] as Record<string, unknown>)
      : {};
  const body = typeof primaryTr.body === "string" ? primaryTr.body.trim() : "";
  if (!body) return t("bulk.err.noAzBody");
  if (body.length > BULK_BODY_MAX) return t("bulk.err.tooLong");
  const prompt = typeof primaryTr.prompt === "string" ? primaryTr.prompt : "";
  const explanation =
    typeof primaryTr.explanation === "string" ? primaryTr.explanation : "";
  if (prompt.length > BULK_BODY_MAX || explanation.length > BULK_BODY_MAX) {
    return t("bulk.err.tooLong");
  }

  const meta =
    it.meta && typeof it.meta === "object" && !Array.isArray(it.meta)
      ? (it.meta as Record<string, unknown>)
      : {};

  // GENERAL mode: meta.topic, meta.subtopic and meta.term (1..4) are required
  // (mirrors bulk_insert_questions v3; olympiad pools keep them optional).
  if (mode === "general") {
    if (typeof meta.topic !== "string" || meta.topic.trim() === "") {
      return t("bulk.err.topicRequired");
    }
    if (typeof meta.subtopic !== "string" || meta.subtopic.trim() === "") {
      return t("bulk.err.subtopicRequired");
    }
    if (termAbsent(meta.term)) return t("bulk.err.termRequired");
    const term = parseTerm(meta.term);
    // Present but not 1..4 (0, 5, "one", true, …) — the owner's third message.
    if (term == null) return t("bulk.err.invalidTerm");

    // Curriculum matching (Round 52 §6): the tree is fixed, so an unknown name
    // is a mistake to fix, never a topic to create.
    if (curriculum) {
      const entry = curriculum.get(normCurriculumName(meta.topic));
      if (!entry) return t("bulk.err.topicNotFound");
      if (!entry.subtopics.has(normCurriculumName(meta.subtopic))) {
        return t("bulk.err.subtopicNotFound");
      }
      // NOTE for callers: a row accepted here may still spell the names
      // differently from the DB. Pass it through canonicalCurriculumNames()
      // before the RPC — see bulkImportQuestions.
      // One term per topic — a row claiming a different one would be rejected
      // by the DB anyway (bulk_insert_questions raises "term % conflicts").
      if (entry.term != null && entry.term !== term) {
        return t("bulk.err.termConflict");
      }
    }
  }

  // Resolve the question type rule. Missing/empty type defaults to
  // single_choice (5 options / 1 correct); a named type must match an active one.
  const typeRaw = meta.type;
  let rule: ActiveTypeRule | null;
  if (typeRaw == null || (typeof typeRaw === "string" && typeRaw.trim() === "")) {
    rule = defaultType;
  } else if (typeof typeRaw === "string") {
    rule = activeByNorm.get(normTypeName(typeRaw)) ?? null;
    if (!rule) return t("bulk.err.unknownType");
  } else {
    return t("bulk.err.unknownType");
  }

  // Options must be an array; count + correct-count must match the type rule.
  if (!Array.isArray(it.options)) return t("bulk.err.optionsArray");
  const options = it.options as unknown[];

  if (rule?.options_required != null && options.length !== rule.options_required) {
    return t("bulk.err.optionCount")
      .replace("{n}", String(rule.options_required))
      .replace("{got}", String(options.length));
  }
  if (rule?.correct_required != null) {
    const correct = options.filter(
      (o) =>
        o != null &&
        typeof o === "object" &&
        (o as { is_correct?: unknown }).is_correct === true,
    ).length;
    if (correct !== rule.correct_required) {
      return t("bulk.err.correctCount")
        .replace("{n}", String(rule.correct_required))
        .replace("{got}", String(correct));
    }
  }

  // Every option needs an az TEXT or an az IMAGE, and text must stay within the
  // length cap. The text-only requirement was relaxed in Round 53 — "which of
  // these pictures" is a real question shape — but an option carrying neither
  // is still refused, here and by the DB constraint.
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const textObj =
      o != null &&
      typeof o === "object" &&
      (o as { text?: unknown }).text != null &&
      typeof (o as { text?: unknown }).text === "object"
        ? ((o as { text: Record<string, unknown> }).text)
        : {};
    const az = typeof textObj.az === "string" ? textObj.az.trim() : "";
    const oMedia = validateOptionMedia(o, t, mixed, i);
    if (oMedia) return oMedia;
    // validateOptionMedia already rejects "no text AND no image"; reaching here
    // with empty text means an image is present, which is valid.
    for (const loc of LOCALES3) {
      const val = textObj[loc];
      if (typeof val === "string" && val.length > BULK_OPTION_MAX) {
        return t("bulk.err.tooLong");
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// MIXED MODE — image references
//
// Images arrive as entries in the uploaded ZIP. The BROWSER reads them, sniffs
// their magic bytes, uploads each one on its own request and replaces the
// reference with the uuid a server action minted after re-typing the STORED
// bytes (lib/admin/import-media.ts). By the time an import action runs, the
// only legal shape is a uuid.
//
// So the server's job here is narrow and absolute: refuse anything that is not
// an already-verified reference. A surviving `meta.image`, a data URL, a path —
// each means the request did not come through the import UI, and none of them
// can be honoured without reintroducing a bytes path this flow deleted.
// ---------------------------------------------------------------------------

const MEDIA_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate one row's media reference. Returns a localized message or null.
 *
 * `mixed` false means the admin chose "text only", so an image present in the
 * file is a MISMATCH worth reporting rather than silently dropping — it almost
 * always means the wrong mode was picked, and silently importing the questions
 * without their images would look like success.
 */
export function validateItemMedia(item: unknown, t: T, mixed: boolean): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const meta = (item as { meta?: unknown }).meta;
  const m =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  // meta.media_asset_id is the field the browser phase WRITES, so its shape is
  // checked here — the option path already does the same. Without it a
  // non-uuid reached claimableMediaIds' .in("id", …) against a uuid column,
  // PostgREST errored, and the gate's fail-closed branch then rejected EVERY
  // media-carrying row in the file instead of the one bad row.
  const rawId = m.media_asset_id;
  if (rawId != null && !(typeof rawId === "string" && rawId.trim() === "")) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!MEDIA_UUID_RE.test(id)) return t("bulk.err.badMedia");
  }

  const raw = m.image;
  // Absent is always fine: media is optional even in mixed mode, because a
  // mixed pool is text-only questions AND image questions together.
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;

  if (!mixed) return t("bulk.err.mediaNotAllowed");
  // The browser phase DELETES meta.image and writes meta.media_asset_id, so any
  // surviving value — whatever its shape — means this request bypassed the UI.
  return t("bulk.err.imageNotUploaded");
}

/**
 * One option's media plus the text-or-image rule. Server twin of
 * validateClientOptionMedia; the two must stay identical.
 */
export function validateOptionMedia(
  opt: unknown,
  t: T,
  mixed: boolean,
  index: number,
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

  if (hasImageField && !mixed) return t("bulk.err.mediaNotAllowed");
  if (!azText && !azImage) {
    return t("bulk.err.optionText").replace("{i}", String(index + 1));
  }
  // EVERY locale, not just az: migration 104 casts each present locale's value
  // with ::uuid, so a non-uuid in en or ru aborts the whole RPC instead of
  // failing one row.
  for (const value of Object.values(imageMap)) {
    if (value == null || (typeof value === "string" && value.trim() === "")) continue;
    const v = typeof value === "string" ? value.trim() : "";
    if (!MEDIA_UUID_RE.test(v)) return t("bulk.err.imageNotUploaded");
  }
  return null;
}

// Maps a raw RPC row error (SQLERRM) to a specific trilingual message by known
// substrings — never leaks raw SQL text. Most are rare (subject/grade are
// injected and type/options/topic/term are pre-validated before the RPC), but
// a term CONFLICT with an already-termed topic is only detectable in the DB.
export function mapRpcRowError(raw: unknown, t: T): string {
  const low = typeof raw === "string" ? raw.toLowerCase() : "";
  if (low.includes("unknown subject")) return t("bulk.err.unknownSubject");
  if (low.includes("unknown grade")) return t("bulk.err.unknownGrade");
  if (low.includes("requires exactly")) return t("bulk.err.structure");
  if (low.includes("conflicts with topic")) return t("bulk.err.termConflict");
  if (low.includes("term (1..4)")) return t("bulk.err.termRequired");
  if (low.includes("subtopic is required")) return t("bulk.err.subtopicRequired");
  if (low.includes("topic is required")) return t("bulk.err.topicRequired");
  // Forward-compatible with a curriculum-strict RPC (the current v3 still
  // auto-creates a missing topic; the app layer above is what stops it today).
  if (low.includes("unknown subtopic") || low.includes("subtopic not found")) {
    return t("bulk.err.subtopicNotFound");
  }
  if (low.includes("unknown topic") || low.includes("topic not found")) {
    return t("bulk.err.topicNotFound");
  }
  // Migration 108: the olympiad pool importer reports a row whose content
  // already exists in that (package, grade) pool instead of inserting it twice.
  if (low.includes("duplicate question")) return t("bulk.err.duplicate");
  if (low.includes("media_asset_id")) return t("bulk.err.badMedia");
  return t("bulk.err.generic");
}

// Merges batch-level meta values (subject name / grade level) into one import
// item, preserving everything else. Non-object items pass through as a bare meta
// wrapper — the RPC then reports them as per-row failures.
export function overrideItemMeta(
  item: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const obj =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const meta =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as Record<string, unknown>)
      : {};
  return { ...obj, meta: { ...meta, ...patch } };
}
