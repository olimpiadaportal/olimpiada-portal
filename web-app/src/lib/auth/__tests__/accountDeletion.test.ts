// Self-serve account deletion — does it actually delete, and does it ever lie?
//
// THE BUG THIS PINS (fixed 2026-09-02). The old core ran
// `await admin.auth.admin.deleteUser(id).catch(() => {})`. That looks like
// "delete and ignore failures". It is worse: auth-js's deleteUser CATCHES every
// AuthError and RETURNS it as `{ data, error }` instead of throwing, so
// `.catch()` intercepted almost nothing and the discarded return value was the
// only place a failure was ever visible. The route then answered
// `{ ok: true, deleted: true }` unconditionally.
//
// In production, two of five real deletions removed NOTHING — auth user alive,
// unbanned, profile intact — while the person was told their account was gone
// and signed out. They could sign straight back in. That is the whole reported
// bug, and none of it was client-side or iOS-specific: a fresh credential login
// is answered by GoTrue, which never consults the phone's Keychain.
//
// So every test here is about the SEAM BETWEEN "the API returned" AND "the row
// is gone". A test that mocks deleteUser to resolve `{ error: null }` and
// asserts no throw would have passed on the broken code.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AuthUser = { id: string };

/**
 * Ids GoTrue STILL reports as present after a delete attempt.
 *
 * Deliberately not mutated by the deleteUser mock: the state that matters here
 * is "the call returned 2xx and the row is still there", which is precisely
 * what the old code could not represent and what put a live account behind a
 * "your account has been deleted" message.
 */
let surviving = new Set<string>();
/** Ids whose delete call returns an error, keyed to the status to return. */
let deleteErrors = new Map<string, number>();
/** Ids whose verification read fails with this status. */
let verifyErrors = new Map<string, number>();

const deleteCalls: string[] = [];
const verifyCalls: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];

let studentRows: { profile_id: string }[] = [];
let credRows: { auth_user_id: string }[] = [];

vi.mock("@/lib/audit", () => ({
  writeAuditLog: async (_p: string, action: string, opts?: { metadata?: Record<string, unknown> }) => {
    audits.push({ action, metadata: opts?.metadata });
  },
}));

/** Objects the fake Storage reports under each `bucket/prefix`. */
let storageTree = new Map<string, string[]>();
/** Buckets whose list/remove blows up, to prove a purge failure is survivable. */
let storageBroken = false;
const removed: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  getAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          if (storageBroken) throw new Error("storage down");
          const names = storageTree.get(`${bucket}/${prefix}`) ?? [];
          return { data: names.map((name) => ({ name })), error: null };
        },
        remove: async (paths: string[]) => {
          if (storageBroken) throw new Error("storage down");
          for (const path of paths) removed.push(`${bucket}/${path}`);
          return { data: null, error: null };
        },
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: table === "students" ? studentRows : [], error: null }),
        in: async () => ({ data: table === "child_credentials" ? credRows : [], error: null }),
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
          verifyCalls.push(id);
          const status = verifyErrors.get(id);
          if (status !== undefined) {
            return { data: { user: null }, error: { message: "nope", status } };
          }
          const user: AuthUser | null = surviving.has(id) ? { id } : null;
          return { data: { user }, error: null };
        },
      },
    },
  }),
}));

const PARENT_PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const PARENT_AUTH = "9f8c1d2e-1111-4222-8333-444455556666";
const CHILD_AUTH = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

async function subject() {
  const mod = await import("@/lib/auth/parentCore");
  return mod.deleteParentAccountCore;
}

beforeEach(() => {
  surviving = new Set();
  deleteErrors = new Map();
  verifyErrors = new Map();
  deleteCalls.length = 0;
  verifyCalls.length = 0;
  audits.length = 0;
  studentRows = [];
  credRows = [];
  storageTree = new Map();
  storageBroken = false;
  removed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the happy path still works", () => {
  it("deletes the parent and verifies the row is gone", async () => {
    const del = await subject();
    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).resolves.toBeUndefined();

    expect(deleteCalls).toEqual([PARENT_AUTH]);
    expect(verifyCalls).toEqual([PARENT_AUTH]);
    expect(audits[0]?.action).toBe("parent.account_delete");
  });

  it("deletes each child auth user before the parent", async () => {
    studentRows = [{ profile_id: "student-1" }];
    credRows = [{ auth_user_id: CHILD_AUTH }];
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH });

    expect(deleteCalls).toEqual([CHILD_AUTH, PARENT_AUTH]);
  });
});

