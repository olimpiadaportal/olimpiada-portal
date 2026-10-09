// Panel user management — Admin / Content Manager accounts and the Super Admin
// (Issues 3 + 4, 2026-10-09).
//
// The server actions are "use server" modules (only async exports), and the
// real protection for the Super Admin is in the database (migration 182, check
// 136 in 013). These pin the STRUCTURE that the UI and the actions depend on, so
// a refactor cannot quietly drop a guard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

// Same convention as the other admin tests: vitest runs from admin-panel/.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const users = read("src/lib/admin/users.ts");
const page = read("src/app/(protected)/users/page.tsx");
const nav = read("src/lib/admin/nav.ts");

/** The body of one exported async function, up to the next export. */
function body(name: string): string {
  const start = users.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = users.indexOf("export async function", start + 10);
  return users.slice(start, next === -1 ? undefined : next);
}

describe("only administrators manage panel users", () => {
  it("every action authorizes FIRST", () => {
    for (const fn of ["createPanelUser", "updatePanelUser", "deletePanelUser"]) {
      const b = body(fn);
      const firstStatement = b.slice(b.indexOf("{") + 1).trim();
      expect(firstStatement.startsWith("const ctx = await requireAdmin()"), fn).toBe(true);
    }
  });
  it("the page is admin-only and so is its nav entry", () => {
    expect(page).toContain("await requireAdmin()");
    expect(nav).toMatch(/href: "\/users", adminOnly: true/);
  });
  it("no action can create or grant a Super Admin — it is not a role", () => {
    expect(users).toMatch(/const ALLOWED_ROLES = \["administrator", "content_manager"\] as const;/);
    expect(users).not.toMatch(/is_super_admin\s*:/);
  });
});

describe("the Super Admin and the viewer's own account", () => {
  it("edit and delete both go through the target check that refuses the Super Admin", () => {
    expect(users).toMatch(/if \(p\.is_super_admin\) return \{ errorKey: "users\.err\.superAdmin" \}/);
    expect(body("updatePanelUser")).toContain("await loadTarget(admin, profileId)");
    expect(body("deletePanelUser")).toContain("await loadTarget(admin, profileId)");
  });
  it("only panel users are reachable — a parent or student id is 'not found'", () => {
    expect(users).toMatch(/if \(panelRoles\.length === 0\) return \{ errorKey: "users\.err\.notFound" \}/);
  });
  it("an administrator cannot delete themselves or change their own role", () => {
    expect(body("deletePanelUser")).toMatch(/target\.profileId === ctx\.profileId\) return \{ error: t\("users\.err\.self"\) \}/);
    expect(body("updatePanelUser")).toMatch(/if \(isSelf && roleChanges\) return \{ error: t\("users\.err\.self"\) \}/);
  });
  it("the page locks the Super Admin row and explains why", () => {
    expect(page).toContain('u.isSuperAdmin ? "super"');
    expect(page).toContain('className={u.isSuperAdmin ? "user-row-locked" : undefined}');
    expect(page).toContain('t("users.err.superAdmin")');
  });
});

describe("account creation never fails silently", () => {
  const create = body("createPanelUser");
  it("names the reason Supabase Auth refused, starting with an email already in use", () => {
    expect(users).toMatch(/case "email_exists":\s*case "user_already_exists":\s*return "users\.err\.emailExists";/);
    expect(create).toContain("t(authErrorKey(createErr.code, createErr.status))");
  });
  it("checks every step and rolls the auth user back after a later failure", () => {
    expect(create).toContain("admin.auth.admin.deleteUser(authUserId)");
    for (const step of ["no profile", "profile activation", "role assignment"]) {
      expect(create, step).toContain(`await undo("${step}"`);
    }
  });
  it("resolves the role before creating anything", () => {
    expect(create.indexOf('.from("roles")')).toBeLessThan(create.indexOf("auth.admin.createUser"));
  });
  it("reports success only after the audit row, at the very end", () => {
    expect(create.indexOf("return { ok: true }")).toBeGreaterThan(create.indexOf('action: "admin.panel_user.create"'));
  });
});

describe("copy", () => {
  it("exists in all three languages", () => {
    const keys = [
      "users.err.emailExists", "users.err.emailInvalid", "users.err.weakPassword", "users.err.nameLong",
      "users.err.notFound", "users.err.superAdmin", "users.err.self", "users.actions", "users.edit",
      "users.delete", "users.editTitle", "users.save", "users.saving", "users.cancel", "users.deleteTitle",
      "users.deleteBody", "users.deleteConfirm", "users.deleting", "users.superAdmin", "users.you",
    ];
    for (const loc of ["az", "en", "ru"] as const) {
      for (const k of keys) expect(messages[loc][k]?.trim(), `${loc} ${k}`).toBeTruthy();
      expect(messages[loc]["users.deleteBody"]).toContain("{email}");
    }
  });
});
