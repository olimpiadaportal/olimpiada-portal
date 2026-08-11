// Migration 108's duplicate guard, asserted against the SQL text itself.
//
// The key is built TWICE — once over the stored pool, once over the incoming
// row — and the two halves live 100 lines apart. If they stop agreeing about a
// separator, the normalizer or the option ordering, nothing fails: every append
// simply reports zero duplicates and silently doubles a pool. There is no
// database in this suite, so the invariants that a query cannot check here are
// checked on the source, in BOTH copies (migration + canonical backport).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the vitest root (admin-panel), NOT with `new URL(…,
// import.meta.url)`: Vite rewrites that pattern into an asset import and then
// refuses to serve a file outside the project.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

/**
 * The importer's plpgsql BODY (`as $$ … $$;`), which is the part that must be
 * identical in both files. The headers differ by convention and always have:
 * the canonical file drops and `create`s, the migration `create or replace`s.
 */
function importerBody(sql: string): string {
  const decl = sql.indexOf("function public.bulk_insert_olympiad_package_questions(");
  expect(decl).toBeGreaterThan(-1);
  const at = sql.indexOf("\nas $$\n", decl);
  expect(at).toBeGreaterThan(decl);
  const end = sql.indexOf("\n$$;", at);
  expect(end).toBeGreaterThan(at);
  return sql.slice(at, end + 4);
}

const MIGRATION = importerBody(
  read("supabase/sql/migrations/2026_08_11_108_olympiad_bulk_append.sql"),
);
const CANONICAL = importerBody(
  read("supabase/sql/011_indexes_constraints_functions_triggers.sql"),
);
const BOTH: [string, string][] = [
  ["migration 108", MIGRATION],
  ["canonical 011", CANONICAL],
];

describe("the canonical backport is the migration, character for character", () => {
  it("keeps one implementation rather than two that drift", () => {
    expect(CANONICAL).toBe(MIGRATION);
  });
});

describe("duplicates are compared against the PRE-EXISTING pool only", () => {
  it.each(BOTH)("%s never extends the snapshot inside the row loop", (_name, src) => {
    // The regression this pins: pushing each successful key back made two
    // identical rows INSIDE one file collide. Creation and add-grade are
    // all-or-nothing, so that turned a package creation which used to succeed
    // into a full rollback.
    expect(src).not.toContain("v_dup_keys || v_key");
    expect(src).not.toContain("v_dup_keys := v_dup_keys");
  });

  it.each(BOTH)("%s snapshots the keys once, before the loop", (_name, src) => {
    const snapshot = src.indexOf("into v_dup_keys");
    const loop = src.indexOf("for v_item in select * from jsonb_array_elements(p_questions)");
    expect(snapshot).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(snapshot);
  });

  it.each(BOTH)("%s scopes the snapshot to this (package, grade) pool", (_name, src) => {
    expect(src).toContain("q2.olympiad_package_id = p_package_id");
    expect(src).toContain("q2.grade_id = v_pool_grade");
  });

  it.each(BOTH)("%s no longer carries the creation-only raise", (_name, src) => {
    expect(src).not.toContain("can only be bulk uploaded once");
  });
});

describe("the two halves of the key are built identically", () => {
  it.each(BOTH)("%s uses the same separators on both sides", (_name, src) => {
    // chr(31) twice per side (body | image | options), chr(29) and chr(30) once
    // per side inside the option aggregate.
    expect(src.split("chr(31)").length - 1).toBe(4);
    expect(src.split("chr(29)").length - 1).toBe(2);
    expect(src.split("chr(30)").length - 1).toBe(2);
  });

  it.each(BOTH)("%s normalizes every component through norm_import_text", (_name, src) => {
    // 3 stored (body, question image, option text+image = 2) + 3 incoming.
    expect(src.split("public.norm_import_text(").length - 1).toBe(8);
    expect(src).toContain("public.norm_import_text(qt.body)");
    expect(src).toContain("public.norm_import_text(v_item->'translations'->v_pl->>'body')");
  });

  it.each(BOTH)("%s orders options the same way the insert numbers them", (_name, src) => {
    // Stored: the real order_index. Incoming: order_index, else the 0-based
    // position — which is exactly what the insert's `coalesce(order_index,
    // v_order)` with `v_order := 0` produces. `ordinality` is 1-based, hence
    // the -1; without it the two keys diverge and nothing ever matches.
    expect(src).toContain("chr(30) order by ao.order_index)");
    expect(src).toContain("chr(30) order by coalesce((o->>'order_index')::int, (ord - 1)::int))");
    expect(src).toContain("v_order := 0;");
    expect(src).toContain("coalesce((v_opt->>'order_index')::int, v_order)");
  });

  it.each(BOTH)("%s reads BOTH sides at the primary locale", (_name, src) => {
    // The documented limitation: re-uploading the same question with its
    // primary_locale flipped does not match. Asserted so a future edit that
    // changes one side without the other is caught.
    expect(src).toContain("on qt.question_id = q2.id and qt.locale = q2.primary_locale");
    expect(src).toContain("on aot.option_id = ao.id and aot.locale = q2.primary_locale");
    expect(src).toContain("public.norm_import_text(o->'text'->>v_pl)");
    expect(src).toContain("public.norm_import_text(o->'image'->>v_pl)");
  });

  it.each(BOTH)("%s raises inside the per-row block, not out of the call", (_name, src) => {
    // The raise must land in the {index, error} contract as a normal row
    // failure; escaping the loop would fail the whole import.
    const raise = src.indexOf("raise exception 'duplicate question already in this grade pool'");
    const handler = src.indexOf("exception when others then");
    expect(raise).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(raise);
  });
});
