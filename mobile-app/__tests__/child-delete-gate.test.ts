// Deleting a child is the one parent action in this app that cannot be undone,
// and four of its properties are the kind that break silently — the screen keeps
// rendering, the button keeps working, and only the wrong family finds out.
// Pinned SOURCE-LEVEL, the idiom of entitlement-visibility.test.ts: rendering
// the screen would need a component renderer this project does not depend on,
// and these are properties of the diff — a regression belongs in review.
//
//   1. THE ACTION IS OFFERED ONLY TO THE CREATING PARENT. `students_select`
//      shows a child to a merely LINKED parent too, but `students_write` and the
//      web `deleteChild` action both require the CREATOR: for anyone else the
//      web button returns having deleted nothing. A button that quietly does
//      nothing is worse than no button.
//   2. THE GATE'S INPUT IS ACTUALLY FETCHED. Drop the column from the children
//      read and `undefined !== profileId` hides the action from EVERYONE — a
//      feature that silently disappears, with no error anywhere.
//   3. ONE TAP, ONE DELETE. No second request while the first is deciding.
//   4. NO SERVER TEXT REACHES THE PARENT. The BFF answers with i18n KEYS; the
//      screen translates them and never renders a raw string.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", ...parts), "utf8");

const EDIT = read("src", "app", "(parent)", "children", "[id]", "edit.tsx");
const DATA = read("src", "lib", "data.ts");
const API = read("src", "lib", "api.ts");

/** The danger-zone component ONLY — bounded at both ends, so a match can never
 *  come from the edit form above it or the screen below it. */
const zone = EDIT.slice(
  EDIT.indexOf("function DeleteChild"),
  EDIT.indexOf("export default function EditChildScreen"),
);

describe("delete-child action", () => {
  it("is a component at all (the slice above means nothing otherwise)", () => {
    expect(EDIT).toContain("function DeleteChild");
    expect(EDIT).toContain("<DeleteChild child={child} />");
    expect(zone.length).toBeGreaterThan(0);
  });

  it("renders nothing unless the signed-in parent CREATED this child", () => {
    expect(zone).toMatch(/created_by_parent_profile_id !== \w+\)\s*return null;/);
  });

  it("fetches the column that gate reads", () => {
    const select = DATA.slice(DATA.indexOf("export async function fetchChildren"));
    expect(select).toMatch(/\.select\([\s\S]{0,400}created_by_parent_profile_id/);
    expect(DATA).toContain("created_by_parent_profile_id: string | null;");
  });

  it("guards against a double submit and against dismissing a request in flight", () => {
    expect(zone.match(/if \(pending\) return;/g) ?? []).toHaveLength(2);
  });

  it("goes through the BFF helper — no hand-rolled fetch, no service role", () => {
    expect(zone).toContain("bffDeleteChild(child.profile_id)");
    expect(zone).not.toContain("fetch(");
    // Bearer-authenticated: the endpoint resolves the parent from the token.
    const helper = API.slice(API.indexOf("export const bffDeleteChild"));
    expect(helper).toContain("bffAuthedPost");
    expect(helper).toContain("/delete");
  });

  it("shows the server's i18n KEY translated, never a raw server string", () => {
    expect(zone).toContain("setError(t(res.error))");
    expect(zone).not.toMatch(/setError\(res\.error\)/);
  });
});
