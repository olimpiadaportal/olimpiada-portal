// THE LINK FLOW HAS TWO ROUTES IN AND NO APPROVAL STEP (owner, 2026-09-17 —
// migration 180). A second adult either enters the CHILD's own credentials
// (migration 177) or an invite code the creating parent generated, and either
// way the grant is immediate.
//
// The approval assertions this file used to carry are gone rather than relaxed.
// They pinned migration 176's shape — redeem, then approve, THEN the
// relationship insert — and 176 is a historical file that will assert the same
// thing forever while the product does the opposite. What is worth pinning is
// the contract the client actually depends on, and the deletions that are
// invisible in a diff: an approve button that comes back, a key list that stops
// covering the panel, a "pending" branch that reappears.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const read = (path: string) => readFileSync(resolve(process.cwd(), "..", path), "utf8").replaceAll("\r\n", "\n");
const migration = read("supabase/sql/migrations/2026_09_12_176_coparent_linking.sql");
const migration180 = read("supabase/sql/migrations/2026_09_17_180_invite_links_without_approval.sql");
const canonicalPolicies = read("supabase/sql/010_rls_policies.sql");
const core = read("web-app/src/lib/auth/childLinkCore.ts");
const route = read("web-app/src/app/api/mobile/v1/children/link/route.ts");
const panelSource = read("web-app/src/components/ChildLinkPanel.tsx");
const pageSource = read("web-app/src/app/(parent)/children/link/page.tsx");

/** Source with comments blanked: prose ABOUT a retired concept must never fail
 *  a test that the concept is gone. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");

const panel = code(panelSource);

/** The closed allowlist the page hands the panel. A key missing from it renders
 *  as the literal key string — no error, no failing build. */
