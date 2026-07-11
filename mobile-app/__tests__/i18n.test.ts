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
