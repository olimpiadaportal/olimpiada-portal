// Migration 112 — bulk purge of a SELECTION of questions inside one olympiad
// package, asserted on both halves.
//
// The properties pinned here are the ones that fail SILENTLY. An action that
// reads FormData before its guard still works for an admin. A selection whose
// malformed entries are quietly filtered out still "succeeds" — with fewer rows
// than the admin ticked and no way to tell which. A wrapper that inlined the
// delete-vs-archive policy still returns counts, right up until the day it
// hard-deletes an answered question. And a hint the SQL raises but the
// dictionary never learned still renders — as "server error", which tells the
// admin nothing about a refusal that was in fact deliberate and explainable.
// None of those show up in a browser click-through.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { deletionBlockText, deletionHintKey, parseDeletionBlocks } from "../deletion-hints";
import { localDict as poolLabels } from "@/app/(protected)/olympiad/labels";

// ---- SQL halves ----------------------------------------------------------
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}
const MIGRATION = read(
  "supabase/sql/migrations/2026_08_14_112_olympiad_bulk_question_purge.sql",
);
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");
const SQL_015 = read("supabase/sql/015_olympiad_preparation.sql");

const FN = "admin_delete_olympiad_questions";

/** A function's plpgsql body — the part that must be identical in both files. */
function body(sql: string, name: string): string {
  const decl = sql.indexOf(`create or replace function public.${name}(`);
  expect(decl, `${name} is declared`).toBeGreaterThan(-1);
  const at = sql.indexOf("\nas $$\n", decl);
  expect(at, `${name} has a dollar-quoted body`).toBeGreaterThan(decl);
  const end = sql.indexOf("\n$$;", at);
  expect(end, `${name} body is terminated`).toBeGreaterThan(at);
  return sql.slice(at, end + 4);
}

// ---- action-under-test scaffolding ---------------------------------------
const order: string[] = [];
const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});
const writeAuditLog = vi.fn(async (_entry: unknown) => {});
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/guards", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: (a: unknown) => writeAuditLog(a) }));
// getT returns the key, so an assertion names the message rather than copying
// its wording — a rewording must not turn into a red test.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

const PKG = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const Q3 = "33333333-3333-4333-8333-333333333333";
const MEDIA = "44444444-4444-4444-8444-444444444444";
const CODE = "oly-2026-riy-6";

const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const fromCalls: string[] = [];
const storageRemoved: { bucket: string; paths: string[] }[] = [];
const mediaRowsDeleted: string[][] = [];
let rpcResults: Record<string, { data: unknown; error: unknown }> = {};

function passthroughBuilder() {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: null, error: null }),
  });
  return b as never;
}

// media_assets is awaited directly (select…in and delete…in), so the builder is
// a thenable rather than a chain ending in a method.
function mediaBuilder() {
  let mode: "select" | "delete" = "select";
  let ids: string[] = [];
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => ((mode = "select"), b),
    delete: () => ((mode = "delete"), b),
    in: (_col: string, v: string[]) => ((ids = v), b),
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      if (mode === "select") {
        return Promise.resolve(
          res({
            data: ids.map((id) => ({ id, bucket: "question-media", path: `pool/${id}.png` })),
            error: null,
          }),
        );
      }
      mediaRowsDeleted.push(ids);
      return Promise.resolve(res({ data: null, error: null }));
    },
  });
  return b as never;
}

function makeSupabase() {
  return {
    from(table: string) {
      fromCalls.push(table);
      return table === "media_assets" ? mediaBuilder() : passthroughBuilder();
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          storageRemoved.push({ bucket, paths });
          return { data: null, error: null };
        },
      }),
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return rpcResults[name] ?? { data: null, error: null };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeSupabase() }));

