// Minimal ZIP writer, used only to build the downloadable mixed-import
// template (a JSON file plus two sample images).
//
// STORED ONLY (method 0), deliberately. The template is about a kilobyte, so
// compressing it would buy nothing and cost a deflate encoder in the admin
// bundle — the browser has DecompressionStream but no matching one-shot
// compressor we could rely on. Real archives an admin uploads are read by
// zipRead.ts, which does handle deflate.
//
// The CRC is mandatory even for stored entries: Windows Explorer refuses an
// archive whose CRC disagrees with the data, so a "why is my template corrupt"
// ticket is one wrong field away.
import { crc32 } from "./zipRead";

export type ZipInput = { path: string; bytes: Uint8Array };

// Fixed 1980-01-01 00:00 in DOS format: a deterministic template downloads
// byte-identical every time, which makes "is this the current template?"
// answerable by comparing files.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // year 1980, month 1, day 1

// The ArrayBuffer type argument is pinned so the result can go straight into a
// Blob / openZip, both of which reject a possibly-shared backing buffer.
export function buildStoredZip(files: ZipInput[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const items = files.map((f) => ({ name: encoder.encode(f.path), bytes: f.bytes }));

  const localSize = items.reduce((n, it) => n + 30 + it.name.length + it.bytes.length, 0);
  const centralSize = items.reduce((n, it) => n + 46 + it.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let at = 0;
  const offsets: number[] = [];
  const crcs: number[] = [];

  for (const it of items) {
    offsets.push(at);
    const crc = crc32(it.bytes);
    crcs.push(crc);

    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0x0800, true); // GP bit 11 — the name is UTF-8
    view.setUint16(at + 8, 0, true); // method 0 (stored)
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, crc, true);
    view.setUint32(at + 18, it.bytes.length, true); // compressed == uncompressed
    view.setUint32(at + 22, it.bytes.length, true);
    view.setUint16(at + 26, it.name.length, true);
    view.setUint16(at + 28, 0, true); // no extra field
    at += 30;
    out.set(it.name, at);
    at += it.name.length;
    out.set(it.bytes, at);
    at += it.bytes.length;
  }

  const centralStart = at;
  items.forEach((it, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, crcs[i], true);
    view.setUint32(at + 20, it.bytes.length, true);
    view.setUint32(at + 24, it.bytes.length, true);
    view.setUint16(at + 28, it.name.length, true);
    view.setUint16(at + 30, 0, true); // extra
    view.setUint16(at + 32, 0, true); // comment
    view.setUint16(at + 34, 0, true); // disk number start
    view.setUint16(at + 36, 0, true); // internal attrs
    view.setUint32(at + 38, 0, true); // external attrs
    view.setUint32(at + 42, offsets[i], true);
    at += 46;
    out.set(it.name, at);
    at += it.name.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 4, 0, true); // this disk
  view.setUint16(at + 6, 0, true); // disk with the central directory
  view.setUint16(at + 8, items.length, true);
  view.setUint16(at + 10, items.length, true);
  view.setUint32(at + 12, at - centralStart, true);
  view.setUint32(at + 16, centralStart, true);
  view.setUint16(at + 20, 0, true); // no comment

  return out;
}
