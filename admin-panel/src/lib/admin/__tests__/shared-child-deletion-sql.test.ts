// Migration 174's deletion safety, asserted against the SQL text — and then
// MUTATION-TESTED, because "the assertions pass" is a much weaker claim than
// "the assertions fail when the rule is broken".
//
// WHY THE SQL AND NOT A DATABASE. Nothing here runs against Postgres, and the
// invariants below are exactly the kind a query cannot catch until after the
// damage: a cascade that stopped promoting still deletes the parent, a guard
// that stopped counting still exists, an FK that went back to CASCADE still has
// a name. All of it is only visible in the source — so both copies of the source
// are checked: the migration a live database ran, and the canonical backport a
// from-zero rebuild actually executes.
//
// HOW THE MUTATION PASS WORKS. Each MUTANT below is a realistic regression
// written as a textual edit of the migration — the promotion call deleted, the
// guard's threshold loosened, the FK list shortened, SECURITY DEFINER dropped.
// The suite asserts that every mutant is KILLED by at least one invariant, and
// names which. An invariant nothing can kill is decoration; a mutant nothing
// catches is a hole in this file.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the vitest root (admin-panel), NOT with `new URL(…,
// import.meta.url)`: Vite rewrites that pattern into an asset import and then
// refuses to serve a file outside the project.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const MIGRATION = read(
  "supabase/sql/migrations/2026_09_11_174_shared_child_deletion_safety.sql",
);
const SQL_007 = read("supabase/sql/007_subscriptions_payments_coupons.sql");
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");

/** A function's dollar-quoted BODY, whatever tag it uses (`$$` or `$fn$`). */
function fnBody(sql: string, name: string): string {
  const decl = sql.indexOf(`create or replace function public.${name}(`);
  if (decl < 0) return "";
  const at = sql.indexOf("\nas $", decl);
  if (at < 0) return "";
  const tagEnd = sql.indexOf("$\n", at + 5);
  if (tagEnd < 0) return "";
  const tag = sql.slice(at + 4, tagEnd + 1); // e.g. "$$" or "$fn$"
  const end = sql.indexOf(`\n${tag};`, tagEnd);
  if (end < 0) return "";
  return sql.slice(tagEnd + 2, end);
}

