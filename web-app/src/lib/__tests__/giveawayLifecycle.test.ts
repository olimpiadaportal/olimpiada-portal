// The giveaway campaign: one clock, three warnings, and an ending that returns
// the platform to normal by itself.
//
// THE MODEL, and why it is not the obvious one. A campaign is BLANKET FREE
// ACCESS — `has_subject_access()` returns true for any subject while one runs
// and writes nothing. It deliberately does NOT create zero-amount subscription
// records: duplicating paid rows to represent free access would mean an existing
// paid subscriber's period, renewal date and metadata could be rewritten by a
// campaign they did not ask for.
//
// What these tests protect are the parts that were missing or wrong:
//
//   * THE CAMPAIGN COULD NOT END CLEANLY. Switching `giveaway_period` on
//     force-disables `payments`; the window then expires LAZILY, so the resolved
//     mode became `off` rather than `real`. At that instant the whole cohort lost
//     access AND nobody could buy their way back — an outage driven by the clock,
//     needing no mistake from anyone, lasting until an admin happened to look.
//   * ONE WARNING, NOT THREE. The idempotency key carried no rung, so the daily
//     job produced exactly one notice per campaign and every later day was
//     silently discarded — the same defect migration 130 fixed for lapses.
//   * TWO CLOCKS. `is_giveaway_active()` parsed the duration more loosely than
//     `current_payment_mode()`, so the two could disagree about one campaign.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(process.cwd(), "..");
const SQL = join(REPO, "supabase", "sql");
const SRC = resolve(process.cwd(), "src");

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}
function sqlCode(text: string): string {
  return text.replace(/^[ \t]*--[^\n]*$/gm, " ");
}
/** Bounded on the following revoke — bodies here end both `$$;` and `end; $$;`. */
function sqlFunction(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined`).toBeGreaterThan(-1);
  const end = text.indexOf(`revoke all on function public.${name}(`, start);
  expect(end, `${name} has no revoke after it`).toBeGreaterThan(start);
  return text.slice(start, end);
}

const M133 = read(join(SQL, "migrations", "2026_08_22_133_connect_feature_flags.sql"));
const M134 = read(join(SQL, "migrations", "2026_08_22_134_giveaway_lifecycle.sql"));
const C011 = read(join(SQL, "011_indexes_constraints_functions_triggers.sql"));
const C016 = read(join(SQL, "016_scheduled_jobs.sql"));

describe("the campaign ends by itself", () => {
  it("records what it paused when it starts", () => {
    // Without this the restore cannot know whether payments were on BEFORE the
    // campaign, and would have to guess — turning payments on for an owner who
    // deliberately had them off.
    expect(sqlCode(C011)).toContain("payments.paused_by_giveaway");
  });

  it("restores payments only once the window is genuinely over", () => {
    const fn = sqlCode(sqlFunction(C011, "restore_payments_after_giveaway"));
    expect(fn).toContain("public.is_giveaway_active()");
    expect(fn).toContain("return false");
  });

  it("is scheduled, so no administrator has to notice", () => {
    expect(C016).toContain("olympiq_restore_payments_after_giveaway");
    expect(M134).toContain("olympiq_restore_payments_after_giveaway");
  });

  it("upserts the start stamp, so a campaign cannot begin inert", () => {
    // A bare UPDATE against a missing settings row matched nothing: the flag
    // switched on and the campaign silently never started, because
    // is_giveaway_active() has no start to measure from.
    //
    // Read by TEXT, not via sqlFunction: this is a TRIGGER function, so no
    // `revoke ... from` line follows it to bound on.
    const start = M133.indexOf("create or replace function public.fn_payment_mode_exclusivity()");
    expect(start).toBeGreaterThan(-1);
    const fn = sqlCode(M133.slice(start, M133.indexOf("\n$$;", start)));
    expect(fn).toContain("insert into public.system_settings");
    expect(fn).toContain("giveaway.started_at");
    expect(fn).toContain("on conflict (key) do update");
  });
});

describe("one clock", () => {
  it("is_giveaway_active delegates to current_payment_mode", () => {
    const fn = sqlCode(sqlFunction(C011, "is_giveaway_active"));
    expect(fn).toContain("current_payment_mode() = 'giveaway'");
  });

  it("and current_payment_mode does not call back, so it cannot recurse", () => {
    expect(sqlCode(sqlFunction(C011, "current_payment_mode"))).not.toContain(
      "is_giveaway_active",
    );
  });
});

describe("three warnings, each landing once", () => {
  const fn = sqlCode(sqlFunction(C011, "notify_giveaway_ending"));

  it("fires at three, two and one calendar days", () => {
    expect(fn).toContain("in (3, 2, 1)");
    expect(fn).toContain("v_end::date - now()::date");
  });

  it("puts the rung in the idempotency key", () => {
    // The single assertion that separates three warnings from one.
    expect(fn).toContain("':d' || v_days");
  });

  it("keeps the window end in the key, so a later campaign starts fresh", () => {
    expect(fn).toContain("v_end::text");
  });

  it("escalates, and overrides a mute only on the last rung", () => {
    expect(fn).toContain("v_prio  := 3;");
    expect(fn).toContain("v_prio  := 2;");
    expect(fn).toContain("v_prio  := 1;");
    expect((fn.match(/v_prio\s+:= 1;/g) ?? []).length).toBe(1);
  });

  it("counts what was sent, not what was considered", () => {
    expect(fn).toContain("if v_sent is not null then");
  });

  it("names no price and no purchase destination", () => {
    // These render in the purchase-silent mobile binaries. The spec's suggested
    // wording said "review the available subscription plans"; that is a purchase
    // CTA under Apple 3.1.1(a), so the copy states the consequence instead.
    const lower = fn.toLowerCase();
    for (const banned of ["azn", "₼", "olympiq.ai", "http", "abunə ol"]) {
      expect(lower.includes(banned), `giveaway copy contains "${banned}"`).toBe(false);
    }
  });

  it("carries its body VERBATIM into 011", () => {
    expect(C011).toContain(sqlFunction(M134, "notify_giveaway_ending").trimEnd());
  });
});

describe("plan selection during a campaign", () => {
  const MANAGE = read(join(SRC, "components", "ManageSubjects.tsx"));
  const PAGE = read(
    join(SRC, "app", "(parent)", "children", "[id]", "subscribe", "page.tsx"),
  );

  it("disables adds, upgrades and cycle changes", () => {
    expect(MANAGE).toContain('paymentMode === "off" || paymentMode === "giveaway"');
  });

  it("explains WHY, rather than reusing the payments-off sentence", () => {
    expect(MANAGE).toContain("gate.giveawaySubsPaused");
  });

  it("still shows the editor, so an existing subscriber can leave a plan", () => {
    // Hiding it took removal and cancellation away from families who were
    // already paying when the campaign started. Their subscription must stay
    // intact AND manageable.
    // Bound the branch on the NEXT arm of the ternary rather than a character
    // count — a comment added inside it should not move the assertion.
    const from = PAGE.indexOf('mode === "giveaway" || freeIntervalActive');
    expect(from).toBeGreaterThan(-1);
    const to = PAGE.indexOf(") : sub?.id ?", from);
    expect(to).toBeGreaterThan(from);
    expect(PAGE.slice(from, to)).toContain("<ManageSubjects");
  });

  it("is enforced on the server too, not just by a disabled button", () => {
    const core = read(join(SRC, "lib", "auth", "subscriptionCore.ts"));
    expect(core).toContain("gate.giveawayFree");
  });
});
