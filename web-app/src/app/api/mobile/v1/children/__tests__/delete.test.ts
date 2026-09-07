// THE DELETE-CHILD ENDPOINT, pinned at the route layer.
//
// The core it wraps (parentCore.deleteChildCore) is tested against its own
// seams; what is asserted HERE is the handful of things that live in the route
// and nowhere else, each of which is invisible in a click-through and serious
// when wrong:
//
//   * AUTHORIZE BEFORE ANYTHING IS READ. An unauthenticated request must not
//     reach the path params, the body, the ownership read or the core. The
//     assertion is literal: `params` is a getter that counts its reads.
//   * A BARE POST DELETES NOTHING. The house rule for an irreversible endpoint
//     (see /account/delete) is an explicit {"confirm":true}; without it a
//     stray, retried or hand-made POST to a URL that is just a child id would
//     destroy that child. The flag is checked before the ownership read, so the
//     refusal costs no database work either.
//   * THE OWNERSHIP CHECK IS THE BEARER PARENT'S. A destructive endpoint that
//     re-verified nothing — or verified an id the CLIENT sent — would pass every
//     test the core has and still let one parent delete another family's child.
//   * "GONE" AND "NOT YOURS" ARE DIFFERENT REFUSALS. The gate used to answer one
//     boolean, so a child that had ALREADY been deleted came back as "this child
//     is not yours" — the retry a parent makes after a slow delete times out
//     client-side, told the deletion belonged to someone else. Only the ABSENT
//     row may take the app's already-deleted path; the 403 stays a refusal.
//   * A FAILED DELETION IS NEVER REPORTED AS SUCCESS. This whole feature exists
//     because `deleteUser(...).catch(() => {})` said "deleted" while the login
//     kept working; a route that flattened the core's refusal into a 200 would
//     put the same lie back one layer up.
//   * A REFUSAL IS A KEY, NEVER A SENTENCE. Every failure body carries an i18n
//     key the app translates locally; no Postgres text and no internal reason
//     code ever reaches a client.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER_CHILD = "9f8c1d2e-1111-4222-8333-444455556666";

// ---- the seams -------------------------------------------------------------

let bearerParent: { profileId: string; authUserId: string } | null = null;
vi.mock("@/lib/auth/mobileBearer", () => ({
  resolveBearerParent: async () => bearerParent,
}));

type Ownership = "owned" | "absent" | "otherParent";
let ownership: Ownership = "owned";
let ownershipThrows = false;
const ownsCalls: [string, string][] = [];
vi.mock("@/lib/auth/subscriptionCore", () => ({
  childOwnershipCore: async (parentProfileId: string, studentId: string) => {
    ownsCalls.push([parentProfileId, studentId]);
    // The real core THROWS on a failed read rather than answering "absent" —
    // "the row could not be read" must never become "the row is gone".
    if (ownershipThrows) throw new Error('relation "students" does not exist');
    return ownership;
  },
}));

type CoreResult = { ok: true } | { ok: false; errorKey: string };
let coreResult: CoreResult = { ok: true };
let coreThrows = false;
const coreCalls: Record<string, unknown>[] = [];
vi.mock("@/lib/auth/parentCore", () => ({
  deleteChildCore: async (args: Record<string, unknown>) => {
    coreCalls.push(args);
    // A Postgres sentence, which the client must never see.
    if (coreThrows) throw new Error('relation "students" does not exist');
    return coreResult;
  },
}));

const { POST } = await import("@/app/api/mobile/v1/children/[id]/delete/route");

// ---------------------------------------------------------------------------

/**
 * A request whose body read is observable. The default body is the confirmed
 * one, so every OTHER test states its own subject rather than the flag; the
 * unconfirmed cases pass their body explicitly.
 */
function req(body: unknown = { confirm: true }): Request & {
  text: ReturnType<typeof vi.fn>;
} {
  const text = vi.fn(async () =>
    typeof body === "string" ? body : JSON.stringify(body),
  );
  return { text, headers: new Headers() } as unknown as Request & {
    text: ReturnType<typeof vi.fn>;
  };
}

