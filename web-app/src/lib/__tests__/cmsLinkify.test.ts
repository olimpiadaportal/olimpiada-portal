// Bare URLs in admin prose become links — and everything else stays text.
//
// THE THREAT MODEL, because it decides every assertion below. Rendering news
// bodies as HTML would be this product's first raw-HTML sink, and the CSP could
// not contain it: `script-src` carries 'unsafe-inline' for Next hydration, so an
// injected `onerror` handler runs. Supabase auth cookies are not httpOnly, so a
// stored payload is token theft — from a component that serves anonymous
// visitors, a paying parent and a child.
//
// So the linkifier never produces HTML. It produces DATA. The only
// attacker-influenced value that reaches the DOM is an `href`, which is why
// almost every test here is about which URL shapes are REFUSED.
import { describe, expect, it } from "vitest";
import {
  CMS_URL_MAX,
  hasLink,
  isAllowedAbsoluteHttpUrl,
  linkifyLine,
  toInternalPath,
} from "@/lib/cmsLinkify";

const linked = (line: string) =>
  linkifyLine(line).filter((s) => s.href !== undefined);

describe("the ordinary case", () => {
  it("links the URL the owner reported", () => {
    const url =
      "https://olympiq.ai/news/world-mathematics-team-championship-wmtc-azerbaycan-uzre-secim-turu-20-sentyabrd";
    const segs = linked(url);
    expect(segs).toHaveLength(1);
    // Ours, so the href becomes same-origin and relative...
    expect(segs[0].href).toBe(
      "/news/world-mathematics-team-championship-wmtc-azerbaycan-uzre-secim-turu-20-sentyabrd",
    );
    expect(segs[0].external).toBe(false);
    // ...but the visible label is still exactly what the admin typed.
    expect(segs[0].text).toBe(url);
  });

  it("keeps the surrounding sentence intact", () => {
    const segs = linkifyLine("Ətraflı: https://example.com/a burada.");
    expect(segs.map((s) => s.text).join("")).toBe(
      "Ətraflı: https://example.com/a burada.",
    );
    expect(linked("Ətraflı: https://example.com/a burada.")).toHaveLength(1);
  });

  it("links several URLs on one line", () => {
    expect(linked("https://a.com/1 and https://b.com/2")).toHaveLength(2);
  });

  it("marks a foreign host external", () => {
    const [seg] = linked("https://example.com/x");
    expect(seg.external).toBe(true);
    expect(seg.href).toBe("https://example.com/x");
  });

  it("allocates nothing for a line with no URL", () => {
    const segs = linkifyLine("Sadəcə mətn, heç bir keçid yoxdur.");
    expect(segs).toHaveLength(1);
    expect(segs[0].href).toBeUndefined();
  });
});

describe("dangerous schemes stay literal text", () => {
  // Each of these, if it ever reached an href, is script execution or a
  // download in the viewer's session.
  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://olympiq.ai/abc",
    "mailto:a@b.com",
    "tel:+994501234567",
    "ftp://example.com/x",
  ]) {
    it(`refuses ${hostile.slice(0, 28)}`, () => {
      expect(linked(hostile)).toHaveLength(0);
      expect(linked(`Bax: ${hostile} sonra`)).toHaveLength(0);
    });
  }

  it("refuses a javascript: URL smuggled after a valid scheme", () => {
    expect(isAllowedAbsoluteHttpUrl("https://x.com/a://javascript:alert(1)")).toBe(
      false,
    );
  });
});

