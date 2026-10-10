// The voided-purchase sweep: revokes only grants that are still live, pages
// through Google's list, and treats a failure as "ask again next run".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileGoogleVoided, type GoogleReconcileDeps } from "@/app/api/payments/google/_lib/reconcileCore";

const TOKEN_A = "tokentokentoken.AO-J1Oy_ExampleValue-000A";
const live = new Set<string>();
const revoked: string[][] = [];
let pages: ({ ok: true; items: { orderId: string | null; purchaseToken: string | null }[]; nextPageToken: string | null } | { ok: false })[] = [];
const asked: (string | null)[] = [];

const deps: GoogleReconcileDeps = {
  listVoided: async (token) => (asked.push(token), pages.shift() ?? { ok: false }),
  findLiveRefs: async (refs) => refs.filter((r) => live.has(r)),
  revoke: async (refs) => {
    revoked.push([...refs]);
    refs.forEach((r) => live.delete(r));
    return refs.length;
  },
};

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  live.clear();
  revoked.length = 0;
  asked.length = 0;
});

describe("the voided-purchase sweep", () => {
  it("revokes the live grant a refund names, across pages, and nothing else", async () => {
    live.add("gp:GPA.1");
    live.add("gp:GPA.untouched");
    pages = [
      { ok: true, items: [{ orderId: "GPA.1", purchaseToken: TOKEN_A }], nextPageToken: "p2" },
      { ok: true, items: [{ orderId: "GPA.2", purchaseToken: null }], nextPageToken: null },
    ];
    const s = await reconcileGoogleVoided(deps);
    expect(s).toMatchObject({ pages: 2, voided: 2, matched: 1, revoked: 1, unresolved: 0, failed: false });
    expect(revoked).toEqual([["gp:GPA.1"]]);
    expect(asked).toEqual([null, "p2"]);
    expect(live.has("gp:GPA.untouched")).toBe(true);
  });

  it("is idempotent: a second run over the same window revokes nothing", async () => {
    live.add("gp:GPA.1");
    const page = { ok: true as const, items: [{ orderId: "GPA.1", purchaseToken: TOKEN_A }], nextPageToken: null };
    pages = [page];
    await reconcileGoogleVoided(deps);
    pages = [page];
    const second = await reconcileGoogleVoided(deps);
    expect(second.revoked).toBe(0);
    expect(revoked).toHaveLength(1);
  });

  it("reports a Google failure and does nothing", async () => {
    pages = [{ ok: false }];
    const s = await reconcileGoogleVoided(deps);
    expect(s.failed).toBe(true);
    expect(revoked).toHaveLength(0);
  });
});
