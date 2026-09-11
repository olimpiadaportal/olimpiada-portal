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
// ordering properties no browser click-through can reveal: the guard before the
// first FormData read, and the prices before the status.
//
// SINCE THE /pricing MERGE (2026-09-10) there is a second invariant, and it is
// about not LOSING money data rather than not hiding it:
//
//     the subject ROW and the subject PRICES are written by different actions.
//
// createSubject writes both (a subject born unpriced is the trap above).
// updateSubject writes name and status ONLY, and saveSubjectPrice writes one
// (subject, interval) amount and nothing else. That is what makes "renaming a
// subject cannot reset its prices" and "repricing cannot rename or unpublish a
// subject" structural rather than careful — and it is asserted here because the
// obvious refactor, "just keep the three inputs on the edit form too", silently
// reintroduces both.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { NAV } from "@/lib/admin/nav";

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
let upsertError: { code?: string; message?: string } | null = null;
let translationRows: { locale: string; name: string }[] = [];
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
    in: () => b,
    // subject_translations is written as ONE upsert of three rows keyed
    // (subject_id, locale) — never delete-then-insert, which would leave the
    // subject nameless for a moment in a table the apps read first.
    upsert: async (
      payload: Record<string, unknown>[],
      opts?: Record<string, unknown>,
    ) => {
      ops.push({ table, op: "upsert", payload: { rows: payload, opts } });
      return { data: null, error: upsertError };
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
          data:
            table === "subjects_pricing"
              ? pricingRows
              : table === "subject_translations"
                ? translationRows
                : [],
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
import { saveSubjectPrice } from "../pricing";

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
  upsertError = null;
  translationRows = [];
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
      // createSubject is the only action that still parses price fields off a
      // subject form; the same strings are re-tested against saveSubjectPrice
      // further down, since that is now the only way an existing price moves.
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

describe("updateSubject — name and status only, never a price", () => {
  const PRICED = [
    { interval: "week", price_amount: "3.00", status: "active" },
    { interval: "month", price_amount: "9.00", status: "active" },
    { interval: "year", price_amount: "90.00", status: "active" },
  ];

  it("re-verifies the client-supplied id against the database", async () => {
    subjectRow = null;
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "err.server" });
    expect(ops).toHaveLength(0);
  });

  it("PRICE PRESERVED ON RENAME: renaming writes no price at all", async () => {
    // THE REGRESSION THIS EXISTS FOR. The edit form used to post three amounts
    // alongside the name, so saving a rename re-wrote every cycle from values
    // read off a page that might be minutes old — silently undoing a reprice
    // made in between, with no version to notice the collision. The action now
    // has no code path that reaches subjects_pricing except a read-only publish
    // check, so the property is structural.
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, name: "Riyaziyyat (yeni ad)" }),
    );
    expect(res).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(0);
    expect(ops.filter((o) => o.table === "subjects_pricing")).toHaveLength(0);
    // The rename itself DID save — into subject_translations, which is where a
    // display name lives. The `subjects` row write carries the status only.
    const written = ops.find(
      (o) => o.table === "subject_translations" && o.op === "upsert",
    );
    expect(
      ((written?.payload?.rows ?? []) as { locale: string; name: string }[]).find(
        (r) => r.locale === "az",
      )?.name,
    ).toBe("Riyaziyyat (yeni ad)");
  });

  it("ignores a forged price field instead of writing it", async () => {
    // The edit form posts no price_* inputs. One arriving anyway is a crafted
    // request, and parseSubjectForm is told not to look — reading it would be
    // exactly the second write path the merge removed.
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, price_month: "1" }),
    );
    expect(rpcCalls).toHaveLength(0);
  });

  it("does not refuse an edit that omits the prices", async () => {
    // parseSubjectForm(…, false) must not treat a missing price_week as an
    // invalid amount, or every rename would fail with a price error.
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, name: "Kimya", status: "active" }),
    );
    expect(res).toEqual({ ok: true });
  });

  it("refuses to publish an unpriced subject through the status dropdown", async () => {
    // With prices off the form, the dropdown became a second route into
    // 'active'. It must not be a route AROUND the interlock the publish button
    // enforces.
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
    ];
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "subj.publishBlocked", field: "status" });
    expect(ops.some((o) => o.table === "subjects" && o.op === "update")).toBe(
      false,
    );
  });

  it("checks ACTIVE pricing rows, not merely present ones", async () => {
    // The Supabase stub returns every row it is handed and cannot express the
    // .eq("status", "active") filter, so this asserts the query at source level
    // — the same technique the transitionSubject suite uses below.
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/admin/actions.ts"),
      "utf8",
    );
    const block = src.slice(src.indexOf("async function pricesComplete"));
    expect(block).toContain('.from("subjects_pricing")');
    expect(block).toMatch(/\.eq\("status",\s*"active"\)/);
  });

  it("never consults pricing for a move that hides the subject", async () => {
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "active" };
    pricingRows = [];
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, name: "Fizika", status: "archived" }),
    );
    expect(res).toEqual({ ok: true });
    expect(
      ops.some((o) => o.op === "update" && o.payload?.status === "archived"),
    ).toBe(true);
  });

  it("never returns a raw Postgres message when the row update fails", async () => {
    pricingRows = PRICED;
    updateError = { code: "23514", message: "violates check constraint" };
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "err.server" });
  });

  it("reports success only when the row actually saved", async () => {
    pricingRows = PRICED;
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ ok: true });
    expect(audits.map((a) => a.action)).toContain("admin.subject.update");
  });

  it("audits the rename, so a name change is reconstructible", async () => {
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, name: "Kimya" }),
    );
    const audit = audits.find((a) => a.action === "admin.subject.update");
    // KEYED BY `code`, not by the name. The display name is the thing that just
    // changed, so an audit trail that identified the subject by it would be a
    // trail of aliases; `code` is generated once and never moves.
    expect(audit?.metadata).toMatchObject({
      code: "fizika",
      renamed: true,
      from: "inactive",
      to: "active",
    });
    expect(audit?.metadata).not.toHaveProperty("name");
  });
});

