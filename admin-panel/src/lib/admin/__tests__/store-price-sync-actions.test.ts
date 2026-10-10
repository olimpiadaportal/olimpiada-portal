// The AZN save and the store sync, wired together.
//
// The contract (owner decision 2026-10-10): subjects_pricing is the source of
// truth and is saved FIRST; the App Store and Google Play then follow. A store
// that is down, unconfigured or refusing must never turn a saved price into a
// failed save — it is reported beside "Saved". Every store write is audited,
// and every action authorizes before it reads a single client field.
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown>; success?: boolean; targetId?: string | null }[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/guards", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (a: (typeof audits)[number]) => {
    audits.push(a);
    return true;
  },
}));
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

// ---- store clients -------------------------------------------------------
type AppleRes = Record<string, unknown>;
let appleResult: AppleRes | Error = {};
let googleResult: AppleRes | Error = {};
const appleCalls: { productId: string; usd: number }[] = [];
const googleCalls: { productId: string; azn: number; rate: number }[] = [];

vi.mock("@/lib/admin/appStoreConnect", () => ({
  syncAppStorePrice: async (productId: string, usd: number) => {
    order.push("apple");
    appleCalls.push({ productId, usd });
    if (appleResult instanceof Error) throw appleResult;
    return { productId, ...appleResult };
  },
  readAppStorePrices: async () => ({ ok: false, problem: "notConfigured" }),
}));
vi.mock("@/lib/admin/googlePlay", () => ({
  syncGooglePlayPrice: async (productId: string, azn: number, rate: number) => {
    order.push("google");
    googleCalls.push({ productId, azn, rate });
    if (googleResult instanceof Error) throw googleResult;
    return { productId, ...googleResult };
  },
  readGooglePlayPrices: async () => ({ ok: false, problem: "notConfigured" }),
}));

// ---- Supabase stub -------------------------------------------------------
const SUBJECT = "9f8c1d2e-1111-4222-8333-444455556666";
let rpcError: { message: string } | null = null;
let fxValue: unknown = undefined;
let iapError: { code: string } | null = null;
let iapRows: { platform: string; product_id: string; subject_id: string; interval: string }[] = [];
let pricingRows: { subject_id: string; interval: string; price_amount: string }[] = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    in: () => b,
    maybeSingle: async () => ({
      data: table === "system_settings" && fxValue !== undefined ? { value_json: fxValue } : null,
      error: null,
    }),
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      if (table === "iap_products") return Promise.resolve(res({ data: iapError ? null : iapRows, error: iapError }));
      if (table === "subjects_pricing") return Promise.resolve(res({ data: pricingRows, error: null }));
      return Promise.resolve(res({ data: [], error: null }));
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => builder(table),
    async rpc() {
      order.push("rpc");
      return { data: null, error: rpcError };
    },
  }),
}));

