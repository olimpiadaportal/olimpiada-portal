// The demo payment mode was DELETED on 2026-08-18 (owner decision). This suite
// exists to keep it deleted.
//
// Why a source-reading test and not a behavioural one: what was removed is a
// mode NAME threaded through a resolver, a component, a stylesheet and three
// locales. Nothing about it can be exercised at runtime any more — the only way
// it comes back is by being re-typed, and the only place that is visible is the
// source. Same reasoning as admin-panel's guarded-deletion-sql suite.
//
// COMMENTS ARE STRIPPED before every code sweep, deliberately. The files that
// deleted this feature explain what they deleted and why, naming the old flag
// and the old component; a sweep that could not tell a mention from a use would
// force those explanations out, and the explanation is the part that stops the
// next reader from "restoring" the mode. The stripping is naive (it does not
// parse strings), which is fine for needles that are i18n keys and class names.
//
// It also pins the two things a well-meaning cleanup would get wrong:
//   * 'off' must SURVIVE. It is not a payment method, it is the kill switch and
//     the fail-closed fallback getPaymentModeInfo returns on any infra failure,
//     so the UI and the DB guard (assert_payments_enabled) always agree.
//   * the DB must still REJECT a demo_payments row rather than ignore it — a
//     silently-recreated flag would render as a selectable payment mode in the
//     admin panel while changing nothing.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** Source with /* … *​/ and // … comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every .ts/.tsx/.css file under web-app/src, absolute paths. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(abs, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Which files still USE any of these tokens (comments excluded). */
function usages(needles: string[]): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith("demoPaymentsRemoved.test.ts")) continue; // this file
    const text = code(read(file));
    for (const needle of needles) {
      if (text.includes(needle)) hits.push(`${relative(REPO, file)} :: ${needle}`);
    }
  }
  return hits;
}

describe("the demo payment mode stays deleted (web app)", () => {
  it("resolves exactly real | giveaway | off", () => {
    const src = code(read(join(SRC, "lib", "paymentMode.ts")));
    expect(src).toContain('export type PaymentMode = "real" | "giveaway" | "off";');
    // The flag list it queries, and the resolution itself.
    expect(src).not.toContain("demo_payments");
    expect(src).not.toMatch(/"demo"/);
    // 'off' is the fail-closed fallback and must not be "cleaned up" away.
    expect(src).toContain('mode: "off"');
  });

  it("has no component, style or key left from the demo pay sheet", () => {
    const files = sourceFiles(SRC);
    expect(files.some((f) => f.endsWith("DemoPaymentModal.tsx"))).toBe(false);
    // InvoicesSection rendered two fabricated PAID invoices and inert buttons.
    expect(files.some((f) => f.endsWith("InvoicesSection.tsx"))).toBe(false);

    expect(
      usages([
        "demo_payments",
        "DemoPaymentModal",
        "pay-demo-badge",
        "demoModeNote",
        "demoBadge",
        "demoNote",
      ]),
    ).toEqual([]);
  });

  it("collects no card data anywhere (the sheet was cosmetic, never a processor)", () => {
    expect(usages(["pay.cardNumber", "pay.cardName", "pay.cvc", "pay.expiry", "4242 4242"])).toEqual(
      [],
    );
  });

  it("says nothing about a demo payment in az, en or ru", () => {
    // The known failure mode is a translation surviving in ONE locale, so every
    // locale is swept, keys and values alike.
    const offenders: string[] = [];
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const [key, value] of Object.entries(dict)) {
        if (/demo|демо|nümunə ödəniş/i.test(`${key} ${value}`)) {
          offenders.push(`${locale}:${key} = ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the DB guard that refuses to let the flag come back", () => {
    const migration = read(
      join(REPO, "supabase", "sql", "migrations", "2026_08_18_121_remove_demo_payments.sql"),
    );
    const canonical = read(
      join(REPO, "supabase", "sql", "011_indexes_constraints_functions_triggers.sql"),
    );
    const seed = read(join(REPO, "supabase", "sql", "012_seed_initial_data.sql"));
    const validation = read(join(REPO, "supabase", "sql", "013_validation_queries.sql"));

    // The row goes, the guard arrives — in the migration AND in the canonical
    // file a from-zero rebuild actually runs.
    expect(migration).toContain(
      "delete from public.feature_flags where key = 'demo_payments';",
    );
    for (const sql of [migration, canonical]) {
      expect(sql).toContain("if new.key = 'demo_payments' then");
      expect(sql).toContain("hint = 'demo_payments_removed'");
      // Exclusivity is over the PAIR now.
      expect(sql).toContain("where key in ('payments', 'giveaway_period')");
      // The WHEN clause must catch a DISABLED demo row too, or the dead switch
      // simply reappears in /settings.
      expect(sql).toContain("when (new.key = 'demo_payments'");
    }
    // The canonical file is what a from-zero build installs: no trio anywhere.
    expect(canonical).not.toContain("'payments', 'demo_payments', 'giveaway_period'");
    expect(canonical).not.toContain("'payments','demo_payments','giveaway_period'");
    // The migration's job is exactly that rewrite, so it names both forms.
    expect(migration).toContain("'payments', 'demo_payments', 'giveaway_period'");
    // A from-zero build must not seed the row (the guard would abort it).
    expect(seed).not.toContain("('demo_payments'");
    // And 013 keeps checking all of the above on every validation run.
    expect(validation).toContain("108_demo_payment_mode_removed");
  });
});
