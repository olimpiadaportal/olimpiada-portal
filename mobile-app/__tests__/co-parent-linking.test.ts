// THE LINK FLOW HAS NO APPROVAL STEP ANY MORE (owner, 2026-09-16 — migration
// 177). A second adult proves they may reach a child by entering that CHILD's
// own credentials, and the grant is immediate.
//
// This file used to assert the OPPOSITE — that the screen collected a one-time
// code and posted `issue` / `approve` / `reject`. Those assertions are gone
// rather than relaxed, because the invite RPC still EXISTS (177 deprecated its
// usage, it did not drop it) and a test that merely tolerated both shapes would
// have passed happily against a screen that had quietly grown its approval UI
// back.
//
// Source assertions on purpose: these are .tsx screens, this suite is .ts-only
// (package.json testMatch), and every failure mode here is a DELETION — a
// password field that stops being cleared, or an approve button that returns,
// looks entirely ordinary in a diff.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replaceAll("\r\n", "\n");

/** Source with comments blanked: prose ABOUT a retired concept must never fail
 *  a test that the concept is gone, and prose ABOUT a prop must never satisfy
 *  one that the prop is set. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");

describe("mobile co-parent flow", () => {
  const entry = read("src/app/(parent)/add-child.tsx");
  const screen = code(read("src/app/(parent)/link-child.tsx"));
  const api = code(read("src/lib/api.ts"));
  const home = read("src/app/(parent)/(tabs)/home.tsx");

  it("offers create and link as explicit Add Child choices", () => {
    expect(entry).toContain('t("link.choice.create")');
    expect(entry).toContain('t("link.choice.existing")');
    expect(entry).toContain('router.push("/(parent)/link-child" as never)');
  });

  it("collects the child's id and password, not an invitation code", () => {
    expect(screen).toContain("<ChildIdField");
    expect(screen).toContain("<PasswordField");
    expect(screen).toContain('t("link.childPassword")');
    expect(screen).toContain("bffChildLinkByCredentials(childId, password)");
    // The code field and its action are gone for good.
    expect(screen).not.toContain('t("link.code")');
    expect(screen).not.toContain('action: "redeem"');
  });

  it("keeps both halves of the credential out of every autofill store", () => {
    // A MINOR's account number plus the PARENT's password, filed against the
    // same app domain as the parent's real credential — see PASSWORD_AUTOFILL.
    expect(screen).toContain('purpose="none"');
    // ChildIdField applies the numeric keypad and the autofill exclusion itself,
    // AFTER the prop spread, so the screen cannot opt back in.
    const field = readFileSync(
      resolve(process.cwd(), "src/components/TextField.tsx"),
      "utf8",
    );
    expect(field).toContain('importantForAutofill="no"');
  });

  it("clears the password on EVERY outcome, in a finally", () => {
    // Not "on error" and not "on success" — a `finally`, which is what makes a
    // thrown request clear it too.
    const submit = screen.slice(screen.indexOf("async function submitCredentials"));
    const body = submit.slice(0, submit.indexOf("async function manage"));
    expect(body).toMatch(/finally\s*\{[\s\S]*setPassword\(""\)/);
  });

  it("has no approval step left to reach", () => {
    for (const gone of ["issue", "approve", "reject", "revokeInvite"]) {
      expect(screen).not.toContain(`action: "${gone}"`);
    }
    // The state type no longer even carries the invite rows the RPC still
    // returns, so no screen can render an Approve button out of them.
    expect(api).not.toContain("masked_email");
    expect(api).not.toContain("invitations");
  });

  it("still supports revoke and self-unlink — the two ways access ends", () => {
    for (const action of ["revoke", "leave"]) {
      expect(screen).toContain(`action: "${action}"`);
    }
  });

  it("shows who can reach each child", () => {
    expect(screen).toContain("bffChildAccessAdults");
    expect(screen).toContain('t("link.access.title")');
    expect(screen).toContain("adult.email");
    expect(screen).toContain("adultLabel");
  });

  it("does not show subscription/edit controls on a shared-child card", () => {
    expect(home).toContain("{isCreator ? <View");
    expect(home).toContain('t("link.linked")');
  });
});
