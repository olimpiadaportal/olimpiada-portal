// THE SUBJECT SEED IS A PROMISE THAT NOTHING CHECKED. Pinned here.
//
// Migration 2026_09_10_171 makes the product read a subject's visible name from
// `subject_translations` FIRST, ahead of the apps' built-in `subj.<code>`
// dictionary. Flipping that precedence against an EMPTY table would not be a
// fix, it would be a mass rename of every subject in all three languages, so
// section D1 of the migration seeds the table with exactly the strings the
// dictionary resolves today and the whole day-one-safety argument rests on the
// word "exactly".
//
// Nothing enforced it. The seed is 21 SQL string literals and the dictionary is
// 21 TypeScript ones, in two files nobody edits together — and a divergence is
// SILENT on both sides: the migration applies, no check fails, and the first
// person to notice is a Russian-reading parent seeing "Riyaziyyat", or an
// English-reading one seeing a subject renamed to a word nobody chose. This
// spec makes either edit fail loudly, in CI, in the round that makes it.
//
// It deliberately compares STRINGS, not behaviour: the migration is the only
// place those values exist before the table is populated, and a future rename
// of `subj.math` in messages.ts must be a conscious decision to change what
// production shows — not a side effect.
//
// Style follows parentStudentLinkRls.test.ts: read the SQL text, assert against
// it, touch no database. 012's copy of the same seed is checked too, because a
// from-zero rebuild runs 012 and never runs the migration.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

// Resolved from the vitest root (web-app), NOT with `new URL(…, import.meta.url)`:
// Vite rewrites that pattern into an asset import and then refuses to serve a
// file outside the project. CRs are normalized away — the SQL tree is LF and
// messages.ts is CRLF, and the STRINGS are what is being compared.
function readSql(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const MIGRATION = "supabase/sql/migrations/2026_09_10_171_subject_translations.sql";
const CANONICAL_SEED = "supabase/sql/012_seed_initial_data.sql";

type SeedRow = { code: string; locale: string; name: string };

/**
 * Pull the `('code', 'locale', 'Name')` tuples out of the D1 `join (values …)
 * as v(code, locale, name)` block. Comment lines are dropped first so a `--`
 * line can never contribute a tuple.
 */
function parseSeed(sql: string): SeedRow[] {
  const start = sql.indexOf("join (values");
  const end = sql.indexOf(") as v(code, locale, name)", start);
  expect(start, "D1 `join (values` block not found").toBeGreaterThan(-1);
  expect(end, "D1 `as v(code, locale, name)` terminator not found").toBeGreaterThan(start);

  const body = sql
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const rows: SeedRow[] = [];
  const tuple = /\(\s*'([a-z0-9_]+)'\s*,\s*'(az|en|ru)'\s*,\s*'([^']*)'\s*\)/g;
  for (let m = tuple.exec(body); m !== null; m = tuple.exec(body)) {
    rows.push({ code: m[1], locale: m[2], name: m[3] });
  }
  return rows;
}

/** Every `subj.<code>` key the shipped dictionary carries, in the az locale. */
const dictionaryCodes = Object.keys(messages.az)
  .filter((k) => k.startsWith("subj."))
  .map((k) => k.slice("subj.".length))
  .sort();

describe("migration 171 seeds exactly what the shipped dictionary resolves", () => {
  const seed = parseSeed(readSql(MIGRATION));

  it("parses all 21 seeded literals (7 subjects × az/en/ru)", () => {
    expect(seed).toHaveLength(dictionaryCodes.length * locales.length);
    expect(dictionaryCodes.length).toBe(7);
  });

  it("covers every subj.<code> key in the dictionary, and invents none", () => {
    const seeded = [...new Set(seed.map((r) => r.code))].sort();
    expect(seeded).toEqual(dictionaryCodes);
  });

  it("gives every seeded subject all three locales", () => {
    for (const code of dictionaryCodes) {
      const got = seed
        .filter((r) => r.code === code)
        .map((r) => r.locale)
        .sort();
      expect(got, `subject ${code}`).toEqual([...locales].sort());
    }
  });

  // The assertion the whole migration rests on.
  for (const locale of locales) {
    it(`${locale}: every seeded name equals messages.${locale}["subj.<code>"]`, () => {
      for (const row of seed.filter((r) => r.locale === locale)) {
        const key = `subj.${row.code}`;
        expect(
          row.name,
          `${MIGRATION} seeds ${locale}/${row.code} as "${row.name}" but ` +
            `messages.${locale}["${key}"] is "${messages[locale][key]}". ` +
            `Applying the migration would RENAME that subject in production. ` +
            `Change both files together, or neither.`,
        ).toBe(messages[locale][key]);
      }
    });
  }
});

describe("012 (the from-zero rebuild path) seeds the same strings", () => {
  const canonical = parseSeed(readSql(CANONICAL_SEED));
  const migration = parseSeed(readSql(MIGRATION));

  it("agrees with the migration on every row it carries", () => {
    for (const row of canonical) {
      const twin = migration.find((r) => r.code === row.code && r.locale === row.locale);
      expect(twin, `012 seeds ${row.locale}/${row.code}; the migration does not`).toBeDefined();
      expect(row.name, `${row.locale}/${row.code} differs between 012 and 171`).toBe(twin?.name);
    }
  });

  it("omits only `azerbaycan_dili`, which 012 does not create", () => {
    const missing = migration
      .filter((m) => !canonical.some((c) => c.code === m.code && c.locale === m.locale))
      .map((m) => m.code);
    expect([...new Set(missing)]).toEqual(["azerbaycan_dili"]);
  });
});
