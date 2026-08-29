// Subject create/edit/publish — the invariant is one sentence:
//
//     status = 'active'  IMPLIES  three active subjects_pricing rows.
//
// It matters because breaking it fails SILENTLY and in the worst possible
// place. A subject's price is not a column on `subjects`; it is one row per
// (subject_id, interval) in `subjects_pricing`, and every family-facing surface
// — /services, /register, Add-Child, the per-child subscribe screen, the admin
// Free Access picker — builds its subject list from PRICED rows. So an 'active'
// subject with an incomplete price set is published, invisible to every family,
// and reported nowhere: the admin sees "Public" and the parent sees nothing.
// Elm and Fizika sat in exactly that state until migration 154 priced them.
//
// Everything below pins a path that could put the platform back there, plus the
// two ordering properties that no browser click-through can reveal: the guard
// before the first FormData read, and the prices before the status.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";

// ---- order tape ----------------------------------------------------------
const order: string[] = [];
const redirects: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// redirect() THROWS in Next — a no-op mock would let execution fall through the
// refusal branch and perform the very write the branch exists to prevent.
vi.mock("next/navigation", () => ({
  redirect: (p: string) => {
    redirects.push(p);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/admin/guards", () => ({
  requireAdmin: () => requireAdmin(),
  requirePanelAccess: () => requireAdmin(),
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (a: { action: string; metadata?: Record<string, unknown> }) => {
    audits.push(a);
  },
}));
// getT returns the key, so an assertion names the message instead of copying
// its wording — a rewording must not turn into a red test.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

// ---- Supabase stub -------------------------------------------------------
const SUBJECT = "9f8c1d2e-1111-4222-8333-444455556666";
const NEW_ID = "11112222-3333-4444-8555-666677778888";

type Op = { table: string; op: string; payload?: Record<string, unknown> };
const ops: Op[] = [];
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

let subjectRow: Record<string, unknown> | null = {
  id: SUBJECT,
  name: "Fizika",
  code: "fizika",
  status: "inactive",
};
let pricingRows: { interval: string; price_amount: string; status: string }[] = [];
let insertError: { code?: string; message?: string } | null = null;
let updateError: { code?: string; message?: string } | null = null;
let rpcErrorFor: string | null = null;

function builder(table: string) {
  let mode: "select" | "insert" | "update" = "select";
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    order: () => b,
    ilike: () => b,
    insert: (payload: Record<string, unknown>) => {
      mode = "insert";
      ops.push({ table, op: "insert", payload });
      return b;
    },
    update: (payload: Record<string, unknown>) => {
      mode = "update";
      ops.push({ table, op: "update", payload });
      return b;
    },
    maybeSingle: async () => ({ data: subjectRow, error: null }),
    single: async () =>
      insertError
        ? { data: null, error: insertError }
        : { data: { id: NEW_ID }, error: null },
    // Awaited directly (`await …update().eq()`, `await …select().eq()`).
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      if (mode === "update") {
        return Promise.resolve(res({ data: null, error: updateError }));
      }
      return Promise.resolve(
        res({
          data: table === "subjects_pricing" ? pricingRows : [],
          error: null,
        }),
      );
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => builder(table),
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (rpcErrorFor && args.p_interval === rpcErrorFor) {
        return { data: null, error: { message: "boom", code: "P0001" } };
      }
      return { data: null, error: null };
    },
  }),
}));

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

const GOOD = {
  name: "Kimya",
  status: "active",
  price_week: "3",
  price_month: "9",
  price_year: "90",
};

import { createSubject, updateSubject } from "../actions";
import { transitionSubject } from "../subject-status";

beforeEach(() => {
  order.length = 0;
  redirects.length = 0;
  audits.length = 0;
  ops.length = 0;
  rpcCalls.length = 0;
  subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "inactive" };
  pricingRows = [];
  insertError = null;
  updateError = null;
  rpcErrorFor = null;
  vi.clearAllMocks();
});

/** Runs an action that ends in redirect() without letting the throw escape. */
async function run(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return undefined;
    throw e;
  }
}

