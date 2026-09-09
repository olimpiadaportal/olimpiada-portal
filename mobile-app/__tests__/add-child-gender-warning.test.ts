// MOBILE SHARES THE WEB'S ADD-CHILD CORE, SO IT SHARED THE WEB'S SILENT LOSS.
//
// `/api/mobile/v1/children` is a thin wrapper over childAccountService.
// createChild — the same RPC, the same saga, and the same follow-up write for
// the optional gender (migration 169), which happens AFTER the provisioning
// transaction because create_child_account's 11-arg signature cannot carry it.
// When that write failed, the route answered 200 with a student id, this screen
// showed the party popper and the 8-digit ID, and the answer the parent gave
// became a NULL that reads as "nobody has been asked" — the one distinction
// migration 169 exists to keep.
//
// The core now returns `warnings`. That fixes nothing here on its own: an
// envelope field nobody reads is the same silence with extra steps. What is
// pinned below is the rest of the path — the route forwards it, the client type
// declares it, the screen keeps it, and the screen SHOWS it in every phase it
// can be pending in, not only on the one the happy path ends on.
//
// Pinned SOURCE-LEVEL (the child-gender-optional.test.ts idiom): rendering this
// screen needs a component renderer this project does not depend on, and these
// are properties of the diff.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (...parts: string[]) => readFileSync(resolve(__dirname, "..", ...parts), "utf8");

const API = read("src", "lib", "api.ts");
const SCREEN = read("src", "app", "(parent)", "add-child.tsx");
const MESSAGES = read("src", "i18n", "messages.generated.ts");

/** The web-app BFF this app posts to — the other half of the contract. */
const CREATE_ROUTE = readFileSync(
  resolve(__dirname, "..", "..", "web-app", "src", "app", "api", "mobile", "v1", "children", "route.ts"),
  "utf8",
);

/** Comments stripped: every rule below is also NAMED in the prose that warns
 *  against breaking it, so a match must come from code. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const WARNING_KEY = "addchild.warn.genderNotSaved";
const LOCALES = 3; // az / en / ru

describe("add-child — a partial save reaches the parent", () => {
  it("the BFF puts the warnings in the SUCCESS envelope", () => {
    // Not in the error branch: the child exists, and a 400 would tell the app
    // to keep the parent on the form and let them create a second child.
    expect(code(CREATE_ROUTE)).toContain("warnings: result.warnings");
  });

  it("the client declares the field, so dropping it stops compiling", () => {
    const call = code(API).slice(code(API).indexOf("export const bffAddChild"));
    expect(call.slice(0, call.indexOf(");"))).toMatch(/warnings\?:\s*string\[\]/);
  });

  it("the screen keeps what the server sent", () => {
    expect(code(SCREEN)).toContain("setWarnings(res.data?.warnings ?? [])");
  });

  it("the screen renders them OUTSIDE every phase branch", () => {
    // THE REGRESSION THIS PINS. The block used to sit inside the
    // `phase === "done"` branch — "on the success card because it is a
    // success" — which is true of the path that reaches it and silent on the
    // path that does not: in the free flow `bffAddChild` succeeds (child
    // created, warnings set) and `bffActivateFree` can then fail, which
    // returns early and leaves the wizard on "info". The parent saw a grant
    // error, retried, and was never told the gender answer had been dropped.
    // The web wizard renders the same warning outside its step body for this
    // exact reason (web-app/src/components/AddChildWizard.tsx); mobile matches
    // that decision rather than inventing a second rule.
    //
    // The pin: the render must come BEFORE the first phase branch opens, which
    // is only possible if it is nested inside none of them.
    expect(code(SCREEN).indexOf("<ScreenScroll")).toBeGreaterThan(-1);
    const RENDER = code(SCREEN).slice(code(SCREEN).indexOf("<ScreenScroll"));
    const info = RENDER.indexOf('{phase === "info" ? (');
    const done = RENDER.indexOf('{phase === "done" ? (');
    const warn = RENDER.indexOf("warnings.map(");
    expect(info).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(info);
    expect(warn).toBeGreaterThan(-1);
    expect(warn).toBeLessThan(info);
  });

  it("renders them exactly once, so the Done phase cannot show them twice", () => {
    // Moving the block out and leaving a copy behind is the other way to be
    // wrong: on "done" the parent would read the same sentence twice.
    expect(code(SCREEN).match(/warnings\.map\(/g)).toHaveLength(1);
  });

  it("renders them localized, not as raw keys", () => {
    // `t(w)` and not `{w}`: the server sends i18n KEYS, and a raw key on screen
    // is a different way of telling the parent nothing.
    const RENDER = code(SCREEN).slice(code(SCREEN).indexOf("<ScreenScroll"));
    const at = RENDER.indexOf("warnings.map(");
    expect(at).toBeGreaterThan(-1);
    // Bounded at the map's own closing `))}` so a `{t(...)}` elsewhere on the
    // screen — there are dozens — cannot satisfy this.
    expect(RENDER.slice(at, RENDER.indexOf("))}", at))).toMatch(/\{t\(w\)\}/);
  });

  it('"add another child" clears them', () => {
    // Otherwise the second child inherits the first one's warning and the
    // parent edits a profile that was saved correctly.
    const reset = code(SCREEN).slice(code(SCREEN).indexOf("function resetForAnother"));
    // Bounded at the function's closing brace (column 2), not at the first `}`
    // — the body's first statement contains an object literal.
    expect(reset.slice(0, reset.indexOf("\n  }"))).toContain("setWarnings([])");
  });

  it("the warning is translated in all three locales", () => {
    const hits = MESSAGES.match(new RegExp(`"${WARNING_KEY.replace(/\./g, "\\.")}":`, "g")) ?? [];
    expect(hits).toHaveLength(LOCALES);
  });

  it("no locale phrases it as a failed registration", () => {
    // The child EXISTS. A parent told creation failed creates a second child.
    const values =
      MESSAGES.match(
        new RegExp(`"${WARNING_KEY.replace(/\./g, "\\.")}":\\s*"([^"]*)"`, "g"),
      ) ?? [];
    expect(values).toHaveLength(LOCALES);
    for (const v of values) {
      expect(v).not.toMatch(/alınmadı|yaradılmadı|not created|failed|не создан|не удалось/i);
    }
  });
});