/** FormData that records the order in which the action reads its fields. */
class SpyFormData extends FormData {
  override get(name: string): FormDataEntryValue | null {
    order.push(`read:${name}`);
    return super.get(name);
  }
}
function form(fields: Record<string, string>): FormData {
  const fd = new SpyFormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** A check_violation as PostgREST surfaces it: hint + JSON detail. */
function guardError(hint: string, blocks: Record<string, unknown>[]) {
  return {
    code: "23514",
    hint,
    details: JSON.stringify({ blocks }),
    message: 'new row for relation "questions" violates check constraint',
  };
}

/** The bulk form as the dialog posts it: package, ids, and the typed token. */
function bulkForm(fields: Record<string, string>): FormData {
  return form({ __code: CODE, ...fields });
}

async function olympiad() {
  return await import("../olympiad");
}

beforeEach(() => {
  order.length = 0;
  rpcCalls.length = 0;
  fromCalls.length = 0;
  storageRemoved.length = 0;
  mediaRowsDeleted.length = 0;
  rpcResults = {
    admin_delete_olympiad_questions: {
      data: {
        package_id: PKG,
        requested: 3,
        deleted: 2,
        archived: 1,
        retained: 1,
        already_archived: 0,
        repaired_practice_sets: 0,
        reset_rotations: 4,
        package_demoted: false,
        orphaned_media_ids: [MEDIA],
        media_truncated: false,
      },
      error: null,
    },
    // The per-row Delete button goes through the SAME guarded body since 112.
    admin_delete_olympiad_pool_question: {
      data: {
        package_id: PKG,
        requested: 1,
        deleted: 1,
        archived: 0,
        retained: 0,
        reset_rotations: 0,
        package_demoted: false,
        orphaned_media_ids: [MEDIA],
        media_truncated: false,
      },
      error: null,
    },
  };
  requireAdmin.mockClear();
  writeAuditLog.mockClear();
  revalidatePath.mockClear();
});

// ===========================================================================
// The server action
// ===========================================================================

describe("authorization happens before any client input is read", () => {
  it("guards first, exactly once", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: `${Q1},${Q2}` }));
    expect(order[0]).toBe("guard");
    expect(order.filter((x) => x === "guard")).toHaveLength(1);
  });

  it("guards even when the payload is garbage", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: "nope", ids: "" }));
    expect(order[0]).toBe("guard");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("a malformed id never reaches the database", () => {
  const BAD = ["not-a-uuid", "1 OR 1=1", "3f2504e0-4f89-11d3-9a0c", `${Q1}x`, "*"];

  it("refuses a malformed package id", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    for (const bad of ["", ...BAD]) {
      const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: bad, ids: Q1 }));
      expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    }
    expect(rpcCalls).toHaveLength(0);
    expect(fromCalls).toHaveLength(0);
  });

  it("refuses the WHOLE selection when one id is malformed, instead of dropping it", async () => {
    // THE property this action exists to keep. questions.ts's idList() filters
    // non-UUIDs out and carries on; here that would purge N-1 of the N rows the
    // admin ticked and report success, with no way to tell which one survived.
    const { deleteOlympiadQuestionsAction } = await olympiad();
    for (const bad of BAD) {
      const res = await deleteOlympiadQuestionsAction(
        null,
        bulkForm({ __package_id: PKG, ids: `${Q1},${bad},${Q2}` }),
      );
      expect(res, bad).toEqual({ ok: false, error: "err.server", blocks: [] });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("an empty selection is a named refusal, not a silent no-op", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    for (const ids of ["", "  ", ",,,"]) {
      const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids }));
      expect(res).toEqual({
        ok: false,
        error: "del.err.blocked",
        blocks: ["del.hint.emptySelection"],
      });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("caps the selection at 500 before it queries anything", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const many = Array.from({ length: 501 }, (_, i) =>
      `${String(i + 10000000).slice(0, 8)}-1111-4111-8111-111111111111`,
    ).join(",");
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: many }));
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.tooManySelected"],
    });
    expect(rpcCalls).toHaveLength(0);
    expect(fromCalls).toHaveLength(0);
  });

  it("sends a de-duplicated array of exactly the ids it was given", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(
      null,
      bulkForm({ __package_id: PKG, ids: ` ${Q1} , ${Q2} ,${Q1}, ${Q3} ` }),
    );
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("admin_delete_olympiad_questions");
    expect(rpcCalls[0].args).toEqual({
      p_package_id: PKG,
      p_question_ids: [Q1, Q2, Q3],
      p_expected_code: CODE,
      // Answered rows are ARCHIVED on the bulk path; only the per-row button
      // asks for the refusal.
      p_refuse_answered: false,
    });
  });
});

// ===========================================================================
// The confirmation token
//
// The RPC is granted to `authenticated`, which makes it a PostgREST endpoint an
// admin session can POST 500 ids at without ever opening the dialog. A
// checkbox in a React component is not a control; a value the DATABASE compares
// under the package's row lock is. This suite pins the wire half of that.
// ===========================================================================

describe("the confirmation token reaches the database", () => {
  it("forwards exactly what the admin typed, untouched", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(
      null,
      form({ __package_id: PKG, ids: Q1, __code: "some-other-code" }),
    );
    expect(rpcCalls[0].args.p_expected_code).toBe("some-other-code");
  });

  it("refuses an empty token before it queries anything", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    for (const code of ["", "   "]) {
      const res = await deleteOlympiadQuestionsAction(
        null,
        form({ __package_id: PKG, ids: Q1, __code: code }),
      );
      expect(res, JSON.stringify(code)).toEqual({
        ok: false,
        error: "del.err.blocked",
        blocks: ["del.hint.confirmationMismatch"],
      });
    }
    expect(rpcCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("renders the database's own mismatch refusal", async () => {
    // The server-side check above is a shortcut, not the control: a wrong (but
    // non-empty) token is refused by the RPC, and that refusal must read as a
    // sentence rather than a server error.
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: { code: "23514", hint: "confirmation_mismatch", details: null, message: "x" },
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(
      null,
      form({ __package_id: PKG, ids: Q1, __code: "wrong" }),
    );
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.confirmationMismatch"],
    });
  });
});

// ===========================================================================
// The purchased-pool rule
//
// CLAUDE.md, non-negotiable: purchasers keep lifetime access. Emptying a
// purchased grade's pool below one attempt leaves the buyer with a package that
// raises "pool too small" forever — which migration 111 refuses for a whole
// pool, and which a grade-filtered select-all reaches in one click.
// ===========================================================================

