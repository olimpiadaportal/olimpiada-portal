// UN-CANCELLING A SCHEDULED SUBJECT REMOVAL (migration 120).
//
// WHY THESE TESTS EXIST. Removing a subject schedules it for THAT subject's own
// period end and refunds nothing — the child keeps access until then. Choosing
// it again before that date is therefore an UN-CANCEL, and the platform billed
// it as a brand-new add: a second full period charged today for coverage the
// parent already owned, and `current_period_start/end` reset to now(), which
// destroyed the remaining prepaid time. Both halves came from ONE hand-copied
// predicate — `not exists (... and ss.remove_at is null)` — appearing once in
// the preview (quote_plan_change) and once in the apply (apply_plan_change).
//
// So the tests below pin the INVARIANTS, not the formatting:
//   * a reinstatement is excluded from due_now;
//   * the period is NOT reset;
//   * the preview and the apply share ONE predicate (they read the same
//     classifier function, `plan_change_states`), because "preview == charged"
//     is an audited invariant (H7) and two copies of a billing rule mis-bill
//     silently the day they drift.
//
// The pure half (isReinstatement) is unit-tested directly; the SQL half is
// asserted by reading the canonical file, in the style of
// admin-panel/src/lib/admin/__tests__/guarded-deletion-sql.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isReinstatement, type LivePlanRow } from "@/lib/planBasket";

const MATH = "11111111-1111-4111-8111-111111111111";

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

function row(over: Partial<LivePlanRow> = {}): LivePlanRow {
  return {
    subject_id: MATH,
    interval: "year",
    pending_interval: null,
    remove_at: null,
    ...over,
  };
}

