import { describe, it, expect } from "vitest";
import { validateItemMedia } from "../bulk-validate";
import { validateClientItemMedia } from "../../bulk-client";

// The two validators are deliberate duplicates: the server copy imports the
// server-only i18n module, so the client mirror cannot share its code. That
// makes DRIFT the real risk, so every case is asserted against BOTH and the
// message keys are compared to each other, not to hardcoded strings.
const t = ((k: string) => k) as never;
const tt = (k: string) => k;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const img = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString("base64")}`;
const item = (image?: unknown) => ({ meta: image === undefined ? {} : { image } });

/** Run both validators and assert they agree; return the shared result. */
function both(value: unknown, mixed: boolean): string | null {
  const server = validateItemMedia(value, t, mixed);
  const client = validateClientItemMedia(value, tt, mixed);
  expect(
    { server, client },
    "server and client validators disagree — they must stay identical",
  ).toEqual({ server, client: server });
  return server;
}

describe("embedded media validation (server + client parity)", () => {
  it("accepts a well-formed image in mixed mode", () => {
    expect(both(item(img("image/png", PNG)), true)).toBeNull();
  });

  it("treats absent media as fine in BOTH modes", () => {
    // A mixed pool is text questions AND image questions together — media is
    // optional even when mixed is selected.
    expect(both(item(), true)).toBeNull();
    expect(both(item(), false)).toBeNull();
    expect(both(item(""), true)).toBeNull();
    expect(both(item("   "), true)).toBeNull();
    expect(both(item(null), true)).toBeNull();
  });

  it("REPORTS an image when text-only mode is selected", () => {
    // The whole point: importing it silently would drop every image and still
    // report success.
    expect(both(item(img("image/png", PNG)), false)).toBe("bulk.err.mediaNotAllowed");
  });

  it("rejects a non-data-URL", () => {
    expect(both(item("https://example.com/a.png"), true)).toBe("bulk.err.badImage");
    expect(both(item("data:image/png,notbase64"), true)).toBe("bulk.err.badImage");
    expect(both(item(12345), true)).toBe("bulk.err.badImage");
  });

  it("rejects a declared type outside the allowed set", () => {
    expect(both(item(img("image/svg+xml", PNG)), true)).toBe("bulk.err.imageType");
    expect(both(item(img("text/html", PNG)), true)).toBe("bulk.err.imageType");
    expect(both(item(img("application/pdf", PNG)), true)).toBe("bulk.err.imageType");
  });

  it("rejects an oversized payload", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    expect(both(item(img("image/png", big)), true)).toBe("bulk.err.imageTooLarge");
  });

  it("rejects an empty payload", () => {
    expect(both(item("data:image/png;base64,"), true)).toBe("bulk.err.badImage");
  });

  it("is safe on malformed items", () => {
    expect(both(null, true)).toBeNull();
    expect(both("nonsense", true)).toBeNull();
    expect(both([], true)).toBeNull();
    expect(both({}, true)).toBeNull();
    expect(both({ meta: "not an object" }, true)).toBeNull();
  });

  it("does NOT decide the real type — that is the server sniff's job", () => {
    // A declared image/png passes here even though the bytes decide later. This
    // is intentional: these validators are a fast pre-check, and the magic-byte
    // sniff in bulk-media.ts is the authority (see its own spec).
    const svgBytes = Buffer.from("<svg></svg>", "utf8");
    expect(both(item(img("image/png", svgBytes)), true)).toBeNull();
  });
});
