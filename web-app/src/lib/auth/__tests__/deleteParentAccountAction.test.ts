// The profile page's "delete my account" server action — when the core refuses,
// does the PARENT ever find out?
//
// THE BUG THIS PINS (fixed 2026-09-07). deleteParentAccountCore THROWS whenever
// an account would survive the deletion — that contract exists so nobody is
// told their account is gone while a working login remains. The web wrapper was
// `(): Promise<void>` and let the throw escape into the server-action boundary,
// where it becomes an opaque digest and renders nothing. The button that
// submitted it made that worse: it disabled its confirmation dialog on submit
// and re-enabled it nowhere, so a refused deletion left the parent staring at
// two dead buttons until they reloaded. It looked fine only because the SUCCESS
// path redirects and takes the dialog with it.
//
// So every test here sits on the seam between "the core threw" and "the parent
// was told". A test that only asserted the happy path redirects would have
// passed on the broken code.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";

vi.mock("server-only", () => ({}));

const PARENT_PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const AUTH_USER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Proves the guard runs before the core, and the sign-out only after it. */
const order: string[] = [];

const requireParent = vi.fn(async () => {
  order.push("guard");
  return { profileId: PARENT_PROFILE };
});

/** What deleteParentAccountCore does, and what it was asked. */
let coreThrows: Error | null = null;
const coreCalls: { parentProfileId: string; authUserId: string | null }[] = [];

/** Which language the parent is reading the profile page in. */
let locale: "az" | "en" | "ru" = "az";

vi.mock("@/lib/auth/session", () => ({
  requireParent: () => requireParent(),
  getParent: async () => ({ profileId: PARENT_PROFILE }),
}));
vi.mock("@/lib/auth/parentCore", () => ({
  deleteParentAccountCore: async (p: { parentProfileId: string; authUserId: string | null }) => {
    order.push("core");
    coreCalls.push(p);
    if (coreThrows) throw coreThrows;
  },
  deleteChildCore: async () => ({ ok: true }),
  updateChildProfileCore: async () => ({ ok: true }),
}));
// The REAL dictionary, not a stub that echoes keys back: the point of the change
// is that a parent reads a sentence, so a passing test has to be reading the
// same strings the danger zone renders.
vi.mock("@/i18n/server", () => ({
  getLocale: async () => locale,
  getT: async () => (key: string) => messages[locale][key] ?? key,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    order.push("redirect");
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: AUTH_USER } } }),
      signOut: async () => {
        order.push("signOut");
      },
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: true,
  getAdminClient: () => ({}),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: async () => {} }));
vi.mock("@/lib/auth/childAccountService", () => ({
  createChild: async () => ({ ok: true }),
  resetChildPassword: async () => ({ ok: true }),
}));
vi.mock("@/lib/auth/accountState", () => ({
  classifyAccount: async () => "none",
  loginShouldSayNoAccount: () => true,
  mayRegister: () => true,
}));
vi.mock("@/lib/auth/pendingVerifyEmail", () => ({ setPendingVerifyEmail: async () => {} }));

const { deleteParentAccount } = await import("@/lib/auth/parentService");

beforeEach(() => {
  order.length = 0;
  coreCalls.length = 0;
  coreThrows = null;
  locale = "az";
  requireParent.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteParentAccount — authorization", () => {
  it("calls requireParent BEFORE touching the core", async () => {
    await expect(deleteParentAccount(null, new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(order[0]).toBe("guard");
    expect(order.indexOf("guard")).toBeLessThan(order.indexOf("core"));
  });

  it("takes both ids from the SESSION — the form carries nothing", async () => {
    const fd = new FormData();
    // A tampered client cannot nominate whose account is being deleted.
    fd.set("parent_profile_id", "11111111-2222-4333-8444-555566667777");
    fd.set("auth_user_id", "99999999-2222-4333-8444-555566667777");
    await expect(deleteParentAccount(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(coreCalls).toEqual([
      { parentProfileId: PARENT_PROFILE, authUserId: AUTH_USER },
    ]);
  });

  it("propagates the guard's redirect and deletes nothing", async () => {
    requireParent.mockImplementationOnce(async () => {
      order.push("guard");
      throw new Error("NEXT_REDIRECT");
    });
    await expect(deleteParentAccount(null, new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(coreCalls).toHaveLength(0);
  });
});

describe("deleteParentAccount — the success path is unchanged", () => {
  it("signs the session out and leaves, in that order", async () => {
    await expect(deleteParentAccount(null, new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/?deleted=1",
    );
    expect(order).toEqual(["guard", "core", "signOut", "redirect"]);
  });
});

describe("deleteParentAccount — a refusal reaches the parent", () => {
  // Both markers the core throws. Neither used to produce anything a person
  // could read: the throw escaped the action entirely.
  const refusals = ["account_delete_no_auth_user", "account_delete_incomplete:2"];

  for (const marker of refusals) {
    it(`returns a readable message instead of throwing on ${marker}`, async () => {
      coreThrows = new Error(marker);
      const res = await deleteParentAccount(null, new FormData());
      expect(res?.error).toBe(messages.az["account.err.deleteFailed"]);
    });
  }

  it("does NOT sign the parent out or navigate away — the account is still there", async () => {
    coreThrows = new Error("account_delete_incomplete:1");
    await deleteParentAccount(null, new FormData());
    expect(order).not.toContain("signOut");
    expect(order).not.toContain("redirect");
  });

  it("says it in whichever of the three languages the parent is reading", async () => {
    for (const l of ["az", "en", "ru"] as const) {
      locale = l;
      coreThrows = new Error("account_delete_incomplete:1");
      const res = await deleteParentAccount(null, new FormData());
      expect(res?.error).toBe(messages[l]["account.err.deleteFailed"]);
      expect(res?.error?.trim()).not.toBe("");
      // A sentence, never the key — the danger zone renders this verbatim.
      expect(res?.error).not.toContain("account.err");
    }
    // Not the same sentence three times — a missing translation would be.
    const said = new Set(
      (["az", "en", "ru"] as const).map((l) => messages[l]["account.err.deleteFailed"]),
    );
    expect(said.size).toBe(3);
  });

  it("never leaks the core's marker or any internal detail to the client", async () => {
    coreThrows = new Error("account_delete_incomplete:2 child:still_present");
    const res = await deleteParentAccount(null, new FormData());
    expect(JSON.stringify(res)).not.toMatch(
      /account_delete|still_present|auth_user|profile_id|supabase|postgres/i,
    );
  });

  it("survives a non-Error throw rather than turning it into a digest", async () => {
    // supabase-js and friends throw non-Error values occasionally; the parent
    // must still get a sentence, not a blank screen.
    coreThrows = "boom" as unknown as Error;
    const res = await deleteParentAccount(null, new FormData());
    expect(res?.error).toBe(messages.az["account.err.deleteFailed"]);
  });
});
