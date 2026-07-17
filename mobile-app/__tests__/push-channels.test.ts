import { PUSH_CHANNELS, channelIdForCategory } from "@/features/push/channels";
import { mobileMessages } from "@/i18n/messages.mobile";

describe("push channel map (processor sends channelId = category)", () => {
  it("covers default + the 5 engine categories with stable ids", () => {
    expect(PUSH_CHANNELS.map((c) => c.id)).toEqual([
      "default",
      "olympiad",
      "progress",
      "billing",
      "announcement",
      "news",
    ]);
  });

  it("maps each known category onto itself", () => {
    for (const id of ["olympiad", "progress", "billing", "announcement", "news"]) {
      expect(channelIdForCategory(id)).toBe(id);
    }
  });

  it("falls back to default for unknown/empty categories", () => {
    expect(channelIdForCategory("something-new")).toBe("default");
    expect(channelIdForCategory("")).toBe("default");
    expect(channelIdForCategory(null)).toBe("default");
    expect(channelIdForCategory(undefined)).toBe("default");
  });

  it("keeps announcement + olympiad time-sensitive (HIGH), the rest DEFAULT", () => {
    const importance = Object.fromEntries(PUSH_CHANNELS.map((c) => [c.id, c.importance]));
    expect(importance.announcement).toBe("high");
    expect(importance.olympiad).toBe("high");
    expect(importance.default).toBe("default");
    expect(importance.progress).toBe("default");
    expect(importance.billing).toBe("default");
    expect(importance.news).toBe("default");
  });

  it("every channel name key exists in all three locales", () => {
    for (const c of PUSH_CHANNELS) {
      for (const locale of ["az", "en", "ru"] as const) {
        expect(mobileMessages[locale][c.nameKey]).toBeTruthy();
      }
    }
  });
});
