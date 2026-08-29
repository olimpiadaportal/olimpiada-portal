"use server";

// Olimpiada Preparation — Administrator-only package + question-pool management.
// Never hard-delete a package (purchasers keep lifetime access) → archive only.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  IMAGE_FILENAME_RE,
  sniffVerifiedImage,
  splitStoragePath,
  verifyStorageObject,
} from "@/lib/admin/media-verify";
import {
  validateBulkItem,
  normTypeName,
  mapRpcRowError,
  overrideItemMeta,
  pickDefaultType,
  type ActiveTypeRule,
  validateItemMedia,
} from "@/lib/admin/bulk-validate";
import { getT, getLocale, type T } from "@/i18n/server";
import { parseIsoTimestamp } from "@/lib/admin/datetime";
import { parsePackagePriceAmount } from "@/app/(protected)/pricing/shared";
import { olympiadLocalStrings } from "@/lib/admin/olympiad-strings";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
import { rejectUnclaimableMedia } from "@/lib/admin/bulk-media";
import { removeMediaAssets } from "@/lib/admin/media-sweep";
import { confirmationTokenMatches } from "@/lib/admin/deletion-confirm";
import {
  deletionBlockText,
  parseDeletionBlocks,
  type DeletionBlock,
  type DestructiveState,
} from "@/lib/admin/deletion-hints";
import {
  fillTemplate,
  gradeLabel,
  gradePoolShortfalls,
  parsePerAttempt,
  parsePerGradeConfig,
} from "@/lib/admin/olympiad-per-attempt";
import { localeNames, type Locale } from "@/i18n/config";
import { localStrings as poolStrings } from "@/app/(protected)/olympiad/labels";

export type OlympiadState = { error?: string } | null;
export type OlympiadCoverState = { error?: string } | null;

type Db = Awaited<ReturnType<typeof createClient>>;
const LOCALES = ["az", "en", "ru"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cover image constraints — mirror the olympiad-media bucket (015): image-only,
// 5 MB, public read. Binary lives in Storage; PostgreSQL keeps only the
// media_assets metadata row + the link on olympiad_packages.cover_media_id.
const COVER_BUCKET = "olympiad-media";
const COVER_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const COVER_MAX_SIZE = 5 * 1024 * 1024;

// Server-side length caps on free text (defence-in-depth; mirrors news.ts).
const TITLE_MAX = 200;
const DESC_MAX = 20000;

function s(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

// Auto-generate the internal stable package `code` (no longer a UI input) from
// the package title — mirrors admin-panel/src/lib/admin/actions.ts slugifyCode,
// but emits a hyphen slug to match the package's slug convention.
const AZ_MAP: Record<string, string> = {
  ə: "e", ö: "o", ü: "u", ğ: "g", ı: "i", ç: "c", ş: "s",
};
function slugifyCode(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[əöügıçş]/g, (c) => AZ_MAP[c] ?? c)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "package"
  );
}

// ---------------------------------------------------------------------------
// Shared package-field parsing + persistence helpers, used by BOTH
// saveOlympiadPackage (edit) and createOlympiadPackageWithQuestions (create).
// ---------------------------------------------------------------------------

type PackageFields = {
  subjectId: string;
  /** Round 34: one package targets MULTIPLE grades (each with its own pool). */
  gradeIds: string[];
  /** Olympiad type — an existing id, or "__other" + the typed name. */
  olympiadTypeId: string;
  olympiadTypeOther: string;
  price: number;
  status: string;
  titleAz: string;
  eventAt: string | null;
  saleStartAt: string | null;
  saleEndAt: string | null;
  durationMinutes: number;
  /** Round 49: how many questions ONE attempt serves (per-student rotation). */
  questionsPerAttempt: number;
};

/** Sentinel the type <select> uses for "Other (enter a new type)". */
const TYPE_OTHER = "__other";
const TYPE_NAME_MAX = 120;

// olympiad_packages.duration_minutes (migration 047): attempt time limit in
// whole minutes, DB CHECK between 5 and 240 — mirrored here.
const DURATION_MIN = 5;
const DURATION_MAX = 240;

function parsePackageFields(
  fd: FormData,
  t: T,
  lt: (key: string) => string,
  opts: { requireGrades: boolean } = { requireGrades: true },
): { error: string } | PackageFields {
  const subjectId = s(fd, "subject_id");
  if (!subjectId) return { error: t("oly2.err.subject") };
  // Round 34: MULTI-grade selection (checkbox group). At least one, all
  // UUID-shaped, deduped — every selected grade will own a separate pool.
  // Edit mode passes requireGrades:false (grades live in their own actions).
  const gradeIds = Array.from(
    new Set(
      fd
        .getAll("grade_ids")
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
  if (opts.requireGrades && gradeIds.length === 0) return { error: lt("oly2.err.grades") };
  if (gradeIds.some((g) => !UUID_RE.test(g))) return { error: lt("oly2.err.grades") };
  // Round 34: the olympiad type is MANDATORY and lives inside this flow now
  // (the sidebar module was retired). "__other" carries a new type's name.
  const olympiadTypeId = s(fd, "olympiad_type_id");
  const olympiadTypeOther = s(fd, "olympiad_type_other").slice(0, TYPE_NAME_MAX);
  if (!olympiadTypeId) return { error: lt("oly2.err.type") };
  if (olympiadTypeId === TYPE_OTHER) {
    if (!olympiadTypeOther) return { error: lt("oly2.err.typeOther") };
  } else if (!UUID_RE.test(olympiadTypeId)) {
    return { error: lt("oly2.err.type") };
  }
  // Price: the SAME parser the subscription-pricing rail uses, in its
  // zero-inclusive form — a free olympiad package is a real product concept
  // (purchase_olympiad_if_free), a free subscription subject is not.
  //
  // This replaced a hand-rolled check that read
  //   const priceNum = Number(priceRaw);
  //   if (!Number.isFinite(priceNum) || priceNum < 0) …
  //   const price = Math.round(priceNum * 100) / 100;
  // which rejected negatives correctly but had no UPPER bound — so 999999999
  // reached Postgres and came back as a raw numeric-overflow reported to the
  // admin as a generic "server error" — and did FLOAT ARITHMETIC ON MONEY,
  // the one place in the panel that did. parsePackagePriceAmount proves
  // "at most 2 decimals" from the STRING SHAPE instead, so no rounding is
  // needed and none is done.
  //
  // An empty field still means a free package: the input is not required, and
  // that is long-standing behaviour rather than something to change here.
  const priceRaw = s(fd, "price_amount").trim();
  const price = priceRaw === "" ? 0 : parsePackagePriceAmount(priceRaw);
  if (price === null) {
    return { error: t("oly2.err.price") };
  }
  // Attempt duration: whole minutes, 5–240 (drives the child's countdown).
  const durationNum = Number(s(fd, "duration_minutes"));
  if (
    !Number.isFinite(durationNum) ||
    !Number.isInteger(durationNum) ||
    durationNum < DURATION_MIN ||
    durationNum > DURATION_MAX
  ) {
    return { error: t("oly2.err.duration") };
  }
  // Round 49: questions served per attempt. Whole number, 1..500 — mirrors the
  // DB CHECK. The client `min`/`max` attributes are UX only; THIS is the gate.
  const questionsPerAttempt = parsePerAttempt(s(fd, "questions_per_attempt"));
  if (questionsPerAttempt === null) return { error: lt("oly2.err.perAttempt") };
  const statusRaw = s(fd, "status");
  const status = ["active", "inactive", "archived"].includes(statusRaw) ? statusRaw : "inactive";
  const titleAz = s(fd, "title_az");
  if (!titleAz) return { error: t("oly2.err.titleAz") };

  // L11: server-side length caps — title ≤ 200, description ≤ 20000 per locale.
  for (const loc of LOCALES) {
    if (s(fd, `title_${loc}`).length > TITLE_MAX) return { error: t("err.tooLong") };
    if (s(fd, `desc_${loc}`).length > DESC_MAX) return { error: t("err.tooLong") };
  }

  // Optional planned event date/time (Round 8) + optional public sale window.
  // All three arrive as UTC ISO strings from hidden fields (the client converts
  // the admin's Baku wall-clock entry — convention in lib/admin/datetime.ts);
  // empty clears back to NULL, malformed/out-of-bounds values are rejected.
  const eventAt = parseIsoTimestamp(s(fd, "event_starts_at"));
  if (eventAt === undefined) return { error: lt("oly2.err.badDate") };
  const saleStartAt = parseIsoTimestamp(s(fd, "sale_starts_at"));
  if (saleStartAt === undefined) return { error: lt("oly2.err.badDate") };
  const saleEndAt = parseIsoTimestamp(s(fd, "sale_ends_at"));
  if (saleEndAt === undefined) return { error: lt("oly2.err.badDate") };
  // Mirror the DB CHECK (sale_ends_at > sale_starts_at when both set) so the
  // admin gets a friendly message instead of a constraint violation.
  if (
    saleStartAt &&
    saleEndAt &&
    Date.parse(saleEndAt) <= Date.parse(saleStartAt)
  ) {
    return { error: lt("oly2.err.saleWindow") };
  }
  return {
    subjectId,
    gradeIds,
    olympiadTypeId,
    olympiadTypeOther,
    price,
    status,
    titleAz,
    eventAt,
    saleStartAt,
    saleEndAt,
    durationMinutes: durationNum,
    questionsPerAttempt,
  };
}

// Resolves the package's olympiad type to an id. "__other" first tries a
// CASE-INSENSITIVE name match (accidental duplicates like "beynəlxalq" vs
// "Beynəlxalq" reuse the existing row) and only then inserts a new type —
// which immediately becomes available to future packages. Existing type
// records are never modified here.
async function resolveOlympiadTypeId(
  supabase: Db,
  fields: PackageFields,
  t: T,
): Promise<{ error: string } | { typeId: string }> {
  if (fields.olympiadTypeId !== TYPE_OTHER) {
    const { data } = await supabase
      .from("olympiad_types")
      .select("id")
      .eq("id", fields.olympiadTypeId)
      .maybeSingle();
    if (!data) return { error: t("err.server") };
    return { typeId: data.id as string };
  }
  const name = fields.olympiadTypeOther;
  // ilike with escaped wildcards = exact case-insensitive match.
  const escaped = name.replace(/([%_\\])/g, "\\$1");
  const { data: existing } = await supabase
    .from("olympiad_types")
    .select("id")
    .ilike("name", escaped)
    .limit(1)
    .maybeSingle();
  if (existing) return { typeId: existing.id as string };
  // code = unique slug of the name (same alphabet mapping as package codes).
  const base = slugifyCode(name) || "type";
  let code = base;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from("olympiad_types")
      .insert({ code, name })
      .select("id")
      .single();
    if (!error && data) return { typeId: data.id as string };
    if ((error as { code?: string } | null)?.code === "23505") {
      code = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }
    console.error("[admin] olympiad type insert failed", error?.message);
    return { error: t("err.server") };
  }
  return { error: t("err.server") };
}

// The grades currently targeted by a package (id → grade row), ordered by level.
async function packageGradeRows(
  supabase: Db,
  pkgId: string,
): Promise<{ id: string; name: string; level: number; need: number | null }[]> {
  const { data } = await supabase
    .from("olympiad_package_grades")
    // Migration 106: the grade's OWN questions_per_attempt (null = inherit).
    .select("grade_id, questions_per_attempt, grades(id, name, level)")
    .eq("olympiad_package_id", pkgId);
  return ((data ?? []) as any[])
    .map((r) => ({
      id: String(r.grade_id),
      name: String(r.grades?.name ?? ""),
      level: Number(r.grades?.level ?? 0),
      need: r.questions_per_attempt == null ? null : Number(r.questions_per_attempt),
    }))
    .sort((a, b) => a.level - b.level);
}

// Published pool size of ONE grade of a package (exact head count — never a
// row fetch, so a 2000-question pool is still counted correctly).
async function publishedPoolCount(
  supabase: Db,
  pkgId: string,
  gradeId: string | null,
): Promise<number> {
  let qb = supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("olympiad_package_id", pkgId)
    .eq("status", "published");
  if (gradeId) qb = qb.eq("grade_id", gradeId);
  const { count } = await qb;
  return count ?? 0;
}

// Round 49 ACTIVATION GATE. A package may only go ACTIVE when every grade it
// targets has a published pool that can actually fill one attempt — i.e.

/**
 * Persist per-grade question count + duration on EDIT (migration 106).
 *
 * The grade set comes from the DATABASE, never from the posted field names: a
 * forged `qpa_<uuid>` for someone else's grade must not write anything. Every
 * target grade is then resolved from the form:
 *
 *   value present + valid  -> store the override
 *   value present + empty  -> store NULL (inherit the package value)
 *   field absent entirely  -> store NULL
 *
 * The last case is what keeps a SINGLE-grade package honest. Its form renders
 * no per-grade panel, so nothing is posted — and if the grade row kept an
 * explicit number, editing the package-level count would silently do nothing
 * because the grade value shadows it. Clearing it makes the package field mean
 * what it says.
 *
 * `__per_grade_cfg` is the form's marker that it owns these fields. Without it
 * this function does nothing at all, so a future caller that does not render
 * the panel can never wipe an admin's overrides by omission.
 *
 * Returns "invalid" for a bad value, "error" for a write failure, null on
 * success.
 */
async function savePerGradeConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageId: string,
  fd: FormData,
): Promise<"invalid" | "error" | null> {
  if (String(fd.get("__per_grade_cfg") ?? "") !== "1") return null;

  const { data: rows, error: readErr } = await supabase
    .from("olympiad_package_grades")
    .select("grade_id, questions_per_attempt, duration_minutes")
    .eq("olympiad_package_id", packageId);
  if (readErr) {
    console.error("[admin] per-grade config read failed", readErr.message);
    return "error";
  }

  for (const row of (rows ?? []) as {
    grade_id: string;
    questions_per_attempt: number | null;
    duration_minutes: number | null;
  }[]) {
    const gid = String(row.grade_id);
    const rawQ = String(fd.get(`qpa_${gid}`) ?? "").trim();
    const rawD = String(fd.get(`dur_${gid}`) ?? "").trim();

    let qpa: number | null = null;
    if (rawQ !== "") {
      qpa = parsePerAttempt(rawQ);
      if (qpa === null) return "invalid";
    }
    let dur: number | null = null;
    if (rawD !== "") {
      const n = Number(rawD);
      if (!Number.isInteger(n) || n < DURATION_MIN || n > DURATION_MAX) return "invalid";
      dur = n;
    }

    // Nothing changed for this grade — skip the write so an unrelated package
    // edit does not touch every grade row (and does not re-fire the DB pool
    // guard on rows that did not move).
    if (qpa === row.questions_per_attempt && dur === row.duration_minutes) continue;

    const { error } = await supabase
      .from("olympiad_package_grades")
      .update({ questions_per_attempt: qpa, duration_minutes: dur })
      .eq("olympiad_package_id", packageId)
      .eq("grade_id", gid);
    if (error) {
      // The DB guard (migration 107) blocks raising a grade's count above what
      // its published pool can serve. Re-render that in the admin's locale
      // rather than leaking the raw Postgres message.
      console.error("[admin] per-grade config write failed", error.message);
      return "error";
    }
  }
  return null;
}

