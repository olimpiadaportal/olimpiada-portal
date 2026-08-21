// The server-side plan basket (src/lib/planBasket.ts) and the retirement of
// proration, asserted where it can actually be asserted: in pure logic and in
// the SQL/TypeScript text itself.
//
// WHY THESE TESTS EXIST. Until migration 118 a caller that sent only subject
// ids reached a DIFFERENT pair of RPCs — quote_subject_change /
// apply_subject_change — which prorated an addition into one shared child
// cycle. The owner retired that model (2026-08-17): every subject is billed on
// its own cycle, starting the day it is added. The fix was not to stop calling
// the wrappers but to make them unreachable, and to move the one rule they
// implemented in SQL ("which cycle does a kept subject keep?") into ONE pure
// function here. Two implementations of a billing rule mis-bill silently the
// day they drift, so the tests below pin both halves: the rule, and the absence
// of the second implementation.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  derivePlanItems,
  desiredFromAddRemove,
  effectivePlanInterval,
  uniformPlanItems,
  validatePlanItems,
  type LivePlan,
  type LivePlanRow,
} from "@/lib/planBasket";

// Fixed UUIDs — validatePlanItems enforces the shape, so these must be real
// v4-shaped strings or every basket in this file would fail for the wrong reason.
const MATH = "11111111-1111-4111-8111-111111111111";
const SCIENCE = "22222222-2222-4222-8222-222222222222";
const LOGIC = "33333333-3333-4333-8333-333333333333";
const ENGLISH = "44444444-4444-4444-8444-444444444444";

function row(over: Partial<LivePlanRow> & { subject_id: string }): LivePlanRow {
  return {
    interval: null,
    pending_interval: null,
    remove_at: null,
    ...over,
  };
}

function plan(over: Partial<LivePlan> = {}): LivePlan {
  const activeRows = over.activeRows ?? [];
  return {
    subscriptionId: "99999999-9999-4999-8999-999999999999",
    interval: "month",
    ...over,
    activeRows,
    // Mirrors readLivePlan, where allRows is the superset and activeRows is it
    // minus the removal-scheduled rows. A test that does not distinguish the
    // two gets the common case where they are equal.
    allRows: over.allRows ?? activeRows,
  };
}

describe("effectivePlanInterval", () => {
  it("prefers a SCHEDULED cycle over the one being paid", () => {
    // The parent moved this subject to yearly on the web; the change applies at
    // its own renewal. Reading `interval` first would make an unrelated
    // add/remove re-assert 'month' — which the server treats as "cancel the
    // schedule", silently undoing the parent's choice.
    expect(
      effectivePlanInterval(
        row({ subject_id: MATH, interval: "month", pending_interval: "year" }),
        "month",
      ),
    ).toBe("year");
  });

  it("falls back to the subject's own cycle, then the subscription default", () => {
    expect(effectivePlanInterval(row({ subject_id: MATH, interval: "week" }), "month")).toBe(
      "week",
    );
    // interval NULL is legal on rows that predate migration 109.
    expect(effectivePlanInterval(row({ subject_id: MATH }), "year")).toBe("year");
    // Nothing to resolve at all — never invent one.
    expect(effectivePlanInterval(undefined, null)).toBeNull();
  });
});

