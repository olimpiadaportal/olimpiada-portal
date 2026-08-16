// Curriculum name resolution (migration 114). Every localized topic/subtopic
// label in the app goes through pickName — the setup picker, the runner header,
// and by extension anything that renders those names — so a bug here is a bug
// on every one of those screens at once.
//
// The rule under test is deliberately asymmetric: topics.name is the AZ source
// of truth and topic_translations carries EN/RU only (a DB CHECK forbids an
// `az` row), so an Azerbaijani reader legitimately finds NO row and must still
// get a name.
import { pickName } from "@/lib/localizedName";

describe("pickName", () => {
  it("returns the row matching the reader's locale", () => {
    const rows = [
      { locale: "en", name: "Natural numbers" },
      { locale: "ru", name: "Натуральные числа" },
    ];
    expect(pickName(rows, "en", "Natural ədədlər")).toBe("Natural numbers");
    expect(pickName(rows, "ru", "Natural ədədlər")).toBe("Натуральные числа");
  });

  it("falls back to the AZ base name when the locale has no row", () => {
    // The normal path for an az reader: translations hold en/ru only.
    expect(pickName([{ locale: "en", name: "Fractions" }], "az", "Kəsrlər")).toBe(
      "Kəsrlər",
    );
    // And the gap case: a topic translated to en but not yet to ru.
    expect(pickName([{ locale: "en", name: "Fractions" }], "ru", "Kəsrlər")).toBe(
      "Kəsrlər",
    );
  });

  it("treats no translations at all as the AZ name", () => {
    expect(pickName([], "en", "Kəsrlər")).toBe("Kəsrlər");
    expect(pickName(null, "en", "Kəsrlər")).toBe("Kəsrlər");
    expect(pickName(undefined, "ru", "Kəsrlər")).toBe("Kəsrlər");
  });

  it("never lets a blank translation shadow the AZ name", () => {
    // ck_*_name_not_blank rejects these in the database, but a legacy or
    // half-written row must never render a topic as an empty label.
    expect(pickName([{ locale: "en", name: "" }], "en", "Kəsrlər")).toBe("Kəsrlər");
    expect(pickName([{ locale: "en", name: "   " }], "en", "Kəsrlər")).toBe("Kəsrlər");
    expect(pickName([{ locale: "en", name: null }], "en", "Kəsrlər")).toBe("Kəsrlər");
  });

  it("trims the translated name it returns", () => {
    expect(pickName([{ locale: "ru", name: "  Дроби  " }], "ru", "Kəsrlər")).toBe(
      "Дроби",
    );
  });

  it("ignores rows for other locales and malformed rows", () => {
    const rows = [
      { locale: null, name: "orphan" },
      { name: "no locale" },
      { locale: "ru", name: "Дроби" },
    ];
    expect(pickName(rows, "en", "Kəsrlər")).toBe("Kəsrlər");
    expect(pickName(rows, "ru", "Kəsrlər")).toBe("Дроби");
  });
});
