// The manual-renewal reminder chain (migration 130) — the three-rung warning a
// parent gets before a subscription lapses.
//
// WHY THESE TESTS EXIST. The bank will not enable card-on-file at launch
// (AZCDF-100303), so nothing can charge a parent automatically and EVERY RENEWAL
// IS AN ACT SOMEBODY PERFORMS BY HAND. That makes this notification the only
// thing standing between a family and the silent loss of access they are still
// paying for — and it is emitted from SQL on a cron schedule, where a mistake is
// invisible until a real subscription lapses in silence.
//
// Two properties are pinned here, and they fail in opposite directions:
//
//   1. THE CHAIN ACTUALLY FIRES THREE TIMES. `create_notification` dedupes on
//      `idempotency_key` with `on conflict do nothing`. The key before migration
//      130 was `subexp:<subscription>:<period_end>` — fixed for the whole
//      period — so the daily job produced ONE notification ever and days 2 and 1
//      were silently discarded. The bug left no trace: no error, no log, just a
//      parent who was warned once.
//
//   2. THE COPY IS LEGAL IN A STORE BINARY. These rows render inside the mobile
//      apps, which are purchase-silent BY ARCHITECTURE
//      (docs/STORE_PAYMENTS_COMPLIANCE.md §4/§5). A price, a purchase verb, a
//      named destination or an external URL in a notification body is the thing
//      an App Store reviewer screenshots. Same banned-substring approach as
//      purchaseSilent.test.ts's `gate.notInApp` test.
//
// The copy lives in SQL, so these read the migration and the canonical backport
// as text. Comments are stripped first — the file EXPLAINS the rule by naming
// the tokens it forbids, and matching those would fail the file on its own
// rationale. Same lesson the in-database check learned when it rejected itself.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(process.cwd(), "..");
const SQL = join(REPO, "supabase", "sql");
const MIGRATION_130 = join(SQL, "migrations", "2026_08_22_130_manual_renewal_reminders.sql");
// Migration 134 RE-ISSUED notify_expiring_subscriptions (it goes silent during a
// giveaway campaign), so the canonical file now carries 134's body, not 130's.
// A backport check pinned to a superseded migration fails on every correct
// future change and passes on none — the same trap that caught 013 checks 91,
// 95, 110 and 114. Behaviour is still asserted against the LIVE body below;
// only the parity comparison follows the migration that wrote it last.
const MIGRATION_134 = join(SQL, "migrations", "2026_08_22_134_giveaway_lifecycle.sql");
// 138 re-issued this producer to request the email channel. Each name follows the
// migration that wrote it LAST -- a parity check pinned to a superseded migration
// fails on every correct future change and passes on none.
const MIGRATION_138 = join(
  SQL, "migrations", "2026_08_25_138_notification_email_delivery.sql",
);
const CANONICAL_011 = join(SQL, "011_indexes_constraints_functions_triggers.sql");

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** SQL with `--` comments blanked out. The em-dashes in the copy are U+2014. */
function sqlCode(text: string): string {
  return text.replace(/--[^\n]*/g, " ");
}