/** Path params whose read is observable (see the header). */
let paramReads = 0;
function ctx(id: string): { params: Promise<{ id: string }> } {
  return {
    get params() {
      paramReads += 1;
      return Promise.resolve({ id });
    },
  };
}

async function payload(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  bearerParent = { profileId: PARENT, authUserId: "auth-1" };
  ownership = "owned";
  ownershipThrows = false;
  coreResult = { ok: true };
  coreThrows = false;
  paramReads = 0;
  ownsCalls.length = 0;
  coreCalls.length = 0;
});

// =============================================================================

describe("authorization happens before anything is read", () => {
  it("an unauthenticated request never reaches the child id", async () => {
    bearerParent = null;
    const request = req();
    const res = await POST(request, ctx(CHILD));
    expect(res.status).toBe(401);
    expect(await payload(res)).toEqual({ error: "parent.err.invalid", retryable: false });
    // THE ASSERTIONS THAT MATTER: nothing was read, nothing was deleted.
    expect(paramReads).toBe(0);
    expect(request.text).not.toHaveBeenCalled();
    expect(ownsCalls).toHaveLength(0);
    expect(coreCalls).toHaveLength(0);
  });

  it("answers no-store", async () => {
    const res = await POST(req(), ctx(CHILD));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// =============================================================================

describe("a bare POST deletes nothing", () => {
  /** Every unconfirmed body answers the SHARED confirm key — see below. */
  async function refused(body: unknown): Promise<void> {
    const res = await POST(req(body), ctx(CHILD));
    expect(res.status).toBe(400);
    expect(await payload(res)).toEqual({
      error: "mob.err.confirmRequired",
      retryable: false,
    });
    // THE ASSERTION THAT MATTERS: no ownership read, and above all no deletion.
    expect(ownsCalls).toHaveLength(0);
    expect(coreCalls).toHaveLength(0);
  }

  it("refuses an authenticated POST with no confirmation", async () => {
    await refused({});
  });

  it("refuses a POST with no body at all", async () => {
    await refused("");
  });

  it("refuses confirm:false, and the STRING \"true\" is not a confirmation", async () => {
    await refused({ confirm: false });
    await refused({ confirm: "true" });
    await refused({ confirm: 1 });
  });

  // The key is NOT the login form's `parent.err.required`, which the app
  // localizes as "Enter your email and password" — rendered under a delete
  // confirmation, where no such field exists, it reads as nonsense. Both danger
  // endpoints answer the SAME key so the two cannot drift apart again; the
  // account twin has no route test of its own, so its half is pinned here.
  it("shares its confirm key with the parent-account twin", () => {
    const twin = readFileSync(
      join(resolve(process.cwd(), "src"), "app", "api", "mobile", "v1", "account", "delete", "route.ts"),
      "utf8",
    );
    expect(twin).toContain('errorResponse("mob.err.confirmRequired", 400)');
    // The call, not the mention: the twin's comment names the old key.
    expect(twin).not.toContain('errorResponse("parent.err.required"');
  });
});

// =============================================================================

describe("deleting a child", () => {
  it("deletes the named child and says so", async () => {
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(200);
    expect(await payload(res)).toEqual({ ok: true, data: { deleted: true } });
    expect(coreCalls).toEqual([{ parentProfileId: PARENT, studentProfileId: CHILD }]);
  });

  it("re-verifies ownership against the BEARER parent, not a posted one", async () => {
    await POST(req(), ctx(CHILD));
    expect(ownsCalls).toEqual([[PARENT, CHILD]]);
  });

  it("never lets a parent delete another parent's child", async () => {
    ownership = "otherParent";
    const res = await POST(req(), ctx(OTHER_CHILD));
    expect(res.status).toBe(403);
    expect(await payload(res)).toEqual({
      error: "auth.child.err.notYourChild",
      retryable: false,
    });
    // The destructive call is never reached.
    expect(coreCalls).toHaveLength(0);
  });

  it("rejects a malformed child id without touching ownership or the core", async () => {
    const res = await POST(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    // NOT `childNotFound`: the app counts that key as "already deleted, done"
    // (see below), so a client bug that posted an empty id would show a success
    // toast and drop a card for a child still in the database.
    expect((await payload(res)).error).toBe("mob.child.delete.failed");
    expect(ownsCalls).toHaveLength(0);
    expect(coreCalls).toHaveLength(0);
  });
});

// =============================================================================

// THE RETRY. A child with a long history takes longer to delete than the client
// waits; the cascade completes anyway, the parent sees a network error and
// presses Delete again. The second call finds no row — and until this
// distinction existed the gate could only say "not yours", so the app's
// deliberate already-deleted path could never fire and a completed deletion
// reported as somebody else's child.
describe("gone is not the same refusal as not yours", () => {
  it("answers childNotFound when the student row is ABSENT", async () => {
    ownership = "absent";
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(400);
    expect(await payload(res)).toEqual({
      error: "auth.child.err.childNotFound",
      retryable: false,
    });
    // Nothing left to delete, so the destructive call is not made either.
    expect(coreCalls).toHaveLength(0);
  });

  it("keeps 403 for a row that belongs to somebody else", async () => {
    ownership = "otherParent";
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(403);
    expect((await payload(res)).error).toBe("auth.child.err.notYourChild");
  });

  it("reports an UNREADABLE row as a server fault, never as already deleted", async () => {
    ownershipThrows = true;
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(500);
    const out = await payload(res);
    expect(out).toEqual({ error: "auth.child.err.serverError", retryable: true });
    // A false `childNotFound` here would report a deletion that never happened
    // as a success — and the Postgres sentence must not travel either.
    expect(JSON.stringify(out)).not.toMatch(/childNotFound|students|relation/i);
    expect(coreCalls).toHaveLength(0);
  });
});

// =============================================================================

describe("a deletion that did not happen is never a success", () => {
  it("reports an INCOMPLETE deletion as a retryable server failure", async () => {
    coreResult = { ok: false, errorKey: "auth.child.err.serverError" };
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(500);
    expect(await payload(res)).toEqual({
      error: "auth.child.err.serverError",
      retryable: true,
    });
  });

  it("passes the core's own refusals through with their keys", async () => {
    coreResult = { ok: false, errorKey: "auth.child.err.childNotFound" };
    let res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("auth.child.err.childNotFound");

    // The core re-checks ownership itself; if IT refuses, the answer is the
    // same 403 the route's own check gives — not a 400 and not a 200.
    coreResult = { ok: false, errorKey: "auth.child.err.notYourChild" };
    res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(403);
    expect((await payload(res)).error).toBe("auth.child.err.notYourChild");
  });

  it("leaks no internal detail when the core throws", async () => {
    coreThrows = true;
    const res = await POST(req(), ctx(CHILD));
    expect(res.status).toBe(500);
    const out = await payload(res);
    expect(out).toEqual({ error: "auth.child.err.serverError", retryable: true });
    // Nothing that came from Postgres reached the client.
    expect(JSON.stringify(out)).not.toMatch(/students|relation|does not exist/i);
  });
});

// =============================================================================

// A REFUSAL IS A KEY, AND A KEY THE APP CANNOT TRANSLATE IS A RAW STRING ON THE
// SHEET. These two arrive at the client as DATA and are rendered through
// `t(res.error)`, so the mobile key sweep — which only reads `t("literal")` —
// cannot see them: rename either in the catalogue and nothing fails anywhere,
// while the parent reads "mob.err.confirmRequired" off a delete confirmation.
describe("the keys it invents are translatable", () => {
  it("declares both in the mobile catalogue, in all three locales", () => {
    const catalogue = readFileSync(
      join(resolve(process.cwd(), ".."), "mobile-app", "src", "i18n", "messages.mobile.ts"),
      "utf8",
    );
    for (const key of ["mob.err.confirmRequired", "mob.child.delete.failed"]) {
      expect(catalogue.split(`"${key}":`).length - 1).toBe(3);
    }
  });
});
