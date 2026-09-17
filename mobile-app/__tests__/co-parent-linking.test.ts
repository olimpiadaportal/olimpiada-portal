// THE LINK FLOW HAS TWO ROUTES IN AND NO APPROVAL STEP (owner, 2026-09-17 —
// migration 180). A second adult either enters the CHILD's own credentials
// (migration 177) or an invite code the creating parent generated, and either
// way the grant is immediate.
//
// This file has now asserted three different shapes, so it is worth saying what
// it is actually for. It first pinned the 176 flow — collect a code, post
// `approve` — then pinned the credentials-only screen that replaced it, with
// the code assertions DELETED rather than relaxed. The code is back; approval
// is not, and never will be: it completed zero links in production because
// issuing a second code revoked the redemption already waiting on it. So what
// this file pins is the pairing — a code route that grants access outright, and
// no approve/reject path anywhere near it.
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
  /** Just the existing-child calls — api.ts also serves endpoints with their own
   *  unrelated "pending" states (an IAP transaction, for one). */
  const linkApi = api.slice(
    api.indexOf("const CHILD_LINK_PATH"),
    api.indexOf("export function bffHealParentAccount"),
  );

  it("offers create and link as explicit Add Child choices", () => {
    expect(entry).toContain('t("link.choice.create")');
    expect(entry).toContain('t("link.choice.existing")');
    expect(entry).toContain('router.push("/(parent)/link-child" as never)');
  });

  it("offers BOTH routes in, each labelled for what it takes", () => {
    // The headings are the whole point of the two-card layout: an 8-digit id
    // over a password box and an 8-digit id over a code box are the same
    // picture without them.
    expect(screen).toContain('t("link.way.credentials")');
    expect(screen).toContain('t("link.way.code")');
    expect(screen).toContain("<ChildIdField");
    expect(screen).toContain("<PasswordField");
    expect(screen).toContain('t("link.childPassword")');
    expect(screen).toContain('t("link.code")');
    expect(screen).toContain("bffChildLinkByCredentials(childId, password)");
    expect(screen).toContain("bffChildLinkRedeem(codeChildId, code)");
  });

  it("gives each form its own focus chain", () => {
    // One chain spanning both would carry "Done" on the password into the OTHER
    // form's submit — see the run rule in lib/useFieldChain.ts.
    expect((screen.match(/useFieldChain\(/g) ?? []).length).toBe(2);
  });

  it("lets the creating parent issue a code and copy it once", () => {
    expect(screen).toContain("bffChildLinkIssue(studentId)");
    expect(screen).toContain('t("link.issue")');
    expect(screen).toContain("<CopyableId");
    expect(screen).toContain('t("link.copyCode")');
    // Issuing revokes any code still outstanding for the same child. Saying so
    // next to the button is not decoration: silently invalidating a code the
    // parent had already shared is half of the bug this flow was rebuilt from.
    expect(screen).toContain('t("link.issueReplaces")');
  });

  it("posts both halves of each call", () => {
    expect(linkApi).toContain('{ action: "redeem", child_id: childId, code }');
    expect(linkApi).toContain('{ action: "issue", student_id: studentId }');
  });

  it("keeps both halves of the credential out of every autofill store", () => {
    // A MINOR's account number plus the PARENT's password, filed against the
    // same app domain as the parent's real credential — see PASSWORD_AUTOFILL.
    expect(screen).toContain('purpose="none"');
    // ChildIdField applies the numeric keypad and the autofill exclusion itself,
    // AFTER the prop spread, so the screen cannot opt back in. The code field is
    // a plain TextField and has to state its own.
    const field = readFileSync(
      resolve(process.cwd(), "src/components/TextField.tsx"),
      "utf8",
    );
    expect(field).toContain('importantForAutofill="no"');
    expect(screen).toContain('importantForAutofill="no"');
  });

  it("clears the password on EVERY outcome, in a finally", () => {
    // Not "on error" and not "on success" — a `finally`, which is what makes a
    // thrown request clear it too.
    const submit = screen.slice(screen.indexOf("async function submitCredentials"));
    const body = submit.slice(0, submit.indexOf("async function submitCode"));
    expect(body).toMatch(/finally\s*\{[\s\S]*setPassword\(""\)/);
  });

  it("treats a redeemed code as access GRANTED, not access requested", () => {
    const submit = screen.slice(screen.indexOf("async function submitCode"));
    const body = submit.slice(0, submit.indexOf("async function issueCode"));
    // The same completed-link message the credential route reports, because the
    // same thing happened.
    expect(body).toContain('key: "link.linkedNotice"');
    // And no branch on the returned state: there is only one.
    expect(body).not.toContain("state");
  });

  it("has no approval step left to reach", () => {
    for (const gone of ["approve", "reject", "revokeInvite"]) {
      expect(screen).not.toContain(`action: "${gone}"`);
    }
    // The state type no longer even carries the invite rows the RPC still
    // returns, so no screen can render an Approve button out of them — and no
    // link call can report anything as pending.
    expect(api).not.toContain("masked_email");
    expect(api).not.toContain("invitations");
    expect(linkApi).not.toContain('"pending"');
    expect(screen).not.toContain('"pending"');
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