describe("a purchased grade's pool cannot be driven below one attempt", () => {
  const BLOCK = {
    hint: "grade_purchased_pool_below_attempt",
    count: 3,
    grade: "6",
    remaining: 12,
    required: 25,
  };

  it("refuses, names the grade and both numbers, and destroys nothing", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: guardError("grade_purchased_pool_below_attempt", [BLOCK]),
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(
      null,
      bulkForm({ __package_id: PKG, ids: `${Q1},${Q2}` }),
    );
    expect(res).toMatchObject({ ok: false, error: "del.err.blocked" });

    // The sentence is built from the block, so the admin is told WHICH grade
    // and how far short the pool would fall — "blocked" alone is unactionable.
    const sentence = (res as { blocks: string[] }).blocks[0];
    for (const loc of ["az", "en", "ru"] as const) {
      const tpl = messages[loc]["del.hint.gradePurchasedPool"];
      expect(tpl, loc).toBeTruthy();
      for (const v of ["{grade}", "{n}", "{remaining}", "{required}"]) {
        expect(tpl, `${loc} ${v}`).toContain(v);
      }
    }
    // getT is stubbed to return the key, so the rendered string is the key —
    // the numbers are asserted on the parsed block instead.
    expect(sentence).toBe("del.hint.gradePurchasedPool");
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(storageRemoved).toHaveLength(0);
  });

  it("carries the grade and the counts through the DETAIL parser", () => {
    const parsed = parseDeletionBlocks(
      guardError("grade_purchased_pool_below_attempt", [BLOCK]),
    );
    expect(parsed).toEqual([
      { hint: BLOCK.hint, count: 3, grade: "6", remaining: 12, required: 25 },
    ]);
    // …and the template is filled with all four, not just {n}.
    const filled = deletionBlockText(
      parsed[0],
      (k) => (k === "del.hint.gradePurchasedPool"
        ? "{grade}|{n}|{remaining}|{required}"
        : k),
    );
    expect(filled).toBe("6|3|12|25");
  });

  it("reports EVERY blocked grade, not just the first", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: guardError("grade_purchased_pool_below_attempt", [
        BLOCK,
        { ...BLOCK, grade: "7", remaining: 0, required: 30 },
      ]),
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(
      null,
      bulkForm({ __package_id: PKG, ids: `${Q1},${Q2}` }),
    );
    expect((res as { blocks: string[] }).blocks).toHaveLength(2);
  });
});

// ===========================================================================
// The per-row Delete button — the other half of the same guard
// ===========================================================================

describe("the single-row delete is not a way around the bulk guards", () => {
  function rowForm() {
    return form({ __package_id: PKG, __id: Q1 });
  }

  it("guards first, then goes through the shared guarded RPC", async () => {
    const { deleteOlympiadPackageQuestion } = await olympiad();
    const res = await deleteOlympiadPackageQuestion(rowForm());
    expect(order[0]).toBe("guard");
    expect(res).toBeNull();
    expect(rpcCalls).toEqual([
      {
        name: "admin_delete_olympiad_pool_question",
        args: { p_package_id: PKG, p_question_id: Q1 },
      },
    ]);
    // NOT a bare table delete any more — that is what let it skip every rule.
    expect(fromCalls).not.toContain("questions");
  });

  it("never sends a malformed id anywhere", async () => {
    const { deleteOlympiadPackageQuestion } = await olympiad();
    for (const [pkg, q] of [
      ["nope", Q1],
      [PKG, "nope"],
      ["", ""],
    ] as const) {
      const res = await deleteOlympiadPackageQuestion(
        form({ __package_id: pkg, __id: q }),
      );
      expect(res).toEqual({ error: "err.server" });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a purchased pool with the SAME sentence the bulk path uses", async () => {
    rpcResults.admin_delete_olympiad_pool_question = {
      data: null,
      error: guardError("grade_purchased_pool_below_attempt", [
        { hint: "grade_purchased_pool_below_attempt", count: 1, grade: "6", remaining: 24, required: 25 },
      ]),
    };
    const { deleteOlympiadPackageQuestion } = await olympiad();
    const res = await deleteOlympiadPackageQuestion(rowForm());
    expect(res).toEqual({ error: "del.hint.gradePurchasedPool" });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("keeps the shipped 'archive it instead' answer for an answered question", async () => {
    rpcResults.admin_delete_olympiad_pool_question = {
      data: null,
      error: guardError("question_has_attempts", [
        { hint: "question_has_attempts", count: 1 },
      ]),
    };
    const { deleteOlympiadPackageQuestion } = await olympiad();
    const res = await deleteOlympiadPackageQuestion(rowForm());
    // The pool dict's own sentence, not a generic block — this button names one
    // row the admin is looking at. getLocale is stubbed to "az", and the pool
    // dict is a real module, so this is the shipped Azerbaijani copy verbatim.
    expect(res).toEqual({ error: poolLabels("az")["olyq.err.hasAttempts"] });
    expect((res as { error: string }).error).toContain("arxivləşdirin");
  });

  it("sweeps the media the RPC reported as orphaned, and audits once", async () => {
    const { deleteOlympiadPackageQuestion } = await olympiad();
    await deleteOlympiadPackageQuestion(rowForm());
    expect(storageRemoved).toEqual([
      { bucket: "question-media", paths: [`pool/${MEDIA}.png`] },
    ]);
    expect(mediaRowsDeleted).toEqual([[MEDIA]]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = writeAuditLog.mock.calls[0][0] as Record<string, any>;
    expect(entry.severity).toBe("warning");
    expect(entry.action).toBe("admin.olympiad.question.delete");
  });

  it("never leaks a raw Postgres message", async () => {
    rpcResults.admin_delete_olympiad_pool_question = {
      data: null,
      error: {
        code: "42883",
        hint: null,
        details: null,
        message: "function public.admin_delete_olympiad_pool_question(uuid, uuid) does not exist",
      },
    };
    const { deleteOlympiadPackageQuestion } = await olympiad();
    const res = await deleteOlympiadPackageQuestion(rowForm());
    expect(res).toEqual({ error: "err.server" });
    expect(JSON.stringify(res)).not.toContain("does not exist");
  });
});

describe("a refusal renders its own reason, never a raw database string", () => {
  it("a foreign id refuses the whole call with a countable sentence", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: guardError("question_not_in_package", [
        { hint: "question_not_in_package", count: 2 },
      ]),
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(
      null,
      bulkForm({ __package_id: PKG, ids: `${Q1},${Q2}` }),
    );
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.questionNotInPackage"],
    });
    // Nothing happened, so nothing is audited and no media is swept.
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(storageRemoved).toHaveLength(0);
  });

  it("an attempt in flight is a named reason too", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: guardError("live_attempts", [{ hint: "live_attempts", count: 1 }]),
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.liveAttempts"],
    });
  });

  it("a raw Postgres message never reaches the client", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: {
        code: "42883",
        hint: null,
        details: null,
        message:
          'function public.admin_delete_olympiad_questions(uuid, uuid[]) does not exist',
      },
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    expect(JSON.stringify(res)).not.toContain("does not exist");
  });

  it("an unknown hint is dropped rather than printed", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: null,
      error: guardError("a_reason_the_ui_never_learned", [
        { hint: "a_reason_the_ui_never_learned", count: 1 },
      ]),
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
  });
});

