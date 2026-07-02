"use server";

// Olimpiada Preparation — Administrator-only package + question-pool management.
// Never hard-delete a package (purchasers keep lifetime access) → archive only.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

export type OlympiadState = { error?: string } | null;
const LOCALES = ["az", "en", "ru"] as const;

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

  const supabase = await createClient();
  // `code` is auto-generated from the Azerbaijani title (no longer a UI input).
  // On update we keep the existing code untouched.
  const row = { subject_id: subjectId, grade_id: gradeId, price_amount: price, status };
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
  if (!pkgId) return { ok: false, error: t("bulk.pickFile") };
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_insert_olympiad_package_questions", {
    p_package_id: pkgId,
    p_questions: payload,
  });
  if (error) {
    console.error("[admin] olympiad bulk import failed", error.message);
    return { ok: false, error: t("err.server") };
  }

  const result = data as {
    total: number;
    successful: number;
    failed: number;
    errors: { index: number; error: string }[];
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
