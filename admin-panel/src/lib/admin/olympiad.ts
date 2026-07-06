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
import { getT } from "@/i18n/server";

export type OlympiadState = { error?: string } | null;
export type OlympiadCoverState = { error?: string } | null;
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

export async function saveOlympiadPackage(
  _prev: OlympiadState,
  fd: FormData,
): Promise<OlympiadState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const id = s(fd, "__id");
  const subjectId = s(fd, "subject_id");
  if (!subjectId) return { error: t("oly2.err.subject") };
  const gradeId = s(fd, "grade_id") || null;
  // Price must be a finite number ≥ 0 (negatives/NaN/Infinity rejected);
  // normalized to 2 decimals.
  const priceRaw = s(fd, "price_amount");
  const priceNum = priceRaw === "" ? 0 : Number(priceRaw);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return { error: t("err.server") };
  }
  const price = Math.round(priceNum * 100) / 100;
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

  const supabase = await createClient();
  // `code` is auto-generated from the Azerbaijani title (no longer a UI input).
  // On update we keep the existing code untouched.
  const row = {
    subject_id: subjectId,
    grade_id: gradeId,
    price_amount: price,
    status,
    event_starts_at: eventAt,
  };
  let pkgId = id;
  if (!pkgId) {
    const base = slugifyCode(titleAz);
    let code = base;
    let inserted: { id: string } | null = null;
    // Retry on a unique-violation by appending a short random suffix.
    for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
      const { data, error } = await supabase
        .from("olympiad_packages")
        .insert({ ...row, code, created_by: ctx.profileId })
        .select("id")
        .single();
      if (!error && data) {
        inserted = data;
        break;
      }
      if ((error as { code?: string } | null)?.code === "23505") {
        code = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        continue;
      }
      console.error("[admin] olympiad package insert failed", error?.message);
      return { error: t("err.server") };
    }
    if (!inserted) return { error: t("err.server") };
    pkgId = inserted.id;
  } else {
    const { error } = await supabase.from("olympiad_packages").update(row).eq("id", pkgId);
    if (error) {
      console.error("[admin] olympiad package update failed", error.message);
      return { error: t("err.server") };
    }
  }

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
        return { error: t("err.server") };
      }
    } else if (id) {
      await supabase
        .from("olympiad_package_translations")
        .delete()
        .eq("olympiad_package_id", pkgId)
        .eq("locale", loc);
    }
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.olympiad.update" : "admin.olympiad.create",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: { status, price },
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

  // Batch-level Grade comes from the modal select (NOT from the file). The RPC
  // resolves grades by grades.level, so that is the value injected into every
  // item's meta below. Subject is scoped by the package inside the RPC.
  const gradeId = s(fd, "grade_id");
  if (!UUID_RE.test(gradeId)) {
    return { ok: false, error: t("qerr.gradeRequired") };
  }
  const supabase = await createClient();
  const { data: grade } = await supabase
    .from("grades")
    .select("id, level")
    .eq("id", gradeId)
    .maybeSingle();
  if (!grade || grade.level == null) {
    return { ok: false, error: t("qerr.gradeRequired") };
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("bulk.pickFile") };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: t("bulk.tooLarge") };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: t("bulk.invalidJson") };
  }
  if (!Array.isArray(payload)) {
    return { ok: false, error: t("bulk.notArray") };
  }

  // Override every item's meta.grade_level with the selected grade's level.
  // Old-format files that still carry grade_level are superseded (backward
  // compatible by design).
  const items = payload.map((item) => {
    const obj =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const meta =
      obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
        ? (obj.meta as Record<string, unknown>)
        : {};
    return { ...obj, meta: { ...meta, grade_level: grade.level } };
  });

  const { data, error } = await supabase.rpc("bulk_insert_olympiad_package_questions", {
    p_package_id: pkgId,
    p_questions: items,
  });
  if (error) {
    console.error("[admin] olympiad bulk import failed", error.message);
    return { ok: false, error: t("err.server") };
  }

  const raw = data as {
    total: number;
    successful: number;
    failed: number;
    errors: { index: number; error: string }[];
  };
  // L9: the RPC records raw SQLERRM per failed row. Keep only our deliberate
  // "bulk_insert…" validation raises; replace anything else with a generic
  // trilingual message so DB internals never reach the client.
  const result = {
    ...raw,
    errors: ((raw?.errors ?? []) as { index: number; error: string }[]).map(
      (e) => ({
        index: e.index,
        error:
          typeof e.error === "string" && e.error.startsWith("bulk_insert")
            ? e.error
            : t("bulk.rowFailed"),
      }),
    ),
  };

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.olympiad.bulk_import",
    targetTable: "olympiad_packages",
    targetId: pkgId,
    metadata: {
      total: result?.total,
      successful: result?.successful,
      failed: result?.failed,
    },
  });

  revalidatePath(`/olympiad/${pkgId}/edit`);
  return { ok: true, result };
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
