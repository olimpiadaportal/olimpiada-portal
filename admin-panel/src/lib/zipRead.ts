// Minimal ZIP reader for the mixed-mode bulk import. No DEPENDENCY on purpose:
// it runs in the browser, is unit-tested under vitest, and must not pull a
// package into the admin bundle for what is ~300 lines of well-specified
// container parsing. The one import is the shared cap module — the reader's
// default limits ARE the import media caps, and two literals that only a
// comment kept in step is how they drift.
//
// WHY A READER AT ALL
// -------------------
// Mixed imports used to carry every image as a base64 data URL inside the JSON,
// which made the file ~4/3 the size of the images and forced an admin to
// hand-embed pictures. A ZIP is what the admin already produces (right-click →
// compress), and it keeps the JSON readable.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// No writing to disk, no ZIP64, no encryption, no multi-disk. An archive that
// needs any of those is REFUSED with a specific reason rather than partially
// understood — a half-parsed archive is how a "missing image" turns into a
// silent wrong image.
//
// THREE INDEPENDENT SIZE GATES (zip-bomb defence)
// -----------------------------------------------
// The declared uncompressed size in the directory is attacker data, so it is
// only the cheap first gate. The gate that actually holds is the STREAMING
// abort in read(): the reader is cancelled the moment inflated bytes pass the
// per-entry cap, whatever the header claimed. The length+CRC32 equality check
// afterwards is what makes a lie fatal instead of merely capped.

import {
  BULK_MEDIA_MAX_BYTES,
  BULK_MEDIA_TOTAL_MAX_BYTES,
} from "./bulk-media-shared";

export type ZipFailure =
  | "notZip"
  | "unsupported"
  | "badPath"
  | "tooManyEntries"
  | "entryTooLarge"
  | "totalTooLarge"
  | "corrupt";

export type ZipLimits = {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxPathLength?: number;
};

/** `size` is the CENTRAL-directory uncompressed size — never the local header's. */
export type ZipEntry = { path: string; size: number };

export type ZipArchive = {
  /** Kept entries in central-directory order (directories and junk filtered out). */
  entries: ZipEntry[];
  find(ref: string): { ok: true; path: string } | { ok: false; reason: "missing" | "ambiguous" };
  read(path: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: ZipFailure }>;
};

const DEFAULT_MAX_ENTRIES = 600;
const DEFAULT_MAX_ENTRY_BYTES = BULK_MEDIA_MAX_BYTES;
const DEFAULT_MAX_TOTAL_BYTES = BULK_MEDIA_TOTAL_MAX_BYTES;
const DEFAULT_MAX_PATH_LENGTH = 180;

/** Central-directory records SCANNED before giving up, independent of how many
 *  are kept: a crafted directory can list far more entries than it stores. */
const MAX_SCANNED_RECORDS = 5000;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** The largest an EOCD record plus its maximum 64 KB comment can be. */
const EOCD_SCAN_WINDOW = 65557;

// ---------------------------------------------------------------------------
// CRC32 (also used by zipWrite.ts — Windows Explorer refuses an archive whose
// CRC disagrees with the data, even for stored entries)
// ---------------------------------------------------------------------------
let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Turn an archive member name into a safe relative POSIX path, or null.
 *
 * Case is PRESERVED: the name is compared against references written by hand,
 * and silently lowercasing here would make two distinct entries collide.
 */
export function normalizeZipPath(
  raw: string,
  maxLength: number = DEFAULT_MAX_PATH_LENGTH,
): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.startsWith("./") ? raw.slice(2) : raw;
  if (p === "") return null;
  // A backslash is rejected rather than translated: on Windows "a\b" is a
  // nested path and on POSIX it is a filename, so guessing which one the
  // archive meant is exactly how a reference resolves to the wrong file.
  if (p.includes("\0") || p.includes("\\")) return null;
  if (p.startsWith("/")) return null;
  // No colon ANYWHERE. It covers the Windows drive letter ("C:/x"), and it also
  // means a value that is really a URL or a data: URL fails as a bad PATH
  // instead of surviving to be reported as a missing file.
  if (p.includes(":")) return null;
  if (p.length > maxLength) return null;
  for (const seg of p.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return null;
  }
  return p;
}