// pool >= questions_per_attempt. Returns the trilingual blocking message
// (naming each short grade, its pool and the required count), or null when
// activation is allowed. Legacy grade-less packages are checked against the
// whole published pool.
async function activationPoolBlock(
  supabase: Db,
  pkgId: string,
  perAttempt: number,
  locale: Locale,
  lt: (key: string) => string,
): Promise<string | null> {
  const gradeRows = await packageGradeRows(supabase, pkgId);
  const fill = (key: string, vars: Record<string, string | number>) =>
    fillTemplate(lt(key), vars);

  if (gradeRows.length === 0) {
    const pool = await publishedPoolCount(supabase, pkgId, null);
    if (pool >= perAttempt) return null;
    return fill("oly2.err.poolBelowPerAttemptNoGrade", {
      pool,
      count: perAttempt,
    });
  }

  const withPools = await Promise.all(
    gradeRows.map(async (g) => ({
      ...g,
      pool: await publishedPoolCount(supabase, pkgId, g.id),
    })),
  );
  // Migration 106/107: each grade is measured against ITS OWN count, matching
  // the DB guard exactly — a mirror that used one number would either block an
  // activation the database allows or let one through that it refuses.
  const short = gradePoolShortfalls(withPools, perAttempt);
  if (short.length === 0) return null;
  return short
    .map((g) =>
      fill("oly2.err.poolBelowPerAttempt", {
        grade: gradeLabel(locale, g.level, g.name),
        pool: g.pool,
        count: g.need ?? perAttempt,
      }),
    )
    .join(" ");
}

// The DB enforces the same rule in a BEFORE INSERT/UPDATE trigger on
// olympiad_packages and raises an Azerbaijani sentence with
// hint='olympiad_pool_below_per_attempt' plus a DETAIL JSON payload. The raw
// sentence must never reach an en/ru admin, so it is re-rendered from the
// payload here (and the raw message is never surfaced).
function mapPoolGuardError(
  error: { hint?: string | null; details?: string | null } | null,
  perAttempt: number,
  locale: Locale,
  lt: (key: string) => string,
): string | null {
  if (!error || error.hint !== "olympiad_pool_below_per_attempt") return null;
  let pool = 0;
  let required = perAttempt;
  let level = 0;
  try {
    const raw = typeof error.details === "string" ? error.details.slice(0, 2000) : "";
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (Number.isFinite(Number(parsed.pool))) pool = Number(parsed.pool);
    if (Number.isFinite(Number(parsed.required))) required = Number(parsed.required);
    if (Number.isFinite(Number(parsed.grade_level))) level = Number(parsed.grade_level);
  } catch {
    // Malformed/absent DETAIL — fall back to the values we already know.
  }
  if (level > 0) {
    return fillTemplate(lt("oly2.err.poolBelowPerAttempt"), {
      grade: gradeLabel(locale, level),
      pool,
      count: required,
    });
  }
  return fillTemplate(lt("oly2.err.poolBelowPerAttemptNoGrade"), {
    pool,
    count: required,
  });
}

// Insert with the auto-generated `code`; retry on a unique-violation by
// appending a short random suffix. Returns the new package id or null.
async function insertPackageRow(
  supabase: Db,
  row: Record<string, unknown>,
  titleAz: string,
  profileId: string | null,
): Promise<string | null> {
  const base = slugifyCode(titleAz);
  let code = base;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from("olympiad_packages")
      .insert({ ...row, code, created_by: profileId })
      .select("id")
      .single();
    if (!error && data) return data.id as string;
    if ((error as { code?: string } | null)?.code === "23505") {
      code = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }
    console.error("[admin] olympiad package insert failed", error?.message);
    return null;
  }
  return null;
}

// Upserts az/en/ru title+description. `deleteMissing` (update mode only)
// removes a locale row when its title was cleared. Returns an error string
// (already logged) or null on success.
async function upsertPackageTranslations(
  supabase: Db,
  fd: FormData,
  pkgId: string,
  deleteMissing: boolean,
): Promise<string | null> {
  for (const loc of LOCALES) {
    const title = s(fd, `title_${loc}`);
    const desc = s(fd, `desc_${loc}`);
    if (title) {
      const { error } = await supabase
        .from("olympiad_package_translations")
        .upsert(
          { olympiad_package_id: pkgId, locale: loc, title, description: desc || null },
          { onConflict: "olympiad_package_id,locale" },
        );
      if (error) {
        console.error("[admin] olympiad translation upsert failed", error.message);
        return error.message;
      }
    } else if (deleteMissing) {
      await supabase
        .from("olympiad_package_translations")
        .delete()
        .eq("olympiad_package_id", pkgId)
        .eq("locale", loc);
    }
  }
  return null;
}

export async function saveOlympiadPackage(
  _prev: OlympiadState,
  fd: FormData,
): Promise<OlympiadState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);
  const id = s(fd, "__id");
  // EDIT mode: grades are managed by the dedicated add/remove actions on the
  // edit page (a grade is only ever added TOGETHER with its question file),
  // so this metadata form does not carry grade checkboxes.
  const fields = parsePackageFields(fd, t, lt, { requireGrades: !id });
  if ("error" in fields) return { error: fields.error };

  // Migration 106: per-grade question count + duration. On EDIT the grade set
  // comes from the posted rows (the form renders one per target grade); on the
  // metadata-only CREATE path it comes from the grade checkboxes. Validated
  // before anything is written either way.
  const metaGradeCfg = parsePerGradeConfig(fd, fields.gradeIds);
  if (!metaGradeCfg.ok) return { error: lt(metaGradeCfg.errorKey) };

  const supabase = await createClient();
  // Round 34: the olympiad type is mandatory; "Other" creates/reuses a type.
  const typeRes = await resolveOlympiadTypeId(supabase, fields, t);
  if ("error" in typeRes) return { error: typeRes.error };

  // Round 49 activation gate: an ACTIVE package must be able to FILL an
  // attempt for EVERY target grade — pool >= questions_per_attempt (a student
  // must never buy into a pool that cannot serve one sitting). This is where
  // the status transition happens; the DB trigger is the second, authoritative
  // line of defence and applies exactly the same rule.
  //
  // Scope mirrors that trigger on purpose: only an ACTIVATION or a change to
  // the per-attempt count is gated. An unrelated edit (price, banner, sale
  // window) on an ALREADY-active package must not be blocked by a pool that
  // predates this rule — otherwise such a package could never be edited again.
  let prev: { status: string; questions_per_attempt: number } | null = null;
  if (id) {
    const { data } = await supabase
      .from("olympiad_packages")
      .select("status, questions_per_attempt")
      .eq("id", id)
      .maybeSingle();
    prev = data
      ? {
          status: String((data as any).status),
          questions_per_attempt: Number((data as any).questions_per_attempt ?? 0),
        }
      : null;
  }
  const gatesActivation =
    fields.status === "active" &&
    (!prev ||
      prev.status !== "active" ||
      prev.questions_per_attempt !== fields.questionsPerAttempt);
  if (gatesActivation) {
    const blocked = id
      ? await activationPoolBlock(supabase, id, fields.questionsPerAttempt, locale, lt)
      : // A package created through this metadata-only path has NO pool yet,
        // so it can never start out active.
        fillTemplate(lt("oly2.err.poolBelowPerAttemptNoGrade"), {
          pool: 0,
          count: fields.questionsPerAttempt,
        });
    if (blocked) return { error: blocked };
  }

  // `code` is auto-generated from the Azerbaijani title (no longer a UI input).
  // On update we keep the existing code untouched. grade_id is NOT written
  // here anymore — the DB sync trigger derives it from the target-grade rows.
  const row = {
    subject_id: fields.subjectId,
    olympiad_type_id: typeRes.typeId,
    price_amount: fields.price,
    status: fields.status,
    event_starts_at: fields.eventAt,
    sale_starts_at: fields.saleStartAt,
    sale_ends_at: fields.saleEndAt,
    duration_minutes: fields.durationMinutes,
    questions_per_attempt: fields.questionsPerAttempt,
  };
  let pkgId = id;
  if (!pkgId) {
    const inserted = await insertPackageRow(supabase, row, fields.titleAz, ctx.profileId);
    if (!inserted) return { error: t("err.server") };
    pkgId = inserted;
    const { error: gErr } = await supabase
      .from("olympiad_package_grades")
      .insert(
        (metaGradeCfg.ok ? metaGradeCfg.rows : []).map((r) => ({
          olympiad_package_id: pkgId,
          grade_id: r.grade_id,
          questions_per_attempt: r.questions_per_attempt,
          duration_minutes: r.duration_minutes,
        })),
      );
    if (gErr) {
      console.error("[admin] olympiad grade rows insert failed", gErr.message);
      await rollbackNewPackage(supabase, pkgId);
      return { error: t("err.server") };
    }
  } else {
    const { error } = await supabase.from("olympiad_packages").update(row).eq("id", pkgId);
    if (error) {
      // The DB pool guard raises an AZ sentence — re-render it in the admin's
      // locale from its DETAIL payload instead of leaking the raw message.
      const guarded = mapPoolGuardError(error, fields.questionsPerAttempt, locale, lt);
      console.error("[admin] olympiad package update failed", error.message);
      return { error: guarded ?? t("err.server") };
    }
  }

  // Migration 106: persist each target grade's own count + duration. EDIT
  // only — on create the values went in with the grade rows above. Grades are
  // added/removed by their own actions, so this updates existing rows and never
  // inserts: a posted grade id that is not a target is simply a no-op.
  if (id) {
    const cfgErr = await savePerGradeConfig(supabase, pkgId, fd);
    if (cfgErr) return { error: cfgErr === "invalid" ? lt("oly2.err.perAttempt") : t("err.server") };
  }

  const trErr = await upsertPackageTranslations(supabase, fd, pkgId, Boolean(id));
  if (trErr) return { error: t("err.server") };

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.olympiad.update" : "admin.olympiad.create",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      status: fields.status,
      price: fields.price,
      questions_per_attempt: fields.questionsPerAttempt,
    },
  });

  revalidatePath("/olympiad");
  redirect(`/olympiad/${pkgId}/edit`);
}

// Bulk import of PRIVATE questions for one package. Each package owns its own
// pool (questions.olympiad_package_id) — NOT shared with the general question
// bank. Delegated to the SECURITY DEFINER bulk_insert_olympiad_package_questions
// RPC (Administrator-only in-body; sets olympiad_package_id + published).
//
// There are exactly TWO entry points, both below: createOlympiadPackageWithQuestions
// (one file per grade, at creation) and appendOlympiadGradeQuestions (one
// already-targeted grade, afterwards). A third — `bulkImportOlympiadQuestions`,
// driven by BulkUploadModal's olympiad branch — was deleted: nothing mounted
// that modal with a package, yet every export of a "use server" module stays a
// POST-able endpoint, and it called the RPC WITHOUT a grade id. Before migration
// 108 the DB refused that; after 108 it would have appended into whatever legacy
// olympiad_packages.grade_id a single-grade package happened to carry.
type BulkResult = {
  total: number;
  successful: number;
  failed: number;
  errors: { index: number; error: string }[];
};

// Reads + size-caps the uploaded JSON file (2 MB, same cap as the general
// question-bank import). Returns the parsed array or a trilingual error.
// Round 34: the create flow uploads ONE FILE PER GRADE (field "file_<gradeId>").
async function readBulkFile(
  fd: FormData,
  t: T,
  fieldName = "file",
): Promise<{ error: string } | { payload: unknown[]; fileName: string }> {
  const file = fd.get(fieldName);
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("bulk.pickFile") };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: t("bulk.tooLarge") };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return { error: t("bulk.invalidJson") };
  }
  if (!Array.isArray(payload)) {
    return { error: t("bulk.notArray") };
  }
  return { payload, fileName: file.name };
}

// Active question types + their structure rules (single_choice = 5 options /
// 1 correct) for the strict per-row validation shared with the general bank.
// Rows that omit meta.type default to single_choice — the RPCs' default.
async function loadActiveTypeRules(supabase: Db): Promise<{
  activeByNorm: Map<string, ActiveTypeRule>;
  defaultType: ActiveTypeRule | null;
}> {
  const { data: typeRows } = await supabase
    .from("question_types")
    .select("code, name, options_required, correct_required")
    .eq("status", "active")
    .order("name");
  const activeTypes: ActiveTypeRule[] = ((typeRows ?? []) as any[]).map((r) => ({
    code: String(r.code ?? ""),
    name: String(r.name),
    options_required: r.options_required ?? null,
    correct_required: r.correct_required ?? null,
  }));
  const activeByNorm = new Map<string, ActiveTypeRule>();
  for (const r of activeTypes) activeByNorm.set(normTypeName(r.name), r);
  return { activeByNorm, defaultType: pickDefaultType(activeTypes) };
}

type ValidatedRows = {
  total: number;
  errors: { index: number; error: string }[];
  validItems: Record<string, unknown>[];
  validFileIndex: number[];
};

