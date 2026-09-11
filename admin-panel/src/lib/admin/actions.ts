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
} from "@/lib/admin/pricing-shared";

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
//
// WHY UPDATE NO LONGER WRITES PRICES (2026-09-10, the /pricing merge). Editing
// a subject and repricing it are now two different actions on two different
// tables: this file owns the `subjects` ROW, and saveSubjectPrice
// (lib/admin/pricing.ts, one cell per (subject, interval)) owns
// `subjects_pricing`. Creation still writes both, because a subject born
// unpriced is the trap described above — but an EDIT that re-posted three
// amounts read off a stale page would silently overwrite a reprice made in the
// meantime, and there is no version to compare against. Two consequences, both
// structural rather than careful:
//   * renaming a subject cannot reset a price — updateSubject has no code path
//     that reaches subjects_pricing at all;
//   * a reprice cannot rename or publish a subject — saveSubjectPrice never
//     reads a name or a status.
// The invariant "status = 'active' implies three active pricing rows" is held
// instead by CHECKING it: updateSubject refuses to move a subject to 'active'
// unless all three cycles are already priced and active, exactly as
// transitionSubject does. It also refuses a status change posted against a
// status the row has since LEFT — the edit form carries the status it was
// rendered against, and a stale tab must not be able to re-publish a subject
// somebody archived in the meantime.
//
// WHY THE NAME IS THREE FIELDS (2026-09-10, migration 171). It used to be one,
// and renaming a subject was a SILENT NO-OP: the apps resolved every visible
// subject label from their own `subj.<code>` dictionary, which won over
// `subjects.name`, so this action wrote the row, wrote the audit entry, said
// "saved" — and nothing anywhere changed, in any of the three languages. The
// names now live per-locale in `subject_translations` and the apps read that
// first.
//
// `subjects.name` IS THE IMPORT KEY, AND AN UPDATE MUST NEVER WRITE IT. Three
// bulk-import RPCs resolve a subject by that column and nothing else —
// bulk_insert_questions, its olympiad-pool sibling and the question_imports log
// row all run `where name = (meta ->> 'subject')`. So renaming "İngilis dili"
// to "English / İngilis dili" through this action used to break every import
// file that names the old string: the admin sees "saved", and days later a
// colleague's upload fails with "unknown subject" and nothing connects the two.
// The rule that follows is structural rather than careful — CREATE writes
// `name` once, from the az field, and UPDATE has no code path that touches it.
// The form says so on the edit screen, beside the field that no longer feeds it.
//
// WHAT THE PANEL SHOWS, DECIDED ONCE. Anything a human READS names the subject
// by its display name in the admin's own locale — the Subjects list, the edit
// heading, the price cells' accessible labels, the deletion dialog. Anything
// that is a RECORD keys it by something stable: the audit rows carry the id and
// the `code`, never the display name, because a name that can change is a poor
// thing to reconstruct history from. The one place the raw key is PRINTED is
// the edit form, labelled as what it is. And the list's search box matches the
// key AND the translations, or a renamed subject would be findable only under a
// name nobody sees any more.
//
// EN and RU are optional and fall back to az. A trilingual form that REFUSED to
// save without all three would make an admin invent English for a subject they
// only teach in Azerbaijani; copying az into the other two is the honest
// default and is exactly what the reader saw before this existed.
// ===========================================================================

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBJECT_STATUSES = ["active", "inactive", "archived"] as const;
type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

/** Which control an error belongs to, so the form can point at it. */
export type SubjectFormField =
  | "name"
  | "name_en"
  | "name_ru"
  | "status"
  | PriceInterval;

/** The three locales a subject name is stored in (public.content_locale). */
export const SUBJECT_LOCALES = ["az", "en", "ru"] as const;
export type SubjectLocale = (typeof SUBJECT_LOCALES)[number];

export type SubjectSaveState = {
  error?: string;
  field?: SubjectFormField;
  ok?: boolean;
  /**
   * The submission's status change was refused because the row had moved under
   * the form. A FLAG rather than a message comparison: the form has to re-read
   * the server data after this outcome (its baseline is now provably stale, and
   * every retry would reproduce the same refusal), and no client should have to
   * recognise a translated sentence to know that.
   */
  stale?: boolean;
} | null;