type EntryMeta = {
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  localOffset: number;
};

function isSkippedName(path: string): boolean {
  const segs = path.split("/");
  // macOS resource forks and dotfiles are archiver noise, not content: counting
  // them toward the entry cap or reporting them as unreferenced images would
  // make a perfectly normal Finder-made ZIP look broken.
  if (segs[0] === "__MACOSX") return true;
  return segs.some((s) => s.startsWith("."));
}

export async function openZip(
  // Pinned to a plain ArrayBuffer rather than the default ArrayBufferLike: the
  // compressed slice is handed to a WritableStream<BufferSource>, which rejects
  // a possibly-SharedArrayBuffer-backed view.
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
  limits: ZipLimits = {},
): Promise<{ ok: true; zip: ZipArchive } | { ok: false; reason: ZipFailure }> {
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxPathLength = limits.maxPathLength ?? DEFAULT_MAX_PATH_LENGTH;

  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = buf.byteLength;
  if (len < 22) return { ok: false, reason: "notZip" };

  // Scan backwards for the EOCD. The comment-length equality check is what
  // stops a 0x06054b50 sitting inside a comment or inside compressed data from
  // being mistaken for the record.
  let eocd = -1;
  const floor = Math.max(0, len - EOCD_SCAN_WINDOW);
  for (let i = len - 22; i >= floor; i--) {
    if (view.getUint32(i, true) !== SIG_EOCD) continue;
    if (view.getUint16(i + 20, true) === len - (i + 22)) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: "notZip" };

  const diskNumber = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    return { ok: false, reason: "unsupported" }; // spanned archive
  }
  // ZIP64 sentinels. An archive within our own caps (<=600 files, <=40 MB)
  // never needs ZIP64, so seeing one means the file is far outside what this
  // flow accepts — refusing is more honest than parsing half of it.
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return { ok: false, reason: "unsupported" };
  }
  if (cdOffset > len) return { ok: false, reason: "corrupt" };

  const metaByPath = new Map<string, EntryMeta>();
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder("utf-8");
  let needsInflate = false;

  let at = cdOffset;
  let scanned = 0;
  for (; ; scanned++) {
    // A crafted directory can list far more records than it stores, so the
    // SCAN is bounded independently of how many entries survive filtering.
    if (scanned >= MAX_SCANNED_RECORDS) return { ok: false, reason: "tooManyEntries" };
    if (at + 46 > len) break;
    if (view.getUint32(at, true) !== SIG_CENTRAL) break;

    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const nameAt = at + 46;
    if (nameAt + nameLen > len) return { ok: false, reason: "corrupt" };

    // Names are decoded as UTF-8 whatever GP bit 11 says: every archiver an
    // admin realistically uses writes UTF-8, and a wrong legacy decode would
    // surface as "image not in the ZIP" rather than as a decoding problem.
    const rawName = decoder.decode(buf.subarray(nameAt, nameAt + nameLen));
    at = nameAt + nameLen + extraLen + commentLen;

    // Encryption (bit 0) and strong encryption (bit 6). Bit 3 (sizes in a data
    // descriptor) is fine — every size here comes from the central record.
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      return { ok: false, reason: "unsupported" };
    }

    if (rawName.endsWith("/")) continue; // directory entry

    const path = normalizeZipPath(rawName, maxPathLength);
    // A traversal or absolute path is hostile, not a stray file: the whole
    // archive is refused rather than quietly dropping the entry, because the
    // admin needs to know the ZIP is not what they think it is.
    if (path === null) return { ok: false, reason: "badPath" };
    if (isSkippedName(path)) continue;

    if (size === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      return { ok: false, reason: "unsupported" }; // per-entry ZIP64
    }
    if (method !== 0 && method !== 8) return { ok: false, reason: "unsupported" };
    if (method === 8) needsInflate = true;

    if (metaByPath.has(path)) return { ok: false, reason: "corrupt" };
    if (entries.length >= maxEntries) return { ok: false, reason: "tooManyEntries" };

    metaByPath.set(path, { method, compressedSize, size, crc, localOffset });
    entries.push({ path, size });
  }
  // An EOCD can appear by coincidence in arbitrary bytes; a central directory
  // that yields no record at all is the proof that it did.
  if (scanned === 0 && cdSize > 0) return { ok: false, reason: "notZip" };
  // Feature-checked rather than attempted: an old browser gets a translated
  // "this ZIP is not supported" instead of a TypeError from the constructor.
  if (needsInflate && typeof DecompressionStream !== "function") {
    return { ok: false, reason: "unsupported" };
  }

  const paths = entries.map((e) => e.path);
  const readTotals = new Set<string>();
  let runningTotal = 0;

  const zip: ZipArchive = {
    entries,
    find(ref: string) {
      if (metaByPath.has(ref)) return { ok: true as const, path: ref };
      // Windows admins produce Images/Q1.PNG constantly. The fallback fires
      // ONLY on a unique case-insensitive match — two candidates report
      // ambiguity, so leniency can never quietly pick the wrong file.
      const low = ref.toLowerCase();
      const hits = paths.filter((p) => p.toLowerCase() === low);
      if (hits.length === 1) return { ok: true as const, path: hits[0] };
      if (hits.length > 1) return { ok: false as const, reason: "ambiguous" as const };
      return { ok: false as const, reason: "missing" as const };
    },
    async read(path: string) {
      const meta = metaByPath.get(path);
      if (!meta) return { ok: false, reason: "corrupt" };

      // Declared-size gates first, so an obviously oversized entry costs no
      // inflation at all.
      if (meta.size > maxEntryBytes) return { ok: false, reason: "entryTooLarge" };
      const counts = !readTotals.has(path);
      if (counts && runningTotal + meta.size > maxTotalBytes) {
        return { ok: false, reason: "totalTooLarge" };
      }

      // The local header's name/extra lengths legitimately differ from the
      // central record's, so the data offset must be derived from IT.
      const lo = meta.localOffset;
      if (lo + 30 > len || view.getUint32(lo, true) !== SIG_LOCAL) {
        return { ok: false, reason: "corrupt" };
      }
      const dataAt = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true);
      if (dataAt + meta.compressedSize > len) return { ok: false, reason: "corrupt" };
      const slice = buf.subarray(dataAt, dataAt + meta.compressedSize);

      let out: Uint8Array;
      if (meta.method === 0) {
        if (meta.compressedSize !== meta.size) return { ok: false, reason: "corrupt" };
        out = slice.slice();
      } else if (meta.method === 8) {
        const inflated = await inflateRaw(slice, maxEntryBytes);
        if (!inflated.ok) return inflated;
        out = inflated.bytes;
      } else {
        return { ok: false, reason: "unsupported" };
      }

      if (out.length !== meta.size || crc32(out) !== meta.crc) {
        return { ok: false, reason: "corrupt" };
      }
      if (counts) {
        readTotals.add(path);
        runningTotal += meta.size;
      }
      // Bytes are deliberately NOT cached: every image is read once and
      // uploaded immediately, so a cache would only double peak memory.
      return { ok: true, bytes: out };
    },
  };

  return { ok: true, zip };
}

/**
 * Inflate a raw deflate slice, aborting the moment it passes `cap`.
 *
 * The cap is enforced on the bytes that actually come OUT, not on the declared
 * size, because the declared size is the part a zip bomb lies about.
 */
async function inflateRaw(
  slice: Uint8Array<ArrayBuffer>,
  cap: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: ZipFailure }> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // Feeding and draining must overlap: awaiting the write before reading
  // deadlocks as soon as the slice exceeds the stream's internal queue.
  const fed = (async () => {
    await writer.write(slice);
    await writer.close();
  })();
  // Cancelling the reader below rejects this promise; that is the abort
  // working, not an error, so it always carries a handler.
  fed.catch(() => {});

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "entryTooLarge" };
      }
      chunks.push(value);
    }
    await fed;
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  const out = new Uint8Array(total);
  let atOut = 0;
  for (const c of chunks) {
    out.set(c, atOut);
    atOut += c.length;
  }
  return { ok: true, bytes: out };
}