describe("a successful purge is audited, sweeps its media and refreshes the table", () => {
  it("writes ONE warning row carrying counts only", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(
      null,
      bulkForm({ __package_id: PKG, ids: `${Q1},${Q2},${Q3}` }),
    );
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = writeAuditLog.mock.calls[0][0] as Record<string, any>;
    expect(entry.severity).toBe("warning");
    expect(entry.action).toBe("admin.olympiad.questions_purge");
    expect(entry.targetTable).toBe("olympiad_packages");
    expect(entry.targetId).toBe(PKG);
    expect(entry.metadata.requested).toBe(3);
    expect(entry.metadata.deleted).toBe(2);
    expect(entry.metadata.archived_questions).toBe(1);
    expect(entry.metadata.reset_rotations).toBe(4);
    // Never the deleted content itself — an audit row is a record, not a backup.
    const meta = JSON.stringify(entry.metadata);
    expect(meta).not.toContain("body");
    expect(meta).not.toContain(Q1);
  });

  it("removes the orphaned bucket objects AND their rows", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    // The shared helper's documented order: bytes first (the database already
    // proved nothing references them), rows second.
    expect(storageRemoved).toEqual([
      { bucket: "question-media", paths: [`pool/${MEDIA}.png`] },
    ]);
    expect(mediaRowsDeleted).toEqual([[MEDIA]]);
  });

  it("revalidates the pool page so the table refreshes without a reload", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/olympiad",
      `/olympiad/${PKG}/edit`,
    ]);
  });

  it("reports both halves of the split, and never claims a bare delete", async () => {
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(res).toEqual({ ok: true, message: "del.done.questionsPurged" });
  });

  it("states an auto-demotion the admin did not ask for", async () => {
    rpcResults.admin_delete_olympiad_questions = {
      data: {
        package_id: PKG,
        requested: 1,
        deleted: 1,
        archived: 0,
        retained: 0,
        reset_rotations: 0,
        package_demoted: true,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    };
    const { deleteOlympiadQuestionsAction } = await olympiad();
    const res = await deleteOlympiadQuestionsAction(null, bulkForm({ __package_id: PKG, ids: Q1 }));
    expect(res).toMatchObject({ ok: true });
    expect((res as { message: string }).message).toContain("del.done.demoted");
  });
});