class SpyFormData extends FormData {
  override get(name: string): FormDataEntryValue | null {
    order.push(`read:${name}`);
    return super.get(name);
  }
}
function form(fields: Record<string, string>): FormData {
  const fd = new SpyFormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

import { saveSubjectPrice } from "../pricing";
import { syncAllStorePrices, syncSubjectStorePrices } from "../storePrices";

const CELL = { subject_id: SUBJECT, interval: "week", amount: "2" };
const IOS_ID = "ai.olympiq.app.sub.math.week";

beforeEach(() => {
  order.length = 0;
  audits.length = 0;
  appleCalls.length = 0;
  googleCalls.length = 0;
  rpcError = null;
  fxValue = undefined;
  iapError = null;
  iapRows = [{ platform: "ios", product_id: IOS_ID, subject_id: SUBJECT, interval: "week" }];
  pricingRows = [];
  appleResult = { ok: true, changed: true, from: "1.79", to: "1.19", currency: "USD" };
  googleResult = { ok: true, changed: true, from: 3, to: 2, currency: "AZN" };
  vi.clearAllMocks();
});

describe("saveSubjectPrice → stores", () => {
  it("authorizes first, saves the AZN row, THEN syncs the stores", async () => {
    await saveSubjectPrice(null, form(CELL));
    expect(order[0]).toBe("guard");
    const rpc = order.indexOf("rpc");
    expect(rpc).toBeGreaterThan(0);
    expect(order.indexOf("apple")).toBeGreaterThan(rpc);
    expect(order.indexOf("google")).toBeGreaterThan(rpc);
  });

  it("a store failure NEVER blocks or undoes the AZN save — it is reported beside it", async () => {
    appleResult = { ok: false, problem: "needsAppManager", from: "1.79", to: "1.19", attempted: true };
    googleResult = new Error("network exploded");
    const res = await saveSubjectPrice(null, form(CELL));
    expect(res?.ok).toBe(true);
    expect(res?.error).toBeUndefined();
    expect(res?.stores).toEqual([
      { ok: false, text: "subj.store.failed" },
      { ok: false, text: "subj.store.failed" },
    ]);
  });

  it("does not touch a store when the AZN save itself failed", async () => {
    rpcError = { message: "boom" };
    const res = await saveSubjectPrice(null, form(CELL));
    expect(res).toEqual({ error: "err.server" });
    expect(appleCalls).toHaveLength(0);
    expect(googleCalls).toHaveLength(0);
  });

  it("Apple gets AZN ÷ rate in USD; Google gets the AZN amount and the rate", async () => {
    fxValue = "1.75";
    await saveSubjectPrice(null, form(CELL));
    expect(appleCalls).toEqual([{ productId: IOS_ID, usd: 2 / 1.75 }]);
    // No android row yet: Play uses the shared product id.
    expect(googleCalls).toEqual([{ productId: IOS_ID, azn: 2, rate: 1.75 }]);
  });

  it("uses the android row's product id when one exists, and 1.70 when the rate is unset", async () => {
    iapRows.push({ platform: "android", product_id: "ai.olympiq.app.sub.math.week", subject_id: SUBJECT, interval: "week" });
    await saveSubjectPrice(null, form(CELL));
    expect(googleCalls[0]).toEqual({ productId: "ai.olympiq.app.sub.math.week", azn: 2, rate: 1.7 });
  });

  it("an unreadable product map is reported as such, never as 'no product'", async () => {
    iapError = { code: "42P01" };
    const res = await saveSubjectPrice(null, form(CELL));
    expect(res?.ok).toBe(true);
    expect(appleCalls).toHaveLength(0);
    expect(res?.stores?.every((s) => !s.ok)).toBe(true);
  });

  it("audits every store write: product id, store, old → new price", async () => {
    await saveSubjectPrice(null, form(CELL));
    const writes = audits.filter((a) => a.action === "admin.store.price.sync");
    expect(writes).toHaveLength(2);
    expect(writes[0].metadata).toMatchObject({
      store: "app_store",
      product_id: IOS_ID,
      old_price: "USD 1.79",
      new_price: "USD 1.19",
      amount_azn: 2,
    });
    expect(writes[1].metadata).toMatchObject({
      store: "google_play",
      old_price: "AZN 3.00",
      new_price: "AZN 2.00",
    });
    expect(writes.every((w) => w.success === true && w.targetId === SUBJECT)).toBe(true);
  });

  it("audits a write that was SENT and failed, but not a read-only no-op", async () => {
    appleResult = { ok: false, problem: "needsAppManager", from: "1.79", to: "1.19", attempted: true };
    googleResult = { ok: true, changed: false, from: 2, to: 2, currency: "AZN" };
    await saveSubjectPrice(null, form(CELL));
    const writes = audits.filter((a) => a.action === "admin.store.price.sync");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ success: false, metadata: { store: "app_store", problem: "needsAppManager" } });
  });

  it("a refusal before the write (no credentials) is reported but not audited as a write", async () => {
    appleResult = { ok: false, problem: "notConfigured" };
    googleResult = { ok: false, problem: "notConfigured" };
    const res = await saveSubjectPrice(null, form(CELL));
    expect(res?.ok).toBe(true);
    expect(audits.filter((a) => a.action === "admin.store.price.sync")).toHaveLength(0);
  });
});

describe("Sync store prices actions", () => {
  it("per subject: requireAdmin before any field is read, and a bad id writes nothing", async () => {
    const res = await syncSubjectStorePrices(null, form({ subject_id: "not-a-uuid" }));
    expect(order[0]).toBe("guard");
    expect(order[1]).toBe("read:subject_id");
    expect(res).toEqual({ error: "err.server" });
    expect(appleCalls).toHaveLength(0);
  });

  it("per subject: pushes the stored AZN amounts (never a posted amount) and records a summary", async () => {
    pricingRows = [
      { subject_id: SUBJECT, interval: "week", price_amount: "2.00" },
      { subject_id: SUBJECT, interval: "month", price_amount: "7.00" },
    ];
    const res = await syncSubjectStorePrices(null, form({ subject_id: SUBJECT, amount: "999" }));
    expect(order[0]).toBe("guard");
    // Only the week product is mapped in this fixture.
    expect(appleCalls).toEqual([{ productId: IOS_ID, usd: 2 / 1.7 }]);
    expect(res?.ok).toBe(true);
    expect(res?.summary).toBe("subj.store.summary");
    const summary = audits.find((a) => a.action === "admin.store.price.sync_subject");
    expect(summary?.metadata).toMatchObject({ updated: 2, failed: 0, not_mapped: 2 });
  });

  it("sync all: guard first, every priced row, failures listed once", async () => {
    pricingRows = [{ subject_id: SUBJECT, interval: "week", price_amount: "2.00" }];
    appleResult = { ok: false, problem: "needsAppManager", from: "1.79", to: "1.19", attempted: true };
    const res = await syncAllStorePrices(null, form({}));
    expect(order[0]).toBe("guard");
    expect(res?.ok).toBe(false);
    expect(res?.failures).toEqual([`${IOS_ID} · subj.store.failed`]);
    expect(audits.some((a) => a.action === "admin.store.price.sync_all")).toBe(true);
  });
});
