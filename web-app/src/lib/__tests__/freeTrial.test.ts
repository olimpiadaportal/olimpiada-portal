// The 1-day pre-purchase Free Trial (migrations 139-142).
//
// THE CONFLICT THIS FEATURE OPENED. The spec asked for the "one attempt per
// subject per day" restriction not to apply during the trial. That rule is
// investor-approved (Round 42/43) and is a DB UNIQUE INDEX, not application
// logic, and its failure mode is unlimited RATED rounds — leaderboard fraud.
//
// It did not need weakening. The index predicate carries `and is_rated`, so an
// UNRATED attempt is outside it entirely, and the spec's other requirement —
// that trial play must not affect score, ranking or analytics — points at the
// same answer. What was actually missing was EXPRESSIVENESS: `is_rated` was
// computed as `(coalesce(p_day,'today') = 'today')`, one boolean that also
// selected the round DATE and the set-selection BRANCH, so "today, fresh draw,
// unrated" could not be said at all.
//
// These tests exist to stop that resolution being undone by someone who reads
// the spec sentence and not the reasoning.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { splitRemaining, TRIAL_MAX_SUBJECTS } from "@/lib/freeTrialShared";

const REPO = resolve(process.cwd(), "..");
const SQL = join(REPO, "supabase", "sql");

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}
function sqlCode(text: string): string {
  return text.replace(/^[ \t]*--[^\n]*$/gm, " ");
}
/**
 * Executable body only. `comment on function ... is '...'` is a STRING literal,
 * not a `--` comment, so sqlCode leaves it in place — and a body assertion then
 * matches the prose DESCRIBING the body ("never calls assert_payments_enabled"),
 * which is the opposite of what it means to test.
 */
