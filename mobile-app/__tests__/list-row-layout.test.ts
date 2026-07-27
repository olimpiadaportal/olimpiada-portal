// Round 52 — ListRow's trailing-slot rules. The owner's bug was a long school
// name ellipsized to one line in Profile → School Information; the fix adds an
// opt-in `valueWrap` mode. These tests pin the two invariants that make the
// opt-in safe for the 24 existing call sites: `trailing` still wins over
// `value`, and the chevron rule never learns about `valueWrap`.
import {
  listRowA11yLabel,
  listRowIconAlignSelf,
  listRowShowChevron,
  listRowValueMode,
  type ListRowValueMode,
} from "@/components/listRowLayout";

const SWITCH = { $$typeof: Symbol.for("react.element") };
const LONG_SCHOOL = "Bakı şəhəri Yasamal rayonu 132 nömrəli tam orta məktəb";
const NO_SPACES = "Bakışəhəriyasamalrayonu132nömrəlitamortaməktəbfilialı";

describe("listRowValueMode", () => {
  it("stacks the value only when the caller opts in", () => {
    const input = { trailing: undefined, value: LONG_SCHOOL };
    expect(listRowValueMode({ ...input, valueWrap: true })).toBe("stacked");
    expect(listRowValueMode({ ...input, valueWrap: false })).toBe("inline");
  });

  it("defaults to the historical inline cell when valueWrap is omitted", () => {
    // The prop is optional; an undefined value must never stack.
    expect(listRowValueMode({ trailing: undefined, value: "12", valueWrap: undefined })).toBe(
      "inline",
    );
  });

  it("reports no trailing content when there is no value", () => {
    expect(listRowValueMode({ trailing: undefined, value: undefined, valueWrap: false })).toBe(
      "none",
    );
    // valueWrap alone must not invent a value cell out of nothing.
    expect(listRowValueMode({ trailing: undefined, value: undefined, valueWrap: true })).toBe(
      "none",
    );
  });

  it("INVARIANT: `trailing` wins over `value`, wrapped or not", () => {
    // AccountSheet's biometric app-lock row passes a Switch via `trailing`.
    expect(listRowValueMode({ trailing: SWITCH, value: undefined, valueWrap: false })).toBe(
      "custom",
    );
    expect(listRowValueMode({ trailing: SWITCH, value: LONG_SCHOOL, valueWrap: true })).toBe(
      "custom",
    );
  });

  it("treats an explicit `trailing={null}` as given, like the original ternary", () => {
    expect(listRowValueMode({ trailing: null, value: "12", valueWrap: false })).toBe("custom");
  });

  it("keeps an empty-string value as a real (empty) cell, not `none`", () => {
    // `value=""` is falsy but defined — the original `value !== undefined`
    // check rendered an empty cell, so the layout must not change.
    expect(listRowValueMode({ trailing: undefined, value: "", valueWrap: false })).toBe("inline");
    expect(listRowValueMode({ trailing: undefined, value: "", valueWrap: true })).toBe("stacked");
  });
});

describe("listRowShowChevron", () => {
  it("shows a chevron for a pressable row by default", () => {
    expect(listRowShowChevron({ trailing: undefined, chevron: undefined, onPress: () => {} })).toBe(
      true,
    );
  });

  it("hides it for a static row", () => {
    // The three SchoolInfoCard rows: no onPress, no chevron.
    expect(listRowShowChevron({ trailing: undefined, chevron: undefined, onPress: undefined })).toBe(
      false,
    );
  });

  it("lets an explicit `chevron` override the onPress default in both directions", () => {
    expect(listRowShowChevron({ trailing: undefined, chevron: false, onPress: () => {} })).toBe(
      false,
    );
    expect(listRowShowChevron({ trailing: undefined, chevron: true, onPress: undefined })).toBe(
      true,
    );
  });

  it("INVARIANT: any `trailing` suppresses the chevron", () => {
    expect(listRowShowChevron({ trailing: SWITCH, chevron: true, onPress: () => {} })).toBe(false);
    expect(listRowShowChevron({ trailing: null, chevron: true, onPress: () => {} })).toBe(false);
  });
});

describe("listRowIconAlignSelf", () => {
  it("top-aligns the 36pt icon chip only on a stacked row", () => {
    expect(listRowIconAlignSelf("stacked")).toBe("flex-start");
  });

  it("leaves every other mode untouched, so existing rows stay centred", () => {
    const others: ListRowValueMode[] = ["inline", "custom", "none"];
    for (const mode of others) {
      // `undefined` means "no alignSelf written at all" in RN.
      expect(listRowIconAlignSelf(mode)).toBeUndefined();
    }
  });
});

describe("listRowA11yLabel", () => {
  const base = { accessibilityLabel: undefined, subtitle: undefined, value: undefined };

  it("reads the title alone", () => {
    expect(listRowA11yLabel({ ...base, title: "Çıxış", mode: "none" })).toBe("Çıxış");
  });

  it("appends the subtitle, unchanged", () => {
    expect(
      listRowA11yLabel({
        ...base,
        title: "Telefon",
        subtitle: "Bildirişlər üçün",
        mode: "none",
      }),
    ).toBe("Telefon. Bildirişlər üçün");
  });

  it("speaks an inline value too — grouping merges it away, so it is NOT read on its own", () => {
    // A Pressable is `accessible` by default: every child collapses into one
    // node whose accessibilityLabel wins. A value omitted here is inaudible.
    expect(
      listRowA11yLabel({ ...base, title: "Bildirişlər", value: "12", mode: "inline" }),
    ).toBe("Bildirişlər. 12");
  });

  it("DOES speak a stacked value, which lives inside the row's own text column", () => {
    expect(
      listRowA11yLabel({ ...base, title: "Məktəb", value: LONG_SCHOOL, mode: "stacked" }),
    ).toBe(`Məktəb. ${LONG_SCHOOL}`);
  });

  it("never speaks a value that `trailing` suppressed — it is not on screen", () => {
    expect(
      listRowA11yLabel({ ...base, title: "Barmaq izi", value: LONG_SCHOOL, mode: "custom" }),
    ).toBe("Barmaq izi");
  });

  it("the non-pressable SchoolInfoCard row is grouped with the same label", () => {
    // ListRow wraps a stacked row in `accessible` + this label so TalkBack
    // announces "label. value" instead of two unrelated focus stops.
    expect(
      listRowA11yLabel({ ...base, title: "Məktəb", value: LONG_SCHOOL, mode: "stacked" }),
    ).toBe(`Məktəb. ${LONG_SCHOOL}`);
  });

  it("orders title, subtitle then stacked value", () => {
    expect(
      listRowA11yLabel({
        accessibilityLabel: undefined,
        title: "Məktəb",
        subtitle: "Profil məlumatı",
        value: NO_SPACES,
        mode: "stacked",
      }),
    ).toBe(`Məktəb. Profil məlumatı. ${NO_SPACES}`);
  });

  it("never duplicates an em-dash placeholder into the label as noise", () => {
    // A missing school renders "—"; it is still spoken (the row is not empty),
    // but the composition must stay a single clean sentence.
    expect(listRowA11yLabel({ ...base, title: "Şəhər", value: "—", mode: "stacked" })).toBe(
      "Şəhər. —",
    );
  });

  it("an explicit accessibilityLabel still overrides everything", () => {
    expect(
      listRowA11yLabel({
        accessibilityLabel: "Profilə keç",
        title: "Məktəb",
        subtitle: "Profil məlumatı",
        value: LONG_SCHOOL,
        mode: "stacked",
      }),
    ).toBe("Profilə keç");
  });
});
