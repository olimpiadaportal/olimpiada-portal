// Parent deletes ONE child — does it delete, and does it ever answer "done"
// when it did not?
//
// THE TWO BUGS THIS PINS (both fixed 2026-09-04, in deleteChildCore).
//
// 1. The ending was `await admin.auth.admin.deleteUser(id).catch(() => {})` —
//    the same swallow account deletion was fixed for two days earlier. auth-js
//    CATCHES every AuthError internally and RETURNS it as `{ data, error }`, so
//    `.catch()` intercepted almost nothing and the discarded return value was
//    the only report a failure ever got. When it failed, NOTHING was deleted:
//    auth user, profile and student row all survived and the child's login kept
//    working, while the dashboard showed the child as removed.
// 2. The signature was `Promise<void>`, and a missing id, an unknown student and
//    ANOTHER parent's student each `return`ed early — three refusals that looked
//    exactly like the success path, revalidate included.
//
// So every test here sits on the seam between "the call returned" and "the row
// is gone", or on the seam between "refused" and "done". A test that mocked
// deleteUser to resolve `{ error: null }` and asserted no throw would have
// passed on the broken code.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Ids GoTrue STILL reports as present after a delete attempt. */
let surviving = new Set<string>();
/** Ids whose delete call returns an error, keyed to the status to return. */
let deleteErrors = new Map<string, number>();
/** Ids whose verification read fails with this status. */
let verifyErrors = new Map<string, number>();

const deleteCalls: string[] = [];
const audits: { action: string; success?: boolean }[] = [];

/** The `students` row the ownership re-check reads (null = no such child). */
let studentRow: { created_by_parent_profile_id: string } | null = null;
/**
 * Makes the `students` read FAIL, which is a different thing from the row being
 * absent — and the difference now decides whether a parent is told their child
 * was deleted. See the "a failed READ is not an absent ROW" test.
 */
let studentReadError: { code: string } | null = null;
/** The `profiles` row the login lookup reads. */
let profileRow: { auth_user_id: string | null } | null = null;

vi.mock("@/lib/audit", () => ({
  writeAuditLog: async (_p: string, action: string, opts?: { success?: boolean }) => {
    audits.push({ action, success: opts?.success });
  },
}));

/** Objects the fake Storage reports under each `bucket/prefix`. */
let storageTree = new Map<string, string[]>();
/** Makes list/remove blow up, to prove a purge failure is survivable. */
let storageBroken = false;
const removed: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: true,
  getAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          if (storageBroken) throw new Error("storage down");
          const names = storageTree.get(bucket + "/" + prefix) ?? [];
          return { data: names.map((name) => ({ name })), error: null };
        },
        remove: async (paths: string[]) => {
          if (storageBroken) throw new Error("storage down");
          for (const path of paths) removed.push(bucket + "/" + path);
          return { data: null, error: null };
        },
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            // supabase-js never returns a row AND an error together: a failed
            // read yields { data: null, error }. Modelling that faithfully is
            // the whole point here — it is the null that used to fall into the
            // "no such child" branch, which is what made a database hiccup
            // indistinguishable from a completed deletion.
            const err = table === "students" ? studentReadError : null;
            if (err) return { data: null, error: err };
            return { data: table === "students" ? studentRow : profileRow, error: null };
          },
        }),
      }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleteCalls.push(id);
          const status = deleteErrors.get(id);
          if (status !== undefined) {
            // auth-js RETURNS the error; it does not throw. This is the exact
            // shape the old `.catch()` could never see.
            return { data: { user: null }, error: { message: "boom", status } };
          }
          return { data: { user: null }, error: null };
        },
        getUserById: async (id: string) => {
          const status = verifyErrors.get(id);
          if (status !== undefined) {
            return { data: { user: null }, error: { message: "nope", status } };
          }
          return { data: { user: surviving.has(id) ? { id } : null }, error: null };
        },
      },
    },
  }),
}));

const PARENT_PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const OTHER_PARENT = "11111111-2222-4333-8444-555566667777";
const STUDENT = "aa0e8400-e29b-41d4-a716-446655440000";
const CHILD_AUTH = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

async function subject() {
  const mod = await import("@/lib/auth/parentCore");
  return mod.deleteChildCore;
}

beforeEach(() => {
  surviving = new Set();
  deleteErrors = new Map();
  verifyErrors = new Map();
  deleteCalls.length = 0;
  audits.length = 0;
  studentRow = { created_by_parent_profile_id: PARENT_PROFILE };
  studentReadError = null;
  profileRow = { auth_user_id: CHILD_AUTH };
  storageTree = new Map();
  storageBroken = false;
  removed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the happy path", () => {
  it("deletes the child's auth user and reports ok", async () => {
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).resolves.toEqual({ ok: true });
    expect(deleteCalls).toEqual([CHILD_AUTH]);
    expect(audits[0]).toEqual({ action: "parent.child_delete", success: true });
  });
});

