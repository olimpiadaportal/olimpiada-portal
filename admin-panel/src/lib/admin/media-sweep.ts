// Deleting media_assets rows together with their storage objects.
//
// PostgreSQL never keeps binaries, so a media_assets row and its bucket object
// are two halves of one record and must go together. The guarded-deletion RPCs
// (migration 111) return `orphaned_media_ids` — assets that nothing references
// any more, computed AFTER the delete inside the same transaction — and hand
// them to the caller precisely because a Storage bucket is not transactional.
import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Removes the given assets' bucket objects and then their rows. Returns how
 * many rows were removed.
 *
 * ORDER MATTERS, and it is the opposite of sweepAbandonedImportMedia's: there
 * the row goes first because its delete can legitimately FAIL (an image-only
 * option is protected by a check constraint) and removing the bytes anyway
 * would leave a live row pointing at nothing. Here the row is already
 * unreferenced by construction — the database said so — so the only remaining
 * risk is the reverse one: deleting the row first and then failing to reach
 * Storage leaks bytes nobody can ever find again.
 *
 * Best-effort by design: this runs AFTER the destructive transaction committed,
 * so throwing here would report a failure for an operation that succeeded.
 */
// The three tables that can reference a question's image. `questions` itself
// holds none — the media hangs off the per-locale rows and the options.
const Q_MEDIA_SOURCES = [
  { table: "question_translations", key: "question_id" },
  { table: "question_explanations", key: "question_id" },
] as const;

/**
 * Every media asset the given questions reference, collected BEFORE they are
 * deleted.
 *
 * This has to run first because the FK is `on delete set null`: the moment the
 * questions go, nothing points at the assets any more and they are unreachable
 * — the media_assets row survives, the Storage object survives, and the image
 * stays publicly fetchable at its original URL forever.
 *
 * Best-effort: a failure here means an orphan is left behind, which is a
 * housekeeping cost, never a reason to abort a delete the admin asked for.
 */
export async function collectQuestionMediaIds(
  supabase: Db,
  questionIds: string[],
): Promise<string[]> {
  const clean = questionIds.filter((id) => UUID_RE.test(id));
  if (clean.length === 0) return [];
  const out = new Set<string>();
  try {
    for (const src of Q_MEDIA_SOURCES) {
      const { data, error } = await supabase
        .from(src.table)
        .select("media_asset_id")
        .in(src.key, clean)
        .not("media_asset_id", "is", null);
      // Checked, not swallowed. A wrong column name or an RLS denial returns an
      // error object rather than throwing, so `data ?? []` would report "this
      // question has no images" for a question full of them.
      if (error) {
        console.error(`[admin] media collect failed (${src.table})`, error.code ?? "unknown");
      }
      for (const r of (data ?? []) as { media_asset_id: string | null }[]) {
        if (r.media_asset_id) out.add(r.media_asset_id);
      }
    }
    // Option media is one hop further out: options belong to the question, and
    // the image hangs off the option's per-locale row.
    const { data: opts, error: optsError } = await supabase
      .from("answer_options")
      .select("id")
      .in("question_id", clean);
    if (optsError) {
      console.error("[admin] option lookup failed", optsError.code ?? "unknown");
    }
    const optionIds = (opts ?? []).map((o: { id: string }) => o.id);
    if (optionIds.length > 0) {
      // `option_id`, NOT `answer_option_id` — see 004: the FK column is named
      // option_id. supabase-js RETURNS errors rather than throwing, so naming a
      // column that does not exist produced `data: null` and quietly collected
      // nothing: every per-option image leaked, permanently and invisibly.
      // Hence the explicit error check below rather than a bare `data ?? []`.
      const { data, error } = await supabase
        .from("answer_option_translations")
        .select("media_asset_id")
        .in("option_id", optionIds)
        .not("media_asset_id", "is", null);
      if (error) {
        console.error("[admin] option media collect failed", error.code ?? "unknown");
      }
      for (const r of (data ?? []) as { media_asset_id: string | null }[]) {
        if (r.media_asset_id) out.add(r.media_asset_id);
      }
    }
  } catch (e) {
    console.error(
      "[admin] media collect failed",
      e instanceof Error ? e.message : "unknown",
    );
  }
  return [...out];
}

/**
 * Of the given assets, the ones nothing references any more — checked AFTER the
 * delete committed.
 *
 * Re-checking rather than trusting the pre-delete list is the point: an asset
 * shared with a question that SURVIVED must not be swept, or deleting one
 * question would blank out another's image.
 */
export async function filterUnreferencedMedia(
  supabase: Db,
  mediaIds: string[],
): Promise<string[]> {
  const clean = Array.from(new Set(mediaIds.filter((id) => UUID_RE.test(id))));
  if (clean.length === 0) return [];
  const stillUsed = new Set<string>();
  try {
    for (const table of [
      "question_translations",
      "question_explanations",
      "answer_option_translations",
    ]) {
      const { data, error } = await supabase
        .from(table)
        .select("media_asset_id")
        .in("media_asset_id", clean);
      // A failed probe must not be read as "unreferenced" — that would delete a
      // live image. Treat the whole batch as in-use and leave it alone.
      if (error) return [];
      for (const r of (data ?? []) as { media_asset_id: string | null }[]) {
        if (r.media_asset_id) stillUsed.add(r.media_asset_id);
      }
    }
  } catch (e) {
    console.error(
      "[admin] media reference probe failed",
      e instanceof Error ? e.message : "unknown",
    );
    return [];
  }
  return clean.filter((id) => !stillUsed.has(id));
}

export async function removeMediaAssets(supabase: Db, ids: string[]): Promise<number> {
  const clean = Array.from(new Set(ids.filter((id) => typeof id === "string" && UUID_RE.test(id))));
  if (clean.length === 0) return 0;

  try {
    const { data } = await supabase
      .from("media_assets")
      .select("id, bucket, path")
      .in("id", clean);
    const rows = (data ?? []) as { id: string; bucket: string; path: string }[];
    if (rows.length === 0) return 0;

    // Grouped per bucket: storage.remove() takes one bucket at a time, and the
    // orphan list can mix question images with a package cover.
    const byBucket = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.bucket || !r.path) continue;
      const list = byBucket.get(r.bucket) ?? [];
      list.push(r.path);
      byBucket.set(r.bucket, list);
    }
    for (const [bucket, paths] of byBucket) {
      await supabase.storage.from(bucket).remove(paths);
    }

    const { error } = await supabase
      .from("media_assets")
      .delete()
      .in("id", rows.map((r) => r.id));
    if (error) {
      console.error("[admin] media sweep row delete failed", error.code ?? "unknown");
      return 0;
    }
    return rows.length;
  } catch (e) {
    console.error(
      "[admin] media sweep failed",
      e instanceof Error ? e.message : "unknown",
    );
    return 0;
  }
}
