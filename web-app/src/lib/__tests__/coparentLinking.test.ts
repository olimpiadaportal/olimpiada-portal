import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "..", path), "utf8").replaceAll("\r\n", "\n");
const migration = read("supabase/sql/migrations/2026_09_12_176_coparent_linking.sql");
const canonicalPolicies = read("supabase/sql/010_rls_policies.sql");
const core = read("web-app/src/lib/auth/childLinkCore.ts");
const route = read("web-app/src/app/api/mobile/v1/children/link/route.ts");

describe("co-parent linking security contract", () => {
  it("stores only a hash and returns the raw 20-character code once", () => {
    expect(migration).toContain("encode(digest(v_code,'sha256'),'hex')");
    expect(migration).toContain("jsonb_build_object('ok',true,'code',v_code");
    expect(migration).not.toMatch(/insert into public\.parent_link_invites[^;]+values\([^;]*v_code\s*\)/s);
  });

  it("requires explicit owner approval before the active relationship insert", () => {
    const redeem = migration.indexOf("if p_action='redeem'");
    const approve = migration.indexOf("elsif p_action='approve'");
    const insert = migration.indexOf("insert into public.parent_student_links", approve);
    expect(redeem).toBeGreaterThan(-1);
    expect(approve).toBeGreaterThan(redeem);
    expect(insert).toBeGreaterThan(approve);
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