function dictKeys(): Set<string> {
  // Comments blanked first: the array carries prose that names keys, and a key
  // "covered" only by a sentence about it is exactly the dark string this
  // guards against.
  const source = code(pageSource);
  const start = source.indexOf("const KEYS = [");
  const end = source.indexOf("];", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return new Set([...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

/** Every static t("literal") the panel resolves. */
function panelKeys(): string[] {
  return [...panel.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
}

describe("co-parent linking security contract", () => {
  it("stores only a hash and returns the raw 20-character code once", () => {
    expect(migration).toContain("encode(digest(v_code,'sha256'),'hex')");
    expect(migration).toContain("jsonb_build_object('ok',true,'code',v_code");
    expect(migration).not.toMatch(/insert into public\.parent_link_invites[^;]+values\([^;]*v_code\s*\)/s);
  });

  it("removes direct relationship writes from authenticated clients", () => {
    expect(migration).toContain("revoke insert,update,delete on public.parent_student_links from anon,authenticated");
  });

  it("keeps linked parents out of payer ledgers in migration and canonical RLS", () => {
    for (const sql of [migration, canonicalPolicies]) {
      const start = sql.indexOf('create policy "sub_changes_select"');
      const end = sql.indexOf(";", start);
      expect(sql.slice(start, end)).not.toContain("is_parent_linked_to_student");
    }
  });

  it("authenticates the mobile request before reading its body", () => {
    expect(route.indexOf("resolveBearerParent(request)")).toBeLessThan(route.indexOf("readJsonBody(request)"));
  });

  it("normalizes and validates identifiers before the privileged RPC", () => {
    expect(core).toContain("CHILD_ID_RE.test(childId)");
    expect(core).toContain("CODE_RE.test(code)");
    expect(core).toContain('rpc("manage_child_link"');
  });

  it("never creates a payment, checkout, subscription, or entitlement", () => {
    expect(migration).not.toMatch(/insert into public\.(payments|checkout_sessions|child_subscriptions|entitlements)/i);
  });
});

describe("the link panel offers two routes in", () => {
  it("collects the child's credentials on one route", () => {
    expect(panel).toContain("childLinkByCredentialsAction(childId, password)");
    expect(panel).toContain('t("link.way.credentials")');
    expect(panel).toContain('t("link.childPassword")');
  });

  it("collects the child's id plus an invite code on the other", () => {
    expect(panel).toContain('action: "redeem"');
    expect(panel).toContain('t("link.way.code")');
    expect(panel).toContain('t("link.code")');
    // Both halves travel; a redeem that posted only the code would be a
    // different (and enumerable) lookup.
    expect(panel).toMatch(/action: "redeem",\s*childId: codeChildId,\s*code,/);
  });

  it("lets the creating parent issue a code and read it back once", () => {
    expect(panel).toContain('action: "issue"');
    expect(panel).toContain('t("link.issue")');
    // The raw code exists only in the mutation result — the state cannot carry
    // it, because the database stores a sha256.
    expect(panel).toContain('"code" in result');
    expect(panel).toContain('t("link.copyCode")');
  });
});

describe("redeeming grants access immediately", () => {
  it("reports the SAME completed-link outcome as the credential route", () => {
    const submit = panel.slice(panel.indexOf("function submitCode"));
    const body = submit.slice(0, submit.indexOf("function issueCode"));
    expect(body).toContain('t("link.linkedNotice")');
    // No branch on the result's state: under 180 a successful redeem IS the
    // link, so there is nothing for the panel to distinguish.
    expect(body).not.toContain("state");
  });

  it("has no pending state left anywhere in the panel", () => {
    // The quoted literal, not the word: `pending` is also this panel's
    // useTransition flag and appears on nearly every control.
    expect(panel).not.toContain('"pending"');
  });

  it("has no approve, reject or revokeInvite path left in the UI", () => {
    for (const gone of ["approve", "reject", "revokeInvite"]) {
      expect(panel).not.toContain(`action: "${gone}"`);
    }
    for (const gone of ["link.approve", "link.reject", "link.pending"]) {
      expect(panel).not.toContain(gone);
      // Deleted from the catalog too. Three ready-made approval strings are how
      // a future round rebuilds the flow that completed zero links. Read by
      // index, never with toHaveProperty — these keys CONTAIN dots, which that
      // matcher would read as a path into an object that has no nesting at all.
      for (const locale of locales) {
        expect((messages[locale] as Record<string, string>)[gone]).toBeUndefined();
      }
    }
  });

  it("still supports revoke and self-unlink — the two ways access ends", () => {
    for (const action of ["revoke", "leave"]) {
      expect(panel).toContain(`action: "${action}"`);
    }
  });
});

describe("the link page ships no dark strings", () => {
  it("allowlists every key the panel renders", () => {
    const allowed = dictKeys();
    const used = panelKeys();
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((key) => !allowed.has(key))).toEqual([]);
  });

  it("allowlists every error key the core can map", () => {
    // The panel renders `t(result.errorKey)` — a dynamic lookup no regex above
    // can see — and `issue`/`redeem` reach codes the credential route never did.
    const linkModule = read("web-app/src/lib/childLink.ts");
    const map = linkModule.slice(linkModule.indexOf("CHILD_LINK_ERROR_KEYS"));
    const keys = [...map.matchAll(/"(link\.err\.[^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    const allowed = dictKeys();
    expect(keys.filter((key) => !allowed.has(key))).toEqual([]);
  });

  it("resolves every allowlisted key in all three locales", () => {
    for (const locale of locales) {
      const missing = [...dictKeys()].filter((key) => {
        const value = (messages[locale] as Record<string, string>)[key];
        return !value || !value.trim();
      });
      expect(missing).toEqual([]);
    }
  });
});

describe("migration 180 — redeeming an invite grants access, and does it once", () => {
  // The replaced test asserted against migration 176, a historical file that
  // will keep passing forever while the product does the opposite. These read
  // the migration the database is ACTUALLY running, so they fail the day the
  // shape changes rather than the day someone remembers to look.

  it("removes approve and reject from the action whitelist", () => {
    // Not merely unused — REMOVED. A second action that can still mint a link is
    // how two paths drift apart the day someone re-adds it to fix something.
    expect(migration180).toContain(
      "p_action not in ('issue','redeem','revokeInvite','revoke','leave')",
    );
    expect(migration180).not.toContain("'issue','redeem','approve','reject'");
  });

  it("leaves exactly ONE path that can create a relationship", () => {
    // The deleted approve branch carried its own insert. Two inserts meant two
    // places where the cap, the audit and the notification could disagree.
    const inserts = migration180.split("insert into public.parent_student_links").length - 1;
    expect(inserts, "more than one way to mint a link").toBe(1);
  });

  it("carries the 4-adult cap on the LINK, not on issuing a code", () => {
    // A cap checked only when a code is issued is outrun by codes issued before
    // the fourth adult arrived.
    const redeemBranch = migration180.slice(migration180.indexOf("if p_action='redeem' then"));
    const capAt = redeemBranch.indexOf("v_count>=4");
    const insertAt = redeemBranch.indexOf("insert into public.parent_student_links");
    expect(capAt, "no cap in the redeem branch").toBeGreaterThan(-1);
    expect(capAt, "the cap must be checked BEFORE the insert").toBeLessThan(insertAt);
  });

  it("notifies the creating parent, because approval was also the notification", () => {
    // Removing the approval step removed a SIGNAL as well as a gate. Without
    // this a link forms with no trace the account owner will ever see.
    expect(migration180).toContain("create_notification");
    expect(migration180, "priority 1 is what survives the platform mute").toMatch(
      /1,\s*null,\s*'announcement'/,
    );
  });

  it("never reports a pending state again", () => {
    // 'pending' WAS the approval state. A client branching on it would be
    // waiting for something that can no longer happen.
    expect(migration180).toContain("'ok',true,'state','saved'");
    expect(migration180).not.toContain("then 'pending' else 'saved'");
  });
});
