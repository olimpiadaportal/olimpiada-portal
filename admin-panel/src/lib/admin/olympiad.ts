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
} from "@/lib/admin/bulk-validate";
import { getT, getLocale, type T } from "@/i18n/server";
import { parseIsoTimestamp } from "@/lib/admin/datetime";
import { olympiadLocalStrings } from "@/lib/admin/olympiad-strings";
import { localeNames } from "@/i18n/config";
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
  gradeId: string;
  price: number;
  status: string;
  titleAz: string;
  eventAt: string | null;
  saleStartAt: string | null;
  saleEndAt: string | null;
  durationMinutes: number;
};

// olympiad_packages.duration_minutes (migration 047): attempt time limit in
// whole minutes, DB CHECK between 5 and 240 — mirrored here.
const DURATION_MIN = 5;
const DURATION_MAX = 240;

function parsePackageFields(
  fd: FormData,
  t: T,
  lt: (key: string) => string,
): { error: string } | PackageFields {
  const subjectId = s(fd, "subject_id");
  if (!subjectId) return { error: t("oly2.err.subject") };
  // Grade is REQUIRED: bulk-imported pool questions inherit the package's
  // subject AND grade, so a package can no longer be saved without one.
  const gradeId = s(fd, "grade_id");
  if (!gradeId) return { error: t("oly2.err.grade") };
  // Price must be a finite number ≥ 0 (negatives/NaN/Infinity rejected);
  // normalized to 2 decimals.
  const priceRaw = s(fd, "price_amount");
  const priceNum = priceRaw === "" ? 0 : Number(priceRaw);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return { error: t("err.server") };
  }
  const price = Math.round(priceNum * 100) / 100;
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
    gradeId,
    price,
    status,
    titleAz,
    eventAt,
    saleStartAt,
    saleEndAt,
    durationMinutes: durationNum,
  };
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
  const lt = olympiadLocalStrings(await getLocale());
  const id = s(fd, "__id");
  const fields = parsePackageFields(fd, t, lt);
  if ("error" in fields) return { error: fields.error };

  const supabase = await createClient();
  // `code` is auto-generated from the Azerbaijani title (no longer a UI input).
  // On update we keep the existing code untouched.
  const row = {
    subject_id: fields.subjectId,
    grade_id: fields.gradeId,
    price_amount: fields.price,
    status: fields.status,
    event_starts_at: fields.eventAt,
    sale_starts_at: fields.saleStartAt,
    sale_ends_at: fields.saleEndAt,
    duration_minutes: fields.durationMinutes,
  };
  let pkgId = id;
  if (!pkgId) {
    const inserted = await insertPackageRow(supabase, row, fields.titleAz, ctx.profileId);
    if (!inserted) return { error: t("err.server") };
    pkgId = inserted;
  } else {
    const { error } = await supabase.from("olympiad_packages").update(row).eq("id", pkgId);
    if (error) {
      console.error("[admin] olympiad package update failed", error.message);
      return { error: t("err.server") };
    }
  }

  const trErr = await upsertPackageTranslations(supabase, fd, pkgId, Boolean(id));
  if (trErr) return { error: t("err.server") };

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.olympiad.update" : "admin.olympiad.create",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { status: fields.status, price: fields.price },
  });

  revalidatePath("/olympiad");
  redirect(`/olympiad/${pkgId}/edit`);
}

// Bulk import of PRIVATE questions for one package. Each package owns its own
// pool (questions.olympiad_package_id) — NOT shared with the general question
// bank. Delegated to the SECURITY DEFINER bulk_insert_olympiad_package_questions
// RPC (checks content.create internally; sets olympiad_package_id + published).
export type OlympiadBulkState =
  | {
      ok: boolean;
      result?: {
        total: number;
        successful: number;
        failed: number;
        errors: { index: number; error: string }[];
      };
      error?: string;
    }
  | null;

type BulkResult = {
  total: number;
  successful: number;
  failed: number;
  errors: { index: number; error: string }[];
};

