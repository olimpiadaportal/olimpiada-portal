import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32, normalizeZipPath, openZip } from "../zipRead";
import { buildStoredZip } from "../zipWrite";

// Stored fixtures come from our own writer; deflated ones are hand-assembled
// around node:zlib, because there is no browser API that produces a raw deflate
// stream and the reader must be exercised on real compressed bytes.

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** DecompressionStream is a Node global on 24.x; the deflate cases skip without
 *  it rather than failing, exactly as openZip degrades in an old browser. */
const CAN_INFLATE = typeof DecompressionStream === "function";

type RawEntry = {
  path: string;
  data: Uint8Array;
  /** Overrides for the malformed-archive cases. */
  method?: number;
  flags?: number;
  crc?: number;
  size?: number;
  compressed?: Uint8Array;
  totalEntriesOverride?: number;
  cdSizeOverride?: number;
};

/** A full ZIP with per-field control, so a hostile archive can be built exactly. */
function buildZip(entries: RawEntry[], opts: { comment?: string } = {}): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc(e.path);
    const method = e.method ?? 0;
    const payload = e.compressed ?? e.data;
    const crc = e.crc ?? crc32(e.data);
    const size = e.size ?? e.data.length;

    const local = new Uint8Array(30 + name.length + payload.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, e.flags ?? 0, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    parts.push(local);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, e.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length;
  }

  const comment = enc(opts.comment ?? "");
  const centralStart = offset;
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const total = offset + centralSize + 22 + comment.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  for (const c of central) {
    out.set(c, at);
    at += c.length;
  }
  const ev = new DataView(out.buffer, at);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries[0]?.totalEntriesOverride ?? entries.length, true);
  ev.setUint16(10, entries[0]?.totalEntriesOverride ?? entries.length, true);
  ev.setUint32(12, entries[0]?.cdSizeOverride ?? centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, comment.length, true);
  out.set(comment, at + 22);
  return out;
}

function deflated(path: string, text: string): RawEntry {
  const data = enc(text);
  return { path, data, method: 8, compressed: new Uint8Array(deflateRawSync(data)) };
}

describe("normalizeZipPath", () => {
  it("keeps a safe relative path, case included", () => {
    expect(normalizeZipPath("images/Q1.PNG")).toBe("images/Q1.PNG");
    expect(normalizeZipPath("./images/q1.png")).toBe("images/q1.png");
  });

  it("rejects everything that could escape the archive's own tree", () => {
    for (const bad of [
      "",
      "../secret",
      "a/../b",
      "/etc/passwd",
      "C:/x",
      "c:\\x",
      "data:image/png;base64,AAAA",
      "https://example.com/q1.png",
      "a//b",
      "a/./b",
      "with\0nul",
    ]) {
      expect(normalizeZipPath(bad), bad).toBeNull();
    }
  });

  // A backslash is a SEPARATOR, not an escape hatch. PowerShell Compress-Archive
  // writes "images\\q1.png", and rejecting that refused the archive a Windows
  // admin actually produces. The traversal cases above still fail once
  // translated, which is why the translation happens before the segment checks.
  it("translates Windows separators instead of rejecting them", () => {
    expect(normalizeZipPath("a\\b")).toBe("a/b");
    expect(normalizeZipPath("images\\q1.png")).toBe("images/q1.png");
    expect(normalizeZipPath("a\\b\\c\\d.png")).toBe("a/b/c/d.png");
  });

  it("rejects an over-long path", () => {
    expect(normalizeZipPath("a".repeat(181))).toBeNull();
    expect(normalizeZipPath("a".repeat(180))).toBe("a".repeat(180));
  });
});

describe("openZip — stored entries", () => {
  it("round-trips a stored archive", async () => {
    const zipBytes = buildStoredZip([
      { path: "questions.json", bytes: enc("[]") },
      { path: "images/q1.png", bytes: enc("PNGDATA") },
    ]);
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.zip.entries.map((e) => e.path)).toEqual(["questions.json", "images/q1.png"]);
    const read = await res.zip.read("images/q1.png");
    expect(read.ok).toBe(true);
    if (read.ok) expect(dec(read.bytes)).toBe("PNGDATA");
  });

  it("finds the EOCD past a trailing comment", async () => {
    const zipBytes = buildZip([{ path: "a.txt", data: enc("hello") }], {
      comment: "a comment long enough to matter",
    });
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
  });

  it("rejects bytes that are not a ZIP", async () => {
    expect(await openZip(enc("this is definitely not a zip file at all"))).toMatchObject({
      ok: false,
      reason: "notZip",
    });
  });
});

