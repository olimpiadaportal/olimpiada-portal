"use server";

// Publish / unpublish / archive a SUBJECT from the list, without opening the
// edit form.
//
// WHY THIS EXISTS. `subjects.status` has been the switch that decides whether a
// subject is sold to families since it was created — the public Services page,
// Add-Child and the per-child subscribe screen all read it. But the only way to
// change it was to open the record's edit form and pick from a dropdown, which
// is a lot of ceremony for the one field an admin actually flips, and it made
// the panel look as though publication were an afterthought of editing rather
// than the point.
//
// THE MODEL IS THE ENUM THAT ALREADY EXISTS. catalog_status is
// active | inactive | archived, and the panel has always labelled them as a
// publication axis (Hər kəsə açıq / Gizli / Arxivlənmiş — Public / Private /
// Archived). No column was added and no migration was needed: "published"
// simply IS status = 'active'.
//
// SHAPE COPIED FROM transitionNews, deliberately: a transition MAP with an
// allowed `from` set, the current status RE-READ server-side before the write,
// and an audit row. Re-reading is the part that matters — the button the admin
// clicked was rendered from data that may be seconds old, and without the check
// a stale page could archive a subject somebody else just published.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { PRICE_INTERVALS } from "@/app/(protected)/pricing/shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a refused publish sends the admin back to. A LITERAL map, never a path
 * from the form: a redirect target read out of client input is an open-redirect
 * (see safeNext() in the web app). The form only picks a key.
 */
const RETURN_PATHS = {
  list: () => "/manage/subjects",
  edit: (id: string) => `/manage/subjects/${id}/edit`,
} as const;

/**
 * The allowed moves. `from` is a whitelist, not documentation: an action whose
 * `from` does not contain the row's CURRENT status is silently ignored, so a
 * double-submit or a stale tab cannot drive the row somewhere unintended.
 *
 * There is no transition INTO 'active' from nowhere and none out of a status
 * that is not listed — every path an admin can take is here, and anything not
 * here is not reachable through this action.
 */
const SUBJECT_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  // Make it sellable. Reachable from both non-public states, which is what
  // makes archiving reversible.
  publish: { from: ["inactive", "archived"], to: "active" },
  // Hide it from families WITHOUT the finality of archiving: the subject keeps
  // its prices, its curriculum and its questions, and comes back with one click.
  unpublish: { from: ["active"], to: "inactive" },
  // The long-term shelf. Same data, but it reads as "retired" rather than
  // "temporarily off", and it is what admin_delete_subject falls back to when a
  // subject cannot be deleted because its questions have been answered.
  archive: { from: ["active", "inactive"], to: "archived" },
};

export type SubjectStatusState = { error?: string; ok?: boolean } | null;

export async function transitionSubject(formData: FormData): Promise<void> {
  // Guard FIRST, before any client-supplied field is read.
  const ctx = await requireAdmin();

  const id = String(formData.get("__id") ?? "").trim();
  const action = String(formData.get("__action") ?? "").trim();
  const returnKey = String(formData.get("__return") ?? "").trim();
  const tr = SUBJECT_TRANSITIONS[action];
  if (!UUID_RE.test(id) || !tr) return;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("subjects")
    .select("status, name")
    .eq("id", id)
    .maybeSingle();
  // Re-read, then verify the move is legal FROM WHERE THE ROW ACTUALLY IS.
  if (!row || !tr.from.includes(String(row.status))) return;

  // PUBLISHED-AND-UNSELLABLE IS THE BUG THIS BLOCKS. A subject's price is not
  // a column on the row: it lives in subjects_pricing, one row per
  // (subject × interval). Every family-facing surface — /services, /register,
  // Add-Child, the per-child subscribe screen, even the admin Free Access
  // picker — builds its subject list from PRICED rows, so a subject that is
  // 'active' with an incomplete price set is published nowhere and says so
  // nowhere. Elm and Fizika sat in exactly that state until migration 154
  // priced them. Publishing now requires all three cycles to be priced, and
  // the refusal is SHOWN (query flag) rather than swallowed — an admin who is
  // told nothing assumes the publish worked.
  if (tr.to === "active") {
    const { data: prices, error: priceErr } = await supabase
      .from("subjects_pricing")
      .select("interval")
      .eq("subject_id", id)
      .eq("status", "active");
    const priced = new Set(
      (prices ?? []).map((p) => String((p as { interval: string }).interval)),
    );
    const complete =
      !priceErr && PRICE_INTERVALS.every((iv) => priced.has(iv));
    if (!complete) {
      if (priceErr) {
        console.error(
          "[admin] subject pricing check failed",
          priceErr.code ?? "unknown",
        );
      }
      const back =
        returnKey === "edit" ? RETURN_PATHS.edit(id) : RETURN_PATHS.list();
      redirect(`${back}?publishBlocked=1`);
    }
  }

  const { error } = await supabase
    .from("subjects")
    .update({ status: tr.to, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.subject.transition",
      targetTable: "subjects",
      targetId: id,
      metadata: { transition: action, from: row.status, to: tr.to, name: row.name },
    });
  } else {
    // Never surface a raw Postgres message; the list re-renders showing the
    // unchanged status, which is the honest outcome.
    console.error("[admin] subject transition failed", error.code ?? "unknown");
  }

  // Both the list and the pricing page show a subject's status, and /services
  // on the web reads it too — but that is a different deployment and revalidates
  // on its own 60s cache.
  revalidatePath("/manage/subjects");
  revalidatePath(`/manage/subjects/${id}/edit`);
  revalidatePath("/pricing");
}