// Reads + size-caps the uploaded JSON file (2 MB, same cap as the general
// question-bank import). Returns the parsed array or a trilingual error.
async function readBulkFile(
  fd: FormData,
  t: T,
): Promise<{ error: string } | { payload: unknown[]; fileName: string }> {
  const file = fd.get("file");
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
): ValidatedRows {
  const errors: { index: number; error: string }[] = [];
  const validItems: Record<string, unknown>[] = [];
  const validFileIndex: number[] = [];
  payload.forEach((item, i) => {
    // OLYMPIAD mode: topic/subtopic/term stay optional (package-scoped pool).
    const msg = validateBulkItem(item, t, activeByNorm, defaultType, "olympiad");
    if (msg) {
      errors.push({ index: i + 1, error: msg });
      return;
    }
    validItems.push(overrideItemMeta(item, { grade_level: gradeLevel }));
    validFileIndex.push(i + 1);
  });
  return { total: payload.length, errors, validItems, validFileIndex };
}

// Runs the SECURITY DEFINER pool-import RPC and merges its per-row errors
// (mapped back to original file row numbers) with the pre-validation errors.
async function runOlympiadPoolImport(
  supabase: Db,
  t: T,
  pkgId: string,
  rows: ValidatedRows,
): Promise<{ error: string } | { result: BulkResult }> {
  const errors = [...rows.errors];
  let successful = 0;
  if (rows.validItems.length > 0) {
    const { data, error } = await supabase.rpc(
      "bulk_insert_olympiad_package_questions",
      { p_package_id: pkgId, p_questions: rows.validItems },
    );
    if (error) {
      // 23514 = the RPC's creation-only guard: the package already has
      // questions, so a later import is rejected. Friendly trilingual message
      // (local strings until messages.ts gains the key) — never the raw error.
      if ((error as { code?: string }).code === "23514") {
        const lt = olympiadLocalStrings(await getLocale());
        return { error: lt("oly2.err.creationOnly") };
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

// Resolves the grade LEVEL a package's imported rows must use. The package's
// stored grade_id is authoritative; a legacy package saved without one cannot
// bulk-import until the admin sets a grade on the package form.
async function packageGradeLevel(
  supabase: Db,
  gradeId: string | null,
): Promise<number | null> {
  if (!gradeId) return null;
  const { data: grade } = await supabase
    .from("grades")
    .select("id, level")
    .eq("id", gradeId)
    .maybeSingle();
  return grade && grade.level != null ? (grade.level as number) : null;
}

export async function bulkImportOlympiadQuestions(
  _prev: OlympiadBulkState,
  fd: FormData,
): Promise<OlympiadBulkState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const pkgId = s(fd, "__id");
  if (!pkgId || !UUID_RE.test(pkgId)) {
    return { ok: false, error: t("err.server") };
  }

  // Subject AND Grade are inherited from the PACKAGE row (the upload UI no
  // longer asks for them): the RPC scopes subject by package; the package's
  // grade level is injected into every row here. Any meta.subject /
  // meta.grade_level left in a legacy file is ignored in favor of these.
  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id, grade_id")
    .eq("id", pkgId)
    .maybeSingle();
  if (!pkg) return { ok: false, error: t("err.server") };
  const gradeLevel = await packageGradeLevel(supabase, (pkg as any).grade_id ?? null);
  if (gradeLevel == null) {
    return { ok: false, error: t("olybulk.err.pkgGrade") };
  }

  const parsedFile = await readBulkFile(fd, t);
  if ("error" in parsedFile) return { ok: false, error: parsedFile.error };

  const { activeByNorm, defaultType } = await loadActiveTypeRules(supabase);
  const rows = validateRows(parsedFile.payload, t, activeByNorm, defaultType, gradeLevel);

  const imp = await runOlympiadPoolImport(supabase, t, pkgId, rows);
  if ("error" in imp) return { ok: false, error: imp.error };
  const result = imp.result;

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.bulk_import",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
    },
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  return { ok: true, result };
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
  const lt = olympiadLocalStrings(await getLocale());

  const fields = parsePackageFields(fd, t, lt);
  if ("error" in fields) return { error: fields.error };
  if (!UUID_RE.test(fields.subjectId)) return { error: t("oly2.err.subject") };
  if (!UUID_RE.test(fields.gradeId)) return { error: t("oly2.err.grade") };

  const supabase = await createClient();
  // Every imported row inherits the package grade — resolve its level now.
  const gradeLevel = await packageGradeLevel(supabase, fields.gradeId);
  if (gradeLevel == null) return { error: t("oly2.err.grade") };

  // Validate the bulk file BEFORE creating anything: a package with zero
  // valid questions must never be created in the first place.
  const parsedFile = await readBulkFile(fd, t);
  if ("error" in parsedFile) return { error: parsedFile.error };

  const { activeByNorm, defaultType } = await loadActiveTypeRules(supabase);
  const rows = validateRows(parsedFile.payload, t, activeByNorm, defaultType, gradeLevel);
  if (rows.validItems.length === 0) {
    return {
      error: t("oly2.err.needQuestions"),
      result: { total: rows.total, successful: 0, failed: rows.total, errors: rows.errors },
    };
  }

  // Create the package — same insert path (auto code + retry) as save.
  const pkgId = await insertPackageRow(
    supabase,
    {
      subject_id: fields.subjectId,
      grade_id: fields.gradeId,
      price_amount: fields.price,
      status: fields.status,
      event_starts_at: fields.eventAt,
      sale_starts_at: fields.saleStartAt,
      sale_ends_at: fields.saleEndAt,
      duration_minutes: fields.durationMinutes,
    },
    fields.titleAz,
    ctx.profileId,
  );
  if (!pkgId) return { error: t("err.server") };

  const trErr = await upsertPackageTranslations(supabase, fd, pkgId, false);
  if (trErr) {
    await rollbackNewPackage(supabase, pkgId);
    return { error: t("err.server") };
  }

  const imp = await runOlympiadPoolImport(supabase, t, pkgId, rows);
  if ("error" in imp) {
    await rollbackNewPackage(supabase, pkgId);
    return { error: imp.error };
  }
  const result = imp.result;

  if (result.successful === 0) {
    // Nothing imported → the package would be empty: undo the creation and
    // surface the per-row errors so the admin can fix the file and retry.
    await rollbackNewPackage(supabase, pkgId);
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.olympiad.create_rolled_back",
      targetTable: "olympiad_packages",
      targetId: pkgId,
      metadata: { total: result.total, failed: result.failed },
      severity: "warning",
      success: false,
    });
    return { error: t("oly2.err.importAllFailed"), result };
  }

  // Audit like saveOlympiadPackage's create today, plus the import counters.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.create",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { status: fields.status, price: fields.price },
  });
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.bulk_import",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
    },
  });

  revalidatePath("/olympiad");
  if (result.failed === 0) {
    // Everything imported — continue on the package's edit page.
    redirect(`/olympiad/${pkgId}/edit`);
  }
  // Partial success: the package exists with `successful` questions; the
  // client shows "created with N questions, M rows skipped" + row errors.
  return { ok: true, packageId: pkgId, result };
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
// Bulk upload stays creation-only (DB-enforced); AFTER creation admins manage
// the pool question by question here. All actions: requireAdmin() FIRST, then
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
  topicId: string;
  subtopicId: string;
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
  topic_id: string | null;
  subtopic_id: string | null;
} | null> {
  const { data } = await supabase
    .from("questions")
    .select("id, status, primary_locale, topic_id, subtopic_id")
    .eq("id", qId)
    .eq("olympiad_package_id", pkgId)
    .maybeSingle();
  return (data as any) ?? null;
}

