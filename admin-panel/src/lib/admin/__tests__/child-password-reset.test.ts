// The admin rescue path for a child who cannot sign in.
//
// What is pinned here is the set of properties that fail SILENTLY — every one
// of them produced a green "Password updated." in production while the child
// stayed locked out. A reset that writes the password by auth user id always
// succeeds; login reads a DIFFERENT key (the synthetic email derived from the
// 8-digit id), and migration 146 left real accounts where the two disagree. A
// click-through of this form cannot tell the two outcomes apart: the only
// difference is whether the child can log in afterwards.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Order of the two things that must not swap: authorization and reading input.
const order: string[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});
const auditEntries: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/guards", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (e: Record<string, unknown>) => {
    auditEntries.push(e);
  },
}));
vi.mock("@/lib/admin/search", () => ({ sanitizeSearchTerm: (v: string) => v }));
// getT returns the key, so an assertion names the message rather than copying
// its wording — a rewording must not turn into a red test. It also makes a
// hardcoded English literal impossible to hide.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

// ---- Supabase stub -------------------------------------------------------
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const AUTH_USER = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CHILD_ID = "12345678";
const SYNTHETIC = `c${CHILD_ID}@children.invalid`;
const PENDING = "pending-9f8c1d2e-1111-4222-8333-444455556666@children.invalid";
// Satisfies the whole strength rule (length, capital, symbol) and is not the id.
const GOOD_PASSWORD = "Xelil!2026";

type TableCall = {
  table: string;
  mode: "select" | "update" | "delete";
  filters: [string, unknown][];
};

const tableCalls: TableCall[] = [];
const authCalls: { fn: string; id: string; attrs?: Record<string, unknown> }[] = [];

let credRow: { auth_user_id: string; child_unique_id: string | null } | null = null;
let currentEmail: string | null = null;
let emailUpdateError: { message: string } | null = null;
let deleteError: { message: string } | null = null;

function builder(table: string) {
  const call: TableCall = { table, mode: "select", filters: [] };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    update: () => ((call.mode = "update"), b),
    delete: () => ((call.mode = "delete"), b),
    eq: (col: string, v: unknown) => (call.filters.push([col, v]), b),
    maybeSingle: async () => {
      order.push(`from:${table}`);
      tableCalls.push(call);
      return { data: credRow, error: null };
    },
    // update/delete chains are awaited directly, so the builder is a thenable.
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      order.push(`from:${table}`);
      tableCalls.push(call);
      return Promise.resolve(
        resolve({ data: null, error: call.mode === "delete" ? deleteError : null }),
      );
    },
  });
  return b as never;
}

const adminClient = {
  from: (table: string) => builder(table),
  auth: {
    admin: {
      getUserById: async (id: string) => {
        authCalls.push({ fn: "getUserById", id });
        return {
          data: { user: currentEmail === null ? null : { id, email: currentEmail } },
          error: null,
        };
      },
      updateUserById: async (id: string, attrs: Record<string, unknown>) => {
        authCalls.push({ fn: "updateUserById", id, attrs });
        return {
          data: {},
          error: "email" in attrs ? emailUpdateError : null,
        };
      },
    },
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
  hasServiceRole: () => true,
}));

const { resetChildPassword } = await import("../accounts");
const { createPanelUser } = await import("../users");

function form(password: string, studentProfileId = CHILD): FormData {
  const fd = new FormData();
  fd.set("student_profile_id", studentProfileId);
  fd.set("password", password);
  return fd;
}

const emailUpdates = () =>
  authCalls.filter((c) => c.fn === "updateUserById" && c.attrs && "email" in c.attrs);
const passwordUpdates = () =>
  authCalls.filter((c) => c.fn === "updateUserById" && c.attrs && "password" in c.attrs);

beforeEach(() => {
  order.length = 0;
  tableCalls.length = 0;
  authCalls.length = 0;
  auditEntries.length = 0;
  credRow = { auth_user_id: AUTH_USER, child_unique_id: CHILD_ID };
  currentEmail = SYNTHETIC;
  emailUpdateError = null;
  deleteError = null;
  requireAdmin.mockClear();
});