/** The same body with SQL line comments removed, so prose cannot satisfy a test. */
function code(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** The `do $$ … $$;` block that performs the foreign-key surgery. */
function fkBlock(sql: string): string {
  const at = sql.indexOf("v_tables text[] := array[");
  if (at < 0) return "";
  const end = sql.indexOf("\n$$;", at);
  return end < 0 ? "" : sql.slice(at, end);
}

// ---------------------------------------------------------------------------
// THE INVARIANTS. Each is one sentence about what must remain true, expressed
// over the migration text so a mutation can be shown to break it.
// ---------------------------------------------------------------------------
type Invariant = { readonly name: string; readonly holds: (sql: string) => boolean };

const INVARIANTS: readonly Invariant[] = [
  {
    // A child with another ACTIVE adult is not in the delete set. This is the
    // entire rule; without it a co-parent's departure kills a living child.
    name: "delete-set excludes children with another active link",
    holds: (sql) => {
      const body = code(fnBody(sql, "parent_children_to_delete"));
      return (
        /not\s+exists/.test(body) &&
        /parent_profile_id\s*<>\s*p_parent/.test(body) &&
        /status\s*=\s*'active'/.test(body)
      );
    },
  },
  {
    // The claim set is creator OR active link — a co-parent holds no authorship
    // and would otherwise be invisible to every deletion rule.
    name: "claim-set is creator OR active link, not creator alone",
    holds: (sql) => {
      const body = code(fnBody(sql, "parent_claimed_children"));
      return (
        /created_by_parent_profile_id\s*=\s*p_parent/.test(body) &&
        /parent_profile_id\s*=\s*p_parent/.test(body) &&
        /\bunion\b/.test(body)
      );
    },
  },
  {
    // ONE rule. The cascade reads the function and carries no inlined copy of
    // the predicate — three copies is how the paths drifted apart.
    name: "cascade reads the shared rule and inlines no copy of it",
    holds: (sql) => {
      const body = code(fnBody(sql, "fn_cascade_delete_parent_children"));
      return (
        body.includes("public.parent_children_to_delete(old.profile_id)") &&
        !body.includes("created_by_parent_profile_id")
      );
    },
  },
  {
    // Promotion happens while the parent row is still there to be promoted FROM.
    name: "cascade promotes before it deletes anything",
    holds: (sql) => {
      const body = code(fnBody(sql, "fn_cascade_delete_parent_children"));
      const promote = body.indexOf("promote_surviving_co_parent");
      const firstDelete = body.indexOf("delete from");
      return promote > -1 && firstDelete > -1 && promote < firstDelete;
    },
  },
  {
    // students.created_by_parent_profile_id is ON DELETE SET NULL, so without
    // this the surviving family keeps a child nobody owns and nobody can buy for.
    name: "promotion re-points the creator",
    holds: (sql) => {
      const body = code(fnBody(sql, "promote_surviving_co_parent"));
      return (
        /update\s+public\.students/.test(body) &&
        /created_by_parent_profile_id\s*=\s*v_heir/.test(body)
      );
    },
  },
  {
    // child_subscriptions.owner_parent_profile_id is NOT NULL ON DELETE CASCADE,
    // so without this the child's live subscription row is deleted outright.
    name: "promotion re-points the live subscription owner",
    holds: (sql) => {
      const body = code(fnBody(sql, "promote_surviving_co_parent"));
      return (
        /update\s+public\.child_subscriptions/.test(body) &&
        /owner_parent_profile_id\s*=\s*v_heir/.test(body)
      );
    },
  },
  {
    // The owner's rule: the LONGEST-STANDING active link is promoted.
    name: "promotion picks the longest-standing link",
    holds: (sql) => {
      const body = code(fnBody(sql, "promote_surviving_co_parent"));
      return /order\s+by\s+l\.created_at\s+asc/.test(body) && /limit\s+1/.test(body);
    },
  },
  {
    // Writing NULL into created_by is the very outcome promotion prevents.
    name: "promotion skips rather than writing a NULL owner",
    holds: (sql) => {
      const body = code(fnBody(sql, "promote_surviving_co_parent"));
      return /if\s+v_heir\s+is\s+null\s+then/.test(body) && /continue;/.test(body);
    },
  },
  {
    // BEFORE DELETE on students, row level. AFTER would fire with the row gone.
    name: "students guard is armed BEFORE DELETE, per row",
    holds: (sql) =>
      /create trigger trg_student_shared_delete_guard\s+before delete on public\.students\s+for each row/.test(
        sql,
      ),
  },
  {
    // More than one active link — the departing adult INCLUDED — means somebody
    // else is still here.
    name: "students guard refuses at more than one active link",
    holds: (sql) => {
      const body = code(fnBody(sql, "fn_student_shared_delete_guard"));
      return /status\s*=\s*'active'/.test(body) && /v_active\s*>\s*1/.test(body);
    },
  },
  {
    // Under a client token the link count is RLS-filtered to the caller's own
    // rows, so an invoker-rights guard counts 1 for a child with four adults.
    name: "students guard is SECURITY DEFINER",
    holds: (sql) => {
      const decl = sql.indexOf(
        "create or replace function public.fn_student_shared_delete_guard()",
      );
      if (decl < 0) return false;
      const header = sql.slice(decl, sql.indexOf("\nas $", decl));
      return /security definer/.test(header);
    },
  },
  {
    // students_write (010) is FOR ALL, so the creating parent holds DELETE; a
    // row delete strands the child's auth.users login (migration 167).
    name: "students guard refuses any user-token row delete",
    holds: (sql) => {
      const body = code(fnBody(sql, "fn_student_shared_delete_guard"));
      return /auth\.uid\(\)\s+is\s+not\s+null/.test(body) && /raise exception/.test(body);
    },
  },
  {
    // Financial history outlives the person.
    name: "all four history owner FKs move to nullable SET NULL",
    holds: (sql) => {
      const block = code(fkBlock(sql));
      return (
        ["checkout_sessions", "sibling_discounts", "free_trials", "iap_purchase_intents"].every(
          (t) => block.includes(`'${t}'`),
        ) &&
        block.includes("drop not null") &&
        block.includes("on delete set null")
      );
    },
  },
  {
    // A live subscription is an ACCESS record for a child who is still here: a
    // NULL owner is a subscription nothing can renew, change or cancel.
    name: "child_subscriptions is NOT harmonised into the SET NULL list",
    holds: (sql) => {
      const start = sql.indexOf("v_tables text[] := array[");
      const end = sql.indexOf("];", start);
      return start >= 0 && end > start && !sql.slice(start, end).includes("'child_subscriptions'");
    },
  },
  {
    // Default privileges are grantor-scoped, so `revoke from public` alone
    // leaves anon/authenticated holding EXECUTE.
    name: "the three deletion-rule functions are service_role only",
    holds: (sql) =>
      ["parent_claimed_children", "parent_children_to_delete", "promote_surviving_co_parent"].every(
        (fn) =>
          sql.includes(
            `revoke all on function public.${fn}(uuid) from public, anon, authenticated;`,
          ) &&
          sql.includes(`grant execute on function public.${fn}(uuid) to service_role;`) &&
          !new RegExp(
            `grant execute on function public\\.${fn}\\(uuid\\) to [^;]*authenticated`,
          ).test(sql),
      ),
  },
  {
    // A nested commit once committed an outer `drop schema public cascade` in
    // this repository and every row was lost.
    name: "the migration never self-transacts",
    holds: (sql) => !/^\s*(begin|commit|rollback)\s*;/im.test(sql),
  },
];

// ---------------------------------------------------------------------------
// THE MUTANTS. Each is a regression somebody could plausibly write, applied to
// the real migration text.
// ---------------------------------------------------------------------------
type Mutant = { readonly name: string; readonly apply: (sql: string) => string };

function replaceOnce(sql: string, from: string, to: string): string {
  const at = sql.indexOf(from);
  if (at < 0) throw new Error("mutation anchor missing: " + from.slice(0, 60));
  return sql.slice(0, at) + to + sql.slice(at + from.length);
}

const MUTANTS: readonly Mutant[] = [
  {
    name: "delete-set stops excluding other adults",
    apply: (sql) =>
      replaceOnce(
        sql,
        `   where not exists (
     select 1
       from public.parent_student_links l2
      where l2.student_profile_id = c.child_profile_id
        and l2.parent_profile_id <> p_parent
        and l2.status = 'active'
   );`,
        "   ;",
      ),
  },
  {
    name: "claim-set narrows back to children I created",
    apply: (sql) =>
      replaceOnce(
        sql,
        `      union
      select l.student_profile_id as child
        from public.parent_student_links l
       where l.parent_profile_id = p_parent
         and l.status = 'active'
`,
        "",
      ),
  },
  {
    name: "cascade re-inlines its own created_by query",
    apply: (sql) =>
      replaceOnce(
        sql,
        "    from public.parent_children_to_delete(old.profile_id) as d;",
        "    from public.students d where d.created_by_parent_profile_id = old.profile_id;",
      ),
  },
  {
    name: "promotion call deleted from the cascade",
    apply: (sql) =>
      replaceOnce(sql, "  perform public.promote_surviving_co_parent(old.profile_id);\n", ""),
  },
  {
    name: "promotion moved after the deletes",
    apply: (sql) =>
      replaceOnce(
        replaceOnce(sql, "  perform public.promote_surviving_co_parent(old.profile_id);\n", ""),
        "  delete from public.profiles p where p.id = any(v_children);",
        "  delete from public.profiles p where p.id = any(v_children);\n  perform public.promote_surviving_co_parent(old.profile_id);",
      ),
  },
  {
    name: "promotion forgets the creator column",
    apply: (sql) =>
      replaceOnce(
        sql,
        `    update public.students s
       set created_by_parent_profile_id = v_heir,
           updated_at = now()
     where s.profile_id = v_child
       and s.created_by_parent_profile_id is distinct from v_heir;
`,
        "",
      ),
  },
  {
    name: "promotion forgets the subscription owner",
    apply: (sql) =>
      replaceOnce(
        sql,
        `    update public.child_subscriptions cs
       set owner_parent_profile_id = v_heir,
           updated_at = now()
     where cs.student_profile_id = v_child
       and cs.owner_parent_profile_id = p_parent;
`,
        "",
      ),
  },
  {
    name: "promotion picks the newest link instead of the longest-standing",
    apply: (sql) =>
      replaceOnce(sql, "     order by l.created_at asc, l.id asc", "     order by l.created_at desc, l.id asc"),
  },
  {
    name: "promotion writes NULL when no heir is found",
    apply: (sql) =>
      replaceOnce(
        sql,
        `    if v_heir is null then
      continue;
    end if;
`,
        "",
      ),
  },
  {
    name: "students guard armed AFTER delete",
    apply: (sql) =>
      replaceOnce(
        sql,
        `create trigger trg_student_shared_delete_guard
  before delete on public.students`,
        `create trigger trg_student_shared_delete_guard
  after delete on public.students`,
      ),
  },
  {
    name: "students guard tolerates a second adult",
    apply: (sql) => replaceOnce(sql, "  if v_active > 1 then", "  if v_active > 2 then"),
  },
  {
    name: "students guard loses SECURITY DEFINER",
    apply: (sql) =>
      replaceOnce(
        sql,
        `create or replace function public.fn_student_shared_delete_guard()
returns trigger
language plpgsql
security definer
`,
        `create or replace function public.fn_student_shared_delete_guard()
returns trigger
language plpgsql
`,
      ),
  },
  {
    name: "students guard lets a user token delete the row",
    apply: (sql) =>
      replaceOnce(
        sql,
        `  if auth.uid() is not null then
    raise exception
      'student % is not deletable with a user token; delete the auth user',
      old.profile_id
      using errcode = 'insufficient_privilege', hint = 'student_row_delete_forbidden';
  end if;
`,
        "",
      ),
  },
  {
    name: "one history table left on CASCADE",
    apply: (sql) =>
      replaceOnce(
        sql,
        `    'free_trials',
    'iap_purchase_intents'
  ];`,
        `    'free_trials'
  ];`,
      ),
  },
  {
    name: "child_subscriptions harmonised into the SET NULL list",
    apply: (sql) =>
      replaceOnce(
        sql,
        `  v_tables text[] := array[
    'checkout_sessions',`,
        `  v_tables text[] := array[
    'child_subscriptions',
    'checkout_sessions',`,
      ),
  },
  {
    name: "the delete-set function is opened to signed-in parents",
    apply: (sql) =>
      replaceOnce(
        sql,
        "grant execute on function public.parent_children_to_delete(uuid) to service_role;",
        "grant execute on function public.parent_children_to_delete(uuid) to service_role, authenticated;",
      ),
  },
  {
    name: "the migration wraps itself in a transaction",
    apply: (sql) => "begin;\n" + sql,
  },
];

describe("migration 174 holds every invariant it claims", () => {
  it.each(INVARIANTS.map((i) => i.name))("%s", (name) => {
    const inv = INVARIANTS.find((i) => i.name === name);
    expect(inv?.holds(MIGRATION)).toBe(true);
  });
});

describe("mutation pass: every plausible regression is caught", () => {
  it.each(MUTANTS.map((m) => m.name))("%s is killed", (name) => {
    const mutant = MUTANTS.find((m) => m.name === name);
    expect(mutant).toBeTruthy();
    const mutated = (mutant as Mutant).apply(MIGRATION);
    // The edit must actually have changed something — a mutant that is a no-op
    // would "pass" this suite while proving nothing.
    expect(mutated).not.toBe(MIGRATION);

    const killers = INVARIANTS.filter((inv) => !inv.holds(mutated)).map((inv) => inv.name);
    expect(killers, `NOT CAUGHT: ${name}`).not.toHaveLength(0);
  });

  it("no invariant is decoration — each one kills at least one mutant", () => {
    const unused = INVARIANTS.filter(
      (inv) => !MUTANTS.some((m) => !inv.holds(m.apply(MIGRATION))),
    ).map((inv) => inv.name);
    expect(unused).toEqual([]);
  });
});

describe("the canonical backport is the same code, not a paraphrase", () => {
  // A from-zero rebuild runs 011, never the migration. Drift between the two is
  // invisible until somebody rebuilds and finds a different database.
  it.each([
    "parent_claimed_children",
    "parent_children_to_delete",
    "promote_surviving_co_parent",
    "fn_cascade_delete_parent_children",
    "fn_student_shared_delete_guard",
  ])("%s has an identical body in 011", (fn) => {
    const fromMigration = fnBody(MIGRATION, fn);
    expect(fromMigration.length, `${fn} body found in the migration`).toBeGreaterThan(0);
    expect(fnBody(SQL_011, fn)).toBe(fromMigration);
  });

  it("011 arms both triggers", () => {
    expect(SQL_011).toMatch(
      /create trigger trg_student_shared_delete_guard\s+before delete on public\.students/,
    );
    expect(SQL_011).toMatch(
      /create trigger trg_parents_cascade_children\s+before delete on public\.parents/,
    );
  });

  it("011 carries the same service_role-only grants", () => {
    for (const fn of [
      "parent_claimed_children",
      "parent_children_to_delete",
      "promote_surviving_co_parent",
    ]) {
      expect(SQL_011).toContain(
        `revoke all on function public.${fn}(uuid) from public, anon, authenticated;`,
      );
      expect(SQL_011).toContain(
        `grant execute on function public.${fn}(uuid) to service_role;`,
      );
    }
  });

  it("007 declares the four history owner columns nullable and SET NULL", () => {
    // Nullable is not cosmetic: ON DELETE SET NULL cannot fire into a NOT NULL
    // column, so the pair has to move together.
    const matches = SQL_007.match(
      /owner_parent_profile_id\s+uuid references public\.profiles\s?\(id\) on delete set null,/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(SQL_007).not.toMatch(
      /owner_parent_profile_id\s+uuid not null references public\.profiles\s?\(id\) on delete cascade,\n\s+kind/,
    );
  });

  it("007 keeps child_subscriptions.owner NOT NULL and CASCADE on purpose", () => {
    expect(SQL_007).toMatch(
      /owner_parent_profile_id\s+uuid not null references public\.profiles \(id\) on delete cascade,\n\s+interval/,
    );
  });

  it("013 asserts both halves at validation time", () => {
    expect(SQL_013).toContain("'130_shared_child_deletion_safety' as check_name");
    expect(SQL_013).toContain("'131_parent_owner_fks_survive_deletion' as check_name");
  });
});