describe("a failed deletion must NEVER be reported as success", () => {
  it("throws when GoTrue returns an error for the parent", async () => {
    // The exact production failure: deleteUser RETURNS an error object.
    deleteErrors.set(PARENT_AUTH, 500);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.toThrow(/account_delete_incomplete/);
  });

  it("throws when the delete SUCCEEDS but the user is still there", async () => {
    // A 2xx with the row still present is the state the old code could not
    // even represent, and it is the one that put a live account behind a
    // "your account has been deleted" message.
    surviving.add(PARENT_AUTH);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.toThrow(/account_delete_incomplete/);
  });

  it("throws when a CHILD survives, even though the parent went cleanly", async () => {
    // A surviving child auth user is its own working login — the synthetic
    // c<id>@children.invalid address with the parent's password. Production
    // already holds 12 such orphans, 9 of which have signed in since.
    studentRows = [{ profile_id: "student-1" }];
    credRows = [{ auth_user_id: CHILD_AUTH }];
    surviving.add(CHILD_AUTH);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.toThrow(/account_delete_incomplete/);
    // ...and it still attempted the parent rather than bailing early.
    expect(deleteCalls).toContain(PARENT_AUTH);
  });

  it("refuses outright when there is no auth user id", async () => {
    // This used to be `if (params.authUserId)` — a silent skip that deleted the
    // children and left the parent able to log in.
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: null }),
    ).rejects.toThrow(/account_delete_no_auth_user/);
    expect(deleteCalls).toEqual([]);
  });

  it("never leaks the upstream message in what it throws", async () => {
    deleteErrors.set(PARENT_AUTH, 500);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.not.toThrow(/boom/);
  });
});

describe("deletion is idempotent, so a retry can finish the job", () => {
  it("treats an already-absent user as deleted", async () => {
    // After a partial failure the person retries. Tripping over the users the
    // first attempt DID remove would make the account permanently unfixable.
    deleteErrors.set(PARENT_AUTH, 404);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).resolves.toBeUndefined();
  });

  it("accepts a 404 from the verification read as proof of absence", async () => {
    verifyErrors.set(PARENT_AUTH, 404);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).resolves.toBeUndefined();
  });

  it("does NOT accept any other verification failure as proof", async () => {
    verifyErrors.set(PARENT_AUTH, 500);
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.toThrow(/account_delete_incomplete/);
  });
});

describe("the family's FILES go too", () => {
  // media_assets.owner_profile_id is ON DELETE SET NULL and nothing ever
  // removed the objects, so a deleted child's PHOTOGRAPH stayed in the bucket.
  // Production is holding four of those right now. On a platform whose users
  // are minors, "we deleted your account" has to include the picture.
  it("purges the child's private avatar objects", async () => {
    studentRows = [{ profile_id: "student-1" }];
    credRows = [{ auth_user_id: CHILD_AUTH }];
    storageTree.set("child-avatars/students/student-1", ["a.jpg", "b.jpg"]);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH });

    expect(removed).toContain("child-avatars/students/student-1/a.jpg");
    expect(removed).toContain("child-avatars/students/student-1/b.jpg");
  });

  it("purges the parent's public avatar objects", async () => {
    storageTree.set(`profile-avatars/${PARENT_AUTH}`, ["me.png"]);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH });

    expect(removed).toContain(`profile-avatars/${PARENT_AUTH}/me.png`);
  });

  it("sweeps legacy child uploads from the PUBLIC bucket too", async () => {
    // Before migration 096 a child's own upload landed in profile-avatars,
    // keyed by their auth user id. Those objects are the world-readable ones.
    studentRows = [{ profile_id: "student-1" }];
    credRows = [{ auth_user_id: CHILD_AUTH }];
    storageTree.set(`profile-avatars/${CHILD_AUTH}`, ["old-public.jpg"]);
    const del = await subject();

    await del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH });

    expect(removed).toContain(`profile-avatars/${CHILD_AUTH}/old-public.jpg`);
  });

  it("purges NOTHING when the deletion is refused", async () => {
    // Ordering is load-bearing in the opposite direction to the intuitive one.
    // Deleting a family's photographs before the account is gone means any
    // refusal destroys their pictures while leaving the family intact — and
    // refusal is a reachable outcome now that the cascade trigger raises rather
    // than stranding a child login (migration 167). Irreversible work goes
    // AFTER the reversible work succeeded.
    studentRows = [{ profile_id: "student-1" }];
    credRows = [{ auth_user_id: CHILD_AUTH }];
    storageTree.set("child-avatars/students/student-1", ["a.jpg"]);
    surviving.add(PARENT_AUTH); // the parent delete will be judged incomplete
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).rejects.toThrow(/account_delete_incomplete/);

    expect(removed).toEqual([]);
  });

  it("does NOT fail the deletion when Storage is unavailable", async () => {
    // Revoking the LOGIN is the part that must not fail silently. A leftover
    // object is a retention problem; a leftover login is a security one, so a
    // transient Storage error must never leave an account alive.
    storageBroken = true;
    const del = await subject();

    await expect(
      del({ parentProfileId: PARENT_PROFILE, authUserId: PARENT_AUTH }),
    ).resolves.toBeUndefined();
    expect(deleteCalls).toEqual([PARENT_AUTH]);
  });
});
