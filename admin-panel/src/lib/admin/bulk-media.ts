import "server-only";

// The CLAIM GATE for client-supplied media uuids, plus the bucket/prefix
// constants the import paths share.
//
// There is no bytes path here any more. Images reach storage exclusively
// through the browser media phase (lib/bulk-upload-media.ts) and the server
// verifier that re-types the STORED bytes before minting the media_assets row
// (lib/admin/import-media.ts). By the time an import action runs, a row can
// only carry uuids — and this module decides which of those uuids that admin is
// actually allowed to attach.
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  BULK_MEDIA_MAX_BYTES,
  IMPORT_MEDIA_PREFIX,
} from "@/lib/bulk-media-shared";

/** Same bucket and cap the manual attach path uses (lib/admin/media.ts). */
export const BULK_MEDIA_BUCKET = "question-media";

/**
 * Prefixes an import may create. Provenance is readable from the key alone,
 * which is what makes a targeted sweep possible:
 *   imports/   browser-uploaded, server-verified (import-media action)
 *   staging/   the single-question create modal
 *   questions/ already attached to a question
 *
 * `bulk/` is the retired server-decoded-base64 prefix. NOTHING writes it any
 * more, but assets imported before the ZIP flow still live under it and must
 * stay claimable — dropping it would orphan every image imported until then.
 */
export const BULK_MEDIA_PREFIX = "bulk/";
// Re-exported, not redefined: the browser builds the same key and enforces the
// same cap, and lib/bulk-media-shared.ts is the one place both sides read.
export { BULK_MEDIA_MAX_BYTES, IMPORT_MEDIA_PREFIX };

/**
 * Which of these client-supplied media uuids may this admin actually attach?
 *
 * WHY THIS EXISTS — a real authorization hole, not a theoretical one
 * -----------------------------------------------------------------
 * `meta.media_asset_id` arrives INSIDE the uploaded file, so it is attacker
 * data. Two facts make it dangerous together:
 *
 *   1. The RLS policy `media_insert` (010_rls_policies.sql) lets any panel user
 *      holding `content.create` INSERT a media_assets row with ANY bucket, path,
 *      mime_type and file_size_bytes. Nothing verifies the row describes a real
 *      object, let alone an image.
 *   2. The import RPC's only check is `ma.bucket = 'question-media'`
 *      (011_indexes_constraints_functions_triggers.sql). It never sniffs bytes.
 *
 * So without this gate a content manager can hand-craft a row pointing at
 * ANOTHER question's image — or at no object at all — and attach it by uuid.
 * The bytes are never examined on that path.
 *
 * The rule: a uuid is claimable only if it is a question-media asset that THIS
 * admin owns, sitting under a prefix our own verified-upload path created.
 * Anything else (another user's asset, a `questions/<id>/` object belonging to
 * an existing question, a fabricated row) is refused.
 *
 * Returns the set of ids that passed. The caller rejects the rest by row.
 */
export async function claimableMediaIds(
  supabase: SupabaseClient,
  ownerProfileId: string | null,
  ids: string[],
): Promise<Set<string>> {
  const unique = [...new Set(ids)].filter((v) => typeof v === "string" && v.length > 0);
  if (unique.length === 0 || !ownerProfileId) return new Set();

  const { data, error } = await supabase
    .from("media_assets")
    .select("id, path")
    .eq("bucket", BULK_MEDIA_BUCKET)
    .eq("owner_profile_id", ownerProfileId)
    .in("id", unique);

  if (error) {
    // Fail CLOSED: an unreadable answer must not become an accepted claim.
    console.error("[admin] media claim check failed", error.message);
    return new Set();
  }

  const ok = new Set<string>();
  for (const row of (data ?? []) as { id: string; path: string }[]) {
    const p = typeof row.path === "string" ? row.path : "";
    // Only assets minted by an import path. `questions/<id>/…` is deliberately
    // excluded — those belong to a question already, and re-attaching one is
    // exactly the abuse this guards.
    if (p.startsWith(IMPORT_MEDIA_PREFIX) || p.startsWith(BULK_MEDIA_PREFIX)) {
      ok.add(row.id);
    }
  }
  return ok;
}

/**
 * Shape both importers use to carry pre-validated rows toward the RPC.
 * Declared here so the claim gate can operate on either without either
 * importer depending on the other.
 */
export type ClaimableRows = {
  errors: { index: number; error: string }[];
  validItems: Record<string, unknown>[];
  validFileIndex: number[];
};

/**
 * Drop every row carrying a media uuid this admin may not attach.
 *
 * Covers BOTH `meta.media_asset_id` and every `options[n].image.<locale>`.
 * The option map (migration 104) used to bypass this gate entirely, leaving the
 * DB's `bucket = 'question-media'` check as the only barrier — precisely the
 * hole claimableMediaIds exists to close, re-opened for options.
 *
 * Mutates `rows` in place, recording ONE per-row error for each rejected row, so
 * a bad uuid costs one question rather than the whole file.
 *
 * Splices UNIQUE indices in DESCENDING order: a row can now supply several
 * uuids, so a naive backwards walk over the supplied list would splice the same
 * position twice and drop an innocent neighbour. Descending order is still
 * required for the same reason it always was — removing an element shifts every
 * later position in the two parallel arrays.
 */
export async function rejectUnclaimableMedia(
  supabase: SupabaseClient,
  ownerProfileId: string | null,
  rows: ClaimableRows,
  t: (k: string) => string,
): Promise<void> {
  const supplied: { idx: number; id: string }[] = [];
  rows.validItems.forEach((it, i) => {
    const raw = (it.meta as Record<string, unknown> | undefined)?.media_asset_id;
    if (typeof raw === "string" && raw.trim() !== "") {
      supplied.push({ idx: i, id: raw.trim() });
    }
    const opts = Array.isArray(it.options) ? (it.options as unknown[]) : [];
    for (const o of opts) {
      if (!o || typeof o !== "object" || Array.isArray(o)) continue;
      const img = (o as Record<string, unknown>).image;
      if (!img || typeof img !== "object" || Array.isArray(img)) continue;
      for (const v of Object.values(img as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() !== "") supplied.push({ idx: i, id: v.trim() });
      }
    }
  });
  if (supplied.length === 0) return;

  const claimable = await claimableMediaIds(
    supabase,
    ownerProfileId,
    supplied.map((x) => x.id),
  );

  const badIdx = new Set<number>();
  for (const { idx, id } of supplied) {
    if (!claimable.has(id)) badIdx.add(idx);
  }
  for (const idx of [...badIdx].sort((a, b) => b - a)) {
    rows.errors.push({ index: rows.validFileIndex[idx], error: t("bulk.err.badMedia") });
    rows.validItems.splice(idx, 1);
    rows.validFileIndex.splice(idx, 1);
  }
}