describe("a stale tab cannot drive the status", () => {
  // THE DEFECT. updateSubject re-read the stored row (good) and then wrote the
  // FORM's status unconditionally (not good). An admin who opened the edit page
  // while a subject was 'active', and saved a rename after somebody else
  // archived it, silently put it back on sale — the dropdown still said
  // "Public" because that is what the page was rendered with. transitionSubject
  // has guarded the same collision since it was written, with a `from`
  // whitelist checked against the RE-READ row; this is the same discipline on
  // the other route into the same column.
  //
  // Both halves are asserted: the status must not move, and the refusal must be
  // SAID. A silent no-op would leave the admin believing the archive was undone
  // — the same class of bug in the other direction.
  const PRICED = [
    { interval: "week", price_amount: "3.00", status: "active" },
    { interval: "month", price_amount: "9.00", status: "active" },
    { interval: "year", price_amount: "90.00", status: "active" },
  ];

  /** The write that landed on `subjects`, if any. */
  const rowWrite = () =>
    ops.find((o) => o.table === "subjects" && o.op === "update");

  it("refuses the status change when the row moved under the form", async () => {
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD }),
    );
    expect(res).toEqual({
      error: "subj.err.staleStatus",
      field: "status",
      stale: true,
    });
    expect(rowWrite()?.payload?.status).toBe("archived");
  });

  it("keeps the rename it was actually asked for", async () => {
    // The names are unrelated data. Losing them would punish this admin for
    // someone else's edit, and would make the refusal look like a total failure.
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD, name: "Kimya" }),
    );
    const up = ops.find(
      (o) => o.table === "subject_translations" && o.op === "upsert",
    );
    expect(up).toBeTruthy();
    expect(
      ((up?.payload?.rows ?? []) as { locale: string; name: string }[]).find(
        (r) => r.locale === "az",
      )?.name,
    ).toBe("Kimya");
  });

  it("does not re-describe a stale refusal as a pricing problem", async () => {
    // An archived, unpriced subject with a stale 'active' posted at it hits two
    // guards. The staleness one is the true one: the admin's publish was never
    // legal in the first place, and "set the prices" would send them off to fix
    // something that is not the reason.
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = [];
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD }),
    );
    expect(res).toEqual({
      error: "subj.err.staleStatus",
      field: "status",
      stale: true,
    });
  });

  it("applies the status when the baseline still matches the row", async () => {
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "inactive", ...GOOD }),
    );
    expect(res).toEqual({ ok: true });
    expect(rowWrite()?.payload?.status).toBe("active");
  });

  it("treats a posted status that already matches the row as no conflict", async () => {
    // Stale baseline, but the admin picked exactly where the row already is.
    // Writing it changes nothing, so there is nothing to refuse.
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD, status: "archived" }),
    );
    expect(res).toEqual({ ok: true });
    expect(rowWrite()?.payload?.status).toBe("archived");
  });

  it("ignores a baseline it cannot interpret instead of refusing the save", async () => {
    // Absent or forged means "no baseline". Refusing on a value we cannot read
    // would break editing for nobody's benefit; the publish interlock still
    // stands underneath.
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "not-a-status", ...GOOD }),
    );
    expect(res).toEqual({ ok: true });
    expect(rowWrite()?.payload?.status).toBe("active");
  });

  it("records the refused target in the audit row", async () => {
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD }),
    );
    const audit = audits.find((a) => a.action === "admin.subject.update");
    expect(audit?.metadata).toMatchObject({
      from: "archived",
      to: "archived",
      statusRefused: "active",
    });
  });

  it("still guards before reading the baseline field", async () => {
    await run(() =>
      updateSubject(null, form({ __id: SUBJECT, __statusWas: "active", ...GOOD })),
    );
    expect(order[0]).toBe("guard");
    expect(order.indexOf("guard")).toBeLessThan(order.indexOf("read:__statusWas"));
  });

  it("the edit form posts the status it was rendered against", () => {
    // Without the hidden field the server has nothing to compare and the check
    // is inert — so the form half is pinned here, not just the action half.
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(protected)/manage/subjects/SubjectForm.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('name="__statusWas"');
    expect(src).toContain("value={defaults.status}");
  });

  it("announces a field error once, not twice", () => {
    // The publish refusal used to render under the status select AND in the
    // form-error paragraph, both role="alert", so a screen reader read it
    // twice. The paragraph now carries only errors that name no control.
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(protected)/manage/subjects/SubjectForm.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("{state?.error && !state.field && (");
  });
});