function sqlBody(text: string, name: string): string {
  const fn = sqlFunction(text, name);
  const doc = fn.indexOf(`comment on function public.${name}(`);
  return sqlCode(doc > 0 ? fn.slice(0, doc) : fn);
}
function sqlFunction(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined`).toBeGreaterThan(-1);
  const revoke = text.indexOf(`revoke all on function public.${name}(`, start);
  const next = text.indexOf("\ncreate or replace function public.", start + 40);
  const ends = [revoke, next].filter((n) => n > start);
  expect(ends.length, `${name} has no terminator`).toBeGreaterThan(0);
  return text.slice(start, Math.min(...ends));
}

const M139 = read(join(SQL, "migrations", "2026_08_25_139_entitlement_source_trial.sql"));
const M140 = read(join(SQL, "migrations", "2026_08_25_140_free_trial.sql"));
const M141 = read(join(SQL, "migrations", "2026_08_25_141_free_trial_notifications.sql"));
const M142 = read(join(SQL, "migrations", "2026_08_25_142_retire_subscription_trial.sql"));
const C001 = read(join(SQL, "001_extensions_and_enums.sql"));
const C005 = read(join(SQL, "005_attempts_daily_tasks_progress.sql"));
const C011 = read(join(SQL, "011_indexes_constraints_functions_triggers.sql"));

describe("the rated rule is not weakened", () => {
  // THE MOST IMPORTANT TEST IN THIS FILE.
  it("keeps uq_rated_daily_live_per_day predicated on is_rated", () => {
    const idx = C005.slice(C005.indexOf("uq_rated_daily_live_per_day"));
    expect(idx).toContain("is_rated");
    expect(idx).toContain("kind = 'daily'");
  });

  it("never drops or re-predicates that index in any trial migration", () => {
    for (const [name, sql] of [
      ["139", M139],
      ["140", M140],
      ["141", M141],
      ["142", M142],
    ] as const) {
      expect(sql, `migration ${name} touches the rated index`).not.toContain(
        "drop index if exists uq_rated_daily_live_per_day",
      );
      expect(sql, `migration ${name} drops the rated index`).not.toContain(
        "drop index uq_rated_daily_live_per_day",
      );
    }
  });

  it("asserts the index is still armed at the end of 140", () => {
    // A feature that is only safe BECAUSE an index exists should refuse to
    // install if that index has gone.
    expect(M140).toContain("uq_rated_daily_live_per_day");
    expect(M140).toContain("no longer predicated on is_rated");
  });

  it("separates 'is today' from 'does it score'", () => {
    const fn = sqlCode(sqlFunction(C011, "start_daily_round_attempt"));
    // The old single boolean carried both meanings; both must now exist.
    expect(fn).toContain("v_today");
    expect(fn).toContain("v_trial");
    expect(fn).toContain("v_rated := not v_trial");
    // The date follows the DAY, not the rating.
    expect(fn).toContain("case when v_today then 0 else 1 end");
  });

  it("stamps the attempt as unrated and trial-flagged in the same insert", () => {
    const fn = sqlCode(sqlFunction(C011, "start_daily_round_attempt"));
    expect(fn).toContain("is_rated, round_date, is_free_trial");
    expect(fn).toContain("v_rated, v_date, v_trial");
  });
});

describe("is_free_trial is provenance, never a gate", () => {
  // Two booleans that both answer "does this count" disagree eventually, and one
  // missed filter would put trial scores on a leaderboard. is_rated stays the
  // single gate that scoring reads.
  it("is not consulted by the points writer", () => {
    const fn = sqlCode(sqlFunction(C011, "award_attempt_points"));
    expect(fn).not.toContain("is_free_trial");
  });

  it("IS consulted by analytics, which is the whole reason it exists", () => {
    expect(sqlCode(sqlFunction(C011, "get_child_subject_dashboard"))).toContain("is_free_trial");
    expect(sqlCode(sqlFunction(C011, "get_admin_platform_overview"))).toContain("is_free_trial");
  });

  it("filters analytics on is_free_trial rather than is_rated", () => {
    // is_rated would ALSO strip topic tests and previous-day replays out of
    // every paying family's analytics — a different feature nobody asked for.
    const fn = sqlCode(sqlFunction(C011, "get_child_subject_dashboard"));
    expect(fn).toContain("not ta.is_free_trial");
  });
});

describe("the access gate fails toward RATED", () => {
  const fn = sqlCode(sqlFunction(C011, "subject_access_is_trial_only"));

  it("returns false when anything other than a trial grants the subject", () => {
    expect(fn).toContain("source <> 'trial'");
  });

  it("returns false during a giveaway or an admin free-access window", () => {
    expect(fn).toContain("is_giveaway_active()");
    expect(fn).toContain("is_free_access_active_for_student");
  });

  it("is service_role only, like the gate it extends", () => {
    expect(C011).toContain(
      "revoke all on function public.subject_access_is_trial_only(uuid, uuid) from public, anon, authenticated;",
    );
  });
});

describe("one trial per child, at most two subjects", () => {
  it("enforces both in the database, not only in the UI", () => {
    expect(M140).toContain("uq_free_trials_student unique (student_profile_id)");
    expect(M140).toContain("cardinality(subject_ids) between 1 and 2");
  });

  it("checks ownership in the RPC, because entitlement_grant does not", () => {
    const fn = sqlBody(M140, "activate_free_trial");
    expect(fn).toContain("created_by_parent_profile_id = p_parent");
  });

  it("never calls assert_payments_enabled — the trial must work with payments off", () => {
    const fn = sqlBody(M140, "activate_free_trial");
    expect(fn).not.toContain("assert_payments_enabled");
  });

  it("creates no subscription row", () => {
    const fn = sqlBody(M140, "activate_free_trial");
    expect(fn).not.toContain("insert into public.child_subscriptions");
    expect(fn).not.toContain("create_child_plan");
  });

  it("leaves the grant untraceable to a subscription, so the reconciler ignores it", () => {
    const fn = sqlFunction(M140, "activate_free_trial");
    expect(fn).toContain("entitlement_grant");
    expect(fn).not.toContain("p_child_subscription_id");
  });

  it("agrees with the client constant", () => {
    expect(TRIAL_MAX_SUBJECTS).toBe(2);
  });
});

describe("'trial' is its own rail", () => {
  it("was added in a migration that does nothing else", () => {
    // A new enum label cannot be USED until its transaction commits, and "used"
    // includes a CHECK, an index predicate, a `do $$` block and any
    // `language sql` body. Migration 127 hit this exact wall.
    expect(M139).toContain("add value if not exists 'trial'");
    expect(M139).not.toContain("create table");
    expect(M139).not.toContain("create or replace function");
  });

  it("is in canonical 001", () => {
    expect(C001).toContain("'trial'");
  });

  it("records that the old justification was retired, not silently deleted", () => {
    // 001 justified the omission with "a trial is an abb_web grant with a short
    // period". A PRE-PURCHASE trial moves no money, so that is false — and the
    // comment now says so rather than quietly dropping the sentence, because the
    // next person to wonder why there are seven rails deserves the reason.
    expect(C001).toContain("MIGRATION 139 added 'trial'");
    expect(C001).toContain("reconciles against nothing");
  });
});

describe("the ending chain says nothing a store would object to", () => {
  const fn = sqlFunction(M141, "free_trial_notice");
  const lower = fn.toLowerCase();

  it("names no price, purchase verb, or destination in any language", () => {
    // These are DB literals and render VERBATIM inside the purchase-silent store
    // binaries. A purchase CTA delivered after review is Apple 3.1.1(a) dynamic
    // steering, and Azerbaijan gets no anti-steering relief.
    const banned = [
      "azn",
      "₼",
      "manat",
      "abunə ol",
      "subscribe",
      "подписатьс",
      "http",
      "olympiq.ai",
    ];
    const failures = banned.filter((b) => lower.includes(b));
    expect(failures, `banned tokens in the notice bodies: ${failures.join(", ")}`).toEqual([]);
  });

  it("carries all three languages", () => {
    expect(fn).toContain("Pulsuz");
    expect(fn).toContain("Free access");
    expect(fn).toContain("Бесплатный");
  });

  it("carries its own banned-token assertion, so the copy cannot drift", () => {
    expect(M141).toContain("banned token");
  });
});

describe("the rungs cannot announce time that has passed", () => {
  const fn = sqlCode(sqlFunction(M141, "notify_free_trial_ending"));

  it("clamps to waking hours in Asia/Baku", () => {
    expect(fn).toContain("Asia/Baku");
    expect(fn).toContain("v_hour < 8 or v_hour > 21");
  });

  it("drops a time-remaining rung once the trial has ended", () => {
    // Deferring "1 hour left" to 08:00 would announce time that no longer
    // exists for a trial that ended at 02:00.
    expect(fn).toContain("ends_at <= now()");
  });

  it("uses a monotone due-and-unsent predicate, never equality", () => {
    // At hour grain an hourly job samples a bucket 1:1, so one delayed run would
    // swallow a whole rung. `<=` plus */5 makes it late rather than never.
    expect(fn).toContain("<= interval '1 hour'");
    expect(fn).toContain("<= interval '12 hours'");
  });

  it("never uses priority 1", () => {
    // Priority 1 overrides both the recipient's mute and the platform-wide
    // notifications switch. Nobody paid for this.
    expect(fn).not.toContain("v_prio := 1");
  });

  it("notifies the parent, never the child", () => {
    expect(fn).toContain("owner_parent_profile_id");
    expect(fn).not.toContain("v_row.student_profile_id,\n        v_type");
  });

  it("asks for the email channel", () => {
    expect(fn).toContain("array['in_app', 'email']");
  });

  it("counts what was sent, not what was considered", () => {
    expect(fn).toContain("if v_sent is not null then v_n := v_n + 1; end if;");
  });

  it("wraps each family so one failure cannot silence the rest", () => {
    expect(fn).toContain("exception when others then");
  });
});

describe("only one trial can apply", () => {
  it("zeroes the subscription trial", () => {
    expect(M142).toContain("set trial_days = 0");
  });

  it("refuses to run before the replacement exists", () => {
    expect(M142).toContain("refusing to retire the only trial");
  });
});

describe("splitRemaining", () => {
  it("splits whole hours, minutes and seconds", () => {
    expect(splitRemaining(3_661_000)).toEqual({ h: 1, m: 1, s: 1, done: false });
  });

  it("reports done at or below zero rather than counting backwards", () => {
    expect(splitRemaining(0).done).toBe(true);
    expect(splitRemaining(-5_000)).toEqual({ h: 0, m: 0, s: 0, done: true });
  });

  it("survives a non-finite input", () => {
    expect(splitRemaining(Number.NaN).done).toBe(true);
  });

  it("does not round a partial second up", () => {
    // 59.9s must read 59, not 60 — a countdown that shows :60 looks broken.
    expect(splitRemaining(59_900).s).toBe(59);
  });
});

describe("the copy ships in all three languages", () => {
  const MSG = read(join(resolve(process.cwd(), "src"), "i18n", "messages.ts"));

  it("defines every trial key exactly three times", () => {
    const keys = new Set(
      [...MSG.matchAll(/"(trial\.[a-zA-Z.]+)":/g)].map((m) => m[1]),
    );
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) {
      const n = [...MSG.matchAll(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g"))].length;
      expect(n, `${k} appears ${n} times, expected 3 (az/en/ru)`).toBe(3);
    }
  });
});