type ParsedSubject =
  | {
      ok: true;
      /**
       * The az name. Written to `subjects.name` on CREATE only — that column is
       * the bulk-import key (see the header), so updateSubject never writes it.
       */
      name: string;
      /** az/en/ru, en and ru already defaulted to az when left blank. */
      names: Record<SubjectLocale, string>;
      status: SubjectStatus;
      prices: Record<PriceInterval, number>;
    }
  | { ok: false; state: SubjectSaveState };

// Server-side validation of the whole form. The client mirrors these rules for
// UX only — nothing here trusts a `required` attribute or a number input.
//
// `withPrices` is FALSE for the edit form, which posts no price fields at all.
// It is a parameter rather than "parse them if present" on purpose: absent
// prices must be a refusal on the create path (a subject born unpriced is the
// bug this whole module exists to prevent) and must be ignored on the edit path
// (a posted `price_month` there is a forged field, and reading it would be the
// second write path the merge removed).
function parseSubjectForm(
  formData: FormData,
  t: T,
  withPrices: boolean,
): ParsedSubject {
  // az is the required one, and on the create path it is also the value
  // `subjects.name` is born with.
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > TEXT_MAX) {
    return { ok: false, state: { error: t("subj.err.name"), field: "name" } };
  }

  // EN and RU are OPTIONAL but still validated: a blank one is a deliberate
  // "same as Azerbaijani", an over-long one is a mistake and must be refused
  // rather than silently truncated by the column.
  const names = { az: name, en: name, ru: name } as Record<SubjectLocale, string>;
  for (const loc of ["en", "ru"] as const) {
    const raw = String(formData.get("name_" + loc) ?? "").trim();
    if (raw.length > TEXT_MAX) {
      return {
        ok: false,
        state: { error: t("subj.err.name"), field: ("name_" + loc) as SubjectFormField },
      };
    }
    if (raw) names[loc] = raw;
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  if (!(SUBJECT_STATUSES as readonly string[]).includes(statusRaw)) {
    return { ok: false, state: { error: t("err.server"), field: "status" } };
  }
  const status = statusRaw as SubjectStatus;

  const prices = {} as Record<PriceInterval, number>;
  if (withPrices) {
    for (const iv of PRICE_INTERVALS) {
      const amount = parsePriceAmount(String(formData.get("price_" + iv) ?? ""));
      if (amount === null) {
        return { ok: false, state: { error: t("subj.err.price"), field: iv } };
      }
      prices[iv] = amount;
    }
  }

  return { ok: true, name, names, status, prices };
}

/**
 * True when all three cycles have an ACTIVE row in subjects_pricing.
 *
 * The same question transitionSubject asks before it publishes, asked here for
 * the same reason: since the edit form stopped carrying prices, the status
 * dropdown is a second way into 'active', and it must not be a way AROUND the
 * interlock. A read failure counts as NOT complete — refusing to publish on bad
 * information is recoverable; publishing an unsellable subject is the silent
 * failure that hid Elm and Fizika from /services.
 */
