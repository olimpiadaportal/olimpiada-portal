import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { clampLocale, createT } from "@/i18n";

describe("createT resolution chain", () => {
  it("CMS override wins, then overlay, then catalog, then az, then the key", () => {
    const t = createT("en", { "nav.home": "Overridden Home" });
    expect(t("nav.home")).toBe("Overridden Home");
    // Mobile overlay key (exists in all locales).
    expect(t("mob.retry")).toBe("Try again");
    // Synced web catalog key.
    expect(t("auth.tab.parent").length).toBeGreaterThan(0);
    // Unknown key falls through to itself.
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("empty override values do not shadow the catalog", () => {
    const t = createT("az", { "nav.home": "" });
    expect(t("nav.home")).not.toBe("");
  });

  it("az catalog backs missing locale entries", () => {
    const t = createT("ru");
    // Every real key resolves to SOMETHING non-empty in ru or az.
    expect(t("parent.auth.login").length).toBeGreaterThan(0);
  });
});

// The chain above ends by returning the key itself, so a key that was never
// added compiles, builds and ships as visible text ("poly.buyFor" on a button).
// Only a sweep catches it — run the same script `npm run check-i18n` runs so a
// plain `npm test` fails on the next one.
describe("i18n key sweep", () => {
  it(
    "every t(\"literal\") key used in src/ exists in az, en and ru",
    () => {
      const script = join(__dirname, "..", "scripts", "check-i18n-keys.mjs");
      let out = "";
      try {
        out = execFileSync(process.execPath, [script], { encoding: "utf8", stdio: "pipe" });
      } catch (err) {
        // Surface the script's own report — it names every offending key and site.
        const e = err as { stdout?: string; stderr?: string };
        throw new Error(`${e.stderr ?? ""}${e.stdout ?? ""}`.trim() || String(err));
      }
      expect(out).toContain("all resolve");
    },
    30000,
  );
});

describe("clampLocale", () => {
  it("keeps a supported candidate", () => {
    expect(clampLocale("ru", ["az", "ru"], "az")).toBe("ru");
  });
  it("falls back to the admin default when unsupported", () => {
    expect(clampLocale("en", ["az", "ru"], "az")).toBe("az");
  });
  it("survives garbage", () => {
    expect(clampLocale("xx", [], "yy")).toBe("az");
    expect(clampLocale(null, ["ru"], "en")).toBe("ru");
  });
});
