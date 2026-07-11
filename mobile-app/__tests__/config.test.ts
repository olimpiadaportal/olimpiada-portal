import {
  compareSemver,
  evaluateVersionGate,
  parseMobileConfig,
} from "@/lib/mobileConfig";

describe("parseMobileConfig", () => {
  it("parses a full server payload", () => {
    const cfg = parseMobileConfig({
      payment: { mode: "giveaway", giveaway_ends_at: "2026-08-01T00:00:00Z" },
      flags: {
        news_public: true,
        olympiad_module: true,
        leaderboard: true,
        notifications: true,
        notifications_push: false,
        launch_promo: true,
      },
      maintenance: { on: false, message: { az: "a", en: "b", ru: "c" } },
      locales: { supported: ["az", "ru"], default: "az" },
      contact: { email: "x@y.z", phone: "+994" },
      social: { facebook: "f", instagram: "i", youtube: "y", tiktok: "t" },
      version: {
        ios: { min: "1.2.0", latest: "1.3.0", force: true, store_url: "https://apple", message: { az: "", en: "", ru: "" } },
        android: { min: "1.0.0", latest: "1.3.0", force: false, store_url: "", message: { az: "", en: "", ru: "" } },
      },
    });
    expect(cfg.payment.mode).toBe("giveaway");
    expect(cfg.payment.giveawayEndsAt).toBe("2026-08-01T00:00:00Z");
    expect(cfg.flags.olympiadModule).toBe(true);
    expect(cfg.flags.notificationsPush).toBe(false);
    expect(cfg.locales.supported).toEqual(["az", "ru"]);
    expect(cfg.version.ios.force).toBe(true);
  });

  it("degrades garbage to the safe side", () => {
    const cfg = parseMobileConfig(null);
    expect(cfg.payment.mode).toBe("off");
    expect(cfg.flags.newsPublic).toBe(false);
    expect(cfg.flags.leaderboard).toBe(false);
    expect(cfg.maintenance.on).toBe(false);
    expect(cfg.locales.supported).toEqual(["az", "en", "ru"]);
    expect(cfg.locales.default).toBe("az");
    expect(cfg.version.android.force).toBe(false);
  });

  it("never trusts an unknown payment mode", () => {
    expect(parseMobileConfig({ payment: { mode: "free-for-all" } }).payment.mode).toBe("off");
  });
});

describe("compareSemver", () => {
  it("orders versions numerically", () => {
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("evaluateVersionGate", () => {
  const base = parseMobileConfig({
    version: {
      ios: { min: "1.2.0", latest: "1.4.0", force: true, store_url: "https://s", message: { az: "m", en: "", ru: "" } },
      android: { min: "1.2.0", latest: "1.4.0", force: false, store_url: "", message: { az: "", en: "", ru: "" } },
    },
  });

  it("force-blocks only below min AND when force is on", () => {
    expect(evaluateVersionGate(base, "ios", "1.1.0").forceUpdate).toBe(true);
    expect(evaluateVersionGate(base, "ios", "1.2.0").forceUpdate).toBe(false);
    // Android: same version spread but force flag off → never a dead end.
    expect(evaluateVersionGate(base, "android", "0.9.0").forceUpdate).toBe(false);
  });

  it("signals a soft update below latest", () => {
    expect(evaluateVersionGate(base, "ios", "1.3.0").updateAvailable).toBe(true);
    expect(evaluateVersionGate(base, "ios", "1.4.0").updateAvailable).toBe(false);
  });
});