async function pricesComplete(supabase: Db, subjectId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("subjects_pricing")
    .select("interval")
    .eq("subject_id", subjectId)
    .eq("status", "active");
  if (error) {
    console.error(
      "[admin] subject pricing check failed",
      error.code ?? "unknown",
    );
    return false;
  }
  const priced = new Set(
    (data ?? []).map((r) => String((r as { interval: string }).interval)),
  );
  return PRICE_INTERVALS.every((iv) => priced.has(iv));
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

/**
 * Writes the three display names into `subject_translations`.
 *
 * UPSERT ON (subject_id, locale) — the table's own unique constraint — rather
 * than delete-then-insert: a rename must never leave a subject with NO name for
 * a locale, not even for the microseconds between two statements, because the
 * apps read this table first and would render the raw code in that window.
 *
 * Returns false on failure. The caller treats that as a REPORTED failure, not a
 * silent one: the whole point of migration 171 is that a rename which does not
 * take must not look like a rename that did.
 */
async function writeSubjectNames(
  supabase: Db,
  subjectId: string,
  names: Record<SubjectLocale, string>,
): Promise<boolean> {
  const { error } = await supabase.from("subject_translations").upsert(
    SUBJECT_LOCALES.map((locale) => ({
      subject_id: subjectId,
      locale,
      name: names[locale],
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "subject_id,locale" },
  );
  if (error) {
    // Never a raw Postgres message; the detail stays in the server log.
    console.error(
      "[admin] subject translation write failed",
      subjectId,
      error.code ?? "unknown",
    );
    return false;
  }
  return true;
}

/**
 * Which locales this submission actually CHANGED, for the audit row.
 *
 * Small on purpose — locale codes, never the names themselves. An audit log is
 * a record that a rename happened and by whom; the values live in the table
 * that was written.
 */
function changedLocales(
  before: Record<SubjectLocale, string> | null,
  after: Record<SubjectLocale, string>,
): SubjectLocale[] {
  if (!before) return [...SUBJECT_LOCALES];
  return SUBJECT_LOCALES.filter((l) => (before[l] ?? "") !== after[l]);
}

function revalidateSubject(id?: string): void {
  revalidatePath("/manage/subjects");
  if (id) revalidatePath("/manage/subjects/" + id + "/edit");
  // /pricing is no longer a screen — it redirects to /manage/subjects, which is
  // already revalidated above.
}

export async function createSubject(
  _prev: SubjectSaveState,
  formData: FormData,
): Promise<SubjectSaveState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  // Creation is the one path that writes prices: a subject must be born priced.
  const parsed = parseSubjectForm(formData, t, true);
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

  // BOTH HALVES ARE WRITTEN BEFORE EITHER IS REPORTED.
  //
  // The names still go FIRST — a subject that becomes visible without them
  // would render its raw `subjects.name` to English and Russian readers — but
  // a failure there used to redirect immediately, which abandoned a created,
  // UNPRICED, unpublished subject and told the admin only that the names had
  // not saved. The likeliest cause of that failure is also the most invisible
  // one: a database where migration 171 has not been applied yet, on which
  // EVERY creation would have silently produced an unsellable subject. The
  // prices are what decide whether the subject can ever be sold at all, so they
  // are written whatever the names did; neither failure publishes.
  const namesOk = await writeSubjectNames(supabase, newId, parsed.names);
  const failedInterval = await writeSubjectPrices(supabase, newId, parsed.prices);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.subject.create",
    targetTable: "subjects",
    targetId: newId,
    metadata: {
      // `name` here is the IMPORT KEY, chosen once at creation and never
      // rewritten (see the header). Recording it is recording a stable value,
      // which is why the update action records `code` instead.
      name: parsed.name,
      code: String(payload.code),
      locales: namesOk ? changedLocales(null, parsed.names) : [],
    },
  });

  if (!namesOk || failedInterval) {
    // The subject EXISTS and is still private. Sending the admin back to the
    // create form would invite a duplicate; the edit page is where BOTH halves
    // can actually be fixed. Each flag renders its own sentence there, so a
    // submission that lost both is told it lost both rather than only the first
    // thing that went wrong.
    const flags = [
      ...(namesOk ? [] : ["nameFailed=1"]),
      ...(failedInterval ? ["priceFailed=1"] : []),
    ].join("&");
    revalidateSubject(newId);
    redirect("/manage/subjects/" + newId + "/edit?" + flags);
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

  // THE STATUS THIS PAGE WAS RENDERED AGAINST — a hidden field the edit form
  // posts beside the id, and the only thing that makes the re-read below worth
  // performing. Anything that is not one of the three statuses (absent, forged,
  // a form cached from before this field existed) means "no baseline", and the
  // staleness check is skipped rather than guessed at: refusing a save on a
  // value we cannot interpret would break editing for nobody's benefit.
  const renderedRaw = String(formData.get("__statusWas") ?? "").trim();
  const renderedStatus = (SUBJECT_STATUSES as readonly string[]).includes(
    renderedRaw,
  )
    ? (renderedRaw as SubjectStatus)
    : null;

  // NAME AND STATUS ONLY. The prices are inline cells with their own action —
  // see the section header. Passing `false` here is what makes "editing a
  // subject cannot reset its prices" structural: there is no parsed price to
  // write, and nothing below this line mentions subjects_pricing except the
  // read-only publish check.
  const parsed = parseSubjectForm(formData, t, false);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  // Re-verify the client-supplied id server-side before anything privileged.
  // `code` is read for the audit row: it is the stable handle a rename cannot
  // move, which is exactly what a history entry should be keyed by.
  const { data: row } = await supabase
    .from("subjects")
    .select("id, code, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: t("err.server") };
  const before = row as { code: string | null; status: string };

  // The names as they stand, so the audit row can say WHICH languages changed
  // rather than "a save happened". A read failure is not fatal — it only costs
  // the precision of that one metadata field, and every locale is reported as
  // changed instead.
  const { data: beforeRows } = await supabase
    .from("subject_translations")
    .select("locale, name")
    .eq("subject_id", id);
  let beforeNames: Record<SubjectLocale, string> | null = null;
  if (Array.isArray(beforeRows)) {
    beforeNames = { az: "", en: "", ru: "" };
    for (const r of beforeRows as { locale: string; name: string }[]) {
      const loc = String(r.locale);
      if ((SUBJECT_LOCALES as readonly string[]).includes(loc)) {
        beforeNames[loc as SubjectLocale] = String(r.name ?? "");
      }
    }
  }

  // A STALE TAB MUST NOT RE-PUBLISH AN ARCHIVED SUBJECT. The row is re-read
  // above for the reason transitionSubject re-reads it — the page the admin is
  // looking at may be minutes old — and re-reading buys nothing if the form's
  // dropdown value is then written unconditionally. An admin who opened this
  // page while the subject was 'active', and saves a rename after somebody else
  // archived it, would otherwise put it back on sale without touching the
  // dropdown and without being told.
  //
  // The refusal is NARROW, the same shape as the `from` whitelist in
  // subject-status.ts: it fires only when the baseline disagrees with the stored
  // status AND the submission would actually move the status. A posted value
  // that already equals what is stored is a no-op with nothing to collide with.
  //
  // The RENAME still saves — it is unrelated data, and dropping it would punish
  // this admin for someone else's edit — and the refusal is REPORTED below.
  // Swallowing it silently is the same class of bug as the one it prevents.
  const staleStatus =
    renderedStatus !== null &&
    renderedStatus !== before.status &&
    parsed.status !== before.status;
  const nextStatus: SubjectStatus = staleStatus
    ? (before.status as SubjectStatus)
    : parsed.status;

  // THE PUBLISH INTERLOCK. Moving a subject to 'active' requires all three
  // cycles priced and active, exactly as the list's publish button does. The
  // check runs only for that direction: hiding or archiving an unpriced subject
  // must always work, because it is the way OUT of a bad state rather than a
  // reward for being in a good one. It asks about `nextStatus`, so a status
  // change already refused as stale is never re-described as a pricing problem.
  if (nextStatus === "active" && before.status !== "active") {
    if (!(await pricesComplete(supabase, id))) {
      return { error: t("subj.publishBlocked"), field: "status" };
    }
  }

  // NO `name` IN THIS PAYLOAD, AND THAT IS THE POINT. `subjects.name` is the
  // key three bulk-import RPCs resolve a subject by (`where name = (meta ->>
  // 'subject')`), so rewriting it here would break every import file naming the
  // old string — invisibly, and days after the rename that caused it. The
  // display names go to `subject_translations` below; this row write carries
  // the publication status and nothing else.
  const { error } = await supabase
    .from("subjects")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    // Never a raw Postgres message; the form keeps showing the stored values.
    console.error("[admin] subject update failed", error.message);
    return { error: t("err.server") };
  }

  // The display names are the half a family actually sees, so a failure here is
  // reported instead of being buried under a green "saved": before migration 171
  // a rename that changed nothing looked exactly like a rename that worked, and
  // that is the bug.
  const namesOk = await writeSubjectNames(supabase, id, parsed.names);
  const locales = namesOk ? changedLocales(beforeNames, parsed.names) : [];

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.subject.update",
    targetTable: "subjects",
    targetId: id,
    metadata: {
      // THE STABLE HANDLE, not the display name. `code` is generated once and
      // never changes, so an audit row still identifies the subject after any
      // number of renames — and it stays small: locale codes and an id, never
      // the names themselves.
      code: before.code ?? "",
      renamed: locales.length > 0,
      // WHICH languages were renamed — locale codes only, never the strings.
      locales,
      from: before.status,
      to: nextStatus,
      // Present only when a status change was refused as stale, so the log can
      // tell "nobody touched the status" apart from "somebody tried and lost".
      ...(staleStatus ? { statusRefused: parsed.status } : {}),
    },
  });

  revalidateSubject(id);
  // `stale` rides on BOTH refusals, not just the second one: a submission that
  // lost the status race AND failed to write its names is still holding a
  // baseline the database has moved past, and the form has to re-read before
  // the admin retries or the retry reproduces this same refusal for ever.
  if (!namesOk) {
    return {
      error: t("subj.err.nameSave"),
      field: "name",
      ...(staleStatus ? { stale: true } : {}),
    };
  }
  if (staleStatus) {
    return { error: t("subj.err.staleStatus"), field: "status", stale: true };
  }
  return { ok: true };
}