describe("every hint this feature can raise has trilingual copy", () => {
  // Rendered by the shared hint map (deletion-hints.ts).
  const HINTS = [
    "question_not_in_package",
    "question_gone",
    "too_many_questions",
    "empty_selection",
    "grade_purchased_pool_below_attempt",
    // Raised by the same file, already shipped with 111.
    "live_attempts",
    "last_grade",
    "confirmation_mismatch",
  ];
  // Raised by the same file but rendered from the POOL dict instead: it is the
  // per-row button's answer, and the sentence names one row the admin is
  // looking at rather than a count in a dialog.
  const ROW_HINTS = ["question_has_attempts"];

  it("the SQL raises exactly the hints this suite claims it does", () => {
    const code = MIGRATION.split("\n")
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    const found = new Set<string>();
    for (const m of code.matchAll(/'hint'\s*,\s*'([a-z_]+)'/g)) found.add(m[1]);
    for (const m of code.matchAll(/hint\s*=\s*'([a-z_]+)'/g)) found.add(m[1]);
    // The grade_has_purchases pair is chosen by a CASE, so neither sits next to
    // a 'hint' token; assert them separately rather than loosening the scanner
    // into matching every quoted word in the file.
    expect(code).toContain(
      "then 'grade_has_purchases' else 'grade_has_purchases_purge' end",
    );
    for (const h of ["grade_has_purchases", "grade_has_purchases_purge"]) {
      expect(deletionHintKey(h), h).toBeTruthy();
    }
    expect([...found].sort()).toEqual([...HINTS, ...ROW_HINTS].sort());
  });

  it.each(ROW_HINTS)("%s is answered from the pool dict in all three locales", (hint) => {
    expect(hint).toBe("question_has_attempts");
    for (const loc of ["az", "en", "ru"] as const) {
      const text = poolLabels(loc)["olyq.err.hasAttempts"];
      expect(text, loc).toBeTruthy();
      expect(text.length, loc).toBeGreaterThan(30);
    }
  });

  it.each(HINTS)("%s maps to a key", (hint) => {
    expect(deletionHintKey(hint)).toBeTruthy();
  });

  it.each(HINTS)("%s reads naturally in az, en and ru", (hint) => {
    const key = deletionHintKey(hint) as string;
    const az = messages.az[key];
    const en = messages.en[key];
    const ru = messages.ru[key];
    for (const [loc, text] of [["az", az], ["en", en], ["ru", ru]] as const) {
      expect(text, `${key} is missing in ${loc}`).toBeTruthy();
      // A whole sentence: every refusal has to name the reason AND the way
      // forward, which does not fit in two words.
      expect(text.length, `${key} in ${loc} is too short to explain anything`).toBeGreaterThan(30);
    }
    // Three distinct languages, not one string copied across the locales.
    expect(new Set([az, en, ru]).size).toBe(3);
  });

  // The acknowledgement is the last thing the admin reads before the button
  // unlocks, and it is the ONE sentence they are asked to affirm. Claiming the
  // content is gone forever is false for the answered half — which the
  // paragraph directly above it already describes as archived.
  it("the acknowledgement admits the archive half in all three locales", () => {
    const ARCHIVE_WORD = { az: "arxiv", en: "archiv", ru: "архив" };
    for (const loc of ["az", "en", "ru"] as const) {
      const ack = messages[loc]["del.ackLabel"].toLowerCase();
      expect(ack, loc).toContain(ARCHIVE_WORD[loc]);
      // …and still says the deleted half is unrecoverable.
      expect(messages[loc]["del.irreversible"], loc).toBeTruthy();
    }
    expect(
      new Set(["az", "en", "ru"].map((l) => messages[l as "az"]["del.ackLabel"])).size,
    ).toBe(3);
  });

  it("the success message counts both halves in all three locales", () => {
    for (const loc of ["az", "en", "ru"] as const) {
      const m = messages[loc]["del.done.questionsPurged"];
      expect(m, loc).toBeTruthy();
      expect(m, loc).toContain("{deleted}");
      expect(m, loc).toContain("{archived}");
    }
  });
});

// ===========================================================================
// The SQL
// ===========================================================================

describe("the wrapper is admin-only, definer and search_path-pinned", () => {
  it("declares the security posture in its header", () => {
    const decl = MIGRATION.indexOf(`create or replace function public.${FN}(`);
    const header = MIGRATION.slice(decl, MIGRATION.indexOf("\nas $$\n", decl));
    expect(header).toContain("language plpgsql");
    expect(header).toContain("security definer");
    // An unpinned search_path on a definer function is privilege escalation.
    expect(header).toContain("set search_path = public, pg_temp");
  });

  it("calls is_admin() as its first statement", () => {
    const src = body(MIGRATION, FN);
    const gate = src.indexOf("if not public.is_admin() then");
    expect(gate).toBeGreaterThan(-1);
    // Nothing may be read before the gate.
    expect(src.slice(0, gate)).not.toMatch(/\bselect\b/);
    expect(src).toContain("errcode = 'insufficient_privilege'");
  });

  it("is granted to authenticated, never to anon, and leaves the helpers alone", () => {
    expect(MIGRATION).toContain(
      `revoke all on function public.${FN}(uuid, uuid[], text, boolean)\n  from public, anon;`,
    );
    expect(MIGRATION).toContain(
      `grant execute on function public.${FN}(uuid, uuid[], text, boolean)\n  to authenticated, service_role;`,
    );
    // purge_question_set must stay service_role-only; the whole point of this
    // wrapper is that the helper is NOT reachable from a signed-in session.
    expect(MIGRATION).not.toContain("grant execute on function public.purge_question_set");
    expect(MIGRATION).toContain("112: purge_question_set is no longer service_role-only");
    // Neither may the blocks helpers become POSTable.
    //
    // olympiad_grade_pool_blocks is in this list because it was briefly LOST:
    // extracting the purchase predicate re-created the function without
    // re-issuing its revoke/grant. `create or replace` KEEPS the existing ACL,
    // so every database that had already run 111 was unaffected and every test
    // passed — the opening only existed on a from-zero bootstrap, where a
    // SECURITY DEFINER function reading olympiad_purchases would have landed
    // EXECUTE-able by anon. A grant must be re-issued beside every create.
    for (const helper of [
      "public.olympiad_grade_purchase_count(uuid, uuid)",
      "public.olympiad_pool_purchase_blocks(uuid, uuid[])",
      "public.olympiad_grade_pool_blocks(uuid, uuid, boolean)",
    ]) {
      expect(MIGRATION).toContain(`grant execute on function ${helper} to service_role;`);
      expect(MIGRATION).not.toContain(
        `grant execute on function ${helper} to authenticated`,
      );
      // The canonical file is what a new database is built from, so it is the
      // copy that actually decides the from-zero posture.
      expect(SQL_015).toContain(`grant execute on function ${helper} to service_role;`);
      expect(SQL_015).toContain(`revoke all on function ${helper}`);
    }
  });

  it("takes a confirmation token and drops the arity that did not", () => {
    const header = MIGRATION.slice(
      MIGRATION.indexOf(`create or replace function public.${FN}(`),
      MIGRATION.indexOf("\nas $$\n", MIGRATION.indexOf(`create or replace function public.${FN}(`)),
    );
    expect(header).toContain("p_expected_code   text");

    // Adding a parameter creates an OVERLOAD; the old signature would still be
    // a POSTable 500-row delete with no confirmation at all.
    expect(MIGRATION).toContain(
      `drop function if exists public.${FN}(uuid, uuid[]);`,
    );
    expect(MIGRATION).toContain(
      `112: the token-less admin_delete_olympiad_questions(uuid,uuid[]) overload still exists`,
    );
    // …dropped BEFORE the create, so the two never coexist.
    expect(MIGRATION.indexOf(`drop function if exists public.${FN}(uuid, uuid[]);`))
      .toBeLessThan(MIGRATION.indexOf(`create or replace function public.${FN}(`));

    const src = body(MIGRATION, FN);
    expect(src).toContain("hint = 'confirmation_mismatch'");
    // Compared under the lock the package row is already held with.
    expect(src.indexOf("for update")).toBeLessThan(src.indexOf("confirmation_mismatch"));
    // …and before a single id is looked at.
    expect(src.indexOf("confirmation_mismatch")).toBeLessThan(
      src.indexOf("question_not_in_package"),
    );
  });
});

