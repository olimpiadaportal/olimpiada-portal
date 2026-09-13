// WHAT AN ACTIVE parent_student_links ROW IS ALLOWED TO DO.
//
// Co-parent linking (up to four adults per child) is approved but not yet
// built. Before a SECOND link can be minted, the two things a link used to
// confer had to stop being conferred: the child's PASSWORD — which is their
// login credential, and whoever sets it can sign in AS the child, because the
// 8-digit id is readable through the same link — and the child's AVATAR, whose
// previous object is really deleted on replace.
//
// THIS SUITE IS THE ONLY PLACE THAT NOTICES. Today every link belongs to the
// creator, so "created the child" and "has an active link" return the same
// answer for every row in the database: the narrowing is invisible in the app,
// in the database, and in a click-through. A regression would be equally
// invisible — until the first co-parent exists, and then it is an estranged
// ex-partner changing a child's password. Hence fixtures for a state that does
// not exist in production yet: a parent who holds an ACTIVE link and did NOT
// create the child.
//
// Three distinct outcomes are pinned for every guarded operation:
//   creator   → it works
//   linked    → refused with the creatorOnly key, and NOTHING was written
//   stranger  → refused with notYourChild (a link they do not have is not the
//               reason they were refused, and they are not told about one)
//
// The "nothing was written" half matters more than the return value: a guard
// that refuses AFTER updating the row would satisfy an assertion on the error
// key alone and still have changed the password.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { messages } from "@/i18n/messages";

// `server-only` is a BUILD-TIME marker with no runtime behaviour and no package
// to resolve under Vite. Stubbing it keeps the guard in the real build instead
// of tempting anyone to delete it from the production file.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const CREATOR = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CO_PARENT = "9f8c1d2e-1111-4222-8333-444455556666";
const STRANGER = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const AUTH_USER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const CHILD_ID = "12345678";
// Satisfies the whole strength rule (length, capital, symbol) and is not the id.
const GOOD_PASSWORD = "Xelil!2026";

type Call = {
  table: string;
  mode: "select" | "update" | "delete";
  cols: string;
  patch?: unknown;
  filters: [string, unknown][];
};

const calls: Call[] = [];
const audits: { action: string; opts: Record<string, unknown> }[] = [];
const storageOps: { op: "upload" | "remove"; paths: string[] }[] = [];
const authCalls: { fn: string; attrs?: Record<string, unknown> }[] = [];

/**
 * The link row the fixtures switch on. `linkedParent` is the parent id for
 * which an ACTIVE link exists — the lookup is filtered on parent AND student
 * AND status='active', exactly like production, so a fixture cannot accidentally
 * hand a link to the wrong parent.
 */
let linkedParent: string | null = null;
let avatarPath: string | null = null;

function linkRowFor(filters: [string, unknown][]): { id: string } | null {
  const get = (c: string) => filters.find(([k]) => k === c)?.[1];
  if (get("status") !== "active") return null;
  if (get("student_profile_id") !== CHILD) return null;
  return linkedParent !== null && get("parent_profile_id") === linkedParent
    ? { id: "link-1" }
    : null;
}

function builder(table: string) {
  const call: Call = { table, mode: "select", cols: "", filters: [] };
  const row = (): Record<string, unknown> | null => {
    if (table === "students") {
      if (call.cols.includes("avatar_media_path")) return { avatar_media_path: avatarPath };
      return { created_by_parent_profile_id: CREATOR };
    }
    if (table === "parent_student_links") return linkRowFor(call.filters);
    if (table === "child_credentials") {
      return { auth_user_id: AUTH_USER, child_unique_id: CHILD_ID };
    }
    return null;
  };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: (cols = "") => ((call.cols = cols), b),
    update: (patch: unknown) => ((call.mode = "update"), (call.patch = patch), b),
    delete: () => ((call.mode = "delete"), b),
    eq: (col: string, v: unknown) => (call.filters.push([col, v]), b),
    single: async () => {
      calls.push(call);
      const data = row();
      return { data, error: data ? null : { message: "no rows" } };
    },
    maybeSingle: async () => {
      calls.push(call);
      return { data: row(), error: null };
    },
    // update/delete chains are awaited directly, so the builder is a thenable.
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      calls.push(call);
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  getAdminClient: () => ({
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: AUTH_USER, email: `c${CHILD_ID}@children.invalid` } },
          error: null,
        }),
        updateUserById: async (_id: string, attrs: Record<string, unknown>) => {
          authCalls.push({ fn: "updateUserById", attrs });
          return { data: {}, error: null };
        },
      },
    },
  }),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: async (
    _actor: string | null,
    action: string,
    opts: Record<string, unknown>,
  ) => {
    audits.push({ action, opts });
  },
}));

const { resetChildPassword } = await import("@/lib/auth/childAccountService");
const {
  removeChildAvatarCore,
  setChildAvatarPhotoCore,
  setChildAvatarPresetCore,
} = await import("@/lib/auth/childAvatarCore");

/** The requesting parent's OWN client — the one storage RLS applies to. */
const userClient = {
  storage: {
    from: () => ({
      upload: async (path: string) => {
        storageOps.push({ op: "upload", paths: [path] });
        return { error: null };
      },
      remove: async (paths: string[]) => {
        storageOps.push({ op: "remove", paths });
        return { error: null };
      },
    }),
  },
} as unknown as SupabaseClient;