// Strict per-row validation BEFORE the RPC, so each bad row gets a specific
// trilingual reason instead of a generic message. Subject is package-scoped
// inside the RPC (never taken from the row); the PACKAGE grade level is
// injected into every valid row, superseding any legacy meta.grade_level.
function validateRows(
  payload: unknown[],
  t: T,
  activeByNorm: Map<string, ActiveTypeRule>,
  defaultType: ActiveTypeRule | null,
  gradeLevel: number,
  // Round 53 — mixed mode permits `meta.image`; text-only mode REPORTS one
  // rather than dropping it, which would import the questions without their
  // pictures and still look successful.
  mixed = false,
): ValidatedRows {
  const errors: { index: number; error: string }[] = [];
  const validItems: Record<string, unknown>[] = [];
  const validFileIndex: number[] = [];
  payload.forEach((item, i) => {
    // OLYMPIAD mode: topic/subtopic/term stay optional (package-scoped pool).
    const msg = validateBulkItem(item, t, activeByNorm, defaultType, "olympiad", null, mixed);
    if (msg) {
      errors.push({ index: i + 1, error: msg });
      return;
    }
    const mediaMsg = validateItemMedia(item, t, mixed);
    if (mediaMsg) {
      errors.push({ index: i + 1, error: mediaMsg });
      return;
    }
    validItems.push(overrideItemMeta(item, { grade_level: gradeLevel }));
    validFileIndex.push(i + 1);
  });
  return { total: payload.length, errors, validItems, validFileIndex };
}

// Reads the mandatory import type, the file, the active type rules and the
// per-row validation in the one order every pool import needs them, so the
// add-grade and append flows cannot drift apart. `rejectUnclaimableMedia` is
// part of the pipeline, not an optional extra: the RPC only checks the bucket,
// and RLS lets a panel user fabricate a media_assets row pointing anywhere.
async function prepareGradePoolRows(
  supabase: Db,
  ownerProfileId: string | null,
  fd: FormData,
  tq: (key: string) => string,
  gradeLevel: number,
  mixed: boolean,
  fileField = "file",
): Promise<{ error: string } | { rows: ValidatedRows }> {
  const parsed = await readBulkFile(fd, tq, fileField);
  if ("error" in parsed) return { error: parsed.error };
  const { activeByNorm, defaultType } = await loadActiveTypeRules(supabase);
  const rows = validateRows(
    parsed.payload,
    tq,
    activeByNorm,
    defaultType,
    gradeLevel,
    mixed,
  );
  await rejectUnclaimableMedia(supabase, ownerProfileId, rows, tq);
  return { rows };
}

// Runs the SECURITY DEFINER pool-import RPC and merges its per-row errors
// (mapped back to original file row numbers) with the pre-validation errors.
// Round 34: p_grade_id targets ONE grade pool. Migration 108: that pool is
// APPENDABLE — a row already in it comes back as a per-row duplicate error.
// `t` must be a withLocalStrings-wrapped translator: several branches of
// mapRpcRowError resolve keys that live in question-flow-labels.ts, not
// messages.ts, and a raw getT() would render them as bare key strings.
//
// `gradeId` is REQUIRED, not defaulted to null: with a null the RPC falls back
// to the legacy olympiad_packages.grade_id, which used to be harmless only
// because the creation-only raise rejected the import anyway. Since migration
// 108 that fallback would silently append into that legacy grade.
async function runOlympiadPoolImport(
  supabase: Db,
  t: (key: string) => string,
  pkgId: string,
  rows: ValidatedRows,
  gradeId: string,
): Promise<{ error: string } | { result: BulkResult }> {
  const errors = [...rows.errors];
  let successful = 0;
  if (rows.validItems.length > 0) {
    const { data, error } = await supabase.rpc(
      "bulk_insert_olympiad_package_questions",
      { p_package_id: pkgId, p_questions: rows.validItems, p_grade_id: gradeId },
    );
    if (error) {
      // The RPC's two check_violations both mean the same thing to an admin:
      // this import has no valid target grade. Keyed off the stable HINT, not
      // the SQLSTATE — 23514 alone would also swallow a future constraint.
      const hint = (error as { hint?: string }).hint ?? "";
      if (hint === "pool_grade_missing" || hint === "pool_grade_not_targeted") {
        const lt = olympiadLocalStrings(await getLocale());
        return { error: lt("oly2.err.grades") };
      }
      console.error("[admin] olympiad bulk import failed", error.message);
      return { error: t("err.server") };
    }
    const rpc = data as BulkResult;
    successful = rpc?.successful ?? 0;
    for (const e of rpc?.errors ?? []) {
      const fileIdx = rows.validFileIndex[e.index - 1] ?? e.index;
      errors.push({ index: fileIdx, error: mapRpcRowError(e.error, t) });
    }
  }
  errors.sort((a, b) => a.index - b.index);
  return {
    result: { total: rows.total, successful, failed: rows.total - successful, errors },
  };
}

// ---------------------------------------------------------------------------
// Create package + import its pool in ONE action (New Package page). A package
// must never be created with zero questions, so:
//   validate fields → validate file rows → create package → import pool →
//   if NOTHING imported, hard-delete the just-created package (safe: it is
//   brand-new — zero purchases verified here AND enforced by the ON DELETE
//   RESTRICT FK on olympiad_purchases; its translations and any pool questions
//   are removed by ON DELETE CASCADE) → report per-row errors.
// Partial success keeps the package (admin fixes the failed rows on the edit
// page); full success redirects straight to the edit page.
// ---------------------------------------------------------------------------

export type OlympiadCreateState =
  | {
      ok?: boolean;
      error?: string;
      packageId?: string;
      result?: BulkResult;
    }
  | null;

// Hard delete used ONLY to roll back a package created in this same call.
// Refuses to touch a package that somehow acquired a purchase.
async function rollbackNewPackage(supabase: Db, pkgId: string): Promise<void> {
  const { count } = await supabase
    .from("olympiad_purchases")
    .select("id", { count: "exact", head: true })
    .eq("olympiad_package_id", pkgId);
  if ((count ?? 0) > 0) {
    console.error(
      "[admin] olympiad create rollback skipped: package has purchases",
      pkgId,
    );
    return;
  }
  const { error } = await supabase
    .from("olympiad_packages")
    .delete()
    .eq("id", pkgId);
  if (error) {
    console.error("[admin] olympiad create rollback failed", error.message);
  }
}

export async function createOlympiadPackageWithQuestions(
  _prev: OlympiadCreateState,
  fd: FormData,
): Promise<OlympiadCreateState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);

  const fields = parsePackageFields(fd, t, lt);
  if ("error" in fields) return { error: fields.error };
  if (!UUID_RE.test(fields.subjectId)) return { error: t("oly2.err.subject") };

  const supabase = await createClient();
  // Resolve the selected grades (level per grade — every row of a grade's
  // file is stamped with THAT grade, whatever legacy meta it carries).
  const { data: gradeRows } = await supabase
    .from("grades")
    .select("id, name, level")
    .in("id", fields.gradeIds);
  const grades = ((gradeRows ?? []) as any[]).map((g) => ({
    id: String(g.id),
    name: String(g.name),
    level: Number(g.level),
  }));
  if (grades.length !== fields.gradeIds.length) return { error: lt("oly2.err.grades") };

  const typeRes = await resolveOlympiadTypeId(supabase, fields, t);
  if ("error" in typeRes) return { error: typeRes.error };

  // Round 53 — ONE mandatory import type for the WHOLE package. Per-grade modes
  // were considered and rejected: every grade file comes from the same external
  // step and the same template, so a per-grade switch would only create a way
  // for two grades to disagree, with nothing gained. Refused rather than
  // defaulted — a default would import a mixed file with every image silently
  // dropped and still report success.
  const tq = withLocalStrings(t, locale);
  const qMode = s(fd, "question_mode");
  if (qMode !== "text" && qMode !== "mixed") {
    return { error: tq("bulk.mode.required") };
  }
  const mixed = qMode === "mixed";

  // Migration 106: per-grade question count + duration. Parsed and validated
  // HERE — before insertPackageRow — so an invalid value fails cleanly instead
  // of leaving a package that then has to be rolled back.
  const gradeConfig = parsePerGradeConfig(fd, fields.gradeIds);
  if (!gradeConfig.ok) return { error: lt(gradeConfig.errorKey) };

  // Round 34: validate EVERY grade's file BEFORE creating anything. The
  // package must not be creatable while any selected grade lacks a valid
  // pool — a bad file in one grade blocks the whole creation, and the admin
  // sees each failing grade + row. (Server-side; the client mirror is UX.)
  const { activeByNorm, defaultType } = await loadActiveTypeRules(supabase);
  const perGrade: {
    grade: { id: string; name: string; level: number };
    rows: ValidatedRows;
  }[] = [];
  const badGrades: string[] = [];
  const allErrors: { index: number; error: string }[] = [];
  for (const grade of grades) {
    const parsed = await readBulkFile(fd, tq, `file_${grade.id}`);
    if ("error" in parsed) {
      badGrades.push(grade.name);
      continue;
    }
    const rows = validateRows(parsed.payload, tq, activeByNorm, defaultType, grade.level, mixed);
    await rejectUnclaimableMedia(supabase, ctx.profileId, rows, tq);
    if (rows.validItems.length === 0 || rows.errors.length > 0) {
      badGrades.push(grade.name);
      for (const e of rows.errors) {
        allErrors.push({ index: e.index, error: `${grade.name}: ${e.error}` });
      }
      continue;
    }
    perGrade.push({ grade, rows });
  }
  if (badGrades.length > 0) {
    return {
      error: lt("oly2.err.gradeFiles").replace("{grades}", badGrades.join(", ")),
      result: {
        total: allErrors.length,
        successful: 0,
        failed: allErrors.length,
        errors: allErrors,
      },
    };
  }

  // Round 49 activation gate, applied BEFORE anything is written: a package
  // may only be created ACTIVE when every grade's uploaded pool can fill one
  // attempt (pool >= questions_per_attempt).
  if (fields.status === "active") {
    // Migration 106: each grade is measured against ITS OWN count, matching the
    // DB guard. A 40-question grade and a 10-question grade have different
    // thresholds against the same uploaded pool.
    const needByGrade = new Map(
      gradeConfig.rows.map((r) => [r.grade_id, r.questions_per_attempt]),
    );
    const short = gradePoolShortfalls(
      perGrade.map(({ grade, rows }) => ({
        ...grade,
        pool: rows.validItems.length,
        need: needByGrade.get(grade.id) ?? null,
      })),
      fields.questionsPerAttempt,
    );
    if (short.length > 0) {
      return {
        error: short
          .map((g) =>
            fillTemplate(lt("oly2.err.poolBelowPerAttempt"), {
              grade: gradeLabel(locale, g.level, g.name),
              pool: g.pool,
              count: g.need ?? fields.questionsPerAttempt,
            }),
          )
          .join(" "),
      };
    }
  }

  // Create the package — grade_id is trigger-derived from the target rows.
  // The row is always INSERTED non-active: the pool is imported further below,
  // and the DB activation guard (rightly) refuses an active package with an
  // empty pool. A requested 'active' status is applied at the very end, once
  // every grade's pool exists.
  const pkgId = await insertPackageRow(
    supabase,
    {
      subject_id: fields.subjectId,
      olympiad_type_id: typeRes.typeId,
      price_amount: fields.price,
      status: fields.status === "active" ? "inactive" : fields.status,
      event_starts_at: fields.eventAt,
      sale_starts_at: fields.saleStartAt,
      sale_ends_at: fields.saleEndAt,
      duration_minutes: fields.durationMinutes,
      questions_per_attempt: fields.questionsPerAttempt,
    },
    fields.titleAz,
    ctx.profileId,
  );
  if (!pkgId) return { error: t("err.server") };

  // Target grades BEFORE the imports (the pool guard trigger checks them).
  // Migration 106: each grade carries its OWN question count and duration.
  // Validated before the package row was created, so a bad value never leaves a
  // half-built package behind.
  const { error: gErr } = await supabase
    .from("olympiad_package_grades")
    .insert(
      gradeConfig.rows.map((r) => ({
        olympiad_package_id: pkgId,
        grade_id: r.grade_id,
        questions_per_attempt: r.questions_per_attempt,
        duration_minutes: r.duration_minutes,
      })),
    );
  if (gErr) {
    console.error("[admin] olympiad grade rows insert failed", gErr.message);
    await rollbackNewPackage(supabase, pkgId);
    return { error: t("err.server") };
  }

  const trErr = await upsertPackageTranslations(supabase, fd, pkgId, false);
  if (trErr) {
    await rollbackNewPackage(supabase, pkgId);
    return { error: t("err.server") };
  }

  // Import EVERY grade's pool. Pre-validation makes per-row RPC failures
  // exceptional (a server-side race); ANY grade ending at 0 questions — or
  // ANY failed row — undoes the whole creation, so a package can never exist
  // with a hole in one grade's pool.
  const combined: BulkResult = { total: 0, successful: 0, failed: 0, errors: [] };
  for (const { grade, rows } of perGrade) {
    const imp = await runOlympiadPoolImport(supabase, tq, pkgId, rows, grade.id);
    if ("error" in imp) {
      await rollbackNewPackage(supabase, pkgId);
      return { error: lt("oly2.err.gradeImport").replace("{grade}", grade.name) };
    }
    combined.total += imp.result.total;
    combined.successful += imp.result.successful;
    combined.failed += imp.result.failed;
    for (const e of imp.result.errors) {
      combined.errors.push({ index: e.index, error: `${grade.name}: ${e.error}` });
    }
    if (imp.result.successful === 0 || imp.result.failed > 0) {
      await rollbackNewPackage(supabase, pkgId);
      await writeAuditLog({
        actorProfileId: ctx.profileId,
        action: "admin.olympiad.create_rolled_back",
        targetTable: "olympiad_packages",
        targetId: pkgId,
        metadata: { grade: grade.name, failed: imp.result.failed },
        severity: "warning",
        success: false,
      });
      return {
        error: lt("oly2.err.gradeFiles").replace("{grades}", grade.name),
        result: combined,
      };
    }
  }

  // Every pool is in place now — apply the requested ACTIVE status. Re-checked
  // against the REAL published counts (not the file counts) so activation can
  // never outrun what actually landed in the pool.
  let effectiveStatus = fields.status;
  if (fields.status === "active") {
    let failure = await activationPoolBlock(
      supabase,
      pkgId,
      fields.questionsPerAttempt,
      locale,
      lt,
    );
    if (!failure) {
      const { error: actErr } = await supabase
        .from("olympiad_packages")
        .update({ status: "active" })
        .eq("id", pkgId);
      failure = actErr?.message ?? null;
    }
    if (failure) {
      // The package exists with a complete pool — keep it (never discard an
      // imported pool over a status flip) and leave it inactive; the admin
      // activates it from the edit page after fixing the pool.
      console.error("[admin] olympiad activation after create failed", failure);
      effectiveStatus = "inactive";
    }
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.create",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      status: effectiveStatus,
      price: fields.price,
      grades: grades.map((g) => g.level),
      questions: combined.successful,
      questions_per_attempt: fields.questionsPerAttempt,
    },
  });

  revalidatePath("/olympiad");
  // All grades imported fully — continue on the package's edit page.
  redirect(`/olympiad/${pkgId}/edit`);
}