describe("isReinstatement — the un-cancel test, mirroring plan_change_states", () => {
  it("is false for a live subject: nothing was cancelled", () => {
    expect(isReinstatement(row({ current_period_end: FUTURE }))).toBe(false);
    expect(isReinstatement(undefined)).toBe(false);
  });

  it("is true while the scheduled removal has NOT lapsed", () => {
    // The parent is still inside the period they paid for, so putting the
    // subject back costs nothing — it is Stripe's cancel_at_period_end = false.
    expect(
      isReinstatement(row({ remove_at: FUTURE, current_period_end: FUTURE })),
    ).toBe(true);
  });

  it("is false once the period HAS lapsed — then it genuinely is a new add", () => {
    expect(isReinstatement(row({ remove_at: PAST, current_period_end: PAST }))).toBe(false);
  });

  it("falls back to the SUBSCRIPTION's period end, exactly like the SQL coalesce", () => {
    // subscription_subjects.current_period_end is legitimately NULL on rows
    // that predate migration 109; the DB reads
    // coalesce(ss.current_period_end, cs.current_period_end).
    expect(isReinstatement(row({ remove_at: FUTURE, current_period_end: null }), FUTURE)).toBe(
      true,
    );
    expect(isReinstatement(row({ remove_at: PAST, current_period_end: null }), PAST)).toBe(
      false,
    );
  });

  it("degrades to remove_at when no period is known, and never invents coverage", () => {
    // The mobile editor never loads the period columns. remove_at was itself
    // written as coalesce(ss.current_period_end, cs.current_period_end, now()),
    // so it is the same date — and when neither existed it is now(), i.e.
    // already lapsed, which is what the SQL concludes too.
    expect(isReinstatement({ remove_at: FUTURE })).toBe(true);
    expect(isReinstatement({ remove_at: PAST })).toBe(false);
    expect(isReinstatement({ remove_at: "not-a-date" })).toBe(false);
  });

  it("uses the caller's clock, so the boundary is testable rather than flaky", () => {
    const at = Date.parse("2026-06-01T00:00:00.000Z");
    const r = row({ remove_at: "2026-06-02T00:00:00.000Z", current_period_end: "2026-06-02T00:00:00.000Z" });
    expect(isReinstatement(r, null, at)).toBe(true);
    // One day later the same row is a lapsed subscription, not an un-cancel.
    expect(isReinstatement(r, null, at + 2 * 86_400_000)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// The SQL: one classifier, read by both RPCs, and nothing charged.
// -----------------------------------------------------------------------------
// Resolved from the vitest root (web-app), NOT with `new URL(…, import.meta.url)`:
// Vite rewrites that pattern into an asset import and refuses to serve a file
// outside the project. Mirrors planBasket.test.ts.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const SQL_007 = read("supabase/sql/007_subscriptions_payments_coupons.sql");
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");
const MIGRATION_120 = read(
  "supabase/sql/migrations/2026_08_17_120_reinstate_cancelled_subject.sql",
);
const CORE = read("web-app/src/lib/auth/subscriptionCore.ts");

/** The body of one `create or replace function public.<name>(` block in 011. */
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined`).toBeGreaterThan(-1);
  // Function bodies in this file are dollar-quoted with a bare $$; the block
  // ends at the first `$$;` after the opening `as $$`.
  const open = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", open + 5);
  expect(end, `${name} has no closing $$;`).toBeGreaterThan(open);
  return sql.slice(start, end);
}

describe("the reinstatement predicate lives in ONE place", () => {
  const states = fnBody(SQL_011, "plan_change_states");
  const quote = fnBody(SQL_011, "quote_plan_change");
  const apply = fnBody(SQL_011, "apply_plan_change");

  it("classifies covered / reinstate / add with the not-lapsed test", () => {
    expect(states).toContain(
      "coalesce(ss.current_period_end, cs.current_period_end) > now()",
    );
    expect(states).toContain("then 'reinstate'");
    expect(states).toContain("then 'covered'");
  });

  it("is read by BOTH the preview and the apply", () => {
    // The whole defect was two copies of the same question. If either function
    // stops calling the classifier, the preview and the charge can disagree.
    expect(quote).toContain("public.plan_change_states(v_sub.id, p_items)");
    expect(apply).toContain("public.plan_change_states(v_sub.id, p_items)");
  });

  it("leaves no hand-copied `remove_at is null` coverage predicate behind", () => {
    // This is the exact shape that treated a scheduled removal as absent. It
    // may still appear where it BELONGS (finding subjects to remove, or the
    // cycle-change loop), so it is banned only in the add/coverage tests: a
    // correlated `not exists` over subscription_subjects keyed on the basket.
    for (const body of [quote, apply]) {
      expect(body).not.toContain("and ss.subject_id = n.subject_id\n      and ss.remove_at is null)");
    }
  });
});

describe("a reinstatement is not billed", () => {
  const quote = fnBody(SQL_011, "quote_plan_change");
  const apply = fnBody(SQL_011, "apply_plan_change");

  it("due_now is built from TRUE adds only", () => {
    // Both the due_now CTE and the added_base sum filter on state = 'add', so a
    // subject whose removal is merely scheduled can never enter the amount.
    const dueNow = quote.slice(quote.indexOf("if v_sub.status <> 'trialing' then"));
    expect(dueNow).toContain("public.plan_change_states(v_sub.id, p_items) s");
    expect(dueNow).toContain("where s.state = 'add'");
    expect(quote).toContain("'reinstatements', coalesce(v_restores, '[]'::jsonb)");
  });

  it("the ledger row carries a zero amount and its own change_type", () => {
    const loop = apply.slice(apply.indexOf("where s.state = 'reinstate'"));
    expect(loop).toContain("'reinstate',");
    // ... prorated_amount = 0 in the values list (the 0 after effective_at).
    expect(loop).toContain("v_row.subject_id, v_row.iv, now(), 0, v_sub.currency");
    expect(SQL_007).toContain(
      "check (change_type in ('add', 'remove', 'plan_change', 'reinstate'))",
    );
  });

  it("the payment kill switch does not gate it", () => {
    // Adds and cycle changes are gated; a reinstatement moves no money and only
    // restores something already paid for, so trapping the parent inside their
    // own cancellation would be the failure mode the switch exists to avoid.
    expect(apply).toContain("if v_adds > 0 or v_changes > 0 then");
    expect(apply).not.toContain("v_restores > 0 then");
    // ...but it DOES satisfy the "at least one subject must remain" guard, or a
    // reinstate-only basket would raise last_subject and the undo would fail.
    expect(apply).toContain("if v_left < 1 and v_adds < 1 and v_restores < 1 then");
  });
});

describe("the prepaid period survives the un-cancel", () => {
  const apply = fnBody(SQL_011, "apply_plan_change");
  // Anchored on the STATEMENT each loop is made of, never on its
  // `where s.state = …` filter: those also appear in the counts query at the
  // top of the function, where 'add' legitimately precedes 'reinstate'.
  const reinstateAt = apply.indexOf("set remove_at = null");
  const addAt = apply.indexOf("insert into public.subscription_subjects");
  const cycleAt = apply.indexOf("set pending_interval =");

  it("clears remove_at and NOTHING else", () => {
    // From the loop's own filter (the one immediately preceding the update, not
    // the counts query's) through to the start of the add loop.
    const loop = apply.slice(
      apply.lastIndexOf("where s.state = 'reinstate'", reinstateAt),
      addAt,
    );
    expect(loop).toContain("set remove_at = null");
    // The four columns whose overwrite destroyed the remaining prepaid time and
    // silently re-priced the subject. None of them may appear in this loop.
    for (const column of [
      "current_period_start",
      "current_period_end   =",
      "price_amount         =",
      "interval             =",
    ]) {
      expect(loop).not.toContain(column);
    }
  });

  it("only a LAPSED row can reach the period-resetting add branch", () => {
    // `on conflict ... do update set ... current_period_start = excluded...` is
    // still correct — but only for a row whose coverage is genuinely over,
    // which is exactly what state = 'add' now means.
    const addLoop = apply.slice(addAt);
    expect(addLoop).toContain("current_period_start = excluded.current_period_start");
    expect(addLoop).toContain("now() + case v_row.iv");
  });

  it("reinstates BEFORE the add and cycle-change loops", () => {
    // ORDER IS LOAD-BEARING. The cycle-change loop filters on remove_at is
    // null, so un-cancelling afterwards would silently drop a cycle change made
    // in the same save; running before the add loop means a reinstated subject
    // re-classifies as 'covered' and can never also be bought.
    expect(reinstateAt).toBeGreaterThan(-1);
    expect(reinstateAt).toBeLessThan(addAt);
    expect(reinstateAt).toBeLessThan(cycleAt);
  });

  it("routes a different cycle through the SCHEDULED path, never an instant switch", () => {
    const quote = fnBody(SQL_011, "quote_plan_change");
    // The quote reports it as a plan_change (covered OR reinstate)...
    expect(quote).toContain("where s.state in ('covered', 'reinstate')");
    // ...and the apply writes pending_interval only.
    const cycleLoop = apply.slice(cycleAt);
    expect(cycleLoop).toContain("set pending_interval =");
    expect(cycleLoop).not.toContain("current_period_end   =");
  });
});

describe("migration 120 and its validation check", () => {
  it("is self-transacting exactly once", () => {
    expect(MIGRATION_120.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toEqual([
      "begin;",
      "commit;",
    ]);
  });

  it("carries the canonical function bodies verbatim (no drift on backport)", () => {
    // A backport that paraphrases is a second implementation with extra steps.
    for (const name of ["plan_change_states", "quote_plan_change", "apply_plan_change"]) {
      expect(SQL_011).toContain(fnBody(MIGRATION_120, name));
    }
  });

  it("restates every revoke/grant, because create-or-replace preserves ACLs", () => {
    for (const sql of [MIGRATION_120, SQL_011]) {
      for (const sig of [
        "public.plan_change_states(uuid, jsonb)",
        "public.quote_plan_change(uuid, jsonb)",
        "public.apply_plan_change(uuid, jsonb, text)",
      ]) {
        expect(sql).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
        expect(sql).toContain(`grant execute on function ${sig} to service_role;`);
      }
    }
  });

  it("verifies its own work and raises on failure", () => {
    for (const raised of [
      "120: the change_type CHECK does not accept reinstate",
      "120: plan_change_states lost the not-lapsed predicate",
      "120: quote_plan_change does not read plan_change_states",
      "120: apply_plan_change does not read plan_change_states",
      "120: quote_plan_change no longer reports prorated = false",
      "120: the reinstatement loop runs after the cycle-change loop",
      "120: a reinstate ledger row carries a non-zero amount",
    ]) {
      expect(MIGRATION_120).toContain(raised);
    }
  });

  it("013 gains a check that survives a dropped function", () => {
    expect(SQL_013).toContain("'107_reinstate_cancelled_subject' as check_name");
    // pg_get_functiondef raises on a missing function, so every body probe is
    // guarded — a regression must report FAIL, not abort the 013 run.
    expect(SQL_013).toContain("case when states is null then null else pg_get_functiondef(states) end");
    expect(SQL_013).toContain("bad_reinstate_rows");
  });

  it("does not disturb migration 118's no-proration posture", () => {
    expect(fnBody(SQL_011, "quote_plan_change")).toContain("'prorated',               false");
  });
});

describe("the app layer stops calling an un-cancel an addition", () => {
  it("reads the period columns it needs to classify one", () => {
    expect(CORE).toContain(
      'select("subject_id, interval, pending_interval, remove_at, current_period_end")',
    );
    expect(CORE).toContain('select("id, interval, current_period_end")');
  });

  it("counts and audits reinstatements apart from adds", () => {
    expect(CORE).toContain("isReinstatement");
    expect(CORE).toContain('op: "reinstate"');
    // The "nothing changed" short-circuit must not swallow a reinstate-only
    // save — that is how "undo the removal" silently did nothing before.
    expect(CORE).toContain("reinstated.length === 0 &&");
  });

  it("puts the reinstatement in the idempotency key", () => {
    // Un-cancelling used to arrive inside `toAdd`, which the key is built from.
    // Classifying it separately took it OUT of the key, so a reinstate-only
    // change hashed identically to a no-op with the same adds and removes:
    // reinstate, change the cycle, revert the cycle inside one 5-minute bucket,
    // and the third save replays the first key and is swallowed as a duplicate.
    expect(CORE).toContain("reinstateKey");
    const builder = CORE.slice(
      CORE.indexOf("function buildSubjectChangeIdempotencyKey"),
      CORE.indexOf("digest(\"hex\")"),
    );
    expect(
      builder.includes("${reinstateKey}"),
      "the reinstatement must be hashed into the key, not merely accepted",
    ).toBe(true);
    expect(CORE).toContain("[...reinstated].sort().join(\",\")");
  });

  it("does not let the app be stricter than the RPC about payment mode", () => {
    // apply_plan_change calls assert_payments_enabled() only when
    // `v_adds > 0 or v_changes > 0`. Removals pass on purpose — never trap a
    // parent inside a plan they are leaving because billing is paused — and 120
    // put reinstatements on the same footing. The app gate used to run before
    // the diff existed and blocked EVERY subject change, so the parent could
    // not undo a cancellation while payments were off.
    // Scoped to THIS function: paidMutationGateKey is also called by the
    // start-a-plan path above, where gating before any diff is correct.
    const fn = CORE.slice(CORE.indexOf("export async function updateSubscriptionSubjectsCore"));
    const gateAt = fn.indexOf("paidMutationGateKey(studentId");
    const diffAt = fn.indexOf("const toAdd =");
    expect(gateAt, "the gate must still exist").toBeGreaterThan(-1);
    expect(
      gateAt > diffAt,
      "the gate must be evaluated AFTER the diff, or it cannot know what it is gating",
    ).toBe(true);
    expect(CORE).toContain("if (toAdd.length > 0 || toChangePlan.length > 0) {");
  });
});
