// The general question editor's TRILINGUAL explanation, and the one way it
// could quietly destroy content.
//
// saveQuestion clears a locale whose box was submitted EMPTY. That is correct
// behaviour — it is how an admin removes a translation — and it is also exactly
// how ~2900 live Azerbaijani explanations could vanish: render three boxes, fail
// to pre-fill the az one from the DB, and the first save of any question wipes
// it. So the invariants pinned here are (1) every locale the form can POST is
// pre-filled from the loaded defaults, and (2) the field names are the
// per-locale ones the server reads. A click-through cannot see either.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The form imports the "use server" module for its action and the browser
// Supabase client for the deferred image upload; neither runs in these tests.
vi.mock("@/lib/admin/questions", () => ({
  saveQuestion: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) } }),
}));

import { QuestionForm } from "@/components/QuestionForm";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";

const dict: Record<string, string> = {
  "qfield.explanation": "Explanation",
  "qexpl.perLocaleNote": "Write the explanation in all three languages.",
  "qexpl.emptyFallback": "Empty — the Azerbaijani explanation will be shown.",
};

const taxonomy: QuestionTaxonomy = { topics: [], subtopics: [] };
const options = { subject_id: [], grade_id: [] };

function defaults(explanations: Record<string, string>) {
  return {
    meta: {},
    primary_locale: "az",
    body: "2 + 2 = ?",
    prompt: "",
    explanations,
    options: [],
  };
}

function renderForm(explanations?: Record<string, string>) {
  return render(
    <QuestionForm
      dict={dict}
      options={options}
      taxonomy={taxonomy}
      defaults={explanations ? defaults(explanations) : undefined}
      id={explanations ? "11111111-1111-1111-1111-111111111111" : undefined}
      submitLabel="Save"
      statusText="In review"
    />,
  );
}

const box = (container: HTMLElement, loc: string) =>
  container.querySelector<HTMLTextAreaElement>(`textarea[name="explanation_${loc}"]`);

describe("the editor posts one explanation box per locale", () => {
  it("renders az, en and ru fields with the server's field names", () => {
    const { container } = renderForm();
    for (const loc of ["az", "en", "ru"]) {
      expect(box(container, loc), `explanation_${loc}`).not.toBeNull();
    }
    // The single-field shape is gone: leaving it behind would post BOTH and
    // make which one wins depend on FormData ordering.
    expect(container.querySelector('textarea[name="explanation"]')).toBeNull();
  });

  it("pre-fills EVERY locale from the loaded question", () => {
    const { container } = renderForm({
      az: "2 + 2 = 4",
      en: "Two plus two is four",
      ru: "Два плюс два — четыре",
    });
    expect(box(container, "az")!.value).toBe("2 + 2 = 4");
    expect(box(container, "en")!.value).toBe("Two plus two is four");
    expect(box(container, "ru")!.value).toBe("Два плюс два — четыре");
  });

  // The destructive case: a question that HAS an az explanation but no
  // translations must still open with az filled in, or saving it deletes the
  // only explanation it had.
  it("keeps an existing az explanation visible when en/ru are empty", () => {
    const { container } = renderForm({ az: "2 + 2 = 4", en: "", ru: "" });
    expect(box(container, "az")!.value).toBe("2 + 2 = 4");
    expect(box(container, "en")!.value).toBe("");
    expect(box(container, "ru")!.value).toBe("");
  });

  it("starts empty for a brand-new question", () => {
    const { container } = renderForm();
    for (const loc of ["az", "en", "ru"]) expect(box(container, loc)!.value).toBe("");
  });
});

describe("the az-fallback label", () => {
  // Same honest rule as the student review screen: only claim the Azerbaijani
  // text will be shown when there IS Azerbaijani text.
  it("marks an empty en/ru box when az is filled", () => {
    renderForm({ az: "2 + 2 = 4", en: "", ru: "" });
    expect(screen.getAllByText(dict["qexpl.emptyFallback"])).toHaveLength(2);
  });

  it("says nothing when there is no az explanation to fall back to", () => {
    renderForm({ az: "", en: "", ru: "" });
    expect(screen.queryByText(dict["qexpl.emptyFallback"])).toBeNull();
  });

  it("says nothing about a locale that IS translated", () => {
    renderForm({ az: "2 + 2 = 4", en: "Two plus two is four", ru: "" });
    expect(screen.getAllByText(dict["qexpl.emptyFallback"])).toHaveLength(1);
  });
});