// ---------------------------------------------------------------------------
// Round 34 — grade management on the EDIT page. A grade is only ever ADDED
// together with its question file (no grade can exist with an empty pool),
// and only REMOVED through the guarded RPC (blocked while purchased; pool
// archived, never deleted).
// Migration 108: an ALREADY-targeted grade's pool can also be APPENDED to
// (appendOlympiadGradeQuestions below) — that is the live bulk path after
// creation, and the only one that reaches the package's own grade.
// ---------------------------------------------------------------------------

export type OlympiadGradeState =
  | { ok?: boolean; error?: string; result?: BulkResult }
  | null;

export async function addOlympiadPackageGrade(
  _prev: OlympiadGradeState,
  fd: FormData,
): Promise<OlympiadGradeState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);
  const pkgId = s(fd, "__id");
  const gradeId = s(fd, "grade_id");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(gradeId)) return { error: t("err.server") };

  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id, status, questions_per_attempt")
    .eq("id", pkgId)
    .maybeSingle();
  if (!pkg) return { error: t("err.server") };
  const { data: grade } = await supabase
    .from("grades")
    .select("id, name, level")
    .eq("id", gradeId)
    .maybeSingle();
  if (!grade) return { error: lt("oly2.err.grades") };
  const { data: already } = await supabase
    .from("olympiad_package_grades")
    .select("grade_id")
    .eq("olympiad_package_id", pkgId)
    .eq("grade_id", gradeId)
    .maybeSingle();
  if (already) return { error: lt("oly2.err.gradeExists") };

  // The new grade's pool file — validated fully BEFORE any write. This surface
  // has no import-type selector, so it stays TEXT-ONLY: a file carrying images
  // is reported (bulk.err.mediaNotAllowed) rather than imported without them.
  const tq = withLocalStrings(t, locale);
  const prepared = await prepareGradePoolRows(
    supabase,
    ctx.profileId,
    fd,
    tq,
    Number(grade.level),
    false,
  );
  if ("error" in prepared) return { error: prepared.error };
  const rows = prepared.rows;
  if (rows.validItems.length === 0 || rows.errors.length > 0) {
    return {
      error: lt("oly2.err.gradeFiles").replace("{grades}", String(grade.name)),
      result: { total: rows.total, successful: 0, failed: rows.total, errors: rows.errors },
    };
  }
  // Round 49: a LIVE package must be able to fill an attempt for every grade it
  // targets, so a grade added to an ACTIVE package needs a pool of at least
  // questions_per_attempt. (An inactive package is gated at activation time.)
  const perAttempt = Number((pkg as any).questions_per_attempt ?? 0);
  if (
    String((pkg as any).status) === "active" &&
    perAttempt > 0 &&
    rows.validItems.length < perAttempt
  ) {
    return {
      error: fillTemplate(lt("oly2.err.poolBelowPerAttempt"), {
        grade: gradeLabel(locale, Number(grade.level), String(grade.name)),
        pool: rows.validItems.length,
        count: perAttempt,
      }),
    };
  }

  const { error: gErr } = await supabase
    .from("olympiad_package_grades")
    .insert({ olympiad_package_id: pkgId, grade_id: gradeId });
  if (gErr) {
    console.error("[admin] add grade failed", gErr.message);
    return { error: t("err.server") };
  }

  const imp = await runOlympiadPoolImport(supabase, tq, pkgId, rows, gradeId);
  const failed =
    "error" in imp || imp.result.successful === 0 || imp.result.failed > 0;
  if (failed) {
    // Undo the half-added grade so no empty/partial pool is left behind. Its
    // few just-imported questions (if any) go with it via the RPC's archive…
    // they cannot: bulk rows are fresh and unanswered — delete them directly.
    //
    // This bare delete is NOT a way around migration 112's purchased-pool rule,
    // and must not be routed through the guarded RPC. The grade was targeted a
    // few lines above (an already-targeted grade never reaches this function),
    // so every row it removes is one THIS request just inserted — there is no
    // entitlement to protect, and refusing the undo would strand a half-added
    // grade instead. The rule guards the two paths that remove pool questions
    // an admin CHOSE: the per-row button and the bulk selection.
    await supabase
      .from("questions")
      .delete()
      .eq("olympiad_package_id", pkgId)
      .eq("grade_id", gradeId);
    await supabase
      .from("olympiad_package_grades")
      .delete()
      .eq("olympiad_package_id", pkgId)
      .eq("grade_id", gradeId);
    return {
      error:
        "error" in imp
          ? imp.error
          : lt("oly2.err.gradeImport").replace("{grade}", String(grade.name)),
      result: "error" in imp ? undefined : imp.result,
    };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.grade_add",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { grade: grade.name, questions: imp.result.successful },
  });
  revalidatePath(`/olympiad/${pkgId}/edit`);
  return { ok: true, result: imp.result };
}

/**
 * Migration 108 — bulk-append into an ALREADY-targeted grade's pool.
 *
 * This is what finally makes bulk upload reachable for a package's OWN grade:
 * that grade is targeted at creation together with its file, so it never
 * appears in the add-grade form above, and before 108 the DB rejected every
 * later import into a non-empty pool.
 *
 * Unlike addOlympiadPackageGrade this allows PARTIAL success — there is no
 * half-created grade to unwind, and re-running the corrected file is safe
 * because the DB skips the rows that already landed as duplicates.
 */
export async function appendOlympiadGradeQuestions(
  _prev: OlympiadGradeState,
  fd: FormData,
): Promise<OlympiadGradeState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);
  const tq = withLocalStrings(t, locale);
  const pkgId = s(fd, "__id");
  const gradeId = s(fd, "grade_id");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(gradeId)) return { error: t("err.server") };

  const supabase = await createClient();
  // Status is deliberately NOT a gate: an ARCHIVED package still entitles its
  // lifetime purchasers, so topping up its pool stays a legitimate action.
  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id")
    .eq("id", pkgId)
    .maybeSingle();
  if (!pkg) return { error: t("err.server") };

  // The posted grade is re-verified against THIS package's target rows before
  // anything is read from the file. The RPC checks it again, but a rejection
  // there arrives as a generic server error instead of a nameable one.
  const target = (await packageGradeRows(supabase, pkgId)).find((g) => g.id === gradeId);
  if (!target) return { error: lt("oly2.err.grades") };
  if (!(target.level > 0)) return { error: t("olybulk.err.pkgGrade") };

  // Mandatory import type — never defaulted, for the same reason as everywhere
  // else: "text" applied to a mixed file drops every image and still succeeds.
  const qMode = s(fd, "question_mode");
  if (qMode !== "text" && qMode !== "mixed") return { error: tq("bulk.mode.required") };

  const prepared = await prepareGradePoolRows(
    supabase,
    ctx.profileId,
    fd,
    tq,
    target.level,
    qMode === "mixed",
  );
  if ("error" in prepared) return { error: prepared.error };
  const rows = prepared.rows;
  if (rows.validItems.length === 0) {
    return {
      error: lt("oly2.err.gradeFiles").replace("{grades}", target.name),
      result: { total: rows.total, successful: 0, failed: rows.total, errors: rows.errors },
    };
  }

  // gradeId is passed explicitly so the package's own/primary grade takes the
  // same path as every other grade instead of relying on the RPC's legacy
  // olympiad_packages.grade_id fallback.
  const imp = await runOlympiadPoolImport(supabase, tq, pkgId, rows, gradeId);
  if ("error" in imp) return { error: imp.error };

  // No activation re-check: an append only GROWS a published pool, and
  // assert_olympiad_pool_meets_per_attempt can only ever block pool < required.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.grade_bulk_append",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      grade_id: gradeId,
      total: imp.result.total,
      successful: imp.result.successful,
      failed: imp.result.failed,
    },
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  return { ok: true, result: imp.result };
}

/**
 * REPLACE one grade's pool with an uploaded file. Full replacement, not append:
 * a 100-question pool replaced by a 50-question file ends with 50.
 *
 * The whole destructive sequence is migration 147's
 * `admin_replace_olympiad_grade_pool`, in ONE transaction: purge the old rows
 * (never-answered hard-deleted, answered ARCHIVED so graded results survive),
 * reset that grade's rotations, import the new rows through the SAME importer
 * the append path uses, then assert the pool still fills one attempt.
 *
 * Parsing, per-row validation and media claiming happen HERE, before the call,
 * so a bad file is rejected while the old pool is still intact (spec §6).
 */
export async function replaceOlympiadGradeQuestions(
  _prev: OlympiadGradeState,
  fd: FormData,
): Promise<OlympiadGradeState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);
  const tq = withLocalStrings(t, locale);

  const pkgId = s(fd, "__id");
  const gradeId = s(fd, "grade_id");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(gradeId)) return { error: t("err.server") };

  const supabase = await createClient();
  // Status is deliberately NOT a gate, exactly as in the append path: an
  // ARCHIVED package still entitles its lifetime purchasers, so refreshing its
  // pool stays legitimate.
  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id, code")
    .eq("id", pkgId)
    .maybeSingle();
  if (!pkg) return { error: t("err.server") };

  // Typed by the admin, compared here for a nameable error and AGAIN by the RPC
  // under its row lock — the second check is the one that counts.
  const code = s(fd, "confirm_code");
  if (!code || code !== String((pkg as { code: string }).code)) {
    return { error: lt("olyq.replace.err.code") };
  }

  const target = (await packageGradeRows(supabase, pkgId)).find((g) => g.id === gradeId);
  if (!target) return { error: lt("oly2.err.grades") };
  if (!(target.level > 0)) return { error: t("olybulk.err.pkgGrade") };

  const qMode = s(fd, "question_mode");
  if (qMode !== "text" && qMode !== "mixed") return { error: tq("bulk.mode.required") };

  // Everything the file can be wrong about is discovered NOW, while the pool
  // this is about to destroy is still there.
  const prepared = await prepareGradePoolRows(
    supabase,
    ctx.profileId,
    fd,
    tq,
    target.level,
    qMode === "mixed",
  );
  if ("error" in prepared) return { error: prepared.error };
  const rows = prepared.rows;

  if (rows.validItems.length === 0) {
    return {
      error: lt("oly2.err.gradeFiles").replace("{grades}", target.name),
      result: { total: rows.total, successful: 0, failed: rows.total, errors: rows.errors },
    };
  }
  // STRICTLY all-or-nothing (spec §6). The append path commits the good rows and
  // reports the rest; here that would leave the grade holding neither the old
  // pool nor the new one, so a single unusable row stops the whole replacement
  // while nothing has been touched.
  if (rows.errors.length > 0) {
    return {
      error: lt("olyq.replace.err.rows"),
      result: {
        total: rows.total,
        successful: 0,
        failed: rows.errors.length,
        errors: rows.errors,
      },
    };
  }

  const { data, error } = await supabase.rpc("admin_replace_olympiad_grade_pool", {
    p_package_id: pkgId,
    p_grade_id: gradeId,
    p_questions: rows.validItems,
    p_expected_code: code,
  });
  if (error) {
    // Every hint the RPC raises is something the admin can act on, so each gets
    // its own sentence rather than the generic server error.
    const hint = (error as { hint?: string }).hint ?? "";
    if (hint === "confirmation_mismatch") return { error: lt("olyq.replace.err.code") };
    if (hint === "empty_replacement") return { error: lt("olyq.replace.err.empty") };
    if (hint === "pool_grade_not_targeted") return { error: lt("oly2.err.grades") };
    if (hint === "live_attempts") return { error: lt("olyq.replace.err.live") };
    if (hint === "replacement_incomplete") return { error: lt("olyq.replace.err.incomplete") };
    if (hint === "replacement_below_floor" || hint === "replacement_below_floor_purchased") {
      return { error: lt("olyq.replace.err.floor") };
    }
    console.error("[admin] olympiad pool replace failed", error.message);
    return { error: t("err.server") };
  }

  const r = (data ?? {}) as Record<string, any>;
  // The RPC returns the media its purge orphaned; sweeping it is the caller's
  // half of the contract, and it is the SAME sweep the delete actions use.
  // `media_truncated` rides along in the audit row: a full-pool replacement can
  // exceed purge_question_set's 2000-id cap, and a leaked remainder that nobody
  // recorded is worse than one that did.
  await afterOlympiadDestructiveCall({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.grade_pool_replace",
    packageId: pkgId,
    metadata: {
      grade_id: gradeId,
      replaced_with: num(r.replaced_with),
      deleted: num(r.deleted_questions),
      archived_questions: num(r.archived_questions),
      retained: num(r.retained_questions),
      reset_rotations: num(r.reset_rotations),
      purchases: num(r.purchases),
      media_truncated: Boolean(r.media_truncated),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  return {
    ok: true,
    result: {
      total: rows.total,
      successful: num(r.replaced_with),
      failed: 0,
      errors: [],
    },
  };
}

export async function removeOlympiadPackageGradeAction(
  _prev: OlympiadGradeState,
  fd: FormData,
): Promise<OlympiadGradeState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const lt = olympiadLocalStrings(await getLocale());
  const pkgId = s(fd, "__id");
  const gradeId = s(fd, "grade_id");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(gradeId)) return { error: t("err.server") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_olympiad_package_grade", {
    p_package_id: pkgId,
    p_grade_id: gradeId,
  });
  if (error) {
    const hint = (error as { hint?: string }).hint ?? "";
    if (hint === "grade_has_purchases") return { error: lt("oly2.err.gradeHasPurchases") };
    if (hint === "last_grade") return { error: lt("oly2.err.lastGrade") };
    console.error("[admin] remove grade failed", error.message);
    return { error: t("err.server") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.grade_remove",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { grade_id: gradeId },
  });
  revalidatePath(`/olympiad/${pkgId}/edit`);
  return { ok: true };
}