describe("openZip — refusals", () => {
  it("refuses an encrypted archive", async () => {
    const zipBytes = buildZip([{ path: "a.txt", data: enc("x"), flags: 0x0001 }]);
    expect(await openZip(zipBytes)).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("refuses an unknown compression method", async () => {
    const zipBytes = buildZip([{ path: "a.txt", data: enc("x"), method: 12 }]);
    expect(await openZip(zipBytes)).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("refuses a ZIP64 sentinel rather than half-parsing it", async () => {
    const zipBytes = buildZip([
      { path: "a.txt", data: enc("x"), totalEntriesOverride: 0xffff },
    ]);
    expect(await openZip(zipBytes)).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("refuses the WHOLE archive when any path is hostile", async () => {
    for (const bad of ["../secret.png", "/etc/x.png", "C:\\x.png", "..\\..\\x.png"]) {
      const zipBytes = buildZip([
        { path: "questions.json", data: enc("[]") },
        { path: bad, data: enc("x") },
      ]);
      expect(await openZip(zipBytes), bad).toMatchObject({ ok: false, reason: "badPath" });
    }
  });

  it("refuses duplicate paths", async () => {
    const zipBytes = buildZip([
      { path: "a.png", data: enc("1") },
      { path: "a.png", data: enc("2") },
    ]);
    expect(await openZip(zipBytes)).toMatchObject({ ok: false, reason: "corrupt" });
  });
});

describe("openZip — archiver noise", () => {
  it("skips __MACOSX and dotfiles, and does not count them toward maxEntries", async () => {
    const zipBytes = buildZip([
      { path: "__MACOSX/._q1.png", data: enc("junk") },
      { path: ".DS_Store", data: enc("junk") },
      { path: "images/.hidden/x.png", data: enc("junk") },
      { path: "questions.json", data: enc("[]") },
      { path: "images/q1.png", data: enc("PNG") },
    ]);
    const res = await openZip(zipBytes, { maxEntries: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.zip.entries.map((e) => e.path)).toEqual(["questions.json", "images/q1.png"]);
  });

  it("reports tooManyEntries once the cap is passed", async () => {
    const zipBytes = buildZip(
      Array.from({ length: 5 }, (_, i) => ({ path: `q${i}.png`, data: enc("x") })),
    );
    expect(await openZip(zipBytes, { maxEntries: 3 })).toMatchObject({
      ok: false,
      reason: "tooManyEntries",
    });
  });
});

describe("read — size gates", () => {
  it("rejects a declared size over the per-entry cap WITHOUT inflating", async () => {
    const zipBytes = buildStoredZip([{ path: "big.png", bytes: new Uint8Array(400) }]);
    const res = await openZip(zipBytes, { maxEntryBytes: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await res.zip.read("big.png")).toMatchObject({
      ok: false,
      reason: "entryTooLarge",
    });
  });

  it("rejects a running total over the archive cap", async () => {
    const zipBytes = buildStoredZip([
      { path: "a.png", bytes: new Uint8Array(60) },
      { path: "b.png", bytes: new Uint8Array(60) },
    ]);
    const res = await openZip(zipBytes, { maxEntryBytes: 100, maxTotalBytes: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await res.zip.read("a.png")).ok).toBe(true);
    expect(await res.zip.read("b.png")).toMatchObject({
      ok: false,
      reason: "totalTooLarge",
    });
  });

  it("does not double-count a re-read", async () => {
    const zipBytes = buildStoredZip([
      { path: "a.png", bytes: new Uint8Array(60) },
      { path: "b.png", bytes: new Uint8Array(30) },
    ]);
    const res = await openZip(zipBytes, { maxEntryBytes: 100, maxTotalBytes: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await res.zip.read("a.png")).ok).toBe(true);
    expect((await res.zip.read("a.png")).ok).toBe(true);
    expect((await res.zip.read("b.png")).ok).toBe(true);
  });

  it("rejects a wrong CRC", async () => {
    const zipBytes = buildZip([{ path: "a.png", data: enc("hello"), crc: 12345 }]);
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await res.zip.read("a.png")).toMatchObject({ ok: false, reason: "corrupt" });
  });
});

describe.runIf(CAN_INFLATE)("read — deflated entries", () => {
  it("round-trips a deflated entry", async () => {
    const text = "hello ".repeat(200);
    const zipBytes = buildZip([deflated("a.txt", text)]);
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const read = await res.zip.read("a.txt");
    expect(read.ok).toBe(true);
    if (read.ok) expect(dec(read.bytes)).toBe(text);
  });

  it("aborts on a LIE about the uncompressed size — the real bomb defence", async () => {
    // Declares 10 bytes, inflates to 2 MB. The declared-size gate passes; only
    // the streaming cap can stop this.
    const data = new Uint8Array(2 * 1024 * 1024);
    const entry = deflated("bomb.png", "");
    entry.data = data;
    entry.compressed = new Uint8Array(deflateRawSync(data));
    entry.crc = crc32(data);
    entry.size = 10;
    const res = await openZip(buildZip([entry]), { maxEntryBytes: 64 * 1024 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await res.zip.read("bomb.png")).toMatchObject({
      ok: false,
      reason: "entryTooLarge",
    });
  });
});

describe("find", () => {
  it("prefers an exact hit, then a unique case-insensitive one", async () => {
    const zipBytes = buildStoredZip([{ path: "images/q1.png", bytes: enc("x") }]);
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.zip.find("images/q1.png")).toEqual({ ok: true, path: "images/q1.png" });
    expect(res.zip.find("Images/Q1.PNG")).toEqual({ ok: true, path: "images/q1.png" });
    expect(res.zip.find("images/q9.png")).toEqual({ ok: false, reason: "missing" });
  });

  it("reports ambiguity rather than guessing between two casings", async () => {
    const zipBytes = buildStoredZip([
      { path: "images/q1.png", bytes: enc("x") },
      { path: "images/Q1.PNG", bytes: enc("y") },
    ]);
    const res = await openZip(zipBytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // An exact hit still wins — leniency never overrides a name that is there.
    expect(res.zip.find("images/q1.png")).toEqual({ ok: true, path: "images/q1.png" });
    expect(res.zip.find("images/Q1.png")).toEqual({ ok: false, reason: "ambiguous" });
  });
});
