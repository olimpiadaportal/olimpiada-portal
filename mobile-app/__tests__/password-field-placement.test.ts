// A password field is never orphaned under someone else's Save button.
//
// THE BUG THIS PINS. On the Edit-Child screen the details form's big filled
// "Save" rendered ABOVE a permanently-visible child-password card that had its
// own small ghost button. A parent typed a new password, pressed the only
// primary button on the screen, and was shown the SUCCESS message — while the
// password had never been transmitted. Nothing in the layout said the field
// belonged to the button further down.
//
// THE INVARIANT. A password input only exists on screen together with its own
// submit as the next action under it. The fix is the collapsed disclosure the
// two self-service password sections already use; this test fails if the field
// is ever hoisted back out of it, or if another submit is moved between the
// field and its own button.
//
// It also pins the client-side strength FEEDBACK: five call sites used to test
// `pw.length < 8` and nothing else, so a password the server would refuse for
// missing an uppercase letter or a symbol looked fine until submit.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..", "src");

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

const EDIT_CHILD = "app/(parent)/children/[id]/edit.tsx";

/** The body of one top-level `function Name(` declaration. The parameter list
 *  is skipped by paren-counting first: these components destructure their
 *  props, so the first `{` after the name belongs to the PARAMETERS. */
function functionBody(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return "";
  let i = source.indexOf("(", at);
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "(") parens += 1;
    else if (source[i] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  const start = source.indexOf("{", i);
  let depth = 0;
  for (let j = start; j < source.length; j += 1) {
    const c = source[j];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  return "";
}

describe("the child password field is not orphaned under the primary Save", () => {
  const source = read(EDIT_CHILD);
  const card = functionBody(source, "PasswordReset");

  it("the password card is a self-contained component", () => {
    expect(card.length).toBeGreaterThan(0);
  });

  it("the details form's Save lives outside the password card", () => {
    // `childedit.save` submits the name/city/school/grade form. If it ever
    // appears inside this card the two submits are adjacent again.
    expect(card).not.toContain("childedit.save");
    expect(source).toContain('title={t("childedit.save")}');
  });

  it("the field only exists while the card is open", () => {
    expect(card).toContain("const [open, setOpen] = useState(false)");
    // The field is rendered in the OPEN branch, never unconditionally.
    expect(card.indexOf("!open")).toBeGreaterThan(-1);
    expect(card.indexOf("PasswordField")).toBeGreaterThan(card.indexOf("!open"));
  });

  it("its own submit is the next action under the field", () => {
    const field = card.indexOf('label={t("parent.child.password")}');
    const ownSubmit = card.indexOf('title={t("child.resetPwSubmit")}');
    expect(field).toBeGreaterThan(-1);
    expect(ownSubmit).toBeGreaterThan(field);
    // Nothing else submits between the two.
    expect(card.slice(field, ownSubmit)).not.toContain("onPress={() => void submit()}");
  });
});

describe("new passwords get the full rule as client feedback", () => {
  // FEEDBACK ONLY — the server stays authoritative. These five are every place
  // in the app where a user CHOOSES a password.
  const SITES = [
    "app/(public)/register.tsx",
    "features/parent/ChildInfoForm.tsx",
    EDIT_CHILD,
    "features/profile/sections.tsx",
    "features/profile/studentSections.tsx",
  ];

  for (const file of SITES) {
    describe(file, () => {
      const source = read(file);

      it("uses the shared policy", () => {
        expect(source).toContain("checkNewPassword");
      });

      it("no longer checks the length alone", () => {
        // The exact shape of the five old checks. `length < 8` on its own
        // passes a password the server refuses for missing an uppercase
        // letter or a symbol.
        expect(source).not.toMatch(/(password|pw)\.length < 8/);
      });
    });
  }
});

describe("self-service password changes go through the BFF", () => {
  // Both screens called supabase.auth.updateUser directly, so the ONLY rule
  // that ever ran server-side was GoTrue's own minimum — the product's policy
  // was enforced by the client alone, which is to say not at all.
  for (const file of ["features/profile/sections.tsx", "features/profile/studentSections.tsx"]) {
    it(`${file} does not call supabase.auth.updateUser`, () => {
      const source = read(file);
      // The CALL, not the mention — the comments explaining why it is gone
      // must be allowed to name it.
      expect(source).not.toMatch(/await\s+supabase\.auth\.updateUser/);
      expect(source).toContain("bffChangeOwnPassword");
    });
  }
});