// Links a browser-uploaded cover image to the package. Mirrors the hardened
// news-cover flow: strict path shape, server-side existence/mime/size
// verification (never trust client-submitted metadata), previous-cover cleanup,
// audit logging. Admin-only.
export async function attachOlympiadCover(
  formData: FormData,
): Promise<OlympiadCoverState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const pkgId = s(formData, "package_id");
  const bucket = s(formData, "bucket");
  const path = s(formData, "path");
  // NOTE: client-submitted mime/size form fields are deliberately IGNORED —
  // both are derived server-side from the storage object below.

  if (!pkgId || !UUID_RE.test(pkgId)) return { error: "Invalid request." };
  if (bucket !== COVER_BUCKET) return { error: "Invalid bucket." };
  // Strict path shape: olympiad/<pkgId>/<single safe image filename> (no svg).
  const filename = splitStoragePath(path, `olympiad/${pkgId}/`);
  if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
    return { error: "Invalid path." };
  }

  const supabase = await createClient();

  // Verify the object actually exists in the bucket and derive size + mime
  // server-side; reject when missing or outside the image whitelist.
  const obj = await verifyStorageObject(supabase, bucket, `olympiad/${pkgId}`, filename);
  if (!obj) return { error: "Invalid path." };
  if (!COVER_MIME.includes(obj.mime)) return { error: "Unsupported file type." };
  if (obj.size > COVER_MAX_SIZE) {
    return { error: "File too large (max 5 MB)." };
  }

  // Byte-sniff the (size-capped) object: metadata mimetype is client-claimed,
  // so the recorded type comes from the actual magic numbers (M19).
  const sniffed = await sniffVerifiedImage(supabase, bucket, path, obj.mime);
  if (!sniffed || !COVER_MIME.includes(sniffed)) {
    return { error: "Unsupported file type." };
  }

  // Remember any previous cover so we can clean it up after re-linking.
  const { data: prev } = await supabase
    .from("olympiad_packages")
    .select("cover_media_id")
    .eq("id", pkgId)
    .maybeSingle();
  const prevId: string | null = prev?.cover_media_id ?? null;

  const { data: media, error } = await supabase
    .from("media_assets")
    .insert({
      bucket,
      path,
      owner_profile_id: ctx.profileId,
      // Server-derived values only — mime comes from the SNIFFED bytes.
      mime_type: sniffed,
      file_size_bytes: obj.size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (error || !media) {
    console.error("[admin] olympiad cover media insert failed", error?.message);
    return { error: t("err.server") };
  }

  const { error: linkErr } = await supabase
    .from("olympiad_packages")
    .update({ cover_media_id: media.id })
    .eq("id", pkgId);
  if (linkErr) {
    console.error("[admin] olympiad cover link failed", linkErr.message);
    return { error: t("err.server") };
  }

  if (prevId) {
    const { data: pm } = await supabase
      .from("media_assets")
      .select("bucket, path")
      .eq("id", prevId)
      .maybeSingle();
    if (pm) await supabase.storage.from(pm.bucket).remove([pm.path]);
    await supabase.from("media_assets").delete().eq("id", prevId);
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.cover_attach",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { path, mime: sniffed, size: obj.size },
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  return null;
}

// Removes the cover: nulls olympiad_packages.cover_media_id, deletes the
// storage object and the media_assets row. Admin-only.
export async function detachOlympiadCover(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const pkgId = s(formData, "package_id");
  if (!pkgId) return;

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("olympiad_packages")
    .select("cover_media_id")
    .eq("id", pkgId)
    .maybeSingle();
  const mediaId: string | null = p?.cover_media_id ?? null;

  await supabase
    .from("olympiad_packages")
    .update({ cover_media_id: null })
    .eq("id", pkgId);

  if (mediaId) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path")
      .eq("id", mediaId)
      .maybeSingle();
    if (m) await supabase.storage.from(m.bucket).remove([m.path]);
    await supabase.from("media_assets").delete().eq("id", mediaId);
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.cover_detach",
    targetTable: "olympiad_packages",
    targetId: pkgId,
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
}

// ---------------------------------------------------------------------------
// Round 21 item 2 — per-question management of a package's PRIVATE pool.
// Complements the per-grade bulk append (migration 108): whole files go through
// appendOlympiadGradeQuestions, single questions through the actions here.
// All actions: requireAdmin() FIRST, then
// re-verify that the posted question actually belongs to the posted package
// before mutating anything (even though RLS would also block outsiders).
//
// EDIT SAFETY: olympiad attempts read questions/options LIVE (no snapshot) and
// historical reviews match test_attempt_answers.selected_option_ids against
// live option ids. Updates are therefore ID-STABLE — the 5 options are updated
// IN PLACE keyed by order_index (translations/is_correct on the existing rows;
// insert only genuinely missing order_index rows, e.g. legacy 4-option shapes).
// Options are NEVER delete+reinserted.
// ---------------------------------------------------------------------------

export type OlympiadQuestionState = { error?: string; ok?: boolean } | null;
export type OlympiadPoolActionResult = { error?: string } | null;

type PoolLocale = (typeof LOCALES)[number];
type PoolLocaleContent = {
  body: string;
  prompt: string;
  explanation: string;
  options: string[];
};

// Full editable payload for the edit modal (loaded on demand so the package
// page never ships every translation of every pool question to the client).
export type OlympiadPoolQuestionData = {
  id: string;
  status: string;
  gradeId: string;
  correct: number; // order_index of the correct option, -1 when none
  content: Record<PoolLocale, PoolLocaleContent>;
  imageUrl: string | null;
};

// Same caps as the general question editor (lib/admin/questions.ts).
const POOL_BODY_MAX = 8000;
const POOL_EXPLANATION_MAX = 8000;
const POOL_OPTION_MAX = 2000;
const POOL_OPTION_COUNT = 5;
const POOL_MEDIA_BUCKET = "question-media";
const POOL_MEDIA_MAX_SIZE = 5 * 1024 * 1024;

async function getPoolPackage(
  supabase: Db,
  pkgId: string,
): Promise<{ id: string; subject_id: string; grade_id: string | null } | null> {
  const { data } = await supabase
    .from("olympiad_packages")
    .select("id, subject_id, grade_id")
    .eq("id", pkgId)
    .maybeSingle();
  return (data as { id: string; subject_id: string; grade_id: string | null } | null) ?? null;
}

// Ownership re-verification used by every pool-question action: the question
// must exist AND carry THIS package's olympiad_package_id.
async function getPoolQuestion(
  supabase: Db,
  pkgId: string,
  qId: string,
): Promise<{
  id: string;
  status: string;
  primary_locale: string;
  grade_id: string | null;
} | null> {
  const { data } = await supabase
    .from("questions")
    .select("id, status, grade_id, primary_locale")
    .eq("id", qId)
    .eq("olympiad_package_id", pkgId)
    .maybeSingle();
  return (data as any) ?? null;
}

// Deletes a media_assets row together with its storage object (PostgreSQL
// never keeps binaries; storage objects must never be orphaned either).
// One-asset wrapper over the shared sweep, so the guarded-deletion RPCs and the
// pool editor cannot drift into two different definitions of "remove an asset".
async function removePoolMediaAsset(supabase: Db, mediaId: string): Promise<void> {
  await removeMediaAssets(supabase, [mediaId]);
}

// On-demand load of one pool question for the edit modal. Admin-only; returns
// null (no detail) when the ids are malformed or the question is not in the
// package.
export async function loadOlympiadPoolQuestion(
  packageId: string,
  questionId: string,
): Promise<OlympiadPoolQuestionData | null> {
  await requireAdmin();
  if (typeof packageId !== "string" || !UUID_RE.test(packageId)) return null;
  if (typeof questionId !== "string" || !UUID_RE.test(questionId)) return null;

  const supabase = await createClient();
  const q = await getPoolQuestion(supabase, packageId, questionId);
  if (!q) return null;

  const [{ data: trs }, { data: exps }, { data: opts }] = await Promise.all([
    supabase
      .from("question_translations")
      .select("locale, body, prompt, media_asset_id")
      .eq("question_id", questionId),
    supabase
      .from("question_explanations")
      .select("locale, explanation_body")
      .eq("question_id", questionId),
    supabase
      .from("answer_options")
      .select("id, is_correct, order_index, answer_option_translations(locale, text)")
      .eq("question_id", questionId)
      .order("order_index"),
  ]);

  const optRows = (opts ?? []) as any[];
  const content = {} as Record<PoolLocale, PoolLocaleContent>;
  for (const loc of LOCALES) {
    const tr = ((trs ?? []) as any[]).find((x) => x.locale === loc);
    const ex = ((exps ?? []) as any[]).find((x) => x.locale === loc);
    const options: string[] = [];
    for (let i = 0; i < POOL_OPTION_COUNT; i++) {
      const row = optRows.find((o) => Number(o.order_index) === i);
      const text = row
        ? ((row.answer_option_translations ?? []) as any[]).find(
            (x) => x.locale === loc,
          )?.text ?? ""
        : "";
      options.push(String(text ?? ""));
    }
    content[loc] = {
      body: String(tr?.body ?? ""),
      prompt: String(tr?.prompt ?? ""),
      explanation: String(ex?.explanation_body ?? ""),
      options,
    };
  }
  const correctRow = optRows.find((o) => o.is_correct);
  const correctIdx = correctRow == null ? -1 : Number(correctRow.order_index);
  const correct = correctIdx >= 0 && correctIdx < POOL_OPTION_COUNT ? correctIdx : -1;

  // Current image preview: linked on the primary-locale translation
  // (fallback: any translation that carries one).
  let imageUrl: string | null = null;
  const trList = (trs ?? []) as any[];
  const mediaTr =
    trList.find((x) => x.locale === q.primary_locale && x.media_asset_id) ??
    trList.find((x) => x.media_asset_id);
  if (mediaTr?.media_asset_id) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path, mime_type")
      .eq("id", mediaTr.media_asset_id)
      .maybeSingle();
    if (m && String(m.mime_type ?? "").startsWith("image/")) {
      const { data: pub } = supabase.storage.from(m.bucket).getPublicUrl(m.path);
      imageUrl = pub.publicUrl;
    }
  }

  return {
    id: String(q.id),
    status: String(q.status),
    gradeId: q.grade_id ? String(q.grade_id) : "",
    correct,
    content,
    imageUrl,
  };
}

// Create or update ONE pool question. Create matches bulk v3 exactly:
// olympiad_package_id set + status='published' + subject/grade from the
// PACKAGE (never the client) + optional olympiad-scoped taxonomy. az content
// is required; en/ru are optional but must be complete when provided.
export async function saveOlympiadPackageQuestion(
  _prev: OlympiadQuestionState,
  fd: FormData,
): Promise<OlympiadQuestionState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const lt = poolStrings(await getLocale());

  const pkgId = s(fd, "__package_id");
  const qId = s(fd, "__id");
  if (!UUID_RE.test(pkgId)) return { error: t("err.server") };
  if (qId && !UUID_RE.test(qId)) return { error: t("err.server") };

  const supabase = await createClient();
  const pkg = await getPoolPackage(supabase, pkgId);
  if (!pkg) return { error: t("err.server") };

  // On edit, re-verify the question belongs to THIS package before anything.
  const existing = qId ? await getPoolQuestion(supabase, pkgId, qId) : null;
  if (qId && !existing) return { error: t("err.server") };

  // Round 34: the question belongs to ONE of the package's grade pools. The
  // form sends grade_id; a single-target package may omit it (that target).
  const pkgGrades = await packageGradeRows(supabase, pkgId);
  let poolGradeId = s(fd, "grade_id");
  if (!poolGradeId && pkgGrades.length === 1) poolGradeId = pkgGrades[0].id;
  if (
    pkgGrades.length > 0 &&
    (!UUID_RE.test(poolGradeId) || !pkgGrades.some((g) => g.id === poolGradeId))
  ) {
    return { error: olympiadLocalStrings(await getLocale())("oly2.err.grades") };
  }

  // TOPIC AND SUBTOPIC ARE NO LONGER PART OF THIS FORM (owner spec §1).
  // The optional olympiad-scoped taxonomy block that stood here validated
  // fields the UI no longer sends. The DATABASE never required them for pool
  // rows -- both taxonomy guards carve out `olympiad_package_id is not null`
  // (011) -- so removing them needed no migration.

  // ---- Trilingual content: az required; en/ru optional-but-complete --------
  const content: Record<PoolLocale, PoolLocaleContent | null> = {
    az: null,
    en: null,
    ru: null,
  };
  // Locales that carry ONLY an explanation — no body, no options. A legitimate
  // shape since migration 119 (see the `active` note below), stored as an
  // explanation row with no translation row, exactly as the importer does.
  const explanationOnly: Partial<Record<PoolLocale, string>> = {};
  for (const loc of LOCALES) {
    const body = s(fd, `body_${loc}`);
    const prompt = s(fd, `prompt_${loc}`);
    const explanation = s(fd, `explanation_${loc}`);
    if (body.length > POOL_BODY_MAX || prompt.length > POOL_BODY_MAX) {
      return { error: t("err.tooLong") };
    }
    if (explanation.length > POOL_EXPLANATION_MAX) return { error: t("err.tooLong") };
    const options: string[] = [];
    for (let i = 0; i < POOL_OPTION_COUNT; i++) {
      const text = s(fd, `opt_${loc}_${i}`);
      if (text.length > POOL_OPTION_MAX) return { error: t("err.tooLong") };
      options.push(text);
    }
    // An EXPLANATION ALONE does not make a locale "active".
    //
    // `question_explanations` is keyed on (question_id, locale) independently of
    // `question_translations`, and since migration 119 the bulk importers store
    // an explanation for a locale whether or not that locale supplied a body —
    // which is exactly the shape the on-screen olyjson.rules hint invites
    // ("write the explanation in all three languages"). Counting the
    // explanation here made such a question PERMANENTLY UNEDITABLE: opening it
    // to fix an Azerbaijani typo failed with "English is incomplete", and the
    // only escape was to invent a full English body plus five English options,
    // or to clear the English explanation — which the save then deleted.
    // A locale is active when it carries QUESTION CONTENT; an explanation-only
    // locale is legitimate and is stored below as just that.
    const active = Boolean(body || prompt || options.some(Boolean));
    if (!active) {
      if (explanation) explanationOnly[loc] = explanation;
      continue;
    }
    if (!body || options.some((x) => !x)) {
      if (loc === "az") {
        return { error: body ? lt("olyq.err.fiveOptions") : lt("olyq.err.azBody") };
      }
      return {
        error: lt("olyq.err.localeIncomplete").replace("{lang}", localeNames[loc]),
      };
    }
    content[loc] = { body, prompt, explanation, options };
  }
  if (!content.az) return { error: lt("olyq.err.azBody") };

  // Exactly one correct option (radio index 0..4).
  const correctRaw = s(fd, "correct");
  if (!/^[0-4]$/.test(correctRaw)) return { error: lt("olyq.err.oneCorrect") };
  const correctIdx = Number(correctRaw);

  // ---- Type resolved server-side (single_choice = 5 options / 1 correct) ---
  const { data: qType } = await supabase
    .from("question_types")
    .select("id")
    .eq("code", "single_choice")
    .maybeSingle();
  if (!qType) {
    console.error("[admin] single_choice question type missing");
    return { error: t("err.server") };
  }

  // ---- Optional staged image (create AND edit; one-submission save) --------
  // The browser uploaded to staging/<uuid>.<ext>; verify existence, cap size,
  // byte-sniff the real mime BEFORE creating/moving anything. SVG stays banned.
  let staged:
    | { path: string; filename: string; mime: string; size: number }
    | null = null;
  const mediaPath = s(fd, "media_path");
  if (mediaPath) {
    const filename = splitStoragePath(mediaPath, "staging/");
    if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
      return { error: lt("olyq.img.invalid") };
    }
    const obj = await verifyStorageObject(supabase, POOL_MEDIA_BUCKET, "staging", filename);
    if (!obj || obj.size > POOL_MEDIA_MAX_SIZE) return { error: lt("olyq.img.invalid") };
    const sniffed = await sniffVerifiedImage(supabase, POOL_MEDIA_BUCKET, mediaPath, obj.mime);
    if (!sniffed) return { error: lt("olyq.img.invalid") };
    staged = { path: mediaPath, filename, mime: sniffed, size: obj.size };
  }
  const mediaRemove = s(fd, "media_remove") === "1";

  // Primary locale: az on create; kept on edit while that language still has
  // content, otherwise it falls back to az (az is always present).
  const existingPl = existing?.primary_locale ?? "";
  const primaryLocale: PoolLocale =
    (LOCALES as readonly string[]).includes(existingPl) &&
    content[existingPl as PoolLocale]
      ? (existingPl as PoolLocale)
      : "az";

  // ---- Question row ---------------------------------------------------------
  let questionId = qId;
  if (!questionId) {
    const { data: q, error } = await supabase
      .from("questions")
      .insert({
        olympiad_package_id: pkgId,
        subject_id: pkg.subject_id,
        grade_id: poolGradeId || null,
        type_id: qType.id,
        // Pool rows are always published (bulk v3 parity) — attempts draw
        // published questions only.
        status: "published",
        primary_locale: primaryLocale,
        created_by: ctx.profileId,
        updated_by: ctx.profileId,
      })
      .select("id")
      .single();
    if (error || !q) {
      console.error("[admin] olympiad pool question insert failed", error?.message);
      return { error: t("err.server") };
    }
    questionId = q.id as string;
  } else {
    const { error } = await supabase
      .from("questions")
      .update({
        subject_id: pkg.subject_id,
        grade_id: poolGradeId || null,
        // topic_id / subtopic_id are OMITTED, not set to null. Writing null
        // here would silently untag every pool question that already carries a
        // topic, the first time an admin opened and saved it -- the form no
        // longer offers the field, so a save must not be able to clear it.
        // Explicit NULL term: trg_question_term_guard re-inherits it, and with
        // the topic left untouched a stale term would otherwise mismatch.
        term: null,
        type_id: qType.id,
        primary_locale: primaryLocale,
        updated_by: ctx.profileId,
        // NOTE: status untouched — an archived question stays archived.
      })
      .eq("id", questionId)
      // Defence-in-depth: re-assert the package scope on the UPDATE itself.
      .eq("olympiad_package_id", pkgId);
    if (error) {
      console.error("[admin] olympiad pool question update failed", error.message);
      return { error: t("err.server") };
    }
  }

  // Only undo a question we created in THIS call (cascades remove children).
  // A still-staged image object is left in place so a retry can reuse it.
  const cleanup = async (context: string, msg?: string): Promise<OlympiadQuestionState> => {
    console.error("[admin]", context, msg);
    if (!qId && questionId) {
      await supabase.from("questions").delete().eq("id", questionId);
    }
    return { error: t("err.server") };
  };

  // ---- Translations + explanations per locale -------------------------------
  for (const loc of LOCALES) {
    const c = content[loc];
    if (c) {
      const { error } = await supabase
        .from("question_translations")
        .upsert(
          { question_id: questionId, locale: loc, body: c.body, prompt: c.prompt || null },
          { onConflict: "question_id,locale" },
        );
      if (error) return cleanup("olympiad pool translation upsert failed", error.message);
      if (c.explanation) {
        const { error: eErr } = await supabase
          .from("question_explanations")
          .upsert(
            { question_id: questionId, locale: loc, explanation_body: c.explanation },
            { onConflict: "question_id,locale" },
          );
        if (eErr) return cleanup("olympiad pool explanation upsert failed", eErr.message);
      } else if (qId) {
        await supabase
          .from("question_explanations")
          .delete()
          .eq("question_id", questionId)
          .eq("locale", loc);
      }
    } else if (explanationOnly[loc]) {
      // Explanation-only locale: keep the explanation, and do NOT touch the
      // (absent) translation row. Without this branch the next save of an
      // imported trilingual-explanation question would silently destroy the
      // very explanations the import was built to preserve.
      const { error: eErr } = await supabase
        .from("question_explanations")
        .upsert(
          { question_id: questionId, locale: loc, explanation_body: explanationOnly[loc] },
          { onConflict: "question_id,locale" },
        );
      if (eErr) return cleanup("olympiad pool explanation upsert failed", eErr.message);
    } else if (qId) {
      // Language cleared on edit (az can never get here): remove its rows and
      // clean up an image that was linked to the removed translation.
      const { data: old } = await supabase
        .from("question_translations")
        .select("media_asset_id")
        .eq("question_id", questionId)
        .eq("locale", loc)
        .maybeSingle();
      await supabase
        .from("question_translations")
        .delete()
        .eq("question_id", questionId)
        .eq("locale", loc);
      await supabase
        .from("question_explanations")
        .delete()
        .eq("question_id", questionId)
        .eq("locale", loc);
      if (old?.media_asset_id) {
        await removePoolMediaAsset(supabase, String(old.media_asset_id));
      }
    }
  }

  // ---- Options: ID-STABLE update keyed by order_index ------------------------
  const { data: optRows } = await supabase
    .from("answer_options")
    .select("id, order_index, is_correct")
    .eq("question_id", questionId)
    .order("order_index");
  const optByIndex = new Map<number, { id: string; is_correct: boolean }>();
  for (const o of (optRows ?? []) as any[]) {
    const idx = Number(o.order_index);
    if (!optByIndex.has(idx)) {
      optByIndex.set(idx, { id: String(o.id), is_correct: Boolean(o.is_correct) });
    }
  }
  for (let i = 0; i < POOL_OPTION_COUNT; i++) {
    const isCorrect = i === correctIdx;
    const existingOpt = optByIndex.get(i);
    let optionId = existingOpt?.id ?? null;
    if (optionId) {
      if (existingOpt!.is_correct !== isCorrect) {
        const { error } = await supabase
          .from("answer_options")
          .update({ is_correct: isCorrect })
          .eq("id", optionId);
        if (error) return cleanup("olympiad pool option update failed", error.message);
      }
    } else {
      // Genuinely missing row (legacy 4-option shape gains its option E).
      const { data: created, error } = await supabase
        .from("answer_options")
        .insert({ question_id: questionId, is_correct: isCorrect, order_index: i })
        .select("id")
        .single();
      if (error || !created) {
        return cleanup("olympiad pool option insert failed", error?.message);
      }
      optionId = String(created.id);
    }
    for (const loc of LOCALES) {
      const text = content[loc]?.options[i] ?? "";
      if (text) {
        const { error } = await supabase
          .from("answer_option_translations")
          .upsert({ option_id: optionId, locale: loc, text }, { onConflict: "option_id,locale" });
        if (error) return cleanup("olympiad pool option translation failed", error.message);
      } else if (qId) {
        await supabase
          .from("answer_option_translations")
          .delete()
          .eq("option_id", optionId)
          .eq("locale", loc);
      }
    }
  }

  // ---- Image: explicit removal, then staged attach ---------------------------
  if (qId && mediaRemove && !staged) {
    const { data: cur } = await supabase
      .from("question_translations")
      .select("media_asset_id")
      .eq("question_id", questionId)
      .eq("locale", primaryLocale)
      .maybeSingle();
    if (cur?.media_asset_id) {
      const { error } = await supabase
        .from("question_translations")
        .update({ media_asset_id: null })
        .eq("question_id", questionId)
        .eq("locale", primaryLocale);
      if (!error) await removePoolMediaAsset(supabase, String(cur.media_asset_id));
    }
  }
  if (staged && questionId) {
    // Move staging/<file> → questions/<id>/<file>, record media_assets with
    // SERVER-derived (sniffed) mime + size, link the primary translation.
    const finalPath = `questions/${questionId}/${staged.filename}`;
    const { error: mvErr } = await supabase.storage
      .from(POOL_MEDIA_BUCKET)
      .move(staged.path, finalPath);
    if (mvErr) return cleanup("olympiad pool image move failed", mvErr.message);

    const { data: media, error: maErr } = await supabase
      .from("media_assets")
      .insert({
        bucket: POOL_MEDIA_BUCKET,
        path: finalPath,
        owner_profile_id: ctx.profileId,
        mime_type: staged.mime,
        file_size_bytes: staged.size,
        visibility: "public",
      })
      .select("id")
      .single();
    if (maErr || !media) {
      await supabase.storage.from(POOL_MEDIA_BUCKET).remove([finalPath]);
      return cleanup("olympiad pool image media insert failed", maErr?.message);
    }

    const { data: prevTr } = await supabase
      .from("question_translations")
      .select("media_asset_id")
      .eq("question_id", questionId)
      .eq("locale", primaryLocale)
      .maybeSingle();
    const prevMediaId: string | null = prevTr?.media_asset_id
      ? String(prevTr.media_asset_id)
      : null;

    const { error: linkErr } = await supabase
      .from("question_translations")
      .update({ media_asset_id: media.id })
      .eq("question_id", questionId)
      .eq("locale", primaryLocale);
    if (linkErr) {
      await supabase.from("media_assets").delete().eq("id", media.id);
      await supabase.storage.from(POOL_MEDIA_BUCKET).remove([finalPath]);
      return cleanup("olympiad pool image link failed", linkErr.message);
    }
    if (prevMediaId) await removePoolMediaAsset(supabase, prevMediaId);
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: qId ? "admin.olympiad.question.update" : "admin.olympiad.question.create",
    targetTable: "questions",
    targetId: questionId,
    metadata: { package_id: pkgId },
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  // Modal flow only: return success, the client closes and refreshes in place.
  return { ok: true };
}

