// The App Store product map (public.iap_products) — the screen that decides
// whether the iOS app sells anything at all.
//
// WHY THIS SUITE EXISTS. Apple rejected the iOS build under Guideline 3.1.1 and
// the owner may not get to test the replacement before Apple reviews it again.
// A product row turned on with no approved App Store Connect counterpart, or
// pointing at a subject that is no longer served, does not fail on our screens —
// it fails in the store, for every family who taps Buy, and we find out from a
// second rejection. Every property below is one that no click-through can show:
// the guard before the first client field is read, the refusals that must
// happen BEFORE a write, and the fact that turning money on leaves a trail.
//
// THE READ-ONLY PASS (owner, 2026-09-16) added a second job. The screen is now
// a MIRROR — our rows beside what App Store Connect reports — and the property
// that matters most about a mirror is that it never invents agreement: an
// unreachable Apple must produce "not read", never "matches". The create path
// is gone, and its absence is asserted rather than assumed, because a create
// form here changed nothing at Apple while minting permanent, unsellable ids.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";

// ---- order tape ----------------------------------------------------------
const order: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown>; severity?: string }[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// redirect() THROWS in Next — a no-op mock would let a refused caller fall
// through into the very write the refusal exists to prevent.
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/admin/guards", () => ({
  requireAdmin: () => requireAdmin(),
  requirePanelAccess: () => requireAdmin(),
}));
// The catalogue names each subject in the READER's language now, so the module
// reads the locale cookie. Pinned to az — the default — because these
// assertions are about guards and writes, not about which language a label is
// rendered in.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (a: {
    action: string;
    metadata?: Record<string, unknown>;
    severity?: string;
  }) => {
    audits.push(a);
  },
}));

// ---- Supabase stub -------------------------------------------------------
const PRODUCT = "aaaaaaaa-1111-4222-8333-444455556666";
const SUBJECT = "bbbbbbbb-1111-4222-8333-444455556666";
const PACKAGE = "cccccccc-1111-4222-8333-444455556666";

type Op = { table: string; op: string; payload?: Record<string, unknown> };
const ops: Op[] = [];

type Row = Record<string, unknown> | null;

let productRow: Row = null;
let productReadError: { code?: string; message?: string } | null = null;
let subjectRow: Row = null;
let packageRow: Row = null;
let gradeRow: Row = null;
let updateResult: { data: unknown; error: { code?: string; message?: string } | null } = {
  data: [{ id: PRODUCT }],
  error: null,
};
const listData: Record<string, unknown[]> = {};

// No insert() here on purpose: the module has no create path any more, and a
// stub that quietly accepted one would let a reintroduced insert pass this
// suite. An unstubbed call throws, which is the report we want.
function builder(table: string) {
  let mode: "select" | "update" = "select";
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    update: (payload: Record<string, unknown>) => {
      mode = "update";
      ops.push({ table, op: "update", payload });
      return b;
    },
    maybeSingle: async () => {
      if (table === "iap_products") return { data: productRow, error: productReadError };
      if (table === "subjects") return { data: subjectRow, error: null };
      if (table === "olympiad_packages") return { data: packageRow, error: null };
      if (table === "grades") return { data: gradeRow, error: null };
      return { data: null, error: null };
    },
    // Awaited directly: `await …update().eq().select()` and
    // `await …select().order()`.
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      if (mode === "update") return Promise.resolve(res(updateResult));
      return Promise.resolve(res({ data: listData[table] ?? [], error: null }));
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}));

/**
 * The App Store Connect preflight, which activation now runs before it writes.
 *
 * It is mocked rather than stubbed away because it FAILS CLOSED: with no Apple
 * credentials in the environment — which is every test run, and correctly so —
 * the real module refuses every activation with `storeNotConfigured`. That is
 * the guard working, and it silently turned five tests in this file red the
 * moment it landed. Default to allowing here so those tests keep testing what
 * they were written for; `storePreflight` below lets a test make Apple refuse.
 */