describe("resetChildPassword — the login address is reconciled, not assumed", () => {
  it("leaves an already-correct address alone and still sets the password", async () => {
    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ ok: true });
    // The read happens on every reset; the WRITE only when it changes anything.
    expect(authCalls.some((c) => c.fn === "getUserById")).toBe(true);
    expect(emailUpdates()).toHaveLength(0);
    expect(passwordUpdates()).toHaveLength(1);
    expect(auditEntries[0]?.metadata).toMatchObject({ emailReconciled: false });
  });

  it("repairs a pending- address BEFORE the password is written", async () => {
    currentEmail = PENDING;

    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ ok: true });
    expect(emailUpdates()).toHaveLength(1);
    expect(emailUpdates()[0].attrs).toMatchObject({
      email: SYNTHETIC,
      // Unconfirmed would swap one silent login failure for another.
      email_confirm: true,
    });
    // Order matters: a password written first would be a password on an
    // address nothing signs in with.
    const sequence = authCalls
      .filter((c) => c.fn === "updateUserById")
      .map((c) => ("email" in (c.attrs ?? {}) ? "email" : "password"));
    expect(sequence).toEqual(["email", "password"]);
    expect(auditEntries[0]?.metadata).toMatchObject({ emailReconciled: true });
  });

  it("does NOT change the password when the repair fails", async () => {
    currentEmail = PENDING;
    emailUpdateError = { message: "email address is already in use" };

    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ error: "accounts.reset.err.loginRepair" });
    expect(passwordUpdates()).toHaveLength(0);
    // Nothing was written, so nothing is claimed in the audit trail either.
    expect(auditEntries).toHaveLength(0);
  });

  it("writes the address anyway when the current one cannot be read", async () => {
    // A read failure must never be mistaken for "already correct" — that is the
    // one wrong outcome nothing downstream could detect.
    currentEmail = null;

    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ ok: true });
    expect(emailUpdates()).toHaveLength(1);
  });
});

describe("resetChildPassword — an account with no login id is refused", () => {
  it("refuses a child with no 8-digit id instead of reporting success", async () => {
    credRow = { auth_user_id: AUTH_USER, child_unique_id: null };

    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ error: "accounts.reset.err.noLoginId" });
    // No password, no address, nothing: the account needs an id, not a reset.
    expect(authCalls).toHaveLength(0);
  });
});

describe("resetChildPassword — the reset voids the lockout", () => {
  it("deletes the child's failed attempts and keeps the successful ones", async () => {
    await resetChildPassword(null, form(GOOD_PASSWORD));

    const cleared = tableCalls.find(
      (c) => c.table === "child_login_attempts" && c.mode === "delete",
    );
    expect(cleared).toBeDefined();
    expect(cleared?.filters).toEqual([
      ["child_unique_id", CHILD_ID],
      ["success", false],
    ]);
    expect(auditEntries[0]?.metadata).toMatchObject({ lockoutCleared: true });
  });

  it("still reports success when the clear fails — the password DID change", async () => {
    deleteError = { message: "permission denied" };

    const res = await resetChildPassword(null, form(GOOD_PASSWORD));

    expect(res).toEqual({ ok: true });
    expect(auditEntries[0]?.metadata).toMatchObject({ lockoutCleared: false });
  });
});

describe("resetChildPassword — the strength rule and the guard", () => {
  it("authorizes before reading anything from the form", async () => {
    await resetChildPassword(null, form(GOOD_PASSWORD));
    expect(order[0]).toBe("guard");
  });

  it.each([
    ["short!A", "pw.err.tooShort"],
    ["xelil!2026", "pw.err.needsUpper"],
    ["Xelil2026", "pw.err.needsSpecial"],
  ])("refuses %s with %s and touches nothing", async (pw, key) => {
    const res = await resetChildPassword(null, form(pw));
    expect(res).toEqual({ error: key });
    expect(authCalls).toHaveLength(0);
    expect(tableCalls).toHaveLength(0);
  });
});

describe("createPanelUser — refusals are keys, not English literals", () => {
  it("answers a weak password with a translatable key", async () => {
    const fd = new FormData();
    fd.set("email", "menecer@olympiq.ai");
    fd.set("password", "xelil2026");
    fd.set("role", "content_manager");

    expect(await createPanelUser(null, fd)).toEqual({ error: "pw.err.needsUpper" });
  });

  it("answers a role outside the allowlist with a translatable key", async () => {
    const fd = new FormData();
    fd.set("email", "menecer@olympiq.ai");
    fd.set("password", GOOD_PASSWORD);
    fd.set("role", "administrator; drop");

    expect(await createPanelUser(null, fd)).toEqual({ error: "users.err.role" });
  });
});
