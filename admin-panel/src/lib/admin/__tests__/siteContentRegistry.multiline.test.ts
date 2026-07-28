// The `multiline` flag is not cosmetic — it decides the CONTROL the admin gets.
// ContentManager renders `multiline: true` as a <textarea> and everything else
// as <input type="text">, and the HTML value-sanitization algorithm strips CR
// and LF from a text input. So a key whose default already contains a newline,
// or whose frontend renders through <CmsProse> (paragraphs + line breaks), is
// physically un-editable as a single-line field: the admin cannot type the
// blank line the renderer knows how to display, and an existing multi-line
// value is flattened the first time they save.
//
// This test pins the invariant so a prose key can never be added back as a
// single-line entry by hand.
import { describe, expect, it } from "vitest";
import { SITE_CONTENT_REGISTRY } from "../siteContentRegistry";

describe("siteContentRegistry multiline invariant", () => {
  it("marks every entry whose default text contains a newline as multiline", () => {
    const offenders = SITE_CONTENT_REGISTRY.filter(
      (e) =>
        !e.multiline &&
        (["az", "en", "ru"] as const).some((loc) => /[\r\n]/.test(e.defaults[loc])),
    ).map((e) => e.key);

    expect(offenders).toEqual([]);
  });

  it("keeps the 3-line legal address editable as a textarea", () => {
    const addr = SITE_CONTENT_REGISTRY.find((e) => e.key === "about2.team.addrValue");
    expect(addr).toBeDefined();
    expect(addr?.multiline).toBe(true);
    // 3 postal lines in every locale — the shape the About page renders.
    for (const loc of ["az", "en", "ru"] as const) {
      expect(addr!.defaults[loc].split("\n")).toHaveLength(3);
    }
  });

  it("registers the About prose keys so the CMS can actually reach them", () => {
    const keys = new Set(SITE_CONTENT_REGISTRY.map((e) => e.key));
    for (const k of [
      "about2.hero.p2",
      "about2.hero.p3",
      "about2.hero.p4",
      "about2.b1.body",
      "about2.b5.body",
      "about2.v1.body",
      "about2.v4.body",
      "about2.team.title",
      "about2.team.sub",
      "about2.team.body",
      "about2.team.addrLabel",
      "about2.team.addrValue",
    ]) {
      expect(keys, `${k} is not admin-editable`).toContain(k);
    }
  });

  it("has no duplicate keys", () => {
    const keys = SITE_CONTENT_REGISTRY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