/**
 * Hard delete of ONE pool question.
 *
 * It goes through admin_delete_olympiad_pool_question (migration 112), which is
 * a thin wrapper over the SAME guarded body the bulk delete uses. That is the
 * point of it: until 112 this action was a bare `.delete()`, so while the bulk
 * path answered to the scope, live-attempt and PURCHASED-POOL rules, forty
 * single clicks reached exactly the state those rules exist to prevent —
 * a lifetime purchaser holding a package whose pool can no longer fill an
 * attempt. A guard the row next to it can walk around is not a guard.
 *
 * The one behaviour kept from the old path is the refusal: a question with
 * answer history is REFUSED here ("archive it instead") rather than silently
 * archived, because this button names a single row the admin is looking at and
 * a row that stays on screen after a Delete click reads as broken. The RPC's
 * p_refuse_answered flag is what preserves it.
 */
export async function deleteOlympiadPackageQuestion(
  fd: FormData,
): Promise<OlympiadPoolActionResult> {
  const ctx = await requireAdmin();
  const t = await getT();
  const lt = poolStrings(await getLocale());

  const pkgId = s(fd, "__package_id");
  const qId = s(fd, "__id");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(qId)) return { error: t("err.server") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_olympiad_pool_question", {
    p_package_id: pkgId,
    p_question_id: qId,
  });
  if (error || !data) {
    // The shipped sentence for the one case the admin can act on directly.
    if (error?.hint === "question_has_attempts") {
      return { error: lt("olyq.err.hasAttempts") };
    }
    // Everything else is rendered from the SAME hint map the dialog uses, so a
    // purchased-pool refusal explains itself here too instead of collapsing
    // into "server error". A raw Postgres message never reaches the client.
    const blocks = parseDeletionBlocks(error)
      .map((b) => deletionBlockText(b, t))
      .filter((x): x is string => Boolean(x));
    console.error(
      "[admin] olympiad pool question delete failed",
      error?.code ?? "unknown",
      error?.hint ?? "",
    );
    return { error: blocks[0] ?? t("err.server") };
  }

  const r = data as Record<string, any>;
  // The RPC's orphan list, not a pre-collected one: it also covers option and
  // explanation images, and it excludes anything still referenced elsewhere.
  const mediaIds = Array.isArray(r.orphaned_media_ids)
    ? (r.orphaned_media_ids as unknown[]).map(String)
    : [];
  for (const mid of mediaIds) await removePoolMediaAsset(supabase, mid);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.question.delete",
    targetTable: "questions",
    targetId: qId,
    metadata: { package_id: pkgId, package_demoted: Boolean(r.package_demoted) },
    severity: "warning",
  });

  // The pool count on the listing card changes with this row, and an
  // auto-demotion would change the package's status there too.
  revalidatePath("/olympiad");
  revalidatePath(`/olympiad/${pkgId}/edit`);
  return null;
}