/** A real PNG by its magic bytes — the cores type uploads from bytes, never
 *  from file.type, and preparePhoto runs BEFORE the guard, so an invalid file
 *  would be refused for the wrong reason and prove nothing. */
function pngFile(): File {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  return new File([bytes], "child.png", { type: "image/png" });
}

const reset = (parentProfileId: string) =>
  resetChildPassword({ parentProfileId, studentProfileId: CHILD, newPassword: GOOD_PASSWORD });

const setPhoto = (parentProfileId: string) =>
  setChildAvatarPhotoCore(userClient, {
    parentProfileId,
    studentProfileId: CHILD,
    file: pngFile(),
  });

const setPreset = (parentProfileId: string) =>
  setChildAvatarPresetCore(userClient, {
    parentProfileId,
    studentProfileId: CHILD,
    preset: "boy",
  });

const removeAvatar = (parentProfileId: string) =>
  removeChildAvatarCore(userClient, { parentProfileId, studentProfileId: CHILD });

/** Every write the cores issued — the real evidence that a refusal refused. */
const writes = () => calls.filter((c) => c.mode !== "select");

beforeEach(() => {
  calls.length = 0;
  audits.length = 0;
  storageOps.length = 0;
  authCalls.length = 0;
  linkedParent = null;
  avatarPath = null;
});

describe("the child's password belongs to the creating parent", () => {
  it("lets the creator set it", async () => {
    expect(await reset(CREATOR)).toEqual({ ok: true });
    expect(authCalls.some((c) => "password" in (c.attrs ?? {}))).toBe(true);
  });

  it("refuses a co-parent holding an ACTIVE link, and writes nothing", async () => {
    linkedParent = CO_PARENT;

    const res = await reset(CO_PARENT);

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["auth.child.err.creatorOnly"]);
    // The credential is untouched: no auth call at all, and no bookkeeping
    // update pretending a password was set.
    expect(authCalls).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });

  it("records the refused co-parent as a warning-severity audit event", async () => {
    linkedParent = CO_PARENT;

    await reset(CO_PARENT);

    // Reaching for a child's login is a security event even when it fails —
    // the whole point of the narrowing is that someone WILL try.
    const refusal = audits.find((a) => a.action === "parent.child_password_reset_refused");
    expect(refusal).toBeDefined();
    expect(refusal?.opts).toMatchObject({
      severity: "warning",
      success: false,
      targetId: CHILD,
    });
    // And no success row beside it.
    expect(audits.some((a) => a.action === "parent.child_password_reset")).toBe(false);
  });

  it("tells a parent with no relationship that the child is not theirs", async () => {
    const res = await reset(STRANGER);

    expect(res.ok === false && res.errors).toEqual(["auth.child.err.notYourChild"]);
    expect(authCalls).toHaveLength(0);
  });
});

describe("the child's avatar: a link reads, the creator writes", () => {
  it("lets the creator upload a photo", async () => {
    const res = await setPhoto(CREATOR);

    expect(res.ok).toBe(true);
    expect(storageOps.some((o) => o.op === "upload")).toBe(true);
    expect(writes().some((c) => c.table === "students")).toBe(true);
  });

  it("lets the creator set a preset and remove the avatar", async () => {
    expect((await setPreset(CREATOR)).ok).toBe(true);
    expect((await removeAvatar(CREATOR)).ok).toBe(true);
  });

  it("refuses a linked co-parent on all three writes, touching no object", async () => {
    linkedParent = CO_PARENT;
    avatarPath = `students/${CHILD}/existing.png`;

    for (const op of [setPhoto, setPreset, removeAvatar]) {
      calls.length = 0;
      storageOps.length = 0;

      const res = await op(CO_PARENT);

      expect(res.ok).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("childedit.err.creatorOnly");
      // The photograph the OTHER parent uploaded is still there: the cores
      // delete the replaced object for real, so a guard that ran too late
      // would have destroyed it before returning this error.
      expect(storageOps).toHaveLength(0);
      expect(writes()).toHaveLength(0);
    }
  });

  it("tells a parent with no relationship that the child is not theirs", async () => {
    const res = await setPreset(STRANGER);

    expect(res.ok === false && res.errorKey).toBe("childedit.err.notYourChild");
    expect(storageOps).toHaveLength(0);
  });
});

describe("the refusals are localized, not raw keys", () => {
  const KEYS = ["auth.child.err.creatorOnly", "childedit.err.creatorOnly"] as const;

  it.each(["az", "en", "ru"] as const)("has native %s copy for both refusals", (locale) => {
    for (const key of KEYS) {
      const text = messages[locale][key];
      expect(text, `${locale}/${key}`).toBeTruthy();
      // A missing key renders as the key itself in every surface (`dict[k] ?? k`),
      // which looks like a bug report rather than a refusal.
      expect(text).not.toBe(key);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it("says WHICH parent may act, rather than repeating notYourChild", () => {
    // The co-parent already knows the child is theirs; being told it is not
    // would read as a bug and generate a support ticket. The distinct copy is
    // the deliverable, so a copy-paste of the neighbouring key must fail here.
    for (const locale of ["az", "en", "ru"] as const) {
      expect(messages[locale]["auth.child.err.creatorOnly"]).not.toBe(
        messages[locale]["auth.child.err.notYourChild"],
      );
      expect(messages[locale]["childedit.err.creatorOnly"]).not.toBe(
        messages[locale]["childedit.err.notYourChild"],
      );
    }
  });
});
