// Deleting a parent from the admin panel, once a child can have two adults.
//
// THE BUG THIS PINS (migration 174). `deleteParent` deleted the parent's
// CHILDREN first, one auth user at a time, and the parent LAST. That reads like
// a tidy cascade and is in fact the whole defect: the protective BEFORE DELETE
// trigger on public.parents — where the shared-child exclusion, the co-parent
// promotion and migration 167's refusal-to-strand-a-login all live — fired on an
// EMPTY set, because every child was already gone by the time it ran. The
// trigger was never bypassed. It was starved.
//
// The second half of the same defect was the QUERY: each deletion path carried
// its own `students where created_by_parent_profile_id = the parent`. Three
// copies (here, the web app's deleteParentAccountCore, and the trigger) that
// nothing forced to agree — and they disagree in the worst direction, because
// `created_by` includes a shared child this parent merely created while the
// trigger deliberately excludes them. Both paths now READ the one shared rule,
// public.parent_children_to_delete().
//
// None of this is reachable today: nothing mints a second link yet. That is
// exactly why it is pinned now — the day it becomes reachable is the day the
// first parent to close their account destroys a child who still has a living
// second parent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";

const ADMIN_PROFILE = "admin-profile-1";
const PARENT_PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const PARENT_AUTH = "9f8c1d2e-1111-4222-8333-444455556666";
const SOLE_CHILD = "aa0e8400-e29b-41d4-a716-446655440000";
const SOLE_CHILD_AUTH = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SHARED_CHILD = "bb1e8400-e29b-41d4-a716-446655440001";
const SHARED_CHILD_AUTH = "4f2504e0-4f89-11d3-9a0c-0305e82c3302";

/** What public.parent_children_to_delete answers for this parent. */
let deletable: string[] = [];
/** Makes that RPC fail, with a Postgres code. */
let ruleError: { code: string } | null = null;
/** student_profile_id -> the auth user id in child_credentials. */
let credentials = new Map<string, string>();
/** student_profile_id -> how many ACTIVE parent links it has. */
let activeLinks = new Map<string, number>();
/** Makes the link count read fail. */
let linkError: { code: string } | null = null;

/** Auth ids GoTrue still reports as present after a delete attempt. */
let surviving = new Set<string>();
const deleteCalls: string[] = [];
const rpcCalls: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/guards", () => ({
  requireAdmin: async () => ({ profileId: ADMIN_PROFILE, isAdmin: true }),
}));
vi.mock("@/i18n/server", () => ({
  getT: async () => (key: string) => messages.az[key] ?? key,
  getLocale: async () => "az",
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (row: { action: string; metadata?: Record<string, unknown> }) => {
    audits.push({ action: row.action, metadata: row.metadata });
    return true;
  },
}));

/**
 * A PostgREST-shaped stub, narrow on purpose: it answers only the reads these
 * two actions make, and throws on anything else, so a future edit that reaches
 * for a table this test does not model fails loudly rather than silently
 * getting `undefined`.
 *
 * It is THENABLE because one of those reads has no terminal method:
 * `select("id", { count: "exact", head: true }).eq(…)` is awaited directly.
 */
interface FakeQuery {
  select: (cols?: string, opts?: { count?: string; head?: boolean }) => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  in: (col: string, vals: unknown[]) => FakeQuery;
  maybeSingle: () => Promise<unknown>;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

function makeQuery(table: string): FakeQuery {
  const filters: Record<string, unknown> = {};
  const q: FakeQuery = {
    select: () => q,
    eq: (col, val) => {
      filters[col] = val;
      return q;
    },
    in: (col, vals) => {
      filters[col] = vals;
      return q;
    },
    maybeSingle: async () => {
      if (table === "roles") return { data: { id: "role-parent" }, error: null };
      if (table === "profile_roles") return { data: { profile_id: PARENT_PROFILE }, error: null };
      if (table === "profiles") {
        return { data: { id: PARENT_PROFILE, auth_user_id: PARENT_AUTH }, error: null };
      }
      if (table === "students") return { data: { profile_id: filters.profile_id }, error: null };
      if (table === "child_credentials") {
        const id = credentials.get(String(filters.student_profile_id));
        return { data: id ? { auth_user_id: id } : null, error: null };
      }
      throw new Error("unmodelled maybeSingle on " + table);
    },
    then: (resolve) => {
      if (table === "parent_student_links") {
        if (linkError) return resolve({ data: null, count: null, error: linkError });
        const n = activeLinks.get(String(filters.student_profile_id)) ?? 1;
        return resolve({ data: null, count: n, error: null });
      }
      if (table === "child_credentials") {
        const ids = (filters.student_profile_id as string[] | undefined) ?? [];
        const rows = ids
          .map((id) => credentials.get(id))
          .filter((v): v is string => typeof v === "string")
          .map((auth_user_id) => ({ auth_user_id }));
        return resolve({ data: rows, error: null });
      }
      throw new Error("unmodelled await on " + table);
    },
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => true,
  createAdminClient: () => ({
    from: (table: string) => makeQuery(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(fn);
      if (typeof args?.p_parent !== "string") {
        throw new Error("rpc " + fn + " called without p_parent");
      }
      if (ruleError) return { data: null, error: ruleError };
      return { data: deletable.map((id) => ({ child_profile_id: id })), error: null };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleteCalls.push(id);
          return { data: { user: null }, error: null };
        },
        getUserById: async (id: string) => ({
          data: { user: surviving.has(id) ? { id } : null },
          error: null,
        }),
      },
    },
  }),
}));