describe("a refusal is not a deletion", () => {
  // All four of these used to be a bare `return` from a void function, so
  // neither the caller nor the parent watching the dashboard could tell them
  // apart from a child that had actually been removed.
  it("refuses a malformed student id without touching auth", async () => {
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: "not-a-uuid" }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.childNotFound" });
    expect(deleteCalls).toEqual([]);
  });

  it("refuses an id that matches no child", async () => {
    studentRow = null;
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.childNotFound" });
    expect(deleteCalls).toEqual([]);
  });

  it("does NOT report a failed READ as an absent ROW", async () => {
    // `childNotFound` is no longer a plain refusal: the mobile client treats it
    // as "already gone, count it as done", so that retrying after a slow but
    // COMPLETED delete stops accusing the parent of not owning their own child.
    // That makes this the one key a transient database error must never borrow —
    // it would show a green "account deleted" toast while the auth user, the
    // profile, the students row and the child's working 8-digit login all
    // survive. Same invariant childOwnershipCore upholds on the route's gate.
    studentReadError = { code: "57014" }; // statement timeout
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.serverError" });
    expect(deleteCalls).toEqual([]);
  });

  it("refuses ANOTHER parent's child, and deletes nothing", async () => {
    // The ownership re-check is the security-relevant one: the id arrives from
    // the client on both surfaces.
    studentRow = { created_by_parent_profile_id: OTHER_PARENT };
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.notYourChild" });
    expect(deleteCalls).toEqual([]);
  });

  it("refuses a child with no auth user rather than silently doing nothing", async () => {
    // Half-finished provisioning: there is no login to revoke, and the row is
    // still there afterwards, so ok would be the same lie in a quieter voice.
    profileRow = { auth_user_id: null };
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.serverError" });
    expect(deleteCalls).toEqual([]);
  });
});

describe("a failed deletion must NEVER be reported as success", () => {
  it("reports the failure when GoTrue returns an error", async () => {
    deleteErrors.set(CHILD_AUTH, 500);
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.serverError" });
  });

  it("reports the failure when the delete SUCCEEDS but the user is still there", async () => {
    // A 2xx with the row still present is the state the old code could not even
    // represent, and the one that leaves a working child login behind a
    // "deleted" card.
    surviving.add(CHILD_AUTH);
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.serverError" });
  });

  it("does NOT accept a non-404 verification failure as proof of absence", async () => {
    verifyErrors.set(CHILD_AUTH, 500);
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: false, errorKey: "auth.child.err.serverError" });
  });

  it("records the refusal in the audit trail", async () => {
    deleteErrors.set(CHILD_AUTH, 500);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT });

    expect(audits[0]).toEqual({ action: "parent.child_delete", success: false });
  });

  it("never returns the upstream message", async () => {
    // The key is all a client ever sees; "boom" belongs in the server log.
    deleteErrors.set(CHILD_AUTH, 500);
    const del = await subject();

    const res = await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT });

    expect(JSON.stringify(res)).not.toMatch(/boom/);
  });
});

describe("deletion stays idempotent, so a retry can finish the job", () => {
  it("treats an already-absent auth user as deleted", async () => {
    deleteErrors.set(CHILD_AUTH, 404);
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: true });
  });

  it("accepts a 404 from the verification read as proof of absence", async () => {
    verifyErrors.set(CHILD_AUTH, 404);
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: true });
  });
});

describe("the child's FILES go too", () => {
  it("purges the child's private avatar objects", async () => {
    // Nothing ever removed these: a deleted child's PHOTOGRAPH stayed in the
    // bucket. On a platform whose users are minors, "deleted" has to include
    // the picture.
    storageTree.set("child-avatars/students/" + STUDENT, ["a.jpg"]);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT });

    expect(removed).toContain("child-avatars/students/" + STUDENT + "/a.jpg");
  });

  it("sweeps legacy child uploads from the PUBLIC bucket too", async () => {
    // Before migration 096 a child's own upload landed in profile-avatars,
    // keyed by their auth user id. Those objects are the world-readable ones.
    storageTree.set("profile-avatars/" + CHILD_AUTH, ["old-public.jpg"]);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT });

    expect(removed).toContain("profile-avatars/" + CHILD_AUTH + "/old-public.jpg");
  });

  it("purges NOTHING when the deletion is refused", async () => {
    // Irreversible work goes AFTER the reversible work succeeded, or a refusal
    // destroys the family's pictures while leaving the child account intact.
    storageTree.set("child-avatars/students/" + STUDENT, ["a.jpg"]);
    surviving.add(CHILD_AUTH);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT });

    expect(removed).toEqual([]);
  });

  it("does NOT fail the deletion when Storage is unavailable", async () => {
    // A leftover object is a retention problem; a leftover login is a security
    // one. Only the second may fail the operation.
    storageBroken = true;
    const del = await subject();

    expect(
      await del({ parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT }),
    ).toEqual({ ok: true });
  });
});