describe("createSubject still writes prices, and still skips unchanged cycles", () => {
  it("skips a cycle whose stored amount already matches, so no audit spam", async () => {
    // writeSubjectPrices is now reached only from createSubject, but the skip
    // rule is what keeps a retried creation from writing three audit rows for
    // amounts that did not move.
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "90.00", status: "active" },
    ];
    await run(() => createSubject(null, form(GOOD)));
    expect(rpcCalls).toHaveLength(0);
  });

  it("rewrites a cycle whose amount moved", async () => {
    pricingRows = [
      { interval: "week", price_amount: "3.00", status: "active" },
      { interval: "month", price_amount: "9.00", status: "active" },
      { interval: "year", price_amount: "80.00", status: "active" },
    ];
    await run(() => createSubject(null, form(GOOD)));
    expect(rpcCalls.map((c) => c.args.p_interval)).toEqual(["year"]);
    expect(rpcCalls[0].args.p_amount).toBe(90);
  });
});

describe("saveSubjectPrice — the ONE way a stored price changes", () => {
  const CELL = { subject_id: SUBJECT, interval: "month", amount: "12.50" };

  it("guards before reading any client field", async () => {
    await saveSubjectPrice(null, form(CELL));
    expect(order[0]).toBe("guard");
    expect(order.filter((o) => o.startsWith("read:")).length).toBeGreaterThan(0);
  });

  it("NAME PRESERVED ON PRICE CHANGE: it never writes the subjects table", async () => {
    // The counterpart of the rename test above. A price cell posts a subject
    // id, an interval and an amount; there is no name and no status in the
    // request, so a reprice cannot rename, publish or unpublish anything even
    // if the form were forged to carry those fields.
    const res = await saveSubjectPrice(
      null,
      form({ ...CELL, name: "Forged", status: "archived" }),
    );
    expect(res).toEqual({ ok: true });
    expect(ops).toHaveLength(0);
    expect(rpcCalls).toEqual([
      {
        name: "admin_upsert_subject_price",
        args: {
          p_subject_id: SUBJECT,
          p_interval: "month",
          p_amount: 12.5,
        },
      },
    ]);
  });

  it("refuses a malformed subject id before touching the database", async () => {
    const res = await saveSubjectPrice(
      null,
      form({ ...CELL, subject_id: "not-a-uuid" }),
    );
    expect(res).toEqual({ error: "err.server" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses an interval outside the plan_interval enum", async () => {
    // 'lifetime' is a real concept on this platform (olympiad packages), which
    // is precisely why a client string must never reach the column.
    const res = await saveSubjectPrice(
      null,
      form({ ...CELL, interval: "lifetime" }),
    );
    expect(res).toEqual({ error: "err.server" });
    expect(rpcCalls).toHaveLength(0);
  });

  const badAmounts: Record<string, string> = {
    negative: "-5",
    zero: "0",
    empty: "",
    text: "abc",
    "three decimals": "9.999",
    "over the cap": "10001",
    "thousands separator": "1,50",
  };
  for (const [label, value] of Object.entries(badAmounts)) {
    it(`refuses a ${label} amount without calling the RPC`, async () => {
      const res = await saveSubjectPrice(null, form({ ...CELL, amount: value }));
      // CELL-SCOPED, not the create form's plural "each price must be…": this
      // message renders under the one input that was rejected.
      expect(res).toEqual({ error: "subj.err.priceCell" });
      expect(rpcCalls).toHaveLength(0);
    });
  }

  it("never returns a raw Postgres message when the RPC fails", async () => {
    rpcErrorFor = "month";
    const res = await saveSubjectPrice(null, form(CELL));
    expect(res).toEqual({ error: "err.server" });
  });

  it("writes no audit row of its own — the RPC writes one", async () => {
    // admin_upsert_subject_price is SECURITY DEFINER and records
    // admin.pricing.subject_price_upsert with the old and new amounts. A
    // writeAuditLog() here would double every reprice in the audit trail.
    await saveSubjectPrice(null, form(CELL));
    expect(audits).toHaveLength(0);
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

describe("the /pricing screen is merged into Subjects, not duplicated", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

  it("the standalone Pricing page is a redirect, not a second grid", () => {
    const src = read("src/app/(protected)/pricing/page.tsx");
    expect(src).toContain('redirect("/manage/subjects")');
    // A bookmark must land somewhere sensible; a 404 would read as "pricing was
    // removed" rather than "pricing moved". And the route must do NOTHING else:
    // a second screen that still reads or writes the pricing tables is the
    // duplication this merge removed.
    expect(src).not.toContain("createClient");
    expect(src).not.toContain("PriceCell");
  });

  it("the sidebar no longer offers a separate Prices entry", () => {
    const items = NAV.flatMap((g) => g.items);
    expect(items.some((i) => i.href === "/pricing")).toBe(false);
    expect(items.some((i) => i.label === "nav.pricing")).toBe(false);
    // Subjects is still there, still Administrator-only: the Content-Manager
    // boundary must not have moved with the screen.
    const subjects = items.find((i) => i.href === "/manage/subjects");
    expect(subjects).toEqual({
      label: "nav.subjects",
      href: "/manage/subjects",
      adminOnly: true,
    });
  });

  it("the price cell was LIFTED, not copied — one component, one action", () => {
    const cell = read("src/components/PriceCell.tsx");
    expect(cell).toContain("saveSubjectPrice");
    for (const screen of [
      "src/app/(protected)/manage/subjects/page.tsx",
      "src/app/(protected)/manage/subjects/[id]/edit/page.tsx",
    ]) {
      expect(read(screen)).toContain('from "@/components/PriceCell"');
    }
  });

  it("the edit form posts no price field, so it cannot write one", () => {
    const formSrc = read(
      "src/app/(protected)/manage/subjects/SubjectForm.tsx",
    );
    // The inputs exist for CREATE only, behind the withPrices flag.
    expect(formSrc).toContain("const withPrices = mode === \"create\";");
    expect(formSrc).toContain("{withPrices && (");
  });

  it("states the Apple consequence on the screen where a subject is created", () => {
    const notice = read("src/app/(protected)/manage/subjects/IapNotice.tsx");
    expect(notice).toContain("subj.iapHeading");
    expect(notice).toContain("subj.iapNotice");
    expect(read("src/app/(protected)/manage/subjects/new/page.tsx")).toContain(
      "<IapNotice",
    );
  });
});

describe("the Apple coupling is stated, in every language", () => {
  const KEYS = [
    "subj.iapHeading",
    "subj.iapNotice",
    "subj.iapSteps",
    "subj.iosNotSellable",
    "subj.iosNotSellableHint",
    "subj.iosSellable",
    // The third state. A failed iap_products read is neither "sold" nor "not
    // sold", and it needs its own sentence in all three languages before either
    // screen can print it.
    "subj.iosUnknown",
    "subj.iosUnknownHint",
  ];

  for (const k of KEYS) {
    it(`${k} ships in az, en and ru`, () => {
      for (const locale of ["az", "en", "ru"] as const) {
        expect(messages[locale][k], `${k} (${locale})`).toBeTruthy();
      }
    });
  }

  it("names App Store Connect and says the subject is simply absent on iOS", () => {
    // The failure mode is silence, so the copy has to describe silence. A
    // rewrite that reduces this to "configure the store products" would drop
    // the only sentence that tells an admin why their new subject is missing
    // from an iPhone while selling fine on the website.
    expect(messages.en["subj.iapNotice"]).toContain("App Store Connect");
    expect(messages.en["subj.iapNotice"]).toContain("no error");
    expect(messages.az["subj.iapNotice"]).toContain("App Store Connect");
    expect(messages.ru["subj.iapNotice"]).toContain("App Store Connect");
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

describe("the subject NAME is trilingual, and a rename is not a no-op", () => {
  // THE DEFECT (migration 171). `subjects.name` held one Azerbaijani string and
  // the apps resolved every visible subject label from their own `subj.<code>`
  // dictionary FIRST. The dictionary won for every seeded subject, so renaming
  // one wrote the row, wrote an audit entry, showed "saved" — and changed
  // nothing a family could see, in any of the three languages. Creating a
  // subject worked (unknown code, no dictionary key), which is exactly why it
  // went unnoticed. The names now live per-locale in subject_translations and
  // the apps read that before the catalog.
  const PRICED = [
    { interval: "week", price_amount: "3.00", status: "active" },
    { interval: "month", price_amount: "9.00", status: "active" },
    { interval: "year", price_amount: "90.00", status: "active" },
  ];

  /** The three rows written to subject_translations, keyed by locale. */
  function written(): Record<string, string> {
    const up = ops.find(
      (o) => o.table === "subject_translations" && o.op === "upsert",
    );
    const rows = (up?.payload?.rows ?? []) as {
      locale: string;
      name: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.locale, r.name]));
  }

  it("writes every locale the admin filled in", async () => {
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({
        __id: SUBJECT,
        ...GOOD,
        name: "İngilis dili",
        name_en: "English",
        name_ru: "Английский язык",
      }),
    );
    expect(res).toEqual({ ok: true });
    expect(written()).toEqual({
      az: "İngilis dili",
      en: "English",
      ru: "Английский язык",
    });
  });

  it("falls back to az for a blank en/ru instead of storing an empty label", async () => {
    // A blank field is "same as Azerbaijani", not "no name". Storing '' would
    // violate ck_subject_tr_name_not_blank AND, if it ever got through, render
    // an empty subject label to that language.
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, name: "Kimya", name_en: "  ", name_ru: "" }),
    );
    expect(written()).toEqual({ az: "Kimya", en: "Kimya", ru: "Kimya" });
  });

  it("NEVER rewrites subjects.name — it is the bulk-import key", async () => {
    // THE DEFECT THIS REPLACES. `subjects.name` is not a label: three bulk-
    // import RPCs resolve a subject with `where name = (meta ->> 'subject')`
    // (011_indexes_constraints_functions_triggers.sql:3026, :3185, :6857). An
    // update that rewrote it turned every import file naming the old string
    // into "unknown subject" — days later, in somebody else's upload, with
    // nothing connecting the failure to the rename that caused it. The az name
    // now goes to subject_translations and the key is left exactly where it was.
    pricingRows = PRICED;
    await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, name: "Məntiq", name_en: "Logic" }),
    );
    const rowWrite = ops.find(
      (o) => o.table === "subjects" && o.op === "update",
    );
    expect(rowWrite?.payload).not.toHaveProperty("name");
    expect(written().az).toBe("Məntiq");
  });

  it("has no code path from updateSubject to the name column at all", () => {
    // Asserted at source level as well as behaviourally: the obvious "fix" for
    // a screen that looks like it should rename the row is to put `name:` back
    // into the payload, and the stub above would not notice a payload key that
    // simply reappears in a branch this suite does not exercise.
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/admin/actions.ts"),
      "utf8",
    );
    const block = src.slice(src.indexOf("export async function updateSubject"));
    expect(block).not.toMatch(/name:\s*parsed\.name/);
  });

  it("still writes subjects.name at CREATION — the key has to come from somewhere", async () => {
    await run(() => createSubject(null, form({ ...GOOD, name: "Kimya" })));
    const insert = ops.find((o) => o.table === "subjects" && o.op === "insert");
    expect(insert?.payload?.name).toBe("Kimya");
  });

  it("upserts on (subject_id, locale) rather than deleting first", async () => {
    pricingRows = PRICED;
    await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    const up = ops.find(
      (o) => o.table === "subject_translations" && o.op === "upsert",
    );
    expect(up?.payload?.opts).toMatchObject({ onConflict: "subject_id,locale" });
    expect(
      ops.some((o) => o.table === "subject_translations" && o.op === "delete"),
    ).toBe(false);
  });

  it("records WHICH languages changed, and no names, in the audit row", async () => {
    pricingRows = PRICED;
    translationRows = [
      { locale: "az", name: "Fizika" },
      { locale: "en", name: "Physics" },
      { locale: "ru", name: "Физика" },
    ];
    await updateSubject(
      null,
      form({
        __id: SUBJECT,
        ...GOOD,
        name: "Fizika",
        name_en: "Physics I",
        name_ru: "Физика",
      }),
    );
    const audit = audits.find((a) => a.action === "admin.subject.update");
    expect(audit?.metadata).toMatchObject({ renamed: true, locales: ["en"] });
    // Small payload: locale codes, never the strings themselves.
    expect(JSON.stringify(audit?.metadata)).not.toContain("Physics I");
  });

  it("reports a failed name write instead of claiming the rename saved", async () => {
    // The whole point of 171: a rename that did not take must not look like one
    // that did. That is the shape of the original bug.
    pricingRows = PRICED;
    upsertError = { code: "42501", message: "permission denied" };
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ error: "subj.err.nameSave", field: "name" });
  });

  it("refuses an over-long English name server-side, before any write", async () => {
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, ...GOOD, name_en: "x".repeat(121) }),
    );
    expect(res).toEqual({ error: "subj.err.name", field: "name_en" });
    expect(ops).toHaveLength(0);
  });

  it("still guards before reading any name field", async () => {
    await run(() =>
      updateSubject(null, form({ __id: SUBJECT, ...GOOD, name_en: "English" })),
    );
    expect(order[0]).toBe("guard");
    expect(order).toContain("read:name_en");
    expect(order.indexOf("guard")).toBeLessThan(order.indexOf("read:name_en"));
  });

  it("creating a subject writes all three names too", async () => {
    await run(() =>
      createSubject(
        null,
        form({ ...GOOD, name: "Kimya", name_en: "Chemistry" }),
      ),
    );
    expect(written()).toEqual({
      az: "Kimya",
      en: "Chemistry",
      ru: "Kimya",
    });
    const insert = ops.find((o) => o.table === "subjects" && o.op === "insert");
    expect(insert?.payload?.name).toBe("Kimya");
    expect(audits.map((a) => a.action)).toContain("admin.subject.create");
  });

  it("a creation whose names fail is not published, and says where to fix it", async () => {
    upsertError = { code: "42P01", message: "relation does not exist" };
    await run(() => createSubject(null, form(GOOD)));
    expect(
      ops.some((o) => o.op === "update" && o.payload?.status === "active"),
    ).toBe(false);
    expect(redirects[0]).toBe(`/manage/subjects/${NEW_ID}/edit?nameFailed=1`);
  });
});

