"use server";

// Generic, allowlisted create/update/delete for taxonomy/config resources.
// Security: the slug must exist in RESOURCES; only registry-defined columns are
// written; access is re-checked server-side; RLS is the final gate.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT, type T } from "@/i18n/server";
import {
  PRICE_INTERVALS,
  parsePriceAmount,
  type PriceInterval,
} from "@/app/(protected)/pricing/shared";

export type SaveState = { error?: string } | null;

// Server-side length cap on free text (taxonomy/config names ≤ 120).
const TEXT_MAX = 120;

// Auto-generate the internal stable `code` (no longer a UI input) from `name`.
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
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "item"
  );
}

type BuiltPayload =
  | { payload: Record<string, unknown>; invalid?: undefined }
  | { payload?: undefined; invalid: "number" | "text" };

type Db = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Module-separation guards (Exams vs Olympiad taxonomy). The Exams taxonomy
// CRUD may only ever touch EXAM-scoped topics: olympiad-package bulk imports
// create scope='olympiad' topics that are package-internal and must never be
// editable/deletable here — even via a forged form post. Subtopics have no
// scope column; they inherit it through their parent topic. New topics rely on
// the DB default scope='exam' (the registry never writes the scope column).
// ---------------------------------------------------------------------------
async function topicIsExamScoped(supabase: Db, topicId: string): Promise<boolean> {
  const { data } = await supabase
    .from("topics")
    .select("scope")
    .eq("id", topicId)
    .maybeSingle();
  return data?.scope === "exam";
}

// True when an existing topics/subtopics row may be mutated from the Exams
// taxonomy pages. Non-taxonomy resources always pass.
async function rowIsExamScoped(
  supabase: Db,
  slug: string,
  id: string,
): Promise<boolean> {
  if (slug === "topics") return topicIsExamScoped(supabase, id);
  if (slug === "subtopics") {
    const { data } = await supabase
      .from("subtopics")
      .select("topic_id")
      .eq("id", id)
      .maybeSingle();
    return data?.topic_id
      ? topicIsExamScoped(supabase, String(data.topic_id))
      : false;
  }
  return true;
}

// True when a client-supplied parent topic_id (subtopic create/update) points
// at an exam-scoped topic. Empty/absent values pass — the required-field and
// FK checks handle those.
async function payloadTopicIsExamScoped(
  supabase: Db,
  slug: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (slug !== "subtopics" || !payload.topic_id) return true;
  return topicIsExamScoped(supabase, String(payload.topic_id));
}

function buildPayload(res: Resource, formData: FormData): BuiltPayload {
  const payload: Record<string, unknown> = {};
  for (const f of res.fields) {
    if (f.type === "boolean") {
      payload[f.name] = formData.get(f.name) != null;
      continue;
    }
    const raw = formData.get(f.name);
    const val = typeof raw === "string" ? raw.trim() : "";
    if (f.type === "number") {
      if (val === "") {
        payload[f.name] = null;
        continue;
      }
      const n = Number(val);
      // Numeric guard: reject NaN/Infinity and negatives.
      if (!Number.isFinite(n) || n < 0) return { invalid: "number" };
      // Grade level is a school class: integer 1..11 only.
      if (
        res.slug === "grades" &&
        f.name === "level" &&
        (!Number.isInteger(n) || n < 1 || n > 11)
      ) {
        return { invalid: "number" };
      }
      payload[f.name] = n;
    } else if (f.type === "reference" || f.type === "select") {
      // Enum whitelist + required enforcement (server-side; the client's
      // `required`/option list is UX only). Covers e.g. topics.term (1..4).
      if (val === "") {
        if (f.required) return { invalid: "number" };
        payload[f.name] = null;
        continue;
      }
      if (
        f.type === "select" &&
        f.options &&
        !f.options.some((o) => o.value === val)
      ) {
        return { invalid: "number" };
      }
      payload[f.name] = val;
    } else {
      // Cap: taxonomy/config names ≤ 120 (server-side, mirrors the UI limit).
      if (val.length > TEXT_MAX) return { invalid: "text" };
      payload[f.name] = val;
    }
  }
  return { payload };
}