describe("the scope check is the feature", () => {
  it("refuses the whole call when any id is outside the package", () => {
    const src = body(MIGRATION, FN);
    expect(src).toContain("q.olympiad_package_id is distinct from p_package_id");
    expect(src).toContain("hint', 'question_not_in_package'");
    // The offending COUNT travels in DETAIL, so the dialog can say how many.
    expect(src).toContain("'count', v_foreign");
    // …and nothing may be purged before that check passes.
    const scope = src.indexOf("question_not_in_package");
    const purge = src.indexOf("public.purge_question_set(");
    expect(scope).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(scope);
  });

  it("caps the array on the RAW input, before any work", () => {
    const src = body(MIGRATION, FN);
    expect(src).toContain("if v_raw > 500 then");
    expect(src).toContain("hint    = 'too_many_questions'");
    const cap = src.indexOf("v_raw > 500");
    expect(src.indexOf("public.purge_question_set(")).toBeGreaterThan(cap);
    expect(src.indexOf("for update")).toBeGreaterThan(cap);
  });

  it("tells a STALE id apart from a foreign one", () => {
    // Both refuse the whole call — only the diagnosis differs. Reporting "does
    // not belong to this package" for a row a second admin just deleted sends
    // the admin hunting a selection bug that does not exist.
    const src = body(MIGRATION, FN);
    expect(src).toContain("hint', 'question_not_in_package'");
    expect(src).toContain("hint', 'question_gone'");
    expect(src).toContain("'count', v_foreign");
    expect(src).toContain("'count', v_missing");
    // Still ALL-OR-NOTHING: either count refuses.
    expect(src).toContain("if jsonb_array_length(v_scope) > 0 then");
  });

  it("blocks while an attempt is drawing from the selection", () => {
    const src = body(MIGRATION, FN);
    expect(src).toContain("ta.status = 'in_progress' and ta.kind = 'olympiad'");
    expect(src).toContain("ta.question_ids && v_ids");
    expect(src).toContain("hint    = 'live_attempts'");
  });
});

// ===========================================================================
// THE FINDING THIS ROUND EXISTS FOR.
//
// Migration 111 refuses to empty a purchased grade's pool (grade_has_purchases_
// purge) because it silently revokes a lifetime entitlement, which CLAUDE.md
// forbids outright. The bulk delete reached the same end state in one confirmed
// click and never asked. What matters most is not that a check exists but that
// there is exactly ONE definition of "purchased" and ONE of "how many an
// attempt needs" — two copies is how the gap opened in the first place.
// ===========================================================================