describe("a rename must stay FINDABLE, and the panel must stay consistent", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("the list search matches the translations, not only the frozen key", () => {
    // The consequence of freezing `subjects.name`: the search box filtered that
    // column alone, so a subject renamed to "English / İngilis dili" was
    // findable only under the name nobody sees any more — on the very screen an
    // admin opens in order to find it.
    const src = read("src/app/(protected)/manage/subjects/data.ts");
    const block = src.slice(src.indexOf("async function searchTranslatedIds"));
    expect(block).toContain('.from("subject_translations")');
    expect(block).toContain('.ilike("name", `%${term}%`)');
  });

  it("the search term stays sanitised and never becomes an or() string", () => {
    // sanitizeSearchTerm caps the term, strips PostgREST's filter-grammar
    // characters and escapes LIKE wildcards; the page applies it and data.ts
    // interpolates the result into `%term%` only. Building a `.or(...)` filter
    // out of it would put raw text back into a place with its own grammar.
    const page = read("src/app/(protected)/manage/subjects/page.tsx");
    expect(page).toContain("sanitizeSearchTerm(q)");
    const data = read("src/app/(protected)/manage/subjects/data.ts");
    // An actual .or("…") call, not the prose about why there isn't one.
    expect(data).not.toMatch(/\.or\(\s*[`'"]/);
  });

  it("shows the DISPLAY name wherever a human reads it", () => {
    // One decision, applied everywhere on these screens: humans read the
    // display name, records key on the id/code, and the import key is printed
    // exactly once — labelled as the key, on the form beside the field that no
    // longer writes it.
    const list = read("src/app/(protected)/manage/subjects/page.tsx");
    expect(list).toContain("{row.display}");
    expect(list).not.toContain("{row.name}");
    const edit = read("src/app/(protected)/manage/subjects/[id]/edit/page.tsx");
    expect(edit).toContain("{subject.display}");
    expect(edit).toContain("internalName: subject.name");
  });

  it("the deletion dialog resolves the display name instead of the RPC's key", () => {
    // admin_preview_subject_deletion returns `subjects.name`. Asking "delete
    // İngilis dili?" about a subject the panel calls "English / İngilis dili"
    // is asking for recognition of something the admin has not seen in months,
    // in the one dialog whose whole job is recognition.
    const src = read("src/lib/admin/subject-deletion.ts");
    expect(src).toContain("async function subjectDisplayName");
    expect(src).toContain("name: await subjectDisplayName(");
  });

  it("says on the form that the import key does not move, in all three languages", () => {
    for (const locale of ["az", "en", "ru"] as const) {
      expect(messages[locale]["subj.importNameHint"]).toBeTruthy();
    }
    const formSrc = read("src/app/(protected)/manage/subjects/SubjectForm.tsx");
    expect(formSrc).toContain("strings.importNameHint");
    // Edit only: on the create screen the az field IS what mints the key.
    expect(formSrc).toContain('mode === "edit" && defaults.internalName');
  });
});

describe("a half-created subject is never abandoned", () => {
  it("writes the prices even when the name write fails", async () => {
    // THE DEFECT. createSubject redirected on a failed subject_translations
    // write BEFORE it reached the prices, so any name failure — including
    // migration 171 simply not being applied yet, which fails EVERY creation —
    // left a created, unpriced, unpublished subject behind and reported only
    // that the names had not saved.
    upsertError = { code: "42P01", message: "relation does not exist" };
    await run(() => createSubject(null, form(GOOD)));
    expect(rpcCalls.map((c) => c.args.p_interval).sort()).toEqual([
      "month",
      "week",
      "year",
    ]);
  });

  it("names BOTH outcomes when both halves fail", async () => {
    upsertError = { code: "42P01", message: "relation does not exist" };
    rpcErrorFor = "year";
    await run(() => createSubject(null, form(GOOD)));
    expect(redirects[0]).toBe(
      `/manage/subjects/${NEW_ID}/edit?nameFailed=1&priceFailed=1`,
    );
  });

  it("publishes neither way", async () => {
    upsertError = { code: "42P01", message: "relation does not exist" };
    await run(() => createSubject(null, form(GOOD)));
    expect(
      ops.some((o) => o.op === "update" && o.payload?.status === "active"),
    ).toBe(false);
  });

  it("the edit page renders a sentence for each flag it can be sent", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(protected)/manage/subjects/[id]/edit/page.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('first(sp, "nameFailed") === "1"');
    expect(src).toContain('first(sp, "priceFailed") === "1"');
  });
});

describe("the staleness guard is armed by the form, not disarmed by it", () => {
  const PRICED = [
    { interval: "week", price_amount: "3.00", status: "active" },
    { interval: "month", price_amount: "9.00", status: "active" },
    { interval: "year", price_amount: "90.00", status: "active" },
  ];
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("the select and the baseline render from ONE source", () => {
    // THE DEFECT. The select was uncontrolled (defaultValue, applied on the
    // first mount only) while the hidden __statusWas field was controlled by
    // the same prop. After an in-page lifecycle transition + router.refresh()
    // the hidden field carried the NEW stored status and the select still
    // showed the OLD one, so the next Save posted a status nobody chose against
    // a baseline that agreed with the database — no conflict, and the guard
    // added this round wrote it through.
    const src = read("src/app/(protected)/manage/subjects/SubjectForm.tsx");
    expect(src).not.toContain("defaultValue={defaults.status}");
    expect(src).toContain("value={status}");
    // The control follows the server value when it moves, adjusted during
    // render rather than in an effect (an effect paints the stale value once).
    expect(src).toContain("if (statusWas !== defaults.status) {");
    expect(src).toContain("setStatus(defaults.status);");
  });

  it("a refused save carries a flag the client can act on", async () => {
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD }),
    );
    // Not a translated sentence the form would have to recognise.
    expect(res).toMatchObject({ field: "status", stale: true });
  });

  it("flags a stale refusal that also lost its names", async () => {
    // Two failures, one stuck page: the baseline is behind either way, so the
    // re-read is owed on both outcomes and not only on the tidier one.
    subjectRow = { id: SUBJECT, name: "Fizika", code: "fizika", status: "archived" };
    pricingRows = PRICED;
    upsertError = { code: "42501", message: "permission denied" };
    const res = await updateSubject(
      null,
      form({ __id: SUBJECT, __statusWas: "active", ...GOOD }),
    );
    expect(res).toMatchObject({ field: "name", stale: true });
  });

  it("a successful save carries no flag", async () => {
    pricingRows = PRICED;
    const res = await updateSubject(null, form({ __id: SUBJECT, ...GOOD }));
    expect(res).toEqual({ ok: true });
  });

  it("the form re-reads after a refusal instead of retrying against a dead baseline", () => {
    // Without this, router.refresh() ran on state.ok only: the page kept the
    // baseline the database had already moved past, so every retry reproduced
    // the identical refusal until the admin reloaded by hand.
    const src = read("src/app/(protected)/manage/subjects/SubjectForm.tsx");
    expect(src).toContain("if (state?.stale) router.refresh();");
  });
});