// Deletes a media_assets row together with its storage object (PostgreSQL
// never keeps binaries; storage objects must never be orphaned either).
async function removePoolMediaAsset(supabase: Db, mediaId: string): Promise<void> {
  const { data: m } = await supabase
    .from("media_assets")
    .select("bucket, path")
    .eq("id", mediaId)
    .maybeSingle();
  if (m) await supabase.storage.from(m.bucket).remove([m.path]);
  await supabase.from("media_assets").delete().eq("id", mediaId);
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
    topicId: q.topic_id ? String(q.topic_id) : "",
    subtopicId: q.subtopic_id ? String(q.subtopic_id) : "",
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

  // ---- Optional olympiad-scoped taxonomy (never exam topics) ---------------
  const topicId = s(fd, "topic_id");
  const subtopicId = s(fd, "subtopic_id");
  if (subtopicId && !topicId) return { error: lt("olyq.err.taxonomy") };
  if (topicId) {
    if (!UUID_RE.test(topicId)) return { error: lt("olyq.err.taxonomy") };
    const { data: tp } = await supabase
      .from("topics")
      .select("id, subject_id, grade_id, scope")
      .eq("id", topicId)
      .maybeSingle();
    if (
      !tp ||
      tp.scope !== "olympiad" ||
      String(tp.subject_id) !== String(pkg.subject_id) ||
      (tp.grade_id != null &&
        pkg.grade_id != null &&
        String(tp.grade_id) !== String(pkg.grade_id))
    ) {
      return { error: lt("olyq.err.taxonomy") };
    }
    if (subtopicId) {
      if (!UUID_RE.test(subtopicId)) return { error: lt("olyq.err.taxonomy") };
      const { data: st } = await supabase
        .from("subtopics")
        .select("id, topic_id")
        .eq("id", subtopicId)
        .maybeSingle();
      if (!st || String(st.topic_id) !== topicId) {
        return { error: lt("olyq.err.taxonomy") };
      }
    }
  }

  // ---- Trilingual content: az required; en/ru optional-but-complete --------
  const content: Record<PoolLocale, PoolLocaleContent | null> = {
    az: null,
    en: null,
    ru: null,
  };
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
    const active = Boolean(body || prompt || explanation || options.some(Boolean));
    if (!active) continue;
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
        grade_id: pkg.grade_id,
        topic_id: topicId || null,
        subtopic_id: subtopicId || null,
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
        grade_id: pkg.grade_id,
        topic_id: topicId || null,
        subtopic_id: subtopicId || null,
        // Explicit NULL: trg_question_term_guard re-inherits the term from the
        // (possibly changed) topic; a stale term would otherwise mismatch.
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

// Hard delete of ONE pool question. The DB trg_question_delete_guard
// (migration 063) blocks deleting any question with attempt history — that
// error is mapped to a friendly "archive it instead" message.
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
  const q = await getPoolQuestion(supabase, pkgId, qId);
  if (!q) return { error: t("err.server") };

  // Collect linked media BEFORE the delete (the FK cascade removes only the
  // DB rows; storage objects + media_assets are cleaned up after success).
  const { data: trs } = await supabase
    .from("question_translations")
    .select("media_asset_id")
    .eq("question_id", qId);
  const mediaIds = ((trs ?? []) as any[])
    .map((x) => x.media_asset_id)
    .filter(Boolean)
    .map(String);

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", qId)
    // Defence-in-depth: re-assert the package scope on the DELETE itself.
    .eq("olympiad_package_id", pkgId);
  if (error) {
    if (
      error.code === "23514" &&
      (error.hint === "question_has_attempts" ||
        /attempt history/i.test(error.message ?? ""))
    ) {
      return { error: lt("olyq.err.hasAttempts") };
    }
    console.error("[admin] olympiad pool question delete failed", error.message);
    return { error: t("err.server") };
  }
  for (const mid of mediaIds) await removePoolMediaAsset(supabase, mid);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.question.delete",
    targetTable: "questions",
    targetId: qId,
    metadata: { package_id: pkgId },
    severity: "warning",
  });

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

export async function archiveOlympiadPackage(fd: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = s(fd, "__id");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("olympiad_packages")
    .update({ status: "archived" })
    .eq("id", id);

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.olympiad.archive",
      targetTable: "olympiad_packages",
      targetId: id,
      metadata: { status: "archived" },
      severity: "warning",
    });
  }

  revalidatePath("/olympiad");
  redirect("/olympiad");
}
