// THE LINK FLOW HAS EXACTLY ONE ROUTE IN, AND IT IS THE INVITE CODE (owner,
// 2026-09-17 — migration 181). A second adult enters the child's 8-digit id plus
// a one-time code the CREATING parent generated, and the grant is immediate.
//
// This file has now asserted four different shapes, so it is worth saying what
// it is actually for. It first pinned the 176 flow — collect a code, post
// `approve` — then the credentials-only screen that replaced it (code
// assertions DELETED rather than relaxed), then both routes side by side when
// 180 restored the code. The owner then cut the credential route, and the
// reason is what to carry forward rather than the count: an invite code is a
// one-time, EXPIRING secret the creating parent hands to a named adult, while a
// child's password is a STANDING secret the child also knows and cannot revoke.
// Approval is not coming back either — it completed zero links in production,
// because issuing a second code revoked the redemption already waiting on it.
//
// So what this file pins is a singular: one route that grants access outright,
// no password field beside it, and no approve/reject path anywhere near it.
//
// Source assertions on purpose: these are .tsx screens, this suite is .ts-only
// (package.json testMatch), and every failure mode here is a DELETION — a
// password field that grows back, or an approve button that returns, looks
// entirely ordinary in a diff.
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

  it("offers exactly ONE route in, and it is the invite code", () => {
    expect(screen).toContain('t("link.enterCode.title")');
    expect(screen).toContain("<ChildIdField");
    expect(screen).toContain('t("link.code")');
    expect(screen).toContain("bffChildLinkRedeem(codeChildId, code)");
  });

  it("has no password route left — not the field, the call, or its keys", () => {
    // Each of these would look entirely ordinary re-added, which is the whole
    // reason they are named one by one.
    expect(screen).not.toContain("<PasswordField");
    expect(screen).not.toContain("setPassword");
    expect(screen).not.toContain("bffChildLinkByCredentials");
    expect(api).not.toContain("bffChildLinkByCredentials");
    expect(linkApi).not.toContain('action: "credentials"');
    for (const gone of ["link.childPassword", "link.credentialsHint", "link.way.credentials"]) {
      expect(screen).not.toContain(gone);
    }
  });

  it("gives the one form one focus chain", () => {
    // A second chain is what a second form looked like. A chain that ran past
    // this form's own submit would carry "Done" somewhere it does not belong —
    // see the run rule in lib/useFieldChain.ts.
    expect((screen.match(/useFieldChain\(/g) ?? []).length).toBe(1);
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

  it("keeps both halves of the submission out of every autofill store", () => {
    // A MINOR's account number plus a one-time code, filed against the same app
    // domain as the parent's real credential — see PASSWORD_AUTOFILL.
    // ChildIdField applies the numeric keypad and the autofill exclusion itself,
    // AFTER the prop spread, so the screen cannot opt back in. The code field is
    // a plain TextField and has to state its own.
    const field = readFileSync(
      resolve(process.cwd(), "src/components/TextField.tsx"),
      "utf8",
    );
    expect(field).toContain('importantForAutofill="no"');
    expect(screen).toContain('importantForAutofill="no"');
    expect(screen).toContain('autoComplete="off"');
    expect(screen).toContain('textContentType="none"');
  });

  it("clears the spent code on success and leaves a rejected one editable", () => {
    // A spent code left in the box only invites a second submit that can never
    // work. A REJECTED one stays: unlike a child's password it is neither
    // standing nor secret past its 72 hours, and 20 characters is worth being
    // able to correct rather than retype.
    const submit = screen.slice(screen.indexOf("async function submitCode"));
    const body = submit.slice(0, submit.indexOf("async function issueCode"));
    const failure = body.slice(0, body.indexOf("setCodeChildId"));
    expect(body).toContain('setCode("")');
    expect(failure).not.toContain('setCode("")');
  });

  it("treats a redeemed code as access GRANTED, not access requested", () => {
    const submit = screen.slice(screen.indexOf("async function submitCode"));
    const body = submit.slice(0, submit.indexOf("async function issueCode"));
    // A completed link, never a submitted request.
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