// Archive/restore for the blocked-delete case: archived pool questions drop
// out of FUTURE attempts (start_olympiad_attempt draws published only) while
// past attempt history stays readable. Restore re-publishes.
export async function setOlympiadPoolQuestionStatus(
  fd: FormData,
): Promise<OlympiadPoolActionResult> {
  const ctx = await requireAdmin();
  const t = await getT();

  const pkgId = s(fd, "__package_id");
  const qId = s(fd, "__id");
  const action = s(fd, "__action");
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(qId)) return { error: t("err.server") };
  if (action !== "archive" && action !== "restore") return { error: t("err.server") };

  const supabase = await createClient();
  const q = await getPoolQuestion(supabase, pkgId, qId);
  if (!q) return { error: t("err.server") };
  if (action === "archive" ? q.status === "archived" : q.status !== "archived") {
    return { error: t("err.server") };
  }
  const to = action === "archive" ? "archived" : "published";

  const { error } = await supabase
    .from("questions")
    .update({ status: to, updated_by: ctx.profileId })
    .eq("id", qId)
    .eq("olympiad_package_id", pkgId);
  if (error) {
    console.error("[admin] olympiad pool question status change failed", error.message);
    return { error: t("err.server") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action:
      action === "archive"
        ? "admin.olympiad.question.archive"
        : "admin.olympiad.question.restore",
    targetTable: "questions",
    targetId: qId,
    metadata: { package_id: pkgId, status: to },
    severity: action === "archive" ? "warning" : "info",
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  return null;
}

/**
 * Archives a package: it leaves the catalogue, nobody new can buy it, and every
 * family that already did keeps lifetime access. That second half is guaranteed
 * one layer below this action — can_view_olympiad_package's purchase branch
 * never reads the package's status (015) — so archiving is safe on a purchased
 * package by construction, and nothing here needs to check for purchases.
 *
 * Purchases block DELETE, not archiving; the delete refusal's own sentence
 * names archiving as the way forward, which is why this action has no guard
 * beyond requireAdmin() and the id check.
 *
 * IT MUST STILL REPORT ITS OWN FAILURE. The previous version used the update
 * error only to decide whether to write the audit row and then redirected to
 * /olympiad regardless, so a refused archive — RLS filtering the row, a row
 * deleted by a second admin, a dropped connection — looked exactly like a
 * successful one. That is the single path by which an archive could genuinely
 * appear "blocked", and it is why this returns a DestructiveState instead of
 * void.
 */
export async function archiveOlympiadPackageAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = s(fd, "__id");
  if (!UUID_RE.test(id)) return { ok: false, error: t("err.server"), blocks: [] };

  const supabase = await createClient();
  // Re-verify the client-supplied id server-side, and read the status it is
  // coming FROM so the audit row records a transition rather than only its
  // destination.
  const { data: before, error: readError } = await supabase
    .from("olympiad_packages")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readError || !before) {
    console.error(
      "[admin] olympiad package archive: target not readable",
      readError?.code ?? "missing",
    );
    return { ok: false, error: t("del.err.archiveFailed"), blocks: [] };
  }

  const from = String((before as { status?: unknown }).status ?? "");
  if (from === "archived") {
    // Not a failure, and not a mutation either: say so rather than audit a
    // status change that never happened.
    return { ok: true, message: t("del.done.packageAlreadyArchived") };
  }

  // `.select("id")` is what makes a silently-ignored update visible: PostgREST
  // answers a filtered-out row with success and ZERO rows, not with an error.
  const { data: updated, error } = await supabase
    .from("olympiad_packages")
    .update({ status: "archived" })
    .eq("id", id)
    .select("id");
  if (error || !updated || updated.length === 0) {
    // Never the raw Postgres text — logged here, generic sentence to the client.
    console.error(
      "[admin] olympiad package archive failed",
      error?.code ?? "no-rows-affected",
    );
    return { ok: false, error: t("del.err.archiveFailed"), blocks: [] };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.archive",
    targetTable: "olympiad_packages",
    targetId: id,
    metadata: { from, status: "archived" },
    severity: "warning",
  });

  revalidatePath("/olympiad");
  revalidatePath(`/olympiad/${id}/edit`);
  // No redirect: archiving destroys nothing, so both screens that offer it —
  // the package list and the package's own edit page — are still there to read
  // the answer. The old redirect to /olympiad also threw away the admin's
  // filters on the way past.
  return { ok: true, message: t("del.done.packageArchivedNow") };
}

// =============================================================================
// Guarded olympiad deletion — the panel half of migration 111.
//
// Archiving stays the FIRST answer the UI offers, and the non-negotiable rule
// that a purchased package is never deleted is enforced in the database, not
// here: olympiad_package_deletion_blocks refuses any package with a purchase
// row in any status, and olympiad_grade_pool_blocks refuses a grade whose pool
// somebody paid for. What these actions add is the operation the panel simply
// did not have — removing a package or a grade pool that was created by mistake
// — with the blast radius counted on screen before the click, and every reason
// for a refusal named.
//
// SECURITY: requireAdmin() is the FIRST statement of every export (olympiad is
// Admin-only — a Content Manager must never reach it), every id is UUID-shape
// checked before it is sent anywhere, the confirmation token is compared here
// AND again inside the database under its own lock, no raw Postgres message
// reaches the client, and every destructive call writes a `warning` audit row.
// =============================================================================

/** Confirmation-token cap. Package codes are short slugs; the DB compares. */
const CODE_MAX = 80;

export type OlympiadDeletionState = DestructiveState;

/** The delete/archive split the database will apply to a pool. */
export type OlympiadQuestionSplit = {
  total: number;
  deletable: number;
  archivedInstead: number;
  alreadyArchived: number;
};

export type OlympiadPackageDeletionPreview = {
  id: string;
  /** Typed by the admin to confirm; also shown, since `code` is not a UI field. */
  code: string;
  titleAz: string;
  status: string;
  ok: boolean;
  /** Finished sentences, already localized — never raw hints. */
  blockedBy: string[];
  /**
   * The raw owner counts, kept alongside the sentences rather than only inside
   * them. `blockedBy` flattens each {hint, count} into finished copy, which is
   * right for a refusal but wrong for a DECISION: "this package has 42 owners"
   * is the fact the admin weighs before choosing archive, and a number buried
   * mid-sentence in a red block is not one they can read.
   *
   * The two are NOT one figure and must not be added together: `purchases`
   * counts olympiad_purchases rows (the ABB web rail), `entitlements` counts
   * entitlements rows for the package — an Apple/Google grant, a school licence
   * or a manual comp has no purchase row at all (migration 124).
   */
  owners: { purchases: number; entitlements: number };
  /** Which branch the mutation will ACTUALLY take, decided by the same rule. */
  outcome: "delete" | "archive";
  questions: OlympiadQuestionSplit;
  /** Rows removed on the DELETE branch. */
  deleteCascade: {
    grades: number;
    translations: number;
    poolLinks: number;
    rotations: number;
    questionTranslations: number;
    answerOptions: number;
  };
  /** Rows removed on the ARCHIVE branch — a much smaller, honest number. */
  archiveCascade: {
    rotations: number;
    questionTranslations: number;
    answerOptions: number;
  };
  orphanMedia: number;
};

export type OlympiadGradePoolDeletionPreview = {
  packageId: string;
  /** The PACKAGE code: what admin_delete_olympiad_grade_pool compares against. */
  code: string;
  packageTitleAz: string;
  packageStatus: string;
  gradeId: string;
  gradeName: string;
  questions: OlympiadQuestionSplit;
  /** Detach the grade AND delete its pool. */
  dropGrade: { ok: boolean; blockedBy: string[] };
  /** Empty the pool, keep the grade targeted. */
  keepGrade: { ok: boolean; blockedBy: string[] };
  isLastGrade: boolean;
  questionsPerAttempt: number;
  /**
   * Only meaningful on the KEEP-the-grade branch: emptying a targeted grade's
   * pool leaves an ACTIVE package unable to fill an attempt, so the mutation
   * demotes it to inactive. Detaching the grade removes it from that check
   * entirely, and the activation guard already proved the survivors are big
   * enough — so the dialog must not render this on the drop branch.
   */
  packageBecomesUnservable: boolean;
  orphanMedia: number;
};

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// One hint's raw count, read out of a preview's blocked_by[] BEFORE
// localizeBlocks turns it into a sentence. Zero when the hint is absent, which
// is exactly what "nobody owns this package" looks like: the SQL only reports a
// block it is actually raising.
function blockCount(raw: unknown, hint: string): number {
  if (!Array.isArray(raw)) return 0;
  for (const b of raw) {
    const block = b as DeletionBlock;
    if (block?.hint === hint) return num(block.count);
  }
  return 0;
}

// Localizes a blocked_by[] array from a preview payload. Unknown hints are
// dropped rather than printed: an unknown hint means the SQL moved without its
// copy, and the raw string is both untranslated and internal.
function localizeBlocks(raw: unknown, lt: (key: string) => string): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const b of raw) {
    const text = deletionBlockText(b as DeletionBlock, lt);
    if (text) out.push(text);
  }
  return out;
}

function splitOf(raw: unknown): OlympiadQuestionSplit {
  const q = (raw ?? {}) as Record<string, unknown>;
  return {
    total: num(q.total),
    deletable: num(q.deletable),
    archivedInstead: num(q.archived_instead),
    alreadyArchived: num(q.already_archived),
  };
}

// Shared failure translation. A guarded-deletion error carries every reason in
// DETAIL, so the admin sees all of them at once instead of clearing one,
// re-clicking, and meeting the next. Raw Postgres text is logged, never shown.
async function toDeletionFailure(
  error: { code?: string | null; hint?: string | null; details?: string | null } | null,
  where: string,
): Promise<{ ok: false; error: string; blocks: string[] }> {
  const t = await getT();
  const blocks = parseDeletionBlocks(error).map((b) => deletionBlockText(b, t) ?? "");
  console.error(`[admin] ${where} failed`, error?.code ?? "unknown", error?.hint ?? "");
  return {
    ok: false,
    error: blocks.length > 0 ? t("del.err.blocked") : t("err.server"),
    blocks: blocks.filter(Boolean),
  };
}

// Refusal for a token that never had a chance of matching. Rendered from the
// same hint the RPC would have raised, so the sentence is identical whichever
// layer catches it.
async function tokenRefusal(): Promise<{ ok: false; error: string; blocks: string[] }> {
  const t = await getT();
  return {
    ok: false,
    error: t("del.err.blocked"),
    blocks: [deletionBlockText({ hint: "confirmation_mismatch" }, t) ?? t("err.server")],
  };
}

// Every destructive olympiad mutation ends the same way: sweep the media the
// transaction orphaned, audit, revalidate. Kept in one place so the package and
// grade paths cannot drift into auditing different things.
async function afterOlympiadDestructiveCall(opts: {
  actorProfileId: string | null;
  action: string;
  packageId: string;
  metadata: Record<string, unknown>;
  orphanedMediaIds: unknown;
}): Promise<void> {
  const supabase = await createClient();
  const ids = Array.isArray(opts.orphanedMediaIds)
    ? opts.orphanedMediaIds.map((x) => String(x))
    : [];
  // Same one-definition sweep removePoolMediaAsset wraps: the bucket objects
  // go first, then the rows — the DB already proved nothing references them.
  const swept = await removeMediaAssets(supabase, ids);

  // Small metadata only: counts and ids. Never the deleted content — an audit
  // row is a record that it happened, not a backup of what was lost.
  await writeAuditLog({
    actorProfileId: opts.actorProfileId,
    action: opts.action,
    targetTable: "olympiad_packages",
    targetId: opts.packageId,
    metadata: { ...opts.metadata, swept_media: swept },
    severity: "warning",
  });

  revalidatePath("/olympiad");
  revalidatePath(`/olympiad/${opts.packageId}/edit`);
}

/**
 * Side-effect free. Drives the package confirmation dialog: what is blocking,
 * which outcome will actually happen, and the code the admin has to type.
 */
export async function loadOlympiadPackageDeletionPreview(
  packageId: string,
): Promise<OlympiadPackageDeletionPreview | null> {
  await requireAdmin();
  if (typeof packageId !== "string" || !UUID_RE.test(packageId)) return null;

  const supabase = await createClient();
  const t = await getT();
  const { data, error } = await supabase.rpc("admin_preview_olympiad_package_deletion", {
    p_package_id: packageId,
  });
  if (error || !data) {
    console.error("[admin] olympiad package deletion preview failed", error?.code ?? "unknown");
    return null;
  }

  const p = data as Record<string, any>;
  return {
    id: String(p.package?.id ?? packageId),
    code: String(p.package?.code ?? ""),
    titleAz: String(p.package?.title_az ?? ""),
    status: String(p.package?.status ?? ""),
    ok: Boolean(p.ok),
    blockedBy: localizeBlocks(p.blocked_by, t),
    owners: {
      purchases: blockCount(p.blocked_by, "package_has_purchases"),
      entitlements: blockCount(p.blocked_by, "package_has_entitlements"),
    },
    outcome: p.outcome === "archive" ? "archive" : "delete",
    questions: splitOf(p.questions),
    deleteCascade: {
      grades: num(p.delete_cascade?.olympiad_package_grades),
      translations: num(p.delete_cascade?.olympiad_package_translations),
      poolLinks: num(p.delete_cascade?.olympiad_package_questions),
      rotations: num(p.delete_cascade?.olympiad_question_rotations),
      questionTranslations: num(p.delete_cascade?.question_translations),
      answerOptions: num(p.delete_cascade?.answer_options),
    },
    archiveCascade: {
      rotations: num(p.archive_cascade?.olympiad_question_rotations),
      questionTranslations: num(p.archive_cascade?.question_translations),
      answerOptions: num(p.archive_cascade?.answer_options),
    },
    orphanMedia: num(p.orphans?.media_assets),
  };
}

/**
 * Side-effect free. Serves BOTH grade dialogs from one round trip: detaching
 * the grade and merely emptying its pool have different blocking rules, so both
 * sets of reasons are reported and the dialog renders each branch's own.
 */