describe("the purchased-pool rule has one definition, shared by both callers", () => {
  it("the selection guard applies it, and refuses before anything is purged", () => {
    const src = body(MIGRATION, FN);
    expect(src).toContain("v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);");
    expect(src).toContain("hint    = 'grade_purchased_pool_below_attempt'");
    expect(src.indexOf("olympiad_pool_purchase_blocks")).toBeLessThan(
      src.indexOf("public.purge_question_set("),
    );
  });

  it("both guards read the SAME purchase predicate, and neither re-spells it", () => {
    const shared = "public.olympiad_grade_purchase_count(";
    for (const fn of ["olympiad_grade_pool_blocks", "olympiad_pool_purchase_blocks"]) {
      const src = body(MIGRATION, fn);
      expect(src, fn).toContain(shared);
      // The predicate itself may only live in the helper.
      expect(src, fn).not.toContain("public.olympiad_purchases pu");
    }
    // …and 111's rule is preserved inside it: ANY status counts, because a
    // refunded purchase is re-activated IN PLACE onto the same grade.
    const helper = body(MIGRATION, "olympiad_grade_purchase_count");
    expect(helper).toContain("public.olympiad_purchases pu");
    expect(helper).not.toContain("pu.status");
    // The legacy snapshot-less purchase still resolves through the student.
    expect(helper).toContain("pu.grade_id is null and exists");
  });

  it("resolves the per-grade requirement through olympiad_grade_config", () => {
    // Migration 106 lets a grade override questions_per_attempt; a hand-rolled
    // coalesce here would silently guard against the package-level number.
    const src = body(MIGRATION, "olympiad_pool_purchase_blocks");
    expect(src).toContain("public.olympiad_grade_config(p_package_id, r.grade_id)");
    expect(src).toContain("if v_left < v_need then");
    // An ARCHIVED row leaves the published pool exactly like a deleted one —
    // attempts draw published only — so both are counted as leaving.
    expect(src).toContain("count(*) filter (where q.status = 'published')");
    expect(src).toContain("and q.status = 'published'");
    // The refusal names the grade and both numbers, or it is unactionable.
    for (const key of ["'grade', coalesce(v_name, '')", "'remaining', v_left", "'required', v_need"]) {
      expect(src).toContain(key);
    }
  });

  it("the per-row button is a WRAPPER over the same body, never a second one", () => {
    const src = body(MIGRATION, "admin_delete_olympiad_pool_question");
    expect(src).toContain("return public.admin_delete_olympiad_questions(");
    // The behaviour it adds, and the only one.
    expect(src).toContain("v_code, true)");
    expect(src).toContain("if not public.is_admin() then");
    // No delete, no purchase query, no split of its own.
    expect(src).not.toContain("delete from public.questions");
    expect(src).not.toContain("public.purge_question_set(");
    expect(src).not.toContain("olympiad_purchases");
  });
});

