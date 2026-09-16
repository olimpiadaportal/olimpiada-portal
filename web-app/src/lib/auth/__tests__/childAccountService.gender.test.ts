// The child gender now rides INSIDE the provisioning transaction, and this file
// pins that it cannot quietly go back to riding outside it.
//
// WHAT THIS FILE USED TO SAY. Until 2026-09-16 the gender was written as its own
// service-role patch AFTER create_child_account committed, because that RPC's
// 11-arg signature was fixed and versioned (migration 064) and validation check
// 66 asserted exactly that arity. A follow-up write can fail on its own, so this
// test's whole job was to prove the failure reached the parent as a warning
// rather than as a clean success. That was the right design for a field a parent
// could decline.
//
// WHY IT NO LONGER IS. The field is MANDATORY (owner, 2026-09-16). A required
// answer whose loss is reported as a warning is a required answer the platform
// does not actually have: the child is created, the wizard advances, and the
// column holds the NULL that means "nobody was ever asked". Migration 178 added
// p_gender as the 12th argument, so the value now commits with the child or not
// at all — and the failure mode this file was written about stops existing
// instead of being handled.
//
// SO WHAT IS PINNED NOW:
//   * the value reaches the RPC, as p_gender, with the exact string submitted;
//   * NOTHING patches `students` after the transaction — a reintroduced
//     follow-up write is the regression, and it would look like a fix;
//   * a create with no gender is REFUSED BEFORE an auth user exists, so a
//     refusal leaves nothing behind to clean up;
//   * the success still carries `warnings`, now always empty. The array stays
//     because the shape recurs and the mobile BFF and app carry it end to end.
import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` is a BUILD-TIME guard with no runtime behaviour and no package
// to resolve under Vite (same stub as childAccountService.reset.test.ts).
vi.mock("server-only", () => ({}));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const AUTH_USER = "9f8c1d2e-1111-4222-8333-444455556666";
const CITY = "11111111-2222-4333-8444-555555555555";
const SCHOOL = "22222222-3333-4444-8555-666666666666";
const GRADE = "33333333-4444-4555-8666-777777777777";
const CHILD_ID = "12345678";
const SYNTHETIC = `c${CHILD_ID}@children.invalid`;
const GOOD_PASSWORD = "Xelil!2026";

type Update = { table: string; values: Record<string, unknown> };

const updates: Update[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const createdAuthUsers: string[] = [];
const deletedAuthUsers: string[] = [];

function builder(table: string) {
  const call: Update = { table, values: {} };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    update: (values: Record<string, unknown>) => ((call.values = values), b),
    select: () => b,
    eq: () => b,
    maybeSingle: async () => {
      updates.push(call);
      return { data: null, error: null };
    },
    // Chains awaited without a terminal read (nothing here does, today).
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      updates.push(call);
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  });
  return b as never;
}

const adminClient = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return {
      data: [{ new_student_profile_id: CHILD, new_child_unique_id: CHILD_ID }],
      error: null,
    };
  },
  auth: {
    admin: {
      createUser: async () => (
        createdAuthUsers.push(AUTH_USER), { data: { user: { id: AUTH_USER } }, error: null }
      ),
      // Already the canonical login address, so the reconcile is a no-op read.
      getUserById: async (id: string) => ({
        data: { user: { id, email: SYNTHETIC } },
        error: null,
      }),
      updateUserById: async () => ({ data: {}, error: null }),
      deleteUser: async (id: string) => (deletedAuthUsers.push(id), { data: {}, error: null }),
    },
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => adminClient,
  isServiceRoleConfigured: true,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: async () => {} }));

const { createChild } = await import("@/lib/auth/childAccountService");

const create = (gender: string | null) =>
  createChild({
    parentProfileId: PARENT,
    password: GOOD_PASSWORD,
    info: {
      firstName: "Aysu",
      lastName: "Məmmədova",
      districtId: CITY,
      schoolId: SCHOOL,
      gradeId: GRADE,
      gender,
    },
  });

const provisioning = () => rpcCalls.find((c) => c.fn === "create_child_account");
const genderUpdates = () => updates.filter((u) => "gender" in u.values);

beforeEach(() => {
  updates.length = 0;
  rpcCalls.length = 0;
  createdAuthUsers.length = 0;
  deletedAuthUsers.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createChild — the gender commits with the child", () => {
  it("passes the answer to the RPC as p_gender", async () => {
    const res = await create("female");

    expect(res.ok).toBe(true);
    expect(res.ok === true && res.studentProfileId).toBe(CHILD);
    expect(provisioning()?.args.p_gender).toBe("female");
  });

  it("writes NOTHING to students afterwards", async () => {
    // THE REGRESSION THIS EXISTS FOR. A follow-up patch would look like a
    // careful belt-and-braces write and would restore the exact failure mode
    // migration 178 removed: a child that exists, a parent told everything
    // worked, and a column holding "nobody was ever asked".
    await create("male");

    expect(genderUpdates()).toHaveLength(0);
    expect(updates.filter((u) => u.table === "students")).toHaveLength(0);
  });

  it("reports no warnings — there is nothing left that can half-succeed", async () => {
    const res = await create("female");
    expect(res.ok === true && res.warnings).toEqual([]);
  });

  it("sends the value verbatim, never a default", async () => {
    for (const gender of ["female", "male"] as const) {
      rpcCalls.length = 0;
      await create(gender);
      expect(provisioning()?.args.p_gender).toBe(gender);
    }
  });
});

describe("createChild — a child is never created without an answer", () => {
  it("REFUSES a missing gender, and before any auth user exists", async () => {
    // Order matters: validation runs ahead of admin.createUser, so a refusal
    // leaves no orphaned auth user for the saga to clean up — and the parent
    // keeps their form.
    const res = await create(null);

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toContain("addchild.err.genderRequired");
    expect(createdAuthUsers).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(deletedAuthUsers).toHaveLength(0);
  });

  it("REFUSES a blank one the same way", async () => {
    const res = await create("");
    expect(res.ok === false && res.errors).toContain("addchild.err.genderRequired");
    expect(rpcCalls).toHaveLength(0);
  });

  it("REFUSES the retired 'unspecified' rather than storing it", async () => {
    // It stays a legal value for rows written before the rule; it is not a
    // legal thing to create a NEW child with.
    const res = await create("unspecified");
    expect(res.ok === false && res.errors).toContain("addchild.err.genderRequired");
    expect(rpcCalls).toHaveLength(0);
  });

  it("REFUSES a forged value with the invalid key, never reaching the column", async () => {
    // Out here it is a field error the parent can act on; at the column it
    // would be a 22P02 they read as a generic failure.
    const res = await create("Female");
    expect(res.ok === false && res.errors).toContain("addchild.err.genderInvalid");
    expect(rpcCalls).toHaveLength(0);
  });

  it("never puts the value itself in a log — it is a minor's personal data", async () => {
    await create("female");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("female");
  });
});

describe("createChild — the surfaces still carry the warnings channel", () => {
  // Source-level (the child-delete-gate idiom): the array is empty today, and
  // the path back to the parent is what made the OLD bug fixable. Dropping it
  // now would have to be undone by the next partial save, and each of these is
  // a one-line omission that compiles.
  const read = async (rel: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(__dirname, "..", "..", "..", rel), "utf8");
  };

  it("the parent action returns the core's warnings with the success", async () => {
    const src = await read("lib/auth/parentService.ts");
    expect(src).toContain("warnings: result.warnings");
  });

  it("the Add-Child wizard renders them", async () => {
    const src = await read("components/AddChildWizard.tsx");
    expect(src).toContain("setInfoWarnings(res.warnings ?? [])");
    expect(src).toMatch(/infoWarnings\.length > 0/);
  });

  it("the mobile BFF forwards them in the success envelope", async () => {
    const src = await read("app/api/mobile/v1/children/route.ts");
    expect(src).toContain("warnings: result.warnings");
  });
});
