// THE PUBLIC SUBJECT CATALOG COMES FROM THE DATABASE, NOT FROM A LITERAL.
//
// WHY THIS TEST EXISTS. The owner reported "I can create and publish a subject
// in the Admin Panel but it does not appear on the website", and /subjects —
// the page the landing hero's browse CTA points at — was the literal answer: a
// four-item array of i18n keys with no query in the file at all. Two of those
// four keys ("subject.science", "subject.logic") named subjects that do not
// exist as codes; the live rows behind them are `elm` and `az_language`.
//
// So the assertions below pin the two halves that can regress independently:
//
//   * the page RENDERS what the catalog returns, and only the PUBLISHED rows.
//     `subjects.status` is a purely client-side filter here (policy
//     subjects_select is USING (true), so anon reads archived rows too), which
//     is precisely the kind of filter that goes missing — it went missing on
//     four sibling surfaces before this round;
//   * the page does NOT read `subjects_pricing`. That is the tempting
//     "consistency" change, and it is the bug: a price answers "is it
//     sellable", not "does it exist", and keying on it hid three of the seven
//     live subjects from the child arena until lib/childSubjects.ts stopped
//     doing it.
//
// The sibling that lives on a page too heavy to render here (parent analytics)
// is asserted at source level, in the style of lib/__tests__/reinstateSubject.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const MATH = "11111111-1111-4111-8111-111111111111";
const LOGIC = "22222222-2222-4222-8222-222222222222";
const KIMYA = "33333333-3333-4333-8333-333333333333";
const ARCHIVED = "44444444-4444-4444-8444-444444444444";
const HIDDEN = "55555555-5555-4555-8555-555555555555";

type SubjectRow = { id: string; code: string | null; name: string; status: string };

/**
 * A catalog with every case that matters: two labelled subjects, one PUBLISHED
 * subject whose slugified code has no `subj.*` key and that nobody has priced
 * (the state every newly created subject starts in), one archived and one
 * hidden.
 */
const CATALOG: SubjectRow[] = [
  { id: MATH, code: "math", name: "Riyaziyyat", status: "active" },
  { id: LOGIC, code: "az_language", name: "Məntiq", status: "active" },
  { id: KIMYA, code: "kimya", name: "Kimya", status: "active" },
  { id: ARCHIVED, code: "kohne", name: "Köhnə fənn", status: "archived" },
  { id: HIDDEN, code: "gizli", name: "Gizli fənn", status: "inactive" },
];

const DICT: Record<string, string> = {
  "subjects.title": "Fənlər",
  "subjects.lead": "Övladınıza lazım olan fənləri seçin.",
  "subjects.note": "Qiymət hər fənn və hər uşaq üzrədir.",
  "cfg.noSubjects": "Hazırda satışda olan fənn yoxdur.",
  "subj.math": "Riyaziyyat",
  "subj.az_language": "Məntiq",
};

/** Tables the page touched during one render — the pricing assertion reads it. */
let touched: string[] = [];

/** Query builder that ACTUALLY APPLIES `.eq()`, so "archived never renders" is
 *  a real assertion rather than a restatement of the fixture. */
function fakeClient(rows: SubjectRow[]) {
  return {
    from(table: string) {
      touched.push(table);
      let out: Record<string, unknown>[] = table === "subjects" ? [...rows] : [];
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: (col: string, val: unknown) => {
          out = out.filter((r) => r[col] === val);
          return b;
        },
        order: () => b,
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve({ data: out, error: null }).then(ok, err),
      });
      return b;
    },
  };
}

/** The failure path: the catalog read errors and the page must still paint. */
function failingClient(error: unknown) {
  return {
    from(table: string) {
      touched.push(table);
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        order: () => b,
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error }).then(ok),
      });
      return b;
    },
  };
}

let catalog: SubjectRow[] = CATALOG;
let readError: unknown = null;

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/server", () => ({
  getT: vi.fn(async () => (key: string) => DICT[key] ?? key),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () =>
    readError ? failingClient(readError) : fakeClient(catalog),
  ),
}));

const SubjectsPage = (await import("@/app/(public)/subjects/page")).default;

async function render(): Promise<string> {
  return renderToStaticMarkup(await SubjectsPage());
}

beforeEach(() => {
  touched = [];
  catalog = CATALOG;
  readError = null;
});

describe("/subjects renders the admin's catalog", () => {
  it("shows every PUBLISHED subject, including one nobody has priced yet", async () => {
    const html = await render();
    expect(html).toContain("Riyaziyyat");
    expect(html).toContain("Məntiq");
    // The whole point of not reading `subjects_pricing`: a subject created
    // minutes ago has no price row and must still be listed here.
    expect(html).toContain("Kimya");
  });

  it("never shows an archived or hidden subject", async () => {
    const html = await render();
    expect(html).not.toContain("Köhnə fənn");
    expect(html).not.toContain("Gizli fənn");
  });

  it("reads `subjects` and never `subjects_pricing`", async () => {
    await render();
    expect(touched).toContain("subjects");
    expect(touched).not.toContain("subjects_pricing");
  });

  it("labels through subj.<code>, falling back to the DB name for a new code", async () => {
    const html = await render();
    // az_language IS Məntiq — the code is legacy and lies, and the label map is
    // the only thing that keeps it readable. A surface printing `code` would
    // show "az_language" to a visitor.
    expect(html).toContain("Məntiq");
    expect(html).not.toContain("az_language");
    // "kimya" has no subj.* entry (codes are slugified on create), so the raw
    // catalog name is the fallback — never a bare i18n key.
    expect(html).not.toContain("subj.kimya");
  });

  it("sorts on the resolved label, not on the raw Azerbaijani name", async () => {
    const html = await render();
    expect(html.indexOf("Kimya")).toBeLessThan(html.indexOf("Riyaziyyat"));
  });

  it("degrades to the empty notice instead of throwing when the read fails", async () => {
    readError = { message: "boom" };
    const html = await render();
    expect(html).toContain(DICT["cfg.noSubjects"]);
    // The page's own copy still renders — a failed catalog is not a blank page.
    expect(html).toContain(DICT["subjects.title"]);
  });

  it("shows the empty notice when the admin has published nothing", async () => {
    catalog = [CATALOG[3], CATALOG[4]];
    expect(await render()).toContain(DICT["cfg.noSubjects"]);
  });
});

describe("no hardcoded subject list survives on the public catalog page", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "..", "app", "(public)", "subjects", "page.tsx"),
    "utf8",
  );

  it("renders no `subject.*` marketing key any more", () => {
    // The call form, not the bare string: the header comment names the four
    // retired keys on purpose, and a test that forbade mentioning them would
    // forbid explaining them.
    expect(source).not.toMatch(/t\(\s*["'`]subject\./);
  });

  it("filters on the subject's OWN status", () => {
    expect(source).toContain('.eq("status", "active")');
  });
});

describe("the parent analytics subject tabs read subjects.status too", () => {
  // The sibling that survived three earlier fixes: `.eq("status","active")` on
  // this query filters the PRICING row, so an archived subject with live price
  // rows stayed a tab. Source-level because the page is a full parent dashboard
  // read; what can regress is the deletion of two lines, which is visible here.
  const source = readFileSync(
    resolve(__dirname, "..", "..", "app", "(parent)", "analytics", "page.tsx"),
    "utf8",
  );

  it("selects the subject's status alongside the price row", () => {
    expect(source).toContain("subjects(id, code, name, status)");
  });

  it("skips a subject that is not published", () => {
    expect(source).toContain('s?.status !== "active"');
  });
});
