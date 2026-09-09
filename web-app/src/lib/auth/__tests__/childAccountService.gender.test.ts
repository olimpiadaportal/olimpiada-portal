// The optional child gender (migration 169) is written AFTER the provisioning
// transaction, and that is not going to change: create_child_account is a
// SECURITY DEFINER function whose 11-arg signature validation check 66 asserts
// exactly, so carrying the value inside the transaction is a migration that has
// to land on both databases before this code deploys. The follow-up write is
// therefore permanent — which makes how it FAILS the whole question.
//
// WHAT THIS PINS. A failed gender write must never come back as a bare success.
// The child is created, the login works, the wizard advances — and the answer
// the parent gave lands in the column as NULL, which is the value that means
// "nobody has been asked". The two states the migration went to the trouble of
// keeping apart are collapsed, by the one code path where the parent is
// standing right there and could fix it in ten seconds if anybody told them.
//
// TWO FAILURE SHAPES, BOTH SILENT. An error from PostgREST is the obvious one.
// The other is an UPDATE that matches no row: that is not an error, it is a
// 204 with an empty body, so a plain `if (error)` check calls it a save. The
// filter is `profile_id = <id returned by another statement>`, so "matched
// nothing" is exactly the shape a mismatch would take.
//
// WHAT MUST NOT HAPPEN EITHER: the saga deleting the child. An account is worth
// far more than a statistic, so this stays a warning on a success — never an
// error, never a rollback.
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
const deletedAuthUsers: string[] = [];

/** What the students UPDATE answers. `error` = PostgREST refused it; `row` =
 *  what came back, and `null` is the row-matched-nothing case (NOT an error). */
let genderUpdate: {
  error: { message: string } | null;
  row: { gender: string | null } | null;
} = { error: null, row: { gender: "female" } };

function builder(table: string) {
  const call: Update = { table, values: {} };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    update: (values: Record<string, unknown>) => ((call.values = values), b),
    select: () => b,
    eq: () => b,
    maybeSingle: async () => {
      updates.push(call);
      return { data: genderUpdate.row, error: genderUpdate.error };
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
  rpc: async () => ({
    data: [{ new_student_profile_id: CHILD, new_child_unique_id: CHILD_ID }],
    error: null,
  }),
  auth: {
    admin: {
      createUser: async () => ({ data: { user: { id: AUTH_USER } }, error: null }),
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

const create = (gender?: string | null) =>
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

const genderUpdates = () => updates.filter((u) => "gender" in u.values);

beforeEach(() => {
  updates.length = 0;
  deletedAuthUsers.length = 0;
  genderUpdate = { error: null, row: { gender: "female" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createChild — a gender that did not save is not a success story", () => {
  it("warns when the write is REFUSED, and still keeps the child", async () => {
    genderUpdate = { error: { message: "permission denied" }, row: null };

    const res = await create("female");

    // The child is kept: a created account beats a failed registration over an
    // optional statistic, and the saga must not have run.
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.studentProfileId).toBe(CHILD);
    expect(deletedAuthUsers).toHaveLength(0);
    // ...but the parent is told. This is the assertion that fails if anyone
    // goes back to logging the miss and returning a clean success.
    expect(res.ok === true && res.warnings).toEqual(["addchild.warn.genderNotSaved"]);
  });

  it("warns when the update matched NO ROW — which PostgREST calls success", async () => {
    genderUpdate = { error: null, row: null };

    const res = await create("male");

    expect(res.ok).toBe(true);
    expect(res.ok === true && res.warnings).toEqual(["addchild.warn.genderNotSaved"]);
  });

  it("warns when the column came back holding something else", async () => {
    // A value silently coerced or overwritten by a trigger is still an answer
    // the parent gave and the platform does not have.
    genderUpdate = { error: null, row: { gender: "unspecified" } };

    const res = await create("male");

    expect(res.ok === true && res.warnings).toEqual(["addchild.warn.genderNotSaved"]);
  });

  it("says nothing when the answer is actually stored", async () => {
    genderUpdate = { error: null, row: { gender: "female" } };

    const res = await create("female");

    expect(res.ok === true && res.warnings).toEqual([]);
    expect(genderUpdates()).toHaveLength(1);
  });

  it("writes nothing and warns about nothing when no answer was given", async () => {
    // ABSENT IS NOT A FAILURE. An untouched control leaves the column at its
    // "never asked" NULL, so there is no write to fail and nothing to report.
    const res = await create("");

    expect(res.ok === true && res.warnings).toEqual([]);
    expect(genderUpdates()).toHaveLength(0);
  });

  it("never puts the value itself in the log — it is a minor's personal data", async () => {
    genderUpdate = { error: { message: "permission denied" }, row: null };

    await create("female");

    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("female");
  });
});

describe("createChild — the surfaces actually carry the warning", () => {
  // Source-level (the child-delete-gate idiom): the core can report perfectly
  // and the parent still learn nothing if the action, the wizard or the BFF
  // drops the array. Each of those is a one-line omission that compiles.
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

  it("the warning exists in all three locales", async () => {
    const src = await read("i18n/messages.ts");
    const hits = src.match(/"addchild\.warn\.genderNotSaved"/g) ?? [];
    expect(hits).toHaveLength(3); // az / en / ru
  });
});
