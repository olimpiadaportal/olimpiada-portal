// The demo payment mode was DELETED on 2026-08-18 (owner decision), so the
// admin panel must not be able to select a mode that no longer exists.
//
// Asserted against the SOURCE, like guarded-deletion-sql.test.ts and for the
// same reason: what was removed is a NAME — a feature-flag key in a tuple, a
// FLAG_META entry, six i18n strings — and none of it can be exercised at
// runtime any more. The only way it returns is by being re-typed, and the only
// place that is visible is the source. Both copies of the SQL are read: the
// migration, and the canonical file a from-zero rebuild actually runs.
//
// Note what is deliberately NOT removed: mode `off`. It is the kill switch and
// the fail-closed fallback, not a payment method — with both flags off the
// platform blocks paid writes, which is exactly what an admin needs to be able
// to do.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAG_META } from "@/lib/admin/settings-meta";
import { providerKind } from "@/lib/admin/subscription-lifecycle";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const REPO = resolve(process.cwd(), "..");
const SRC = resolve(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8").split("\r\n").join("\n");
}
/** Source with /* … *​/ and // … comments blanked out — see the web-app twin. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(abs, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

describe("the demo payment mode stays deleted (admin panel)", () => {
  it("offers exactly two payment-mode flags in the Features tab", () => {
    const page = code(read("admin-panel/src/app/(protected)/settings/page.tsx"));
    expect(page).toContain(
      'const PAYMENT_MODE_FLAGS = ["payments", "giveaway_period"] as const;',
    );
    expect(page).not.toContain("demo_payments");
  });

  it("has no flag registry entry, so no toggle can render for it", () => {
    expect(Object.keys(FLAG_META)).not.toContain("demo_payments");
    // The two that remain are the modes; everything else in FLAG_META is a
    // normal feature switch.
    expect(Object.keys(FLAG_META)).toEqual(
      expect.arrayContaining(["payments", "giveaway_period"]),
    );
  });

  it("never writes demo_payments from any admin code path", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith("demo-payments-removed.test.ts")) continue; // this file
      const text = code(readFileSync(file, "utf8").split("\r\n").join("\n"));
      if (text.includes("demo_payments")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("says nothing about a demo payment mode in az, en or ru", () => {
    const offenders: string[] = [];
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const [key, value] of Object.entries(dict)) {
        // `demote`/`demoted` are the olympiad package status wording and have
        // nothing to do with payments.
        if (/demo(?!t)|демо/i.test(`${key} ${value}`)) {
          offenders.push(`${locale}:${key} = ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // messages.ts is NOT the only catalog: several modules ship their own local
  // STRINGS dictionary (subscriptions/labels.ts, lib/admin/olympiad-strings.ts).
  // The first sweep of this removal updated az + en in labels.ts and left the
  // RUSSIAN sentences still saying "демо" — invisible to the test above because
  // it only reads messages.ts. So sweep every STRING LITERAL in the panel.
  it("says nothing about a demo payment in any local string catalog either", () => {
    const literal = new RegExp('"((?:[^"\\\\]|\\\\.)*)"', "g");
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith("demo-payments-removed.test.ts")) continue; // this file
      if (!/\.tsx?$/.test(file)) continue;
      const text = code(readFileSync(file, "utf8").split("\r\n").join("\n"));
      for (const m of text.matchAll(literal)) {
        if (/demo(?!t)|демо/i.test(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("labels a provider-less subscription honestly instead of 'Demo'", () => {
    // The fact is unchanged (nothing charged it); only the name was wrong once
    // the mode it referred to stopped existing.
    expect(providerKind(null)).toBe("none");
    expect(providerKind("none")).toBe("none");
    expect(providerKind("admin_grant")).toBe("comped");
    expect(providerKind("abb")).toBe("other");
    const labels = read("admin-panel/src/app/(protected)/subscriptions/labels.ts");
    expect(labels).not.toContain("subs.source.demo");
    // One label per locale, all three present (a missing one renders the key).
    expect(labels.split('"subs.source.none":').length - 1).toBe(3);
  });

  it("keeps the DB guard that refuses to let the flag come back", () => {
    const migration = read(
      "supabase/sql/migrations/2026_08_18_121_remove_demo_payments.sql",
    );
    const canonical = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
    const seed = read("supabase/sql/012_seed_initial_data.sql");
    const validation = read("supabase/sql/013_validation_queries.sql");

    expect(migration).toContain(
      "delete from public.feature_flags where key = 'demo_payments';",
    );
    for (const sql of [migration, canonical]) {
      expect(sql).toContain("if new.key = 'demo_payments' then");
      expect(sql).toContain("hint = 'demo_payments_removed'");
      expect(sql).toContain("where key in ('payments', 'giveaway_period')");
      expect(sql).toContain("when (new.key = 'demo_payments'");
    }
    expect(canonical).not.toContain("'payments', 'demo_payments', 'giveaway_period'");
    expect(canonical).not.toContain("'payments','demo_payments','giveaway_period'");
    expect(seed).not.toContain("('demo_payments'");
    expect(validation).toContain("108_demo_payment_mode_removed");
    // 013's mode whitelist must be the surviving three, `off` included.
    expect(validation).toContain("in ('real','giveaway','off')");
  });
});