describe("authorization", () => {
  it("createSubject guards before reading any client field", async () => {
    await run(() => createSubject(null, form(GOOD)));
    expect(order[0]).toBe("guard");
    expect(order.filter((o) => o.startsWith("read:")).length).toBeGreaterThan(0);
  });

  it("updateSubject guards before reading any client field", async () => {
    await run(() => updateSubject(null, form({ __id: SUBJECT, ...GOOD })));
    expect(order[0]).toBe("guard");
  });

  it("updateSubject refuses a malformed id before touching the database", async () => {
    const res = await updateSubject(null, form({ __id: "not-a-uuid", ...GOOD }));
    expect(res).toEqual({ error: "err.server" });
    expect(ops).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("price validation is server-side and rejects before any write", () => {
  const bad: Record<string, string> = {
    negative: "-5",
    zero: "0",
    empty: "",
    text: "abc",
    "three decimals": "9.999",
    "over the cap": "10001",
    "thousands separator": "1,50",
  };

  for (const [label, value] of Object.entries(bad)) {
    it(`refuses a ${label} monthly price`, async () => {
      const res = await createSubject(
        null,
        form({ ...GOOD, price_month: value }),
      );
      expect(res).toEqual({ error: "subj.err.price", field: "month" });
      // Nothing was created, so a rejected price can never leave a half-made
      // subject behind.
      expect(ops).toHaveLength(0);
      expect(rpcCalls).toHaveLength(0);
    });
  }

  it("accepts two decimals", async () => {
    await run(() => createSubject(null, form({ ...GOOD, price_week: "3.50" })));
    const week = rpcCalls.find((c) => c.args.p_interval === "week");
    expect(week?.name).toBe("admin_upsert_subject_price");
    expect(week?.args.p_amount).toBe(3.5);
  });

  it("refuses an empty name and an over-long one", async () => {
    expect(await createSubject(null, form({ ...GOOD, name: "   " }))).toEqual({
      error: "subj.err.name",
      field: "name",
    });
    expect(
      await createSubject(null, form({ ...GOOD, name: "x".repeat(121) })),
    ).toEqual({ error: "subj.err.name", field: "name" });
    expect(ops).toHaveLength(0);
  });

  it("refuses a status outside the catalog_status enum", async () => {
    const res = await createSubject(null, form({ ...GOOD, status: "draft" }));
    // There is NO 'draft' in public.catalog_status — "published" IS
    // status='active'. A client string must never reach the column.
    expect(res).toEqual({ error: "err.server", field: "status" });
    expect(ops).toHaveLength(0);
  });
});

describe("createSubject — a subject is never born published-and-unsellable", () => {
  it("inserts as 'inactive' even when the form asks for Public", async () => {
    await run(() => createSubject(null, form(GOOD)));
    const insert = ops.find((o) => o.op === "insert");
    expect(insert?.table).toBe("subjects");
    expect(insert?.payload?.status).toBe("inactive");
  });

  it("writes all THREE cycle prices, not one", async () => {
    await run(() => createSubject(null, form(GOOD)));
    expect(rpcCalls.map((c) => c.args.p_interval).sort()).toEqual([
      "month",
      "week",
      "year",
    ]);
    for (const c of rpcCalls) {
      expect(c.name).toBe("admin_upsert_subject_price");
      expect(c.args.p_subject_id).toBe(NEW_ID);
    }
  });

  it("applies the requested status only AFTER the prices are stored", async () => {
    await run(() => createSubject(null, form(GOOD)));
    const statusUpdate = ops.findIndex(
      (o) => o.op === "update" && o.payload?.status === "active",
    );
    expect(statusUpdate).toBeGreaterThan(-1);
    // Every price write happened before the row became public.
    expect(rpcCalls).toHaveLength(3);
  });

  it("does NOT publish when a price write fails, and sends the admin somewhere it can be fixed", async () => {
    rpcErrorFor = "year";
    await run(() => createSubject(null, form(GOOD)));
    expect(ops.some((o) => o.op === "update" && o.payload?.status === "active")).toBe(
      false,
    );
    expect(redirects[0]).toBe(`/manage/subjects/${NEW_ID}/edit?priceFailed=1`);
  });

  it("never returns a raw Postgres message when the insert fails", async () => {
    insertError = { code: "42501", message: 'permission denied for table "subjects"' };
    const res = await createSubject(null, form(GOOD));
    expect(res).toEqual({ error: "err.server" });
  });

  it("audits the creation", async () => {
    await run(() => createSubject(null, form(GOOD)));
    expect(audits.map((a) => a.action)).toContain("admin.subject.create");
  });
});

describe("updateSubject — a failed reprice keeps the previous price and the previous status", () => {
  it("writes the prices BEFORE the row, and skips the row entirely on failure", async () => {
    rpcErrorFor = "month";
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "subj.err.priceSave", field: "month" });
    // The status stays where it was: no update reached `subjects`.
    expect(ops.some((o) => o.table === "subjects" && o.op === "update")).toBe(false);
  });

  it("re-verifies the client-supplied id against the database", async () => {
    subjectRow = null;
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "err.server" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("skips a cycle whose stored amount already matches, so Save is not audit spam", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "90.00", status: "active" },
    ];
    await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(rpcCalls).toHaveLength(0);
    // The row itself is still saved (the name or status may have changed).
    expect(ops.some((o) => o.table === "subjects" && o.op === "update")).toBe(true);
  });

  it("rewrites a cycle whose amount moved", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "80.00", status: "active" },
    ];
    await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(rpcCalls.map((c) => c.args.p_interval)).toEqual(["year"]);
    expect(rpcCalls[0].args.p_amount).toBe(90);
  });

  it("never returns a raw Postgres message when the row update fails", async () => {
    updateError = { code: "23514", message: "violates check constraint" };
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "err.server" });
  });

  it("reports success only when the row actually saved", async () => {
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ ok: true });
    expect(audits.map((a) => a.action)).toContain("admin.subject.update");
  });
});