describe("host trickery is refused", () => {
  it("refuses a mixed-script homograph", () => {
    // Cyrillic а in "аpple.com" — indistinguishable to a reader.
    expect(isAllowedAbsoluteHttpUrl("https://аpple.com")).toBe(false);
  });

  it("refuses userinfo smuggling", () => {
    // A reader sees olympiq.ai; the browser goes to evil.com.
    expect(isAllowedAbsoluteHttpUrl("https://olympiq.ai@evil.com/x")).toBe(false);
  });

  it("refuses a backslash anywhere", () => {
    expect(isAllowedAbsoluteHttpUrl("https://olympiq.ai\\@evil.com")).toBe(false);
  });

  it("refuses an empty or dots-only authority", () => {
    expect(isAllowedAbsoluteHttpUrl("https://")).toBe(false);
    expect(isAllowedAbsoluteHttpUrl("https://...")).toBe(false);
  });

  it("treats the internal host list as EXACT, never a suffix", () => {
    // The whole point: endsWith("olympiq.ai") would make both of these ours.
    expect(toInternalPath("https://evil-olympiq.ai/x")).toBeNull();
    expect(toInternalPath("https://olympiq.ai.attacker.com/x")).toBeNull();
    expect(toInternalPath("https://olympiq.ai/x")).toBe("/x");
    expect(toInternalPath("https://www.olympiq.ai/x")).toBe("/x");
  });

  it("refuses a protocol-relative path derived from our own host", () => {
    // //evil.com is a cross-origin destination wearing a relative-path costume.
    expect(toInternalPath("https://olympiq.ai//evil.com")).toBeNull();
  });
});

describe("boundaries and punctuation", () => {
  it("does not link a URL glued to a preceding word", () => {
    expect(linked("seehttps://example.com")).toHaveLength(0);
  });

  it("links a URL after an opening bracket or quote", () => {
    expect(linked("(https://example.com/a)")).toHaveLength(1);
    expect(linked('"https://example.com/a"')).toHaveLength(1);
  });

  it("drops a trailing full stop but keeps the URL", () => {
    const [seg] = linked("Bax https://example.com/a.");
    expect(seg.href).toBe("https://example.com/a");
  });

  it("keeps a balanced bracket pair inside the URL", () => {
    const [seg] = linked("https://en.wikipedia.org/wiki/Foo_(bar)");
    expect(seg.href).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("releases an unbalanced closing bracket back to the text", () => {
    const segs = linkifyLine("(bax https://example.com/a)");
    expect(segs.map((s) => s.text).join("")).toBe("(bax https://example.com/a)");
    expect(linked("(bax https://example.com/a)")[0].href).toBe(
      "https://example.com/a",
    );
  });

  it("never loses or duplicates a character", () => {
    for (const line of [
      "a https://x.com/1 b https://y.com/2 c",
      "((https://x.com/a))",
      "https://x.com/a, https://y.com/b.",
      "no links here at all",
      "",
    ]) {
      expect(linkifyLine(line).map((s) => s.text).join("")).toBe(line);
    }
  });
});

describe("limits", () => {
  it("refuses a URL past the cap", () => {
    expect(isAllowedAbsoluteHttpUrl("https://x.com/" + "a".repeat(CMS_URL_MAX))).toBe(
      false,
    );
  });

  it("stays linear on a long body with no links", () => {
    // Guards the ReDoS-safety claim the paragraph splitter also makes: this
    // must complete instantly, not degrade.
    const big = "lorem ipsum ".repeat(1600); // ~19k chars
    const started = Date.now();
    expect(hasLink(big)).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("stays linear on a body full of near-misses", () => {
    const big = "http:/not-a-url ".repeat(1200);
    const started = Date.now();
    expect(hasLink(big)).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("markup is never interpreted", () => {
  it("leaves HTML as literal text", () => {
    const line = '<img src=x onerror=alert(1)> and <script>alert(1)</script>';
    const segs = linkifyLine(line);
    expect(segs).toHaveLength(1);
    expect(segs[0].href).toBeUndefined();
    expect(segs[0].text).toBe(line);
  });

  it("does not parse markdown link syntax", () => {
    // Documented v1 limit: bare URLs only. The URL inside still links; the
    // brackets stay visible text.
    const segs = linkifyLine("[label](https://example.com/a)");
    expect(segs.map((s) => s.text).join("")).toBe("[label](https://example.com/a)");
  });

  it("produces no html field on any segment", () => {
    // Structural: nothing in this module may ever hand a caller markup.
    for (const seg of linkifyLine("x https://a.com/1 y")) {
      expect(Object.keys(seg).every((k) => ["text", "href", "external"].includes(k))).toBe(
        true,
      );
    }
  });
});