let storePreflight: { ok: boolean; problem?: string; state?: string } = {
  ok: true,
  state: "APPROVED",
};
const storeChecks: string[] = [];

/** What App Store Connect "reports" for the mirror. Reset in beforeEach. */
const STORE_FETCHED_AT = "2026-09-16T08:00:00.000Z";
type StoreStub =
  | {
      ok: true;
      products: { productId: string; state: string; name: string | null }[];
      fetchedAt: string;
    }
  | { ok: false; problem: string; fetchedAt: string };
let storeCatalogue: StoreStub = {
  ok: true,
  products: [],
  fetchedAt: STORE_FETCHED_AT,
};

vi.mock("@/lib/admin/appStoreConnect", async (importOriginal) => {
  // Only the two NETWORK reads are stubbed. storeStateLabelKey and
  // storeStateVerdict are pure lookup tables and they are exactly what the
  // mirror renders, so they run for real — a stub of those would let the two
  // halves agree in a test and disagree in the console.
  const actual =
    await importOriginal<typeof import("@/lib/admin/appStoreConnect")>();
  return {
    ...actual,
    preflightStoreProduct: async (productId: string) => {
      storeChecks.push(productId);
      return storePreflight;
    },
    fetchStoreCatalogue: async () => storeCatalogue,
    isAppStoreConnectConfigured: () => true,
  };
});

/** FormData that records the order in which the action reads its fields. */
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

import { listIapCatalogue, setIapProductActive } from "../iap";

const SUBJECT_PRODUCT = {
  id: PRODUCT,
  platform: "ios",
  product_id: "ai.olympiq.app.sub.math.month",
  scope: "subject",
  subject_id: SUBJECT,
  package_id: null,
  grade_id: null,
  interval: "month",
  active: false,
};

beforeEach(() => {
  order.length = 0;
  audits.length = 0;
  ops.length = 0;
  storeChecks.length = 0;
  storePreflight = { ok: true, state: "APPROVED" };
  storeCatalogue = { ok: true, products: [], fetchedAt: STORE_FETCHED_AT };
  productRow = { ...SUBJECT_PRODUCT };
  productReadError = null;
  subjectRow = { id: SUBJECT, status: "active" };
  packageRow = { id: PACKAGE, status: "active" };
  gradeRow = null;
  updateResult = { data: [{ id: PRODUCT }], error: null };
  for (const k of Object.keys(listData)) delete listData[k];
  vi.clearAllMocks();
});

// ===========================================================================
describe("authorization", () => {
  it("setIapProductActive guards before reading any client field", async () => {
    await setIapProductActive(null, form({ __id: PRODUCT, __active: "true" }));
    expect(order[0]).toBe("guard");
    expect(order.filter((o) => o.startsWith("read:")).length).toBeGreaterThan(0);
  });

  it("listIapCatalogue guards before it reads anything", async () => {
    await listIapCatalogue();
    expect(requireAdmin).toHaveBeenCalled();
    expect(order[0]).toBe("guard");
  });

  it("refuses a malformed id before touching the database", async () => {
    const res = await setIapProductActive(
      null,
      form({ __id: "not-a-uuid", __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.server" });
    expect(ops).toHaveLength(0);
  });

  it("refuses an __active value that is not a literal boolean string", async () => {
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "yes" }),
    );
    expect(res).toEqual({ error: "iap.err.server" });
    expect(ops).toHaveLength(0);
  });
});

