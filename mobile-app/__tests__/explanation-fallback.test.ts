// Locks in the rules that keep the "Azerbaijani only" label HONEST, and keeps
// mobile labelling IDENTICALLY to web — the same attempt must never read as
// translated on the phone and untranslated in the browser.
//
// The label exists because question_explanations holds az rows only today
// (az 2897 / en 0 / ru 0), so get_test_review's locale→az coalesce serves
// Azerbaijani text to an EN/RU reader. Getting the label wrong in the other
// direction — stamping "Azerbaijani only" onto an explanation that IS
// translated — would be a worse bug than the silence it replaces, which is why
// a visible az row is required before anything is labelled.
import { fallbackExplanationIds } from "@/lib/explanationFallback";

const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const Q3 = "33333333-3333-4333-8333-333333333333";

describe("fallbackExplanationIds", () => {
  it("labels a question that has az but not the reader's locale", () => {
    const ids = fallbackExplanationIds([{ question_id: Q1, locale: "az" }], "en", [Q1]);
    expect([...ids]).toEqual([Q1]);
  });

  it("leaves a translated question alone", () => {
    const ids = fallbackExplanationIds(
      [
        { question_id: Q1, locale: "az" },
        { question_id: Q1, locale: "en" },
      ],
      "en",
      [Q1],
    );
    expect(ids.size).toBe(0);
  });

  it("keeps the locales apart — a ru row does not satisfy an en reader", () => {
    const ids = fallbackExplanationIds(
      [
        { question_id: Q1, locale: "az" },
        { question_id: Q1, locale: "ru" },
      ],
      "en",
      [Q1],
    );
    expect([...ids]).toEqual([Q1]);
  });

  it("stays silent when even the az row is invisible (RLS-hidden question)", () => {
    // An archived question's explanations are hidden from a student by
    // qexpl_select, so NO rows come back. That must not be read as
    // "untranslated" — it is "we cannot tell".
    expect(fallbackExplanationIds([], "en", [Q1]).size).toBe(0);
    expect(fallbackExplanationIds(null, "ru", [Q1]).size).toBe(0);
    expect(fallbackExplanationIds(undefined, "ru", [Q1]).size).toBe(0);
  });

  it("never labels anything for an Azerbaijani reader", () => {
    // az IS the fallback, so there is nothing to disclose. This is also the
    // branch that skips the extra query entirely in fetchTestReview.
    const ids = fallbackExplanationIds([{ question_id: Q1, locale: "az" }], "az", [Q1]);
    expect(ids.size).toBe(0);
  });

  it("only considers the candidates it was given", () => {
    // Candidates are the questions whose payload actually carries an
    // explanation; a question with no explanation has no label to earn.
    const rows = [
      { question_id: Q1, locale: "az" },
      { question_id: Q2, locale: "az" },
      { question_id: Q3, locale: "az" },
      { question_id: Q3, locale: "ru" },
    ];
    const ids = fallbackExplanationIds(rows, "ru", [Q2, Q3]);
    expect([...ids]).toEqual([Q2]);
  });

  it("ignores malformed rows instead of throwing", () => {
    const ids = fallbackExplanationIds(
      [
        { question_id: null, locale: "az" },
        { locale: "en" },
        { question_id: Q1, locale: "az" },
      ],
      "en",
      [Q1],
    );
    expect([...ids]).toEqual([Q1]);
  });
});