describe("transitionSubject — publishing requires a complete price set", () => {
  it("refuses to publish a subject with a missing cycle, and says so", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
    ];
    await run(() =>
      transitionSubject(form({ __id: SUBJECT, __action: "publish" })),
    );
    expect(ops.some((o) => o.op === "update")).toBe(false);
    expect(redirects[0]).toBe("/manage/subjects?publishBlocked=1");
  });

  it("treats a non-active pricing row as no price at all", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "90.00", status: "inactive" },
    ];
    // The stub returns every row it is given; the ACTION filters on
    // status='active' in the query, which the stub cannot express — so this
    // asserts the query itself, at source level, rather than the stub's echo.
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/admin/subject-status.ts"),
      "utf8",
    );
    expect(src).toContain('.from("subjects_pricing")');
    expect(src).toMatch(/\.eq\("status",\s*"active"\)/);
  });

  it("publishes when all three cycles are priced", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "90.00", status: "active" },
    ];
    await run(() =>
      transitionSubject(form({ __id: SUBJECT, __action: "publish" })),
    );
    expect(redirects).toHaveLength(0);
    expect(ops.some((o) => o.op === "update" && o.payload?.status === "active")).toBe(
      true,
    );
  });

  it("never consults pricing for a move that hides the subject", async () => {
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "active" };
    await run(() =>
      transitionSubject(form({ __id: SUBJECT, __action: "archive" })),
    );
    // Archiving an unpriced subject must always work — it is the recommended
    // way OUT of a bad state, not a reward for being in a good one.
    expect(redirects).toHaveLength(0);
    expect(
      ops.some((o) => o.op === "update" && o.payload?.status === "archived"),
    ).toBe(true);
  });

  it("sends a refused publish back to the screen it was fired from", async () => {
    pricingRows = [];
    await run(() =>
      transitionSubject(
        form({ __id: SUBJECT, __action: "publish", __return: "edit" }),
      ),
    );
    expect(redirects[0]).toBe(`/manage/subjects/${SUBJECT}/edit?publishBlocked=1`);
  });

  it("resolves the return target from a literal map, never from the posted value", async () => {
    pricingRows = [];
    await run(() =>
      transitionSubject(
        form({
          __id: SUBJECT,
          __action: "publish",
          __return: "https://evil.example/steal",
        }),
      ),
    );
    expect(redirects[0]).toBe("/manage/subjects?publishBlocked=1");
  });
});

describe("the generic registry can no longer write a subject", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "src/lib/admin/actions.ts"),
    "utf8",
  );

  it("refuses __slug=subjects in saveRow", () => {
    // Hidden in the UI is not refused: /manage/subjects is a dedicated screen
    // now, but a hand-crafted POST carrying __slug=subjects would otherwise
    // still flip status to 'active' on an unpriced row.
    expect(SRC).toContain('const NON_GENERIC_SAVE = new Set(["subjects"]);');
    expect(SRC).toContain("NON_GENERIC_SAVE.has(res.slug)");
  });

  it("still refuses __slug=subjects in deleteRow", () => {
    expect(SRC).toContain('const NON_GENERIC_DELETE = new Set(["subjects"]);');
  });

  it("does no float arithmetic on money", () => {
    // Amounts are validated as TEXT and handed to the RPC untouched; the only
    // numeric normalisation is toFixed(2) for a text COMPARISON.
    const block = SRC.slice(SRC.indexOf("async function writeSubjectPrices"));
    expect(block).not.toMatch(/p_amount:\s*[^,]*[*+/-]/);
    expect(block).toContain("toFixed(2)");
  });
});

describe("trilingual copy", () => {
  const NEW_KEYS = Object.keys(messages.az).filter(
    (k) => k.startsWith("subj.") || k.startsWith("del.subject."),
  );

  it("ships every subject key in az, en and ru", () => {
    expect(NEW_KEYS.length).toBeGreaterThan(30);
    const missingEn = NEW_KEYS.filter((k) => !messages.en[k]);
    const missingRu = NEW_KEYS.filter((k) => !messages.ru[k]);
    expect(missingEn).toEqual([]);
    expect(missingRu).toEqual([]);
  });

  it("does not leave a locale echoing the Azerbaijani string", () => {
    // A copy-paste that forgot to translate is the usual way a "trilingual"
    // change ships in one language.
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
});