// ===========================================================================
describe("activation refuses a target that cannot be served", () => {
  it("refuses an ARCHIVED subject, and writes nothing", async () => {
    subjectRow = { id: SUBJECT, status: "archived" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.targetArchived" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
    expect(audits).toHaveLength(0);
  });

  it("refuses an UNPUBLISHED subject too — not shown to families is not sellable", async () => {
    subjectRow = { id: SUBJECT, status: "inactive" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.targetArchived" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("refuses a subject that no longer exists", async () => {
    subjectRow = null;
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.targetMissing" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("refuses an archived olympiad package", async () => {
    productRow = {
      ...SUBJECT_PRODUCT,
      scope: "olympiad_package",
      subject_id: null,
      package_id: PACKAGE,
      interval: null,
      product_id: "ai.olympiq.app.oly.citymath",
    };
    packageRow = { id: PACKAGE, status: "archived" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.targetArchived" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("refuses a grade-pinned product whose grade is gone", async () => {
    productRow = {
      ...SUBJECT_PRODUCT,
      scope: "olympiad_package",
      subject_id: null,
      package_id: PACKAGE,
      grade_id: "dddddddd-1111-4222-8333-444455556666",
      interval: null,
      product_id: "ai.olympiq.app.oly.citymath",
    };
    gradeRow = null;
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.gradeMissing" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("DEACTIVATION is never blocked by a dead target — it is the way out", async () => {
    productRow = { ...SUBJECT_PRODUCT, active: true };
    subjectRow = { id: SUBJECT, status: "archived" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "false" }),
    );
    expect(res).toEqual({ ok: true });
    expect(
      ops.find((o) => o.op === "update")?.payload,
    ).toEqual({ active: false });
  });

  it("activates when the subject is live", async () => {
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ ok: true });
    expect(ops.find((o) => o.op === "update")?.payload).toEqual({ active: true });
  });
});

describe("activation also asks Apple, not just our own database", () => {
  // Everything else in this file only proves OUR side is coherent. A product id
  // App Store Connect has never heard of passes every one of those checks and
  // still gives every family a buy button that fails — which is the 3.1.1
  // rejection, with the rail already built.

  it("checks the product id Apple would be asked about", async () => {
    await setIapProductActive(null, form({ __id: PRODUCT, __active: "true" }));
    expect(storeChecks).toEqual([SUBJECT_PRODUCT.product_id]);
  });

  it("refuses, and writes nothing, when Apple has no such product", async () => {
    storePreflight = { ok: false, problem: "storeMissingProduct" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.storeMissingProduct" });
    expect(ops.find((o) => o.op === "update")).toBeUndefined();
    expect(audits).toHaveLength(0);
  });

  it("passes the store's own reason through so the fix is obvious", async () => {
    // A generic "that did not work" would leave an admin re-clicking on release
    // day. Each problem maps to a message naming the App Store Connect screen.
    for (const problem of [
      "storeIncomplete",
      "storeRejected",
      "storeRemoved",
      "storeUnknownState",
      "storeUnreachable",
      "storeNotConfigured",
    ]) {
      storePreflight = { ok: false, problem };
      const res = await setIapProductActive(
        null,
        form({ __id: PRODUCT, __active: "true" }),
      );
      expect(res).toEqual({ error: `iap.err.${problem}` });
      // Every one of them must be a real, translated string.
      expect(messages.az[`iap.err.${problem}`]).toBeTruthy();
      expect(messages.en[`iap.err.${problem}`]).toBeTruthy();
      expect(messages.ru[`iap.err.${problem}`]).toBeTruthy();
    }
  });

  it("NEVER blocks deactivation on Apple", async () => {
    // Turning a product off is the way OUT of a bad state and must always be
    // possible — including when Apple is unreachable, which is exactly when
    // somebody is trying to stop selling something.
    productRow = { ...SUBJECT_PRODUCT, active: true };
    storePreflight = { ok: false, problem: "storeUnreachable" };

    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "false" }),
    );

    expect(res).toEqual({ ok: true });
    expect(ops.find((o) => o.op === "update")?.payload).toEqual({ active: false });
    expect(storeChecks).toEqual([]);
  });
});