export async function loadOlympiadGradePoolDeletionPreview(
  packageId: string,
  gradeId: string,
): Promise<OlympiadGradePoolDeletionPreview | null> {
  await requireAdmin();
  if (typeof packageId !== "string" || !UUID_RE.test(packageId)) return null;
  if (typeof gradeId !== "string" || !UUID_RE.test(gradeId)) return null;

  const supabase = await createClient();
  const t = await getT();
  const { data, error } = await supabase.rpc(
    "admin_preview_olympiad_grade_pool_deletion",
    { p_package_id: packageId, p_grade_id: gradeId },
  );
  if (error || !data) {
    console.error("[admin] olympiad grade pool preview failed", error?.code ?? "unknown");
    return null;
  }

  const p = data as Record<string, any>;
  return {
    packageId: String(p.package?.id ?? packageId),
    code: String(p.package?.code ?? ""),
    packageTitleAz: String(p.package?.title_az ?? ""),
    packageStatus: String(p.package?.status ?? ""),
    gradeId: String(p.grade?.id ?? gradeId),
    gradeName: String(p.grade?.name ?? ""),
    questions: splitOf(p.questions),
    dropGrade: {
      ok: Boolean(p.drop_grade?.ok),
      blockedBy: localizeBlocks(p.drop_grade?.blocked_by, t),
    },
    keepGrade: {
      ok: Boolean(p.keep_grade?.ok),
      blockedBy: localizeBlocks(p.keep_grade?.blocked_by, t),
    },
    isLastGrade: Boolean(p.is_last_grade),
    questionsPerAttempt: num(p.questions_per_attempt),
    packageBecomesUnservable: Boolean(p.package_becomes_unservable),
    orphanMedia: num(p.orphans?.media_assets),
  };
}

/**
 * Deletes an olympiad package and its entire pool. When answered questions
 * survive anywhere in that pool the PACKAGE IS ARCHIVED instead — the database
 * decides that before it destroys anything, and the message says which of the
 * two happened, because a button that silently did the other thing reads as
 * broken.
 */
export async function deleteOlympiadPackageAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = s(fd, "__id");
  if (!UUID_RE.test(id)) return { ok: false, error: t("err.server"), blocks: [] };

  const supabase = await createClient();
  // NO CONFIRMATION TOKEN HERE (owner decision, migration 113) — unlike every
  // sibling in this file. The dialog's acknowledgement is the only confirmation
  // a package delete asks for now. What still stops a destructive mistake is
  // olympiad_package_deletion_blocks inside the RPC, which refuses a package
  // carrying purchases or attempts; that guard is untouched, so paid content
  // remains protected. Do not reintroduce __code here without also restoring
  // the tokened arity — 113 dropped it, so the RPC would fail to resolve.
  const { data, error } = await supabase.rpc("admin_delete_olympiad_package", {
    p_package_id: id,
  });
  if (error || !data) return await toDeletionFailure(error, "olympiad package delete");

  const r = data as Record<string, any>;
  const archived = Boolean(r.package_archived);
  await afterOlympiadDestructiveCall({
    actorProfileId: ctx.profileId,
    action: archived
      ? "admin.olympiad.archive_instead_of_delete"
      : "admin.olympiad.package_delete",
    packageId: id,
    metadata: {
      archived,
      reason: typeof r.reason === "string" ? r.reason : undefined,
      deleted: num(r.deleted_questions),
      archived_questions: num(r.archived_questions),
      retained: num(r.retained_questions),
      media_truncated: Boolean(r.media_truncated),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  if (archived) {
    return { ok: true, message: t("del.done.packageArchived") };
  }
  // The edit page this dialog sits on now describes a row that is gone. A fixed
  // literal, never anything derived from the request.
  return {
    ok: true,
    message: t("del.done.packageDeleted"),
    redirectTo: "/olympiad",
  };
}

/**
 * ONE grade's pool: emptied, and with `drop_grade` also detached from the
 * package. Unanswered questions are deleted, answered ones ARCHIVED — the
 * database decides that split inside the DELETE, never here.
 *
 * remove_olympiad_package_grade (removeOlympiadPackageGradeAction above) stays
 * the SAFE archive-only path the UI offers first; this is the hard one, and it
 * is why the package code has to be typed even though the dialog already knows
 * which grade it is showing.
 */
export async function deleteOlympiadGradePoolAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const pkgId = s(fd, "__id");
  const gradeId = s(fd, "grade_id");
  const code = s(fd, "__code").slice(0, CODE_MAX);
  // The posted flag decides between two operations with DIFFERENT blocking
  // rules, so it is read as a strict literal rather than coerced: any other
  // value means "keep the grade", the less destructive of the two.
  const dropGrade = s(fd, "drop_grade") === "1";
  if (!UUID_RE.test(pkgId) || !UUID_RE.test(gradeId)) {
    return { ok: false, error: t("err.server"), blocks: [] };
  }

  const supabase = await createClient();
  if ((await confirmationTokenMatches(supabase, "olympiad_packages", pkgId, code)) === false) {
    return await tokenRefusal();
  }

  const { data, error } = await supabase.rpc("admin_delete_olympiad_grade_pool", {
    p_package_id: pkgId,
    p_grade_id: gradeId,
    p_expected_code: code,
    p_drop_grade: dropGrade,
  });
  if (error || !data) return await toDeletionFailure(error, "olympiad grade pool delete");

  const r = data as Record<string, any>;
  const dropped = Boolean(r.grade_dropped);
  const demoted = Boolean(r.package_demoted);
  await afterOlympiadDestructiveCall({
    actorProfileId: ctx.profileId,
    action: dropped
      ? "admin.olympiad.grade_pool_delete"
      : "admin.olympiad.grade_pool_purge",
    packageId: pkgId,
    metadata: {
      grade_id: gradeId,
      grade_dropped: dropped,
      deleted: num(r.deleted_questions),
      archived_questions: num(r.archived_questions),
      retained: num(r.retained_questions),
      reset_rotations: num(r.reset_rotations),
      package_demoted: demoted,
      media_truncated: Boolean(r.media_truncated),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  // The auto-demotion is a change the admin did not ask for, so it is stated
  // rather than left to be discovered on the listing.
  const base = fillTemplate(t(dropped ? "del.done.gradeDropped" : "del.done.gradePurged"), {
    deleted: num(r.deleted_questions),
    archived: num(r.archived_questions),
  });
  return {
    ok: true,
    message: demoted ? `${base} ${t("del.done.demoted")}` : base,
  };
}

/**
 * Cap on ONE bulk selection. Mirrors the RPC's own ceiling (which mirrors
 * questions_per_attempt's 1–500 range) so the panel refuses the same set the
 * database would, with a sentence instead of a stack trace.
 */
const BULK_MAX = 500;

/** A refusal rendered from a hint the RPC would have raised itself. */
async function hintRefusal(
  hint: string,
  count: number,
): Promise<{ ok: false; error: string; blocks: string[] }> {
  const t = await getT();
  return {
    ok: false,
    error: t("del.err.blocked"),
    blocks: [deletionBlockText({ hint, count }, t) ?? t("err.server")],
  };
}

/**
 * Deletes a SELECTION of questions inside ONE olympiad package: unanswered rows
 * go, answered rows are ARCHIVED. The database decides that split (migration
 * 112 delegates it to purge_question_set), and the database — not this action —
 * is what proves every id belongs to the package.
 *
 * ALL-OR-NOTHING, on both sides. A malformed or foreign id refuses the whole
 * call rather than being quietly dropped: the admin ticked N boxes, and getting
 * N-1 back with no way to tell which one was skipped is how a selection bug
 * stays invisible. That is why this does NOT reuse questions.ts's `idList`,
 * whose `.filter(UUID_RE)` is exactly the silent drop this operation must not
 * do.
 *
 * The package's own code travels as the confirmation token and the DATABASE
 * compares it, under the package's row lock — the same control every sibling
 * destructive RPC takes. The dialog's checkbox is UX; this endpoint is a
 * PostgREST function granted to `authenticated`, so only a value the database
 * re-checks can stand between an admin session and 500 destroyed rows.
 */
export async function deleteOlympiadQuestionsAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const pkgId = s(fd, "__package_id");
  // Same wire shape the general question table already posts (QuestionsTable's
  // hidden `ids` input), so the pool table can reuse the shipped bulk bar.
  const raw = s(fd, "ids");
  const code = s(fd, "__code").slice(0, CODE_MAX);
  if (!UUID_RE.test(pkgId)) return { ok: false, error: t("err.server"), blocks: [] };
  // An empty box never had a chance of matching; the RPC would say the same
  // thing after a round trip and a lock.
  if (code.length === 0) return await tokenRefusal();

  const parts = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (parts.length === 0) return await hintRefusal("empty_selection", 0);
  // Checked BEFORE the shape loop and before any query: an unbounded list is a
  // denial-of-service shape, and the number the admin needs to read is how many
  // they selected, not how many survived a filter.
  if (parts.length > BULK_MAX) return await hintRefusal("too_many_questions", parts.length);
  if (parts.some((x) => !UUID_RE.test(x))) {
    return { ok: false, error: t("err.server"), blocks: [] };
  }
  const ids = Array.from(new Set(parts));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_olympiad_questions", {
    p_package_id: pkgId,
    p_question_ids: ids,
    p_expected_code: code,
    // Answered rows are ARCHIVED here. Refusing a 40-row selection because one
    // of them was answered is the dead end purge_question_set's split exists to
    // avoid; only the per-row button asks for the refusal.
    p_refuse_answered: false,
  });
  if (error || !data) return await toDeletionFailure(error, "olympiad pool bulk delete");

  const r = data as Record<string, any>;
  const demoted = Boolean(r.package_demoted);
  await afterOlympiadDestructiveCall({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.questions_purge",
    packageId: pkgId,
    metadata: {
      requested: num(r.requested),
      deleted: num(r.deleted),
      archived_questions: num(r.archived),
      retained: num(r.retained),
      reset_rotations: num(r.reset_rotations),
      package_demoted: demoted,
      media_truncated: Boolean(r.media_truncated),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  // Says which of the two things happened to how many rows: a button that
  // reported "deleted" for questions it archived reads as broken. The
  // auto-demotion is a change the admin did not ask for, so it is stated rather
  // than left to be discovered on the listing.
  const base = fillTemplate(t("del.done.questionsPurged"), {
    deleted: num(r.deleted),
    archived: num(r.archived),
  });
  return { ok: true, message: demoted ? `${base} ${t("del.done.demoted")}` : base };
}

/**
 * Archive or re-publish a SELECTION of pool questions (migration 144).
 *
 * WHY THIS EXISTS RATHER THAN A LOOP OVER setOlympiadPoolQuestionStatus.
 * Archiving removes a question from every future attempt exactly as deleting
 * does -- every draw path filters `status = 'published'` -- but the per-row
 * status writer had none of the delete path's guards: no purchase check, no
 * floor check, no demotion, and no trigger covering it. And the attempt engine
 * draws `least(questions_per_attempt, |pool|)` WITHOUT raising, so an unguarded
 * archive hands a paying family a shorter olympiad and tells nobody.
 *
 * A per-row hazard becomes a one-click hazard the moment it is bulk-enabled, so
 * the RPC carries the same guards as the delete path and this action is a thin
 * wrapper over it.
 *
 * The confirmation code is passed even though the archive dialog does not ask
 * the admin to type it: the DATABASE re-checks it under the package lock, which
 * is what makes a hand-crafted POST unable to skip the check. Archiving is
 * reversible, so the UI friction is not earned -- the server contract is not
 * negotiable either way.
 */
export async function setOlympiadPoolQuestionsStatusAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST -- before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const pkgId = s(fd, "__package_id");
  const raw = s(fd, "ids");
  const code = s(fd, "__code").slice(0, CODE_MAX);
  const next = s(fd, "__status");

  if (!UUID_RE.test(pkgId)) return { ok: false, error: t("err.server"), blocks: [] };
  // Enum whitelist, never a client string passed through to the database.
  if (next !== "archived" && next !== "published") {
    return { ok: false, error: t("err.server"), blocks: [] };
  }
  if (code.length === 0) return await tokenRefusal();

  const parts = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (parts.length === 0) return await hintRefusal("empty_selection", 0);
  // Checked BEFORE the shape loop and before any query, same as the delete
  // path: an unbounded list is a denial-of-service shape.
  if (parts.length > BULK_MAX) return await hintRefusal("too_many_questions", parts.length);
  if (parts.some((x) => !UUID_RE.test(x))) {
    return { ok: false, error: t("err.server"), blocks: [] };
  }
  const ids = Array.from(new Set(parts));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_olympiad_questions_status", {
    p_package_id: pkgId,
    p_question_ids: ids,
    p_status: next,
    p_expected_code: code,
  });
  if (error || !data) return await toDeletionFailure(error, "olympiad pool bulk status");

  const r = data as Record<string, any>;
  const demoted = Boolean(r.package_demoted);
  await afterOlympiadDestructiveCall({
    actorProfileId: ctx.profileId,
    action:
      next === "archived"
        ? "admin.olympiad.questions_archive"
        : "admin.olympiad.questions_restore",
    packageId: pkgId,
    metadata: {
      requested: num(r.requested),
      changed: num(r.changed),
      already_in_status: num(r.already_in_status),
      status: next,
      package_demoted: demoted,
    },
    // A status change orphans no media. Routed through the same helper anyway so
    // the audit path has exactly one definition; it sweeps an empty array.
    orphanedMediaIds: [],
  });

  // Reports what actually happened, not what was asked for: a button that says
  // "20 archived" when 15 were already archived reads as broken.
  const base = fillTemplate(
    t(next === "archived" ? "olyq.bulk.archived" : "olyq.bulk.restored"),
    { changed: num(r.changed), already: num(r.already_in_status) },
  );
  return { ok: true, message: demoted ? `${base} ${t("del.done.demoted")}` : base };
}

/**
 * Restores an ARCHIVED package to INACTIVE. The one non-destructive operation
 * in this family, and the reason it lands on `inactive` rather than `active` is
 * in the RPC comment: restoring to active re-fires the activation pool guard —
 * which most archived packages would fail — and it would put the package back
 * on sale instantly under a sale window that may be long expired.
 */
export async function unarchiveOlympiadPackageAction(
  _prev: OlympiadDeletionState,
  fd: FormData,
): Promise<OlympiadDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = s(fd, "__id");
  if (!UUID_RE.test(id)) return { ok: false, error: t("err.server"), blocks: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_unarchive_olympiad_package", {
    p_package_id: id,
  });
  if (error || !data) return await toDeletionFailure(error, "olympiad package unarchive");

  // Not destructive: `info`, unlike everything else in this section.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.unarchive",
    targetTable: "olympiad_packages",
    targetId: id,
    metadata: { status: String((data as Record<string, any>).status ?? "inactive") },
    severity: "info",
  });

  revalidatePath("/olympiad");
  revalidatePath(`/olympiad/${id}/edit`);
  return { ok: true, message: t("del.done.restored") };
}