/** The body of one `create or replace function public.<name>(` block. */
function sqlFunction(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined`).toBeGreaterThan(-1);
  // Bound on the revoke that follows it, NOT on a dollar-quote terminator:
  // bodies in this file end `end; $$;` on one line, so searching for "\n$$;"
  // walks into the NEXT function. That mistake silently ate two unrelated
  // functions out of the canonical file once.
  const end = text.indexOf(`revoke all on function public.${name}(`, start);
  expect(end, `${name} has no revoke after it`).toBeGreaterThan(start);
  return text.slice(start, end);
}

const migration = read(MIGRATION_130);
const canonical = read(CANONICAL_011);
const fn = sqlFunction(migration, "notify_expiring_subscriptions");
const fnCode = sqlCode(fn);

describe("the renewal chain fires three times, not once", () => {
  it("warns at three, two and one calendar days", () => {
    expect(fnCode).toContain("in (3, 2, 1)");
  });

  it("puts the day bucket in the idempotency key", () => {
    // WITHOUT THIS the second and third warnings collide with the first on
    // `on conflict (idempotency_key) do nothing` and are thrown away in silence.
    // This single assertion is the difference between three warnings and one.
    expect(fnCode).toContain("':d' || v_row.days_left");
    expect(fnCode).toContain("v_row.end_date::text");
  });

  it("counts rungs in whole calendar days, not 24-hour multiples", () => {
    // ceil(epoch/86400) makes the rung depend on what time the cron fires, so a
    // period ending mid-morning against an 04:00 job can skip a rung entirely.
    expect(fnCode).toContain("now()::date");
    expect(fnCode).not.toContain("86400");
  });

  it("reports what was SENT, not what was considered", () => {
    // create_notification returns NULL on a deduped write. The old code
    // `perform`ed it and incremented regardless, so a run that sent nothing
    // still reported one per candidate. Nothing reads the number today — which
    // is precisely how a lying counter survives until someone debugging a
    // missing reminder believes it.
    expect(fnCode).toContain("if v_sent is not null then");
    expect(fnCode).not.toMatch(/perform public\.create_notification/);
  });

  it("stays quiet about a subject the parent already chose to drop", () => {
    expect(fnCode).toContain("ss.remove_at is null");
  });

  it("escalates priority and overrides a mute only on the final warning", () => {
    // Priority 1 is the level create_notification refuses to let a recipient
    // silence. Using it is a strong move, so it happens exactly once — on the
    // last warning a parent will ever get, because nothing charges a card.
    expect(fnCode).toContain("v_prio  := 3;");
    expect(fnCode).toContain("v_prio  := 2;");
    expect(fnCode).toContain("v_prio  := 1;");
    expect((fnCode.match(/v_prio\s+:= 1;/g) ?? []).length, "priority 1 used more than once").toBe(1);
  });
});

describe("the copy is legal inside a purchase-silent app", () => {
  it("names no price, no purchase verb, no destination and no URL", () => {
    // docs/STORE_PAYMENTS_COMPLIANCE.md §5. "Manage it on your web account" is
    // specifically the WRONG form (audit finding I6): a plan plus a named
    // destination reads as a call to action without a link. These bodies state
    // WHAT ends and WHEN, and nothing else.
    const lower = fnCode.toLowerCase();
    for (const banned of [
      "azn",
      "olympiq.ai",
      "http",
      "abunə ol",
      "ödəniş edin",
      "satın",
      "veb",
      "hesabınızdan",
      "sayt",
      "manat",
      "₼",
    ]) {
      expect(lower.includes(banned), `notification copy contains "${banned}"`).toBe(false);
    }
  });

  it("routes to a RELATIVE path, never an absolute URL", () => {
    // §5 forbids opening an external https URL from notification content; the
    // mobile client allowlists relative routes only.
    expect(fnCode).toContain("'/subscription'");
    expect(fnCode).not.toMatch(/'https?:\/\//);
  });

  it("tells the parent nothing renews itself, on every rung", () => {
    // The one fact the whole chain exists to convey. If a future edit softens
    // this, a parent reads three reminders and still assumes a card is on file.
    const occurrences = (fnCode.match(/avtomatik yenilənmir/g) ?? []).length;
    expect(occurrences, "the no-auto-renewal fact is missing from a rung").toBeGreaterThanOrEqual(2);
    expect(fnCode).toContain("giriş dayanacaq");
  });
});

describe("the reminder chain and its backport", () => {
  const migration138 = read(MIGRATION_138);

  it("carries migration 138's body VERBATIM into 011", () => {
    // 138 is the migration that wrote this function LAST. Comparing against 130
    // or 134 would fail however correct the backport is.
    expect(canonical).toContain(sqlFunction(migration138, "notify_expiring_subscriptions").trimEnd());
  });

  it("asks for the email channel, because in-app alone reaches nobody", () => {
    // Renewals are MANUAL, so this chain IS the retention mechanism -- and the
    // parent is the payer while the child is the daily user.
    expect(sqlCode(sqlFunction(canonical, "notify_expiring_subscriptions"))).toContain(
      "array['in_app', 'email']",
    );
  });

  it("goes silent while the platform is free", () => {
    // A campaign makes access free platform-wide, so "access stops on <date>,
    // and nothing renews it" is false in both halves — and every payment rail
    // refuses a plan change anyway, so the parent is told to act and then
    // prevented from acting. The campaign has its own three-rung chain.
    expect(sqlCode(sqlFunction(canonical, "notify_expiring_subscriptions"))).toContain(
      "is_giveaway_active()",
    );
  });

  it("restates the revoke, because create-or-replace preserves ACLs", () => {
    for (const [label, sql] of [
      ["migration 138", migration138],
      ["canonical 011", canonical],
    ] as const) {
      expect(sql, label).toContain(
        "revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;",
      );
    }
  });

  it("self-transacts, and the canonical file does not", () => {
    expect(migration.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toEqual(["begin;", "commit;"]);
    expect(canonical.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toBeNull();
  });

  it("did not eat a neighbouring function on backport", () => {
    // It did, once: the old body ends `end; $$;` on ONE line, so a splice bound
    // on "\n$$;" ran past it and removed notify_giveaway_ending and
    // admin_manage_child_subscription from the canonical file. A from-zero
    // rebuild would have been missing both, and nothing else would have noticed.
    for (const name of [
      "notify_giveaway_ending",
      "admin_manage_child_subscription",
      "notify_expiring_subscriptions",
    ]) {
      expect(canonical, name).toContain(`create or replace function public.${name}`);
    }
  });
});