// ===========================================================================
describe("Android purchase-silence is structural, not a UI convention", () => {
  const ACTION_SRC = readFileSync(
    resolve(process.cwd(), "src/lib/admin/iap.ts"),
    "utf8",
  );

  it("never reads a platform out of the submitted form", () => {
    expect(ACTION_SRC).not.toMatch(/formData\.get\(\s*["'][^"']*platform/i);
    expect(ACTION_SRC).toContain('const IOS_PLATFORM = "ios"');
  });

  it("cannot offer a non-ios row even if one somehow exists", async () => {
    productRow = { ...SUBJECT_PRODUCT, platform: "android" };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.iosOnly" });
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });
});

// ===========================================================================
describe("the screen is read-only apart from the one switch", () => {
  // The owner's reasoning, pinned: creating a product here never created one at
  // Apple (that is a local script, run by hand), so "managing" products on this
  // screen was a workflow that changed nothing in the store and left permanent,
  // unsellable ids in ours. What survived is the switch that decides what OUR
  // app offers — the only code path in the repository that can set
  // active = false, i.e. withdraw a live product without raw SQL on production.
  const ACTION_SRC = readFileSync(
    resolve(process.cwd(), "src/lib/admin/iap.ts"),
    "utf8",
  );
  const PAGE_SRC = readFileSync(
    resolve(process.cwd(), "src/app/(protected)/iap/page.tsx"),
    "utf8",
  );

  it("exports exactly two server functions: the read and the offer switch", async () => {
    const mod = await import("../iap");
    const fns = Object.keys(mod).filter(
      (k) => typeof (mod as Record<string, unknown>)[k] === "function",
    );
    expect(fns.sort()).toEqual(["listIapCatalogue", "setIapProductActive"]);
  });

  it("writes nothing but `active` — no insert, no delete, no other column", () => {
    expect(ACTION_SRC).not.toMatch(/\.insert\(/);
    expect(ACTION_SRC).not.toMatch(/\.delete\(/);
    expect(ACTION_SRC).not.toMatch(/\.upsert\(/);
    const updates = [...ACTION_SRC.matchAll(/\.update\(([^)]*)\)/g)].map(
      (m) => m[1].trim(),
    );
    expect(updates).toEqual(["{ active: next }"]);
  });

  it("the create form is gone, not merely unlinked", () => {
    expect(() =>
      readFileSync(
        resolve(process.cwd(), "src/app/(protected)/iap/IapCreateForm.tsx"),
        "utf8",
      ),
    ).toThrow();
    expect(PAGE_SRC).not.toContain("IapCreateForm");
  });

  it("the route survives — it IS the kill switch", () => {
    expect(PAGE_SRC).toContain("IapToggle");
  });
});

// ===========================================================================
describe("the mirror never invents agreement", () => {
  // Silent divergence is the failure mode: both halves looked fine separately
  // and the store rejected the build anyway. Each case below is a shape the
  // screen has to NAME rather than render as two innocent-looking pills.
  const OUR_ID = SUBJECT_PRODUCT.product_id;

  beforeEach(() => {
    listData.iap_products = [{ ...SUBJECT_PRODUCT }];
    listData.subjects = [
      {
        id: SUBJECT,
        name: "Riyaziyyat",
        code: "math",
        status: "active",
        subject_translations: [],
      },
    ];
    listData.olympiad_packages = [];
  });

  /** One offered / not-offered row, with whatever Apple is pretending to say. */
  function given(active: boolean, store: StoreStub) {
    listData.iap_products = [{ ...SUBJECT_PRODUCT, active }];
    storeCatalogue = store;
  }

  it("carries App Store Connect's OWN wording, never the API state code", async () => {
    // "MISSING_METADATA" is a status no App Store Connect screen shows — the
    // console calls it "Prepare for Submission". An admin sent hunting for the
    // API name finds nothing.
    given(false, {
      ok: true,
      products: [{ productId: OUR_ID, state: "MISSING_METADATA", name: "Math" }],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows } = await listIapCatalogue();
    expect(rows[0].store).toEqual({
      labelKey: "iap.store.state.prepare",
      verdict: "blocked",
      name: "Math",
    });
  });

  it("names the 3.1.1 shape: offered here, unknown at Apple", async () => {
    given(true, { ok: true, products: [], fetchedAt: STORE_FETCHED_AT });
    const { rows } = await listIapCatalogue();
    expect(rows[0].store).toBeNull();
    expect(rows[0].divergence).toBe("offeredMissing");
  });

  it("flags an offered product Apple will not sell", async () => {
    given(true, {
      ok: true,
      products: [{ productId: OUR_ID, state: "REJECTED", name: null }],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows } = await listIapCatalogue();
    expect(rows[0].divergence).toBe("offeredBlocked");
  });

  it("flags an offered product whose state Apple has not published to us", async () => {
    given(true, {
      ok: true,
      products: [{ productId: OUR_ID, state: "SOMETHING_NEW", name: null }],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows } = await listIapCatalogue();
    expect(rows[0].store?.labelKey).toBe("iap.store.state.unknown");
    expect(rows[0].divergence).toBe("offeredUnknown");
  });

  it("states — without alarm — an approved product we choose not to offer", async () => {
    given(false, {
      ok: true,
      products: [{ productId: OUR_ID, state: "APPROVED", name: null }],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows } = await listIapCatalogue();
    expect(rows[0].divergence).toBe("approvedIdle");
  });

  it("does not put a notice on every row while a submission is in review", async () => {
    // WAITING_FOR_REVIEW is sellable in sandbox but not yet approved. Flagging
    // it as "ready and not offered" would light up all 21 rows during every
    // submission, which trains an admin to ignore the column.
    given(false, {
      ok: true,
      products: [{ productId: OUR_ID, state: "WAITING_FOR_REVIEW", name: null }],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows } = await listIapCatalogue();
    expect(rows[0].divergence).toBeNull();
  });

  it("marks a row Apple has never had as unopenable", async () => {
    given(false, { ok: true, products: [], fetchedAt: STORE_FETCHED_AT });
    const { rows } = await listIapCatalogue();
    expect(rows[0].divergence).toBe("absentAtApple");
  });

  it("an unreachable Apple yields NO verdict, not a false one", async () => {
    // The dangerous shape: an empty catalogue from a failed read would make
    // every row say "Apple has never heard of this".
    given(true, {
      ok: false,
      problem: "storeUnreachable",
      fetchedAt: STORE_FETCHED_AT,
    });
    const { rows, unmapped, store } = await listIapCatalogue();
    expect(rows[0].store).toBeNull();
    expect(rows[0].divergence).toBeNull();
    expect(unmapped).toEqual([]);
    expect(store).toEqual({
      ok: false,
      problem: "storeUnreachable",
      fetchedAt: STORE_FETCHED_AT,
    });
  });

  it("reports when the picture of Apple was taken", async () => {
    given(false, { ok: true, products: [], fetchedAt: STORE_FETCHED_AT });
    const { store } = await listIapCatalogue();
    expect(store).toEqual({ ok: true, problem: null, fetchedAt: STORE_FETCHED_AT });
  });

  it("lists Apple products no row maps — the charge that grants nothing", async () => {
    given(false, {
      ok: true,
      products: [
        { productId: OUR_ID, state: "APPROVED", name: null },
        { productId: "ai.olympiq.app.oly.citymath", state: "APPROVED", name: "City Math" },
      ],
      fetchedAt: STORE_FETCHED_AT,
    });
    const { unmapped } = await listIapCatalogue();
    expect(unmapped).toEqual([
      {
        productId: "ai.olympiq.app.oly.citymath",
        name: "City Math",
        labelKey: "iap.store.state.approved",
        verdict: "sellable",
      },
    ]);
  });
});

// ===========================================================================
describe("every toggle leaves a trail", () => {
  it("audits an activation with the product id and a raised severity", async () => {
    await setIapProductActive(null, form({ __id: PRODUCT, __active: "true" }));
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("admin.iap.product.activate");
    expect(audits[0].metadata?.product_id).toBe("ai.olympiq.app.sub.math.month");
    // Turning a product ON is the moment the app starts taking money.
    expect(audits[0].severity).toBe("warning");
  });

  it("audits a deactivation under its own action name", async () => {
    productRow = { ...SUBJECT_PRODUCT, active: true };
    await setIapProductActive(null, form({ __id: PRODUCT, __active: "false" }));
    expect(audits.map((a) => a.action)).toEqual(["admin.iap.product.deactivate"]);
  });

  it("does not audit a no-op toggle, so release day is not buried in noise", async () => {
    productRow = { ...SUBJECT_PRODUCT, active: true };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ ok: true });
    expect(ops.some((o) => o.op === "update")).toBe(false);
    expect(audits).toHaveLength(0);
  });
});

// ===========================================================================
describe("a failed write is never reported as success", () => {
  it("returns a generic key, never the Postgres message", async () => {
    updateResult = {
      data: null,
      error: { code: "42501", message: 'permission denied for table "iap_products"' },
    };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.server" });
    expect(audits).toHaveLength(0);
  });

  it("names the two-live-products case instead of a generic failure", async () => {
    updateResult = {
      data: null,
      error: { code: "23505", message: "uq_iap_product_subject_active" },
    };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.duplicateActive" });
  });

  it("treats an RLS-silenced update (zero rows) as a failure", async () => {
    // The dangerous shape: no error, no row. Reporting ok here would tell an
    // admin the app is selling something it is not.
    updateResult = { data: [], error: null };
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.server" });
    expect(audits).toHaveLength(0);
  });

  it("says so when the row has vanished", async () => {
    productRow = null;
    const res = await setIapProductActive(
      null,
      form({ __id: PRODUCT, __active: "true" }),
    );
    expect(res).toEqual({ error: "iap.err.notFound" });
  });

  it("reports a load failure instead of an empty, reassuring catalogue", async () => {
    productReadError = null;
    // A products query that errors must not render as "no products".
    const SRC = readFileSync(resolve(process.cwd(), "src/lib/admin/iap.ts"), "utf8");
    expect(SRC).toContain("loadFailed: true");
    expect(SRC).toContain("productsRes.error");
  });
});

// ===========================================================================
describe("the module never reaches for the service-role key", () => {
  const SRC = readFileSync(resolve(process.cwd(), "src/lib/admin/iap.ts"), "utf8");

  it("uses only the request-scoped client", () => {
    expect(SRC).toContain('from "@/lib/supabase/server"');
    expect(SRC).not.toContain("@/lib/supabase/admin");
  });

  it("guards first in every exported action", () => {
    for (const fn of ["listIapCatalogue", "setIapProductActive"]) {
      const body = SRC.slice(SRC.indexOf(`export async function ${fn}`));
      const firstAwait = body.indexOf("await ");
      expect(body.slice(firstAwait, firstAwait + 40)).toContain("requireAdmin()");
    }
  });
});

// ===========================================================================
describe("trilingual copy", () => {
  const NEW_KEYS = Object.keys(messages.az).filter(
    (k) => k.startsWith("iap.") || k === "nav.iap",
  );

  it("ships every App Store product key in az, en and ru", () => {
    expect(NEW_KEYS.length).toBeGreaterThan(50);
    expect(NEW_KEYS.filter((k) => !messages.en[k])).toEqual([]);
    expect(NEW_KEYS.filter((k) => !messages.ru[k])).toEqual([]);
  });

  it("does not leave a locale echoing the Azerbaijani string", () => {
    const echoed = NEW_KEYS.filter(
      (k) => messages.ru[k] === messages.az[k] && messages.az[k].length > 12,
    );
    expect(echoed).toEqual([]);
  });

  it("keeps every placeholder the template needs in all three locales", () => {
    const slots = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const k of NEW_KEYS) {
      expect(slots(messages.en[k]), `${k} (en)`).toBe(slots(messages.az[k]));
      expect(slots(messages.ru[k]), `${k} (ru)`).toBe(slots(messages.az[k]));
    }
  });

  it("carries a key for every error the actions can return", () => {
    const SRC = readFileSync(resolve(process.cwd(), "src/lib/admin/iap.ts"), "utf8");
    const returned = new Set(
      [...SRC.matchAll(/error:\s*"(iap\.err\.[a-zA-Z.]+)"/g)].map((m) => m[1]),
    );
    // Two template-literal branches no regex can enumerate: `iap.err.${problem}`
    // for our own target checks (IapTargetProblem) and `iap.err.${store.problem}`
    // for Apple's refusals (IapPreflightProblem). Both unions are listed in full
    // here — a new member added to either without its three translations is the
    // failure this test is for, and it shows up as a missing key below.
    for (const p of ["targetMissing", "targetArchived", "gradeMissing"]) {
      returned.add(`iap.err.${p}`);
    }
    for (const p of [
      "storeNotConfigured",
      "storeUnreachable",
      "storeMissingProduct",
      "storeIncomplete",
      "storeRejected",
      "storeRemoved",
      "storeUnknownState",
    ]) {
      returned.add(`iap.err.${p}`);
    }
    expect(returned.size).toBeGreaterThan(12);
    for (const key of returned) {
      expect(messages.az[key], `${key} (az)`).toBeTruthy();
      expect(messages.en[key], `${key} (en)`).toBeTruthy();
      expect(messages.ru[key], `${key} (ru)`).toBeTruthy();
    }
  });

  it("never names a price or the website in store-product copy", () => {
    // Store & payments compliance: nothing in the panel may imply a channel
    // price, and nothing that could be copied into store-facing copy should
    // carry AZN or the marketing domain.
    for (const locale of ["az", "en", "ru"] as const) {
      for (const k of NEW_KEYS) {
        expect(messages[locale][k], `${k} (${locale})`).not.toMatch(/AZN|olympiq\.ai/);
      }
    }
  });
});

// ===========================================================================
describe("the screen states the current posture", () => {
  const PAGE_SRC = readFileSync(
    resolve(process.cwd(), "src/app/(protected)/iap/page.tsx"),
    "utf8",
  );

  it("is Administrator-only, not permission-gated", () => {
    expect(PAGE_SRC).toContain("await requireAdmin()");
    expect(PAGE_SRC).not.toContain("requirePermission");
  });

  it("shows a banner when NOTHING is offered", () => {
    // Zero offered products is a state this platform has shipped in; without
    // the banner an admin reads the whole screen as broken.
    expect(PAGE_SRC).toContain("activeCount === 0");
    expect(PAGE_SRC).toContain("iap.banner.none.title");
  });

  it("groups the rows by scope and resolves names rather than printing uuids", () => {
    expect(PAGE_SRC).toContain('r.scope === "subject"');
    expect(PAGE_SRC).toContain('r.scope === "olympiad_package"');
    expect(PAGE_SRC).toContain("row.targetName");
  });

  it("says the screen changes nothing at Apple, before anything else", () => {
    expect(PAGE_SRC).toContain("iap.readonly.title");
    expect(PAGE_SRC).toContain("iap.readonly.body");
  });

  it("shows BOTH sides and how fresh the Apple side is", () => {
    expect(PAGE_SRC).toContain("iap.col.ours");
    expect(PAGE_SRC).toContain("iap.col.apple");
    expect(PAGE_SRC).toContain("iap.refresh.stamp");
    expect(PAGE_SRC).toContain("IapRefreshButton");
  });

  it("renders the disagreement on the row instead of leaving it to be spotted", () => {
    expect(PAGE_SRC).toContain("iap.diverge.");
    expect(PAGE_SRC).toContain("row.divergence");
  });
});

// ===========================================================================
describe("the nav entry", () => {
  const NAV_SRC = readFileSync(
    resolve(process.cwd(), "src/lib/admin/nav.ts"),
    "utf8",
  );

  it("is admin-only and carries no permission code a Content Manager could hold", () => {
    const line = NAV_SRC.split("\n").find((l) => l.includes('label: "nav.iap"'));
    expect(line).toBeTruthy();
    expect(line).toContain("adminOnly: true");
    expect(line).not.toContain("permission");
  });
});