describe("the delete-vs-archive policy has exactly one definition", () => {
  it("delegates to purge_question_set instead of carrying a copy", () => {
    const src = body(MIGRATION, FN);
    expect(src).toContain("v_purge := public.purge_question_set(v_ids);");
    // The only rows this function may remove itself are rotation cache rows.
    expect(src).not.toContain("delete from public.questions");
    expect(src).not.toContain("set status = 'archived'");
    expect(src).toContain("delete from public.olympiad_question_rotations");
  });

  it("never deletes an answer row, a purchase, a package or a grade target", () => {
    for (const forbidden of [
      "delete from public.test_attempt_answers",
      "delete from public.olympiad_purchases",
      "delete from public.olympiad_packages",
      "delete from public.olympiad_package_grades",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });

  it("never disables a trigger or suspends replication-role enforcement", () => {
    // Both are banned by CLAUDE.md: they also suspend FK enforcement and
    // auditing, which is how migration 095 lost every row.
    const code = MIGRATION.split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(code).not.toContain("disable trigger");
    expect(code).not.toContain("session_replication_role");
    expect(MIGRATION).toContain("112: trg_question_delete_guard is missing or disabled");
  });

  it("hands the caller the media ids under the name the panel already sweeps", () => {
    // afterOlympiadDestructiveCall() reads `orphaned_media_ids`; a second
    // spelling would be two names for one array.
    expect(body(MIGRATION, FN)).toContain(
      "'orphaned_media_ids', v_purge->'orphaned_media_ids'",
    );
  });
});

describe("the canonical backport is the migration, character for character", () => {
  it("011 carries the two admin functions unchanged", () => {
    for (const fn of [FN, "admin_delete_olympiad_pool_question"]) {
      expect(body(SQL_011, fn), fn).toBe(body(MIGRATION, fn));
    }
  });

  it("015 carries the three olympiad helpers unchanged", () => {
    for (const fn of [
      "olympiad_grade_purchase_count",
      "olympiad_grade_pool_blocks",
      "olympiad_pool_purchase_blocks",
    ]) {
      expect(body(SQL_015, fn), fn).toBe(body(MIGRATION, fn));
    }
  });

  it("each function is defined exactly once, in exactly one canonical file", () => {
    // A stray second definition wins by run order, and 015 runs after 011 — so a
    // duplicate in the wrong file silently replaces the reviewed one.
    for (const fn of [FN, "admin_delete_olympiad_pool_question"]) {
      const decl = `create or replace function public.${fn}(`;
      expect(SQL_015, fn).not.toContain(decl);
      expect(SQL_011.split(decl).length - 1, fn).toBe(1);
    }
    for (const fn of [
      "olympiad_grade_purchase_count",
      "olympiad_pool_purchase_blocks",
      "olympiad_grade_pool_blocks",
    ]) {
      const decl = `create or replace function public.${fn}(`;
      expect(SQL_011, fn).not.toContain(decl);
      expect(SQL_015.split(decl).length - 1, fn).toBe(1);
    }
  });

  it("what lives in 011 is plpgsql, which is why it may read olympiad tables", () => {
    // 011 runs before the olympiad tables exist. A plpgsql body is raw-parsed
    // and survives; a `language sql` body is analyzed at CREATE time and would
    // fail the whole from-zero rebuild. olympiad_grade_purchase_count IS
    // `language sql`, which is exactly why it belongs to 015.
    for (const fn of [FN, "admin_delete_olympiad_pool_question"]) {
      const decl = SQL_011.indexOf(`create or replace function public.${fn}(`);
      const header = SQL_011.slice(decl, SQL_011.indexOf("\nas $$\n", decl));
      expect(header, fn).toContain("language plpgsql");
    }
  });

  it("backports the drop and the grants, but no transaction control or verify block", () => {
    expect(SQL_011).toContain(`drop function if exists public.${FN}(uuid, uuid[]);`);
    expect(SQL_011).toContain(
      `grant execute on function public.${FN}(uuid, uuid[], text, boolean)\n  to authenticated, service_role;`,
    );
    expect(SQL_011).toContain(
      "grant execute on function public.admin_delete_olympiad_pool_question(uuid, uuid)\n  to authenticated, service_role;",
    );
    expect(SQL_015).toContain(
      "grant execute on function public.olympiad_pool_purchase_blocks(uuid, uuid[]) to service_role;",
    );
    expect(SQL_011).not.toContain("112: purge_question_set is no longer service_role-only");
    expect(SQL_015).not.toContain("112: purge_question_set is no longer service_role-only");
  });
});

describe("013 validation check 101", () => {
  it("numbers the new check 101 and leaves 100 in place", () => {
    expect(SQL_013).toContain("'100_subscription_subjects_intact' as check_name");
    expect(SQL_013).toContain("'101_olympiad_bulk_purge_scoped' as check_name");
  });

  it("asserts the security posture of every function this feature added", () => {
    for (const row of [
      "('public.admin_delete_olympiad_questions(uuid,uuid[],text,boolean)', true)",
      "('public.admin_delete_olympiad_pool_question(uuid,uuid)', true)",
      "('public.purge_question_set(uuid[])', false)",
      "('public.olympiad_grade_purchase_count(uuid,uuid)', false)",
      "('public.olympiad_pool_purchase_blocks(uuid,uuid[])', false)",
    ]) {
      expect(SQL_013).toContain(row);
    }
    // The old signature is asserted ABSENT, never listed as a function.
    expect(SQL_013).toContain("('public.admin_delete_olympiad_questions(uuid,uuid[])', '', false)");
  });

  it("probes the shipped bodies, in both directions", () => {
    for (const needle of [
      "'public.is_admin()', true",
      "'public.purge_question_set(', true",
      "'question_not_in_package', true",
      "'question_gone', true",
      "'too_many_questions', true",
      "'confirmation_mismatch', true",
      "'public.olympiad_pool_purchase_blocks(', true",
      // The negative one: a question delete in this body IS the drift.
      "'delete from public.questions', false",
      // ONE purchase predicate, asserted from both callers…
      "('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', 'public.olympiad_grade_purchase_count(', true)",
      "('public.olympiad_pool_purchase_blocks(uuid,uuid[])', 'public.olympiad_grade_purchase_count(', true)",
      // …and ANY status still counts now that the predicate moved.
      "('public.olympiad_grade_purchase_count(uuid,uuid)', 'pu.status', false)",
      // The per-row button delegates rather than re-implementing.
      "('public.admin_delete_olympiad_pool_question(uuid,uuid)', 'public.admin_delete_olympiad_questions(', true)",
    ]) {
      expect(SQL_013).toContain(needle);
    }
    expect(SQL_013).toContain("failed_invariants");
  });

  it("check 96's active-only probe is not left passing for a moved predicate", () => {
    // 96 asserts olympiad_grade_pool_blocks does NOT filter purchases to
    // status = 'active'. That probe now passes trivially, because the predicate
    // lives in the helper — so 101 has to carry the same claim forward or the
    // invariant quietly stops being tested anywhere.
    expect(SQL_013).toContain(
      "('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', 'pu.status = ''active''', false)",
    );
    expect(SQL_013).toContain("('public.olympiad_grade_purchase_count(uuid,uuid)', 'pu.status', false)");
  });
});

describe("transaction shape", () => {
  it("gives the migration exactly one begin and one commit", () => {
    // Migration 095 self-transacted inside a rebuild and its inner commit
    // committed the OUTER transaction, including a `drop schema`.
    const tx = MIGRATION.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm) || [];
    expect(tx.map((x) => x.trim())).toEqual(["begin;", "commit;"]);
    expect(MIGRATION).not.toContain("\\i ");
  });

  it("leaves the canonical files free of transaction control", () => {
    for (const sql of [SQL_011, SQL_013, SQL_015]) {
      expect(sql.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toBeNull();
    }
  });

  it("keeps the dollar-quote delimiters intact in every file it touched", () => {
    // A JS replacement string containing `$$` silently truncates the delimiter;
    // that bug shipped a broken canonical 015 in this repository once.
    for (const [name, sql] of [
      ["112", MIGRATION],
      ["011", SQL_011],
      ["013", SQL_013],
      ["015", SQL_015],
    ] as const) {
      expect(sql.match(/^as \$\s*$/m), name).toBeNull();
      expect(sql.match(/^\$\s*;\s*$/m), name).toBeNull();
    }
  });
});
