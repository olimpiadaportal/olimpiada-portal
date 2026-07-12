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
  type ActiveTypeRule,
} from "@/lib/admin/bulk-validate";
import { getT, type T } from "@/i18n/server";

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
  durationMinutes: number;
};

// olympiad_packages.duration_minutes (migration 047): attempt time limit in
// whole minutes, DB CHECK between 5 and 240 — mirrored here.
const DURATION_MIN = 5;
const DURATION_MAX = 240;

function parsePackageFields(fd: FormData, t: T): { error: string } | PackageFields {
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

  // Optional planned event date/time (Round 8). The form submits an ISO string
  // (client-side timezone-correct); empty clears the date back to NULL.
  const eventRaw = s(fd, "event_starts_at");
  let eventAt: string | null = null;
  if (eventRaw) {
    const ts = Date.parse(eventRaw);
    if (!Number.isFinite(ts)) return { error: t("err.server") };
    eventAt = new Date(ts).toISOString();
  }
  return {
    subjectId,
    gradeId,
    price,
    status,
    titleAz,
    eventAt,
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
  const id = s(fd, "__id");
  const fields = parsePackageFields(fd, t);
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

// Active question types + their structure rules (MCQ = 4 options / 1 correct)
// for the strict per-row validation shared with the general bank.
async function loadActiveTypeRules(supabase: Db): Promise<{
  activeByNorm: Map<string, ActiveTypeRule>;
  defaultType: ActiveTypeRule | null;
}> {
  const { data: typeRows } = await supabase
    .from("question_types")
    .select("name, options_required, correct_required")
    .eq("status", "active")
    .order("name");
  const activeTypes: ActiveTypeRule[] = ((typeRows ?? []) as any[]).map((r) => ({
    name: String(r.name),
    options_required: r.options_required ?? null,
    correct_required: r.correct_required ?? null,
  }));
  const activeByNorm = new Map<string, ActiveTypeRule>();
  for (const r of activeTypes) activeByNorm.set(normTypeName(r.name), r);
  return { activeByNorm, defaultType: activeTypes[0] ?? null };
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
    const msg = validateBulkItem(item, t, activeByNorm, defaultType);
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

  const fields = parsePackageFields(fd, t);
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