describe("derivePlanItems (the retired wrappers' rule, now server-side)", () => {
  it("keeps each covered subject on its own cycle and opens new ones on the default", () => {
    const live = plan({
      interval: "month",
      activeRows: [
        row({ subject_id: MATH, interval: "year" }),
        row({ subject_id: SCIENCE, interval: "week" }),
      ],
    });
    expect(derivePlanItems([MATH, SCIENCE, LOGIC], live)).toEqual([
      { subjectId: MATH, interval: "year" },
      { subjectId: SCIENCE, interval: "week" },
      // Not covered yet -> the subscription's default cycle, starting today.
      { subjectId: LOGIC, interval: "month" },
    ]);
  });

  it("carries a SCHEDULED cycle change through an unrelated add", () => {
    const live = plan({
      interval: "month",
      activeRows: [row({ subject_id: MATH, interval: "month", pending_interval: "year" })],
    });
    expect(derivePlanItems([MATH, LOGIC], live)).toEqual([
      { subjectId: MATH, interval: "year" },
      { subjectId: LOGIC, interval: "month" },
    ]);
  });

  it("treats a subject scheduled for removal as NOT covered", () => {
    // A row with remove_at keeps access to its own period end but is out of the
    // go-forward plan, so re-selecting it is an ADD — which is what clears
    // remove_at. readLivePlan filters those rows out; this asserts the shape
    // the derivation is handed.
    const live = plan({
      interval: "week",
      activeRows: [row({ subject_id: MATH, interval: "year" })],
    });
    expect(derivePlanItems([MATH, SCIENCE], live)).toEqual([
      { subjectId: MATH, interval: "year" },
      { subjectId: SCIENCE, interval: "week" },
    ]);
  });

  it("restores a removal-scheduled subject to ITS OWN cycle, not the default", () => {
    // REGRESSION. Membership and cycle are different questions. Resolving the
    // cycle from activeRows — which excludes a row with remove_at — made a
    // re-selected subject fall through to the subscription default, and
    // apply_plan_change writes `interval = excluded.interval` on conflict. So a
    // parent on a monthly-default subscription who scheduled removal of a
    // YEARLY subject and then changed their mind would have had it silently
    // switched to monthly: a cycle change, and a price, nobody asked for.
    // It is still an ADD (remove_at is cleared); only the CYCLE now comes from
    // the row that is actually paid.
    const live = plan({
      interval: "month",
      activeRows: [],
      allRows: [
        row({ subject_id: MATH, interval: "year", remove_at: "2027-01-01T00:00:00.000Z" }),
      ],
    });
    expect(derivePlanItems([MATH], live)).toEqual([{ subjectId: MATH, interval: "year" }]);
  });

  it("still gives a genuinely NEW subject the subscription default", () => {
    // The other half of the same rule: consulting allRows must not make every
    // unknown subject inherit some unrelated row's cycle.
    const live = plan({
      interval: "week",
      activeRows: [],
      allRows: [row({ subject_id: MATH, interval: "year", remove_at: "2027-01-01T00:00:00.000Z" })],
    });
    expect(derivePlanItems([SCIENCE], live)).toEqual([{ subjectId: SCIENCE, interval: "week" }]);
  });

  it("collapses duplicates to the FIRST occurrence", () => {
    const live = plan({
      interval: "month",
      activeRows: [row({ subject_id: MATH, interval: "year" })],
    });
    // A second mention must not demote a covered subject to the default cycle.
    expect(derivePlanItems([MATH, MATH], live)).toEqual([{ subjectId: MATH, interval: "year" }]);
  });

  it("emits an EMPTY cycle rather than guessing when none can be resolved", () => {
    const live = plan({ interval: null, activeRows: [] });
    const items = derivePlanItems([MATH], live);
    expect(items).toEqual([{ subjectId: MATH, interval: "" }]);
    // …and the basket is then rejected, so the caller returns sub.err.invalid
    // instead of billing a cycle nobody chose.
    expect(validatePlanItems(items)).toBeNull();
  });
});

describe("desiredFromAddRemove (the legacy add/remove body shape)", () => {
  const live = plan({
    interval: "month",
    activeRows: [
      row({ subject_id: MATH, interval: "year" }),
      row({ subject_id: SCIENCE, interval: "month" }),
    ],
  });

  it("is the live coverage minus the removals plus the additions", () => {
    expect(desiredFromAddRemove(live, [LOGIC], [SCIENCE])).toEqual([MATH, LOGIC]);
  });

  it("round-trips into a basket that preserves every kept subject's cycle", () => {
    const items = derivePlanItems(desiredFromAddRemove(live, [LOGIC], []), live);
    expect(items).toEqual([
      { subjectId: MATH, interval: "year" },
      { subjectId: SCIENCE, interval: "month" },
      { subjectId: LOGIC, interval: "month" },
    ]);
    expect(validatePlanItems(items)).toEqual([
      { subject_id: MATH, interval: "year" },
      { subject_id: SCIENCE, interval: "month" },
      { subject_id: LOGIC, interval: "month" },
    ]);
  });

  it("can empty the plan, which the caller must refuse (min one subject)", () => {
    expect(desiredFromAddRemove(live, [], [MATH, SCIENCE])).toEqual([]);
    expect(validatePlanItems(derivePlanItems([], live))).toBeNull();
  });
});

describe("validatePlanItems", () => {
  it("rejects non-UUID ids, unknown cycles, empty and oversized baskets", () => {
    expect(validatePlanItems([{ subjectId: "not-a-uuid", interval: "month" }])).toBeNull();
    expect(validatePlanItems([{ subjectId: MATH, interval: "fortnight" }])).toBeNull();
    expect(validatePlanItems([])).toBeNull();
    expect(validatePlanItems(undefined)).toBeNull();
    const many = Array.from({ length: 21 }, (_, i) => ({
      subjectId: `1111111${String(i).padStart(2, "0")}-1111-4111-8111-111111111111`,
      interval: "month",
    }));
    expect(validatePlanItems(many)).toBeNull();
  });

  it("keeps the LAST cycle when one subject appears twice", () => {
    expect(
      validatePlanItems([
        { subjectId: MATH, interval: "month" },
        { subjectId: MATH, interval: "year" },
      ]),
    ).toEqual([{ subject_id: MATH, interval: "year" }]);
  });

  it("expands the legacy uniform (interval, ids) shape", () => {
    expect(validatePlanItems(uniformPlanItems("week", [MATH, ENGLISH]))).toEqual([
      { subject_id: MATH, interval: "week" },
      { subject_id: ENGLISH, interval: "week" },
    ]);
  });
});