export async function saveRow(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  // L8: guard FIRST — the cheapest gate (panel access) runs before ANY
  // client-supplied FormData is read; escalation to admin happens as soon as
  // the registry flag is known. getAuthContext is request-memoized, so the
  // second guard reuses the same lookup.
  const ctx = await requirePanelAccess();
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res) return { error: "Unknown resource." };
  if (res.adminOnly) await requireAdmin();
  const t = await getT();
  // Subjects have their own create/edit action (below): the registry form
  // cannot express the three subjects_pricing rows a subject needs to be
  // sellable, and a subject saved WITHOUT them is published nowhere. Refused
  // here and not merely hidden in the UI, because a hand-crafted POST
  // carrying __slug=subjects would otherwise still flip status to 'active'
  // on an unpriced row — the exact state that made Elm and Fizika invisible.
  if (NON_GENERIC_SAVE.has(res.slug)) {
    console.error("[admin] generic save refused for guarded resource", res.slug);
    return { error: t("err.server") };
  }

  const supabase = await createClient();
  const built = buildPayload(res, formData);
  if (built.invalid) {
    return { error: built.invalid === "text" ? t("err.tooLong") : t("err.server") };
  }
  const payload = built.payload;

  // Module separation: reject mutations that would touch or attach
  // olympiad-scoped taxonomy from the Exams pages (generic error, no detail).
  if (!(await payloadTopicIsExamScoped(supabase, res.slug, payload))) {
    return { error: t("err.server") };
  }
  if (id && !(await rowIsExamScoped(supabase, res.slug, id))) {
    return { error: t("err.server") };
  }

  if (id) {
    const { error } = await supabase.from(res.table).update(payload).eq("id", id);
    if (error) {
      console.error("[admin] resource update failed", slug, error.message);
      return { error: t("err.server") };
    }
    // M5: best-effort audit trail (never fails the mutation — handled inside).
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.resource.update",
      targetTable: res.table,
      targetId: id,
      metadata: { resource: slug, id },
    });
    revalidatePath(`/manage/${slug}`);
    redirect(`/manage/${slug}`);
  } else {
    if (res.autoCode && !payload.code) {
      payload.code = slugifyCode(String(payload.name ?? ""));
    }
    let { data: created, error } = await supabase
      .from(res.table)
      .insert(payload)
      .select("id")
      .single();
    if (error && res.autoCode && (error as { code?: string }).code === "23505") {
      // `code` collided — retry once with a short random suffix.
      payload.code = `${slugifyCode(String(payload.name ?? ""))}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      ({ data: created, error } = await supabase
        .from(res.table)
        .insert(payload)
        .select("id")
        .single());
    }
    if (error) {
      console.error("[admin] resource insert failed", slug, error.message);
      return { error: t("err.server") };
    }
    const newId = (created as { id?: string } | null)?.id ?? null;
    // M5: best-effort audit trail (never fails the mutation — handled inside).
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.resource.create",
      targetTable: res.table,
      targetId: newId,
      metadata: { resource: slug, id: newId ?? undefined },
    });
    revalidatePath(`/manage/${slug}`);
    return null;
  }
}

// Resources whose delete is NOT generic. `subjects` is here because the cascade
// behind one row is a paid subscription line (subscription_subjects is CASCADE,
// and a cancelled row is the receipt for money already taken), the whole
// curriculum tree, and a SET NULL across the question bank, the attempts and the
// points ledger — none of which a bare `.delete()` can show, confirm or count.
// Migration 111 gives it a previewed, code-confirmed RPC;
// lib/admin/subject-deletion.ts is the only route. Refused HERE and not merely
// hidden in the UI, because a hand-crafted POST carrying __slug=subjects would
// otherwise still reach the table (the DB trigger would then refuse it, but
// with an error this function used to throw away).
const NON_GENERIC_DELETE = new Set(["subjects"]);

// Resources whose CREATE/UPDATE is not generic either. Same reasoning as
// above, applied to the write side: see the comment inside saveRow().
const NON_GENERIC_SAVE = new Set(["subjects"]);

export async function deleteRow(formData: FormData): Promise<void> {
  // L8: guard FIRST — panel access before any FormData is read; escalate to
  // admin once the registry flag is known (memoized context, no extra lookup).
  const ctx = await requirePanelAccess();
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res || !id) return;
  if (res.adminOnly) await requireAdmin();
  if (NON_GENERIC_DELETE.has(res.slug)) {
    console.error("[admin] generic delete refused for guarded resource", res.slug);
    return;
  }

  const supabase = await createClient();
  // Module separation: olympiad-scoped taxonomy can never be deleted from the
  // Exams pages (silent no-op, mirroring the other early returns above).
  if (!(await rowIsExamScoped(supabase, res.slug, id))) return;
  const { error } = await supabase.from(res.table).delete().eq("id", id);

  if (error) {
    // The error used to be DISCARDED, so a delete refused by a database guard
    // looked exactly like a delete that worked: the row stayed, the page
    // reloaded, nothing was said. Migration 111 adds BEFORE DELETE guards that
    // make refusals routine, so silence is no longer survivable. The raw
    // Postgres text stays server-side (never leak internals); the page renders
    // the failure from the query flag.
    console.error(
      "[admin] resource delete failed",
      slug,
      (error as { code?: string }).code ?? "unknown",
      error.message,
    );
    revalidatePath(`/manage/${slug}`);
    redirect(`/manage/${slug}?deleteFailed=1`);
  }

  // M5: best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.resource.delete",
    targetTable: res.table,
    targetId: id,
    metadata: { resource: slug, id },
    severity: "warning",
  });

  revalidatePath(`/manage/${slug}`);
}

// ===========================================================================
// SUBJECTS — their own create/edit action.
//
// WHY NOT THE REGISTRY. A subject's PRICE is not a column on `subjects`. It
// lives in `public.subjects_pricing`, one row per (subject_id, interval) with
// a UNIQUE key on that pair and intervals week | month | year. So a single
// scalar "price" field is the wrong shape twice over: it cannot hold 3/9/90,
// and writing only one of the three leaves the other two unpriced — which is
// precisely the state that made Elm and Fizika vanish from /services. The form
// therefore takes THREE amounts, and this action is the only route that can
// write a subject and its prices together.
//
// WHY PRICES ARE REQUIRED AT CREATION. Every family-facing surface builds its
// subject list from PRICED rows, not from `subjects`, so a subject created
// 'active' with no pricing is published and unsellable at the same moment, and
// nothing anywhere says so. The three alternatives were: default the prices
// (which would put a brand-new subject on public sale at a price nobody chose),
// block publishing only (which leaves the trap intact for a subject created as
// Public), or demand them up front. This does the last AND blocks publishing
// (see subject-status.ts), so the invariant "status = 'active' implies three
// active pricing rows" holds through every path an admin can take.
//
// MONEY. Amounts are validated by parsePriceAmount — a STRING shape plus
// 0 < x <= 10000 — so "at most two decimals" is a property of the text, not of
// a float. The value goes straight to admin_upsert_subject_price, which
// re-checks the same bounds and stores numeric(12,2). No arithmetic happens in
// TypeScript at any point.
// ===========================================================================

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBJECT_STATUSES = ["active", "inactive", "archived"] as const;
type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

/** Which control an error belongs to, so the form can point at it. */
export type SubjectFormField = "name" | "status" | PriceInterval;

export type SubjectSaveState = {
  error?: string;
  field?: SubjectFormField;
  ok?: boolean;
} | null;

type ParsedSubject =
  | {
      ok: true;
      name: string;
      status: SubjectStatus;
      prices: Record<PriceInterval, number>;
    }
  | { ok: false; state: SubjectSaveState };

// Server-side validation of the whole form. The client mirrors these rules for
// UX only — nothing here trusts a `required` attribute or a number input.
function parseSubjectForm(formData: FormData, t: T): ParsedSubject {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > TEXT_MAX) {
    return { ok: false, state: { error: t("subj.err.name"), field: "name" } };
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  if (!(SUBJECT_STATUSES as readonly string[]).includes(statusRaw)) {
    return { ok: false, state: { error: t("err.server"), field: "status" } };
  }
  const status = statusRaw as SubjectStatus;

  const prices = {} as Record<PriceInterval, number>;
  for (const iv of PRICE_INTERVALS) {
    const amount = parsePriceAmount(String(formData.get("price_" + iv) ?? ""));
    if (amount === null) {
      return { ok: false, state: { error: t("subj.err.price"), field: iv } };
    }
    prices[iv] = amount;
  }

  return { ok: true, name, status, prices };
}

/**
 * Writes the three prices through admin_upsert_subject_price (Administrator
 * guard, interval whitelist and bounds re-checked in the database, and its own
 * audit row per write).
 *
 * Returns the interval that FAILED, or null when all three are stored. The
 * caller must not change the subject's status after a failure: an interval
 * that did not save is an interval the public basket will not find.
 *
 * A cycle whose amount is already stored is skipped, so re-saving an unchanged
 * form does not write three audit rows. KNOWN GAP: the RPC never touches
 * `subjects_pricing.status`, so a pricing row somebody deactivated by hand
 * cannot be brought back to 'active' from the panel — it is re-written on every
 * save and stays unsellable. No admin path can produce that state today; it is
 * reported rather than papered over.
 */
async function writeSubjectPrices(
  supabase: Db,
  subjectId: string,
  prices: Record<PriceInterval, number>,
): Promise<PriceInterval | null> {
  const { data: existing } = await supabase
    .from("subjects_pricing")
    .select("interval, price_amount, status")
    .eq("subject_id", subjectId);

  const stored = new Map<string, { amount: string; status: string }>();
  for (const r of (existing ?? []) as {
    interval: string;
    price_amount: number | string;
    status: string;
  }[]) {
    // numeric(12,2) arrives as a string over PostgREST. Both sides are
    // normalised to the same 2-decimal TEXT and compared as text — never
    // subtracted.
    stored.set(String(r.interval), {
      amount: Number(r.price_amount).toFixed(2),
      status: String(r.status),
    });
  }

  for (const iv of PRICE_INTERVALS) {
    const cur = stored.get(iv);
    if (cur && cur.status === "active" && cur.amount === prices[iv].toFixed(2)) {
      continue;
    }
    const { error } = await supabase.rpc("admin_upsert_subject_price", {
      p_subject_id: subjectId,
      p_interval: iv,
      p_amount: prices[iv],
    });
    if (error) {
      // Generic message to the client; the detail stays in the server log.
      console.error(
        "[admin] subject price write failed",
        subjectId,
        iv,
        error.message,
      );
      return iv;
    }
  }
  return null;
}

function revalidateSubject(id?: string): void {
  revalidatePath("/manage/subjects");
  if (id) revalidatePath("/manage/subjects/" + id + "/edit");
  // The pricing grid reads the same two tables.
  revalidatePath("/pricing");
}

export async function createSubject(
  _prev: SubjectSaveState,
  formData: FormData,
): Promise<SubjectSaveState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const parsed = parseSubjectForm(formData, t);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();

  // THE ROW IS BORN PRIVATE, ALWAYS. The requested status is applied only
  // after the prices are stored, so a price write that fails can never leave a
  // published subject that cannot be sold — the failure mode this whole action
  // exists to remove.
  const payload: Record<string, unknown> = {
    name: parsed.name,
    status: "inactive",
    code: slugifyCode(parsed.name),
  };
  let { data: created, error } = await supabase
    .from("subjects")
    .insert(payload)
    .select("id")
    .single();
  if (error && (error as { code?: string }).code === "23505") {
    // `code` collided — retry once with a short random suffix (the same rule
    // the registry insert uses; `code` is unique, `name` is not).
    payload.code =
      slugifyCode(parsed.name) + "_" + Math.random().toString(36).slice(2, 6);
    ({ data: created, error } = await supabase
      .from("subjects")
      .insert(payload)
      .select("id")
      .single());
  }
  if (error || !created) {
    console.error("[admin] subject insert failed", error?.message);
    return { error: t("err.server") };
  }

  const newId = String((created as { id: string }).id);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.subject.create",
    targetTable: "subjects",
    targetId: newId,
    metadata: { name: parsed.name, code: String(payload.code) },
  });

  const failed = await writeSubjectPrices(supabase, newId, parsed.prices);
  if (failed) {
    // The subject EXISTS but is unpriced and still private. Sending the admin
    // back to the create form would invite a duplicate; the edit page is where
    // the missing price can actually be fixed, and the flag says what happened.
    revalidateSubject(newId);
    redirect("/manage/subjects/" + newId + "/edit?priceFailed=1");
  }

  if (parsed.status !== "inactive") {
    const { error: statusErr } = await supabase
      .from("subjects")
      .update({ status: parsed.status, updated_at: new Date().toISOString() })
      .eq("id", newId);
    if (statusErr) {
      console.error(
        "[admin] subject status write failed",
        statusErr.code ?? "unknown",
      );
      // Do NOT report a publish that did not happen.
      revalidateSubject(newId);
      redirect("/manage/subjects/" + newId + "/edit?statusFailed=1");
    }
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.subject.transition",
      targetTable: "subjects",
      targetId: newId,
      metadata: { transition: "create", from: "inactive", to: parsed.status },
    });
  }

  revalidateSubject(newId);
  redirect("/manage/subjects");
}

export async function updateSubject(
  _prev: SubjectSaveState,
  formData: FormData,
): Promise<SubjectSaveState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = String(formData.get("__id") ?? "").trim();
  if (!UUID_SHAPE.test(id)) return { error: t("err.server") };

  const parsed = parseSubjectForm(formData, t);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  // Re-verify the client-supplied id server-side before anything privileged.
  const { data: row } = await supabase
    .from("subjects")
    .select("id, name, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: t("err.server") };
  const before = row as { name: string; status: string };

  // PRICES FIRST, ROW SECOND. If a price write fails the status is left exactly
  // where it was, so a failed reprice can never publish an unsellable subject —
  // and the previous price stays in the database, which is what the error
  // message promises the admin.
  const failed = await writeSubjectPrices(supabase, id, parsed.prices);
  if (failed) return { error: t("subj.err.priceSave"), field: failed };

  const { error } = await supabase
    .from("subjects")
    .update({
      name: parsed.name,
      status: parsed.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    // Never a raw Postgres message; the form keeps showing the stored values.
    console.error("[admin] subject update failed", error.message);
    return { error: t("err.server") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.subject.update",
    targetTable: "subjects",
    targetId: id,
    metadata: {
      name: parsed.name,
      renamed: before.name !== parsed.name,
      from: before.status,
      to: parsed.status,
    },
  });

  revalidateSubject(id);
  return { ok: true };
}