const { deleteParent, deleteChild } = await import("@/lib/admin/accounts");

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const CONFIRM = messages.az["accounts.delete.confirmWord"];

beforeEach(() => {
  deletable = [SOLE_CHILD];
  ruleError = null;
  credentials = new Map([
    [SOLE_CHILD, SOLE_CHILD_AUTH],
    [SHARED_CHILD, SHARED_CHILD_AUTH],
  ]);
  activeLinks = new Map();
  linkError = null;
  surviving = new Set();
  deleteCalls.length = 0;
  rpcCalls.length = 0;
  audits.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteParent lets the database decide who dies", () => {
  it("deletes the PARENT first, then sweeps the child logins", async () => {
    // The order IS the fix — see the file header. Children-first starved the
    // trigger that protects shared children.
    const res = await deleteParent(
      {},
      form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }),
    );

    expect(res).toEqual({ ok: true });
    expect(deleteCalls).toEqual([PARENT_AUTH, SOLE_CHILD_AUTH]);
  });

  it("reads the shared rule instead of re-deriving it", async () => {
    await deleteParent({}, form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }));

    expect(rpcCalls).toContain("parent_children_to_delete");
  });

  it("never touches a child the shared rule left out", async () => {
    // The parent CREATED this child, but a co-parent holds an active link, so
    // the child survives them. The old `created_by` query would have killed it.
    deletable = [];

    await deleteParent({}, form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }));

    expect(deleteCalls).toEqual([PARENT_AUTH]);
    expect(deleteCalls).not.toContain(SHARED_CHILD_AUTH);
  });

  it("still deletes a sole-parent child standing beside a shared sibling", async () => {
    // The rule is per CHILD, not per family.
    deletable = [SOLE_CHILD];

    await deleteParent({}, form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }));

    expect(deleteCalls).toEqual([PARENT_AUTH, SOLE_CHILD_AUTH]);
  });

  it("REFUSES when the shared rule cannot be read", async () => {
    // "The rule is unavailable" and "this parent has no children" are different
    // facts. Collapsing them deletes the parent and orphans every child — the
    // still-loginable account migration 098 exists to abolish.
    ruleError = { code: "57014" };

    const res = await deleteParent(
      {},
      form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }),
    );

    expect(res).toEqual({ error: messages.az["accounts.delete.err.failed"] });
    expect(deleteCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("does NOT sweep the children when the parent delete failed", async () => {
    // The original bug inverted: the family would keep their account and lose
    // their children.
    surviving.add(PARENT_AUTH);

    const res = await deleteParent(
      {},
      form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }),
    );

    expect(res).toEqual({ error: messages.az["accounts.delete.err.failed"] });
    expect(deleteCalls).toEqual([PARENT_AUTH]);
  });

  it("audits the shared rule's count, not 'everyone I created'", async () => {
    deletable = [SOLE_CHILD];

    await deleteParent({}, form({ parent_profile_id: PARENT_PROFILE, confirm: CONFIRM }));

    expect(audits[0]).toMatchObject({
      action: "admin.parent.delete",
      metadata: { childrenDeleted: 1 },
    });
  });
});

describe("deleteChild refuses a child with a second adult", () => {
  it("refuses rather than letting the row guard answer with a 500", async () => {
    activeLinks.set(SHARED_CHILD, 2);

    const res = await deleteChild(
      {},
      form({ student_profile_id: SHARED_CHILD, confirm: CONFIRM }),
    );

    expect(res).toEqual({ error: messages.az["accounts.delete.err.failed"] });
    expect(deleteCalls).toEqual([]);
  });

  it("still deletes a child nobody else holds", async () => {
    activeLinks.set(SOLE_CHILD, 1);

    const res = await deleteChild(
      {},
      form({ student_profile_id: SOLE_CHILD, confirm: CONFIRM }),
    );

    expect(res).toEqual({ ok: true });
    expect(deleteCalls).toEqual([SOLE_CHILD_AUTH]);
  });

  it("refuses rather than guessing when the link count cannot be read", async () => {
    linkError = { code: "57014" };

    const res = await deleteChild(
      {},
      form({ student_profile_id: SOLE_CHILD, confirm: CONFIRM }),
    );

    expect(res).toEqual({ error: messages.az["accounts.delete.err.failed"] });
    expect(deleteCalls).toEqual([]);
  });
});