// -----------------------------------------------------------------------------
// The retired path must stay unreachable — in the app AND in the schema.
// -----------------------------------------------------------------------------
// Resolved from the vitest root (web-app), NOT with `new URL(…, import.meta.url)`:
// Vite rewrites that pattern into an asset import and refuses to serve a file
// outside the project. Mirrors admin-panel's guarded-deletion-sql spec.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const CORE = read("web-app/src/lib/auth/subscriptionCore.ts");
const QUOTE_ROUTE = read(
  "web-app/src/app/api/mobile/v1/children/[id]/subjects/quote/route.ts",
);
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");
const MIGRATION_118 = read(
  "supabase/sql/migrations/2026_08_17_118_retire_subject_change_proration.sql",
);

describe("proration is retired everywhere, not just on the happy path", () => {
  it("no code path calls the dropped RPCs", () => {
    for (const name of ["quote_subject_change", "apply_subject_change"]) {
      expect(CORE).not.toContain(`rpc("${name}"`);
      expect(CORE).not.toContain(`rpc('${name}'`);
    }
    // Both surviving calls are the plan pair. Migration 127 went further than
    // 126: the posture no longer selects the RPC at all, because there is only
    // one to select. The core names the FREE-ONLY apply unconditionally, and the
    // priced apply_plan_change has no caller in this codebase — it is reached
    // exclusively from inside checkout_redeem_plan, behind a verified payment.
    expect(CORE).toContain('rpc("quote_plan_change"');
    expect(CORE).toContain('"apply_plan_change_if_free"');
    expect(CORE).toContain('"create_child_plan_if_free"');
    // ...and the priced names appear nowhere as an RPC target.
    for (const priced of ["apply_plan_change", "create_child_plan"]) {
      expect(CORE).not.toContain(`rpc("${priced}"`);
      expect(CORE).not.toContain(`rpc(
    "${priced}",`);
    }
  });

  it("a subject-ids-only caller is derived server-side rather than routed elsewhere", () => {
    // The bug this guards: `const rpc = usingItems ? planPair : legacyPair`.
    // Selecting an RPC by whether the CLIENT sent cycles is how the retired
    // model stayed reachable from the mobile BFF.
    expect(CORE).toContain("derivePlanItems");
    expect(CORE).toContain("desiredFromAddRemove");
    expect(CORE).not.toMatch(/\?\s*await admin\.rpc/);
  });

  it("the BFF quote response no longer carries a proration field", () => {
    for (const field of [
      "prorated",
      "proration_waived",
      "added_base",
      "remaining_ratio",
      "days_remaining",
      "period_days",
    ]) {
      expect(QUOTE_ROUTE).not.toContain(`${field}: q.`);
    }
    expect(QUOTE_ROUTE).toContain("due_now: q.dueNow");
  });

  it("the canonical schema no longer defines or grants the wrappers", () => {
    for (const name of ["quote_subject_change", "apply_subject_change"]) {
      expect(SQL_011).not.toContain(`create or replace function public.${name}(`);
      expect(SQL_011).not.toContain(`on function public.${name}`);
    }
    // The pair that replaced them is still defined and still service-role only.
    expect(SQL_011).toContain("create or replace function public.quote_plan_change(");
    expect(SQL_011).toContain("create or replace function public.apply_plan_change(");
    expect(SQL_011).toContain(
      "grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;",
    );
  });

  it("migration 118 drops both without CASCADE and verifies the drop", () => {
    expect(MIGRATION_118).toContain(
      "drop function if exists public.quote_subject_change(uuid, uuid[], uuid[]);",
    );
    expect(MIGRATION_118).toContain(
      "drop function if exists public.apply_subject_change(uuid, uuid[], uuid[], text);",
    );
    // A CASCADE would let the drop take an unknown dependant with it silently.
    expect(MIGRATION_118).not.toMatch(/drop function[^;]*cascade/i);
    // Self-transacting, exactly once — a half-applied drop is worse than none.
    expect(MIGRATION_118.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toEqual([
      "begin;",
      "commit;",
    ]);
    expect(MIGRATION_118).toContain("118: quote_subject_change still exists");
    expect(MIGRATION_118).toContain("118: apply_subject_change still exists");
  });

  it("013 asserts the absence and never reads a dropped function's body", () => {
    expect(SQL_013).toContain("'105_subject_change_proration_retired' as check_name");
    expect(SQL_013).not.toMatch(/pg_get_functiondef\('public\.(quote|apply)_subject_change/);
    // The kill-switch probe moved to the function that now guards adds.
    expect(SQL_013).toContain("position('v_adds > 0 or v_changes > 0' in");
  });
});
