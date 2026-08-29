// The child ID is SHOWN grouped and COPIED raw.
//
// WHY THIS IS WORTH A SPEC. `groupChildId` exists only so a parent can read
// eight digits off a screen without losing their place. The moment that
// readable form reaches the clipboard, the child's login fails with "wrong ID"
// — and the parent blames the number, not the space, so the report that comes
// back is unactionable. Every assertion below defends that one boundary.
//
// The second boundary: a refused clipboard write must NOT report success. A
// false "Copied" is discovered at the login screen, which is the worst possible
// place to discover it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupChildId } from "@/lib/childId";
import { CopyableId, copyRawId } from "@/components/CopyableId";

const RAW = "27210253";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("groupChildId", () => {
  it("splits the 8-digit ID after the fourth digit", () => {
    expect(groupChildId(RAW)).toBe("2721 0253");
  });

  it("leaves an ID of four digits or fewer alone", () => {
    expect(groupChildId("2721")).toBe("2721");
    expect(groupChildId("")).toBe("");
  });

  it("groups whatever it is given, without assuming a length", () => {
    // Defensive: the allocator owns the length, this helper must not silently
    // mangle a value it did not expect.
    expect(groupChildId("272102539")).toBe("2721 02539");
  });
});

describe("copyRawId", () => {
  it("hands the clipboard the RAW digits, never the grouped display form", async () => {
    const writes: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (v: string) => {
          writes.push(v);
        },
      },
    });

    await expect(copyRawId(RAW, null)).resolves.toBe(true);
    expect(writes).toEqual([RAW]);
    expect(writes[0]).not.toContain(" ");
    expect(writes[0]).not.toBe(groupChildId(RAW));
  });

  it("reports failure and selects the number when the write is refused", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("permission denied");
        },
      },
    });
    const selected: unknown[] = [];
    const range = { selectNodeContents: (el: unknown) => selected.push(el) };
    vi.stubGlobal("document", { createRange: () => range });
    const removeAllRanges = vi.fn();
    const addRange = vi.fn();
    vi.stubGlobal("window", { getSelection: () => ({ removeAllRanges, addRange }) });

    const el = {} as HTMLElement;
    // false is what stops the caller showing "Copied".
    await expect(copyRawId(RAW, el)).resolves.toBe(false);
    expect(selected).toEqual([el]);
    expect(addRange).toHaveBeenCalledWith(range);
  });

  it("survives an origin with no clipboard API at all", async () => {
    // http:// and older browsers expose no navigator.clipboard; the property
    // access itself throws, which must land in the same failure path.
    vi.stubGlobal("navigator", {});
    await expect(copyRawId(RAW, null)).resolves.toBe(false);
  });
});

describe("<CopyableId>", () => {
  const html = (props: { id: string; size?: "sm" | "lg" }) =>
    renderToStaticMarkup(createElement(CopyableId, props));

  it("shows the grouped form and keeps the raw digits out of the markup", () => {
    const out = html({ id: RAW });
    expect(out).toContain("2721 0253");
    // Nothing in the DOM carries the unspaced value, so the only way it can
    // reach the clipboard is through copyRawId above.
    expect(out).not.toContain(RAW);
  });

  it("renders a real button, reset away from the global accent-purple rule", () => {
    const out = html({ id: RAW, size: "lg" });
    expect(out).toContain('type="button"');
    expect(out).toContain("cid cid-lg");
    // The confirmation has to be announced, not only seen.
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("aria-label=");
  });
});
