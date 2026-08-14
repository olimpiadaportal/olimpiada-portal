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
