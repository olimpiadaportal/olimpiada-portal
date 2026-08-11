// The size caps and the storage-key shape that the bulk-import media path
// shares between the BROWSER (ZIP reader, upload phase, client validators) and
// the SERVER (verifier, claim gate, sweep).
//
// WHY ONE MODULE
// --------------
// These used to be independent literals in four files, with comments claiming
// they "mirror" each other and nothing enforcing it. The storage prefix was the
// dangerous one: `imports/<batch>/<uuid>.<ext>` was hardcoded in three
// components and defined a fourth time on the server, so changing it would have
// made verifyImportImage reject every browser upload — at runtime, with no
// compile error anywhere.
//
// Deliberately dependency-free and WITHOUT `server-only`: the server modules
// and the client bundle both read it.

/** Per-image cap. Checked on the ZIP entry, again on the bytes before upload,
 *  and a third time on the STORED object before a media_assets row is minted. */
export const BULK_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Cap on the images of ONE archive / one media phase — NOT on a whole submit.
 * The olympiad create form uploads one ZIP per selected grade, each with its own
 * budget, so an 11-grade package legitimately moves up to 11x this. The hint
 * strings say "per ZIP" for exactly that reason; a single shared budget would
 * have to be threaded through that loop, which is a product decision, not a
 * constant.
 */
export const BULK_MEDIA_TOTAL_MAX_BYTES = 40 * 1024 * 1024;

/** Prefix every browser-uploaded, server-verified import object lives under. */
export const IMPORT_MEDIA_PREFIX = "imports/";

/**
 * The storage key a browser must upload to — and the only shape
 * verifyImportImage accepts (it confines the object to `imports/<batchId>/` and
 * requires a uuid filename). One definition, so an upload can never land
 * somewhere the verifier refuses to look.
 */
export function buildImportMediaPath(batchId: string, ext: string): string {
  return `${IMPORT_MEDIA_PREFIX}${batchId}/${crypto.randomUUID()}.${ext}`;
}
