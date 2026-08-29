// Parent-side child password reset — the shared core behind both the web
// server action and the mobile BFF route.
//
// What is pinned here is the set of properties that fail SILENTLY. Every one of
// them shipped a truthful-looking "Parol yeniləndi" to a parent whose child
// still could not sign in: the password is written by auth user id, login reads
// the synthetic email derived from the 8-digit id, and migration 146 left real
// accounts where the two disagree (SQL cannot write auth.users.email — its
// header says so). None of it shows up in a click-through; the only difference
// is whether the child gets in afterwards.
import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` is a BUILD-TIME guard with no runtime behaviour and no package
// to resolve under Vite. Stubbing the marker keeps the guard where it belongs
// (the real build) instead of tempting anyone to delete it from the production
// file to make a test pass.
vi.mock("server-only", () => ({}));

const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const AUTH_USER = "9f8c1d2e-1111-4222-8333-444455556666";
const CHILD_ID = "12345678";
const SYNTHETIC = `c${CHILD_ID}@children.invalid`;
const PENDING = "pending-2c3f9a10-5555-4666-8777-888899990000@children.invalid";
// Satisfies the whole strength rule (length, capital, symbol) and is not the id.
const GOOD_PASSWORD = "Xelil!2026";

type TableCall = {
  table: string;
  mode: "select" | "update" | "delete";
  filters: [string, unknown][];
};

const tableCalls: TableCall[] = [];
const authCalls: { fn: string; id: string; attrs?: Record<string, unknown> }[] = [];
const auditEntries: { action: string; opts: Record<string, unknown> }[] = [];

let credRow: { auth_user_id: string; child_unique_id: string | null } | null = null;
let studentRow: { created_by_parent_profile_id: string | null } | null = null;
let currentEmail: string | null = null;
let emailUpdateError: { message: string } | null = null;
let deleteError: { message: string } | null = null;

function builder(table: string) {
  const call: TableCall = { table, mode: "select", filters: [] };
  const b: Record<string, unknown> = {};
  const row = () => (table === "child_credentials" ? credRow : studentRow);
  Object.assign(b, {
    select: () => b,
    update: () => ((call.mode = "update"), b),
    delete: () => ((call.mode = "delete"), b),
    eq: (col: string, v: unknown) => (call.filters.push([col, v]), b),
    single: async () => {
      tableCalls.push(call);
      return { data: row(), error: row() ? null : { message: "no rows" } };
    },
    maybeSingle: async () => {
      tableCalls.push(call);
      return { data: null, error: null };
    },
    // update/delete chains are awaited directly, so the builder is a thenable.
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
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
        return { data: {}, error: "email" in attrs ? emailUpdateError : null };
      },
    },
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => adminClient,
  isServiceRoleConfigured: true,
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: async (
    _actor: string | null,
    action: string,
    opts: Record<string, unknown>,
  ) => {
    auditEntries.push({ action, opts });
  },
}));

const { resetChildPassword } = await import("@/lib/auth/childAccountService");

const emailUpdates = () =>
  authCalls.filter((c) => c.fn === "updateUserById" && c.attrs && "email" in c.attrs);
const passwordUpdates = () =>
  authCalls.filter((c) => c.fn === "updateUserById" && c.attrs && "password" in c.attrs);

const reset = (newPassword = GOOD_PASSWORD) =>
  resetChildPassword({
    parentProfileId: PARENT,
    studentProfileId: CHILD,
    newPassword,
  });

beforeEach(() => {
  tableCalls.length = 0;
  authCalls.length = 0;
  auditEntries.length = 0;
  credRow = { auth_user_id: AUTH_USER, child_unique_id: CHILD_ID };
  studentRow = { created_by_parent_profile_id: PARENT };
  currentEmail = SYNTHETIC;
  emailUpdateError = null;
  deleteError = null;
});

describe("resetChildPassword — the login address is reconciled, not assumed", () => {
  it("leaves an already-correct address alone and still sets the password", async () => {
    const res = await reset();

    expect(res).toEqual({ ok: true });
    // The read happens on every reset; the WRITE only when it changes anything.
    expect(authCalls.some((c) => c.fn === "getUserById")).toBe(true);
    expect(emailUpdates()).toHaveLength(0);
    expect(passwordUpdates()).toHaveLength(1);
    expect(auditEntries[0]?.opts.metadata).toMatchObject({ emailReconciled: false });
  });

  it("repairs a pending- address BEFORE the password is written", async () => {
    currentEmail = PENDING;

    const res = await reset();

    expect(res).toEqual({ ok: true });
    expect(emailUpdates()[0]?.attrs).toMatchObject({
      email: SYNTHETIC,
      // Unconfirmed would swap one silent login failure for another.
      email_confirm: true,
    });
    // Order matters: a password written first is a password on an address that
    // nothing signs in with.
    const sequence = authCalls
      .filter((c) => c.fn === "updateUserById")
      .map((c) => ("email" in (c.attrs ?? {}) ? "email" : "password"));
    expect(sequence).toEqual(["email", "password"]);
    expect(auditEntries[0]?.opts.metadata).toMatchObject({ emailReconciled: true });
  });

  it("does NOT change the password when the repair fails", async () => {
    currentEmail = PENDING;
    emailUpdateError = { message: "email address is already in use" };

    const res = await reset();

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["auth.child.err.updateFailed"]);
    expect(passwordUpdates()).toHaveLength(0);
    // Nothing was written, so nothing is claimed in the audit trail either.
    expect(auditEntries).toHaveLength(0);
  });

  it("writes the address anyway when the current one cannot be read", async () => {
    // A read failure must never be mistaken for "already correct" — that is the
    // one wrong outcome nothing downstream could detect.
    currentEmail = null;

    expect(await reset()).toEqual({ ok: true });
    expect(emailUpdates()).toHaveLength(1);
  });
});

describe("resetChildPassword — an account with no login id is refused", () => {
  it("refuses a child with no 8-digit id instead of reporting success", async () => {
    credRow = { auth_user_id: AUTH_USER, child_unique_id: null };

    const res = await reset();

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["auth.child.err.noLoginId"]);
    // No password, no address, nothing: the account needs an id, not a reset.
    expect(authCalls).toHaveLength(0);
  });
});

describe("resetChildPassword — ownership and the lockout", () => {
  it("refuses a child the parent neither created nor is linked to", async () => {
    studentRow = { created_by_parent_profile_id: "someone-else" };

    const res = await reset();

    expect(res.ok === false && res.errors).toEqual(["auth.child.err.notYourChild"]);
    expect(authCalls).toHaveLength(0);
  });

  it("deletes the child's failed attempts and keeps the successful ones", async () => {
    await reset();

    const cleared = tableCalls.find(
      (c) => c.table === "child_login_attempts" && c.mode === "delete",
    );
    expect(cleared?.filters).toEqual([
      ["child_unique_id", CHILD_ID],
      ["success", false],
    ]);
    expect(auditEntries[0]?.opts.metadata).toMatchObject({ lockoutCleared: true });
  });

  it("still reports success when the clear fails — the password DID change", async () => {
    deleteError = { message: "permission denied" };

    expect(await reset()).toEqual({ ok: true });
    expect(auditEntries[0]?.opts.metadata).toMatchObject({ lockoutCleared: false });
  });
});
