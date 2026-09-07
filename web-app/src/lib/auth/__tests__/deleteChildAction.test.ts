// The dashboard's "delete this child" server action — when the core says no,
// does the PARENT ever find out?
//
// THE BUG THIS PINS (fixed 2026-09-07). deleteChildCore has answered with a
// typed errorKey since 2026-09-04 and the mobile BFF has reported it ever since,
// but the web wrapper was `(formData) => Promise<void>`: it console.error'd the
// key, revalidated, and returned nothing. The dashboard re-rendered with the
// child still listed and not one word of explanation, so a refusal was
// indistinguishable from a mis-clicked confirm. The card made it worse — it
// disabled its confirmation dialog on submit and re-enabled it nowhere, so a
// refused delete left the parent staring at two dead buttons until they
// reloaded the page.
//
// Every test here therefore sits on the seam between "the core refused" and
// "the parent was told". A test that asserted deleteChild resolves without
// throwing would have passed on the broken code.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import type { DeleteChildCoreResult } from "@/lib/auth/parentCore";

vi.mock("server-only", () => ({}));

/** Proves the guard runs before anything reads the form or touches the core. */
const order: string[] = [];

const requireParent = vi.fn(async () => {
  order.push("guard");
  return { profileId: PARENT_PROFILE };
});

/** What deleteChildCore answers, and what it was asked. */
let coreResult: DeleteChildCoreResult = { ok: true };
const coreCalls: { parentProfileId: string; studentProfileId: string }[] = [];

/** Which language the parent is reading the dashboard in. */
let locale: "az" | "en" | "ru" = "az";

const revalidated: string[] = [];

vi.mock("@/lib/auth/session", () => ({
  requireParent: () => requireParent(),
  getParent: async () => ({ profileId: PARENT_PROFILE }),
}));
vi.mock("@/lib/auth/parentCore", () => ({
  deleteChildCore: async (p: { parentProfileId: string; studentProfileId: string }) => {
    order.push("core");
    coreCalls.push(p);
    return coreResult;
  },
  deleteParentAccountCore: async () => ({ ok: true }),
  updateChildProfileCore: async () => ({ ok: true }),
}));
// The REAL dictionary, not a stub that echoes keys back: the whole point of the
// change is that a parent reads a sentence, so a passing test has to be reading
// the same strings the dashboard renders.
vi.mock("@/i18n/server", () => ({
  getLocale: async () => locale,
  getT: async () => (key: string) => messages[locale][key] ?? key,
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    order.push("revalidate");
    revalidated.push(path);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
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

const PARENT_PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const STUDENT = "aa0e8400-e29b-41d4-a716-446655440000";

const { deleteChild } = await import("@/lib/auth/parentService");

function form(studentProfileId: string): FormData {
  const fd = new FormData();
  fd.set("student_profile_id", studentProfileId);
  return fd;
}

beforeEach(() => {
  order.length = 0;
  coreCalls.length = 0;
  revalidated.length = 0;
  coreResult = { ok: true };
  locale = "az";
  requireParent.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteChild — authorization", () => {
  it("calls requireParent BEFORE reading the form or touching the core", async () => {
    await deleteChild(null, form(STUDENT));
    expect(order[0]).toBe("guard");
    expect(order.indexOf("guard")).toBeLessThan(order.indexOf("core"));
  });

  it("takes the parent id from the SESSION and only the child id from the form", async () => {
    const fd = form(STUDENT);
    // A tampered client cannot nominate whose child this is.
    fd.set("parent_profile_id", "11111111-2222-4333-8444-555566667777");
    await deleteChild(null, fd);
    expect(coreCalls).toEqual([
      { parentProfileId: PARENT_PROFILE, studentProfileId: STUDENT },
    ]);
  });

  it("propagates the guard's redirect and deletes nothing", async () => {
    requireParent.mockImplementationOnce(async () => {
      order.push("guard");
      throw new Error("NEXT_REDIRECT");
    });
    await expect(deleteChild(null, form(STUDENT))).rejects.toThrow("NEXT_REDIRECT");
    expect(coreCalls).toHaveLength(0);
  });
});

describe("deleteChild — the success path is unchanged", () => {
  it("reports ok and revalidates the dashboard so the card disappears", async () => {
    await expect(deleteChild(null, form(STUDENT))).resolves.toEqual({ ok: true });
    expect(revalidated).toEqual(["/dashboard"]);
  });
});

describe("deleteChild — a refusal reaches the parent", () => {
  // These three used to resolve to `undefined`, exactly like the success above.
  const refusals = [
    "auth.child.err.childNotFound",
    "auth.child.err.notYourChild",
    "auth.child.err.serverError",
  ] as const;

  for (const errorKey of refusals) {
    it(`returns a readable message for ${errorKey}`, async () => {
      coreResult = { ok: false, errorKey };
      const res = await deleteChild(null, form(STUDENT));
      expect(res?.ok).toBeUndefined();
      expect(res?.error).toBe(messages.az[errorKey]);
      // A sentence, never the key — the card renders this string verbatim.
      expect(res?.error).not.toContain("auth.child.err");
    });
  }

  it("says it in whichever of the three languages the parent is reading", async () => {
    for (const l of ["az", "en", "ru"] as const) {
      locale = l;
      coreResult = { ok: false, errorKey: "auth.child.err.notYourChild" };
      const res = await deleteChild(null, form(STUDENT));
      expect(res?.error).toBe(messages[l]["auth.child.err.notYourChild"]);
      expect(res?.error?.trim()).not.toBe("");
    }
    // Not the same sentence three times — a missing translation would be.
    const said = new Set(
      (["az", "en", "ru"] as const).map((l) => messages[l]["auth.child.err.notYourChild"]),
    );
    expect(said.size).toBe(3);
  });

  it("revalidates on a refusal too, so the dashboard shows the child STILL THERE", async () => {
    coreResult = { ok: false, errorKey: "auth.child.err.serverError" };
    await deleteChild(null, form(STUDENT));
    expect(revalidated).toEqual(["/dashboard"]);
  });

  it("never leaks an internal detail or which refusal it was beyond the key's own wording", async () => {
    coreResult = { ok: false, errorKey: "auth.child.err.serverError" };
    const res = await deleteChild(null, form(STUDENT));
    expect(JSON.stringify(res)).not.toMatch(
      /errorKey|profile_id|students|relation|postgres|supabase/i,
    );
  });

  it("refuses a malformed id the same visible way, without special-casing it", async () => {
    // The core answers childNotFound for a non-uuid; the wrapper must not
    // reintroduce a silent early return for it.
    coreResult = { ok: false, errorKey: "auth.child.err.childNotFound" };
    const res = await deleteChild(null, form("not-a-uuid"));
    expect(res?.error).toBe(messages.az["auth.child.err.childNotFound"]);
    expect(coreCalls[0]!.studentProfileId).toBe("not-a-uuid");
  });
});
