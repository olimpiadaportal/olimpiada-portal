// The panel half of migration 111: the server actions behind every guarded
// deletion, plus the copy they render.
//
// What is pinned here is the set of properties that fail SILENTLY. An action
// that read FormData before its guard still works for an admin; a token check
// that happened only inside the RPC still refuses, but only after the
// destructive function has taken its lock and read its scope; a hint the SQL
// raises but the dictionary never learned still renders — as "server error",
// which tells the admin nothing about a refusal that was in fact deliberate and
// explainable. None of those show up in a browser click-through.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { deletionHintKey, parseDeletionBlocks } from "../deletion-hints";

// Order of the two things that must not swap: authorization and reading input.
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
const GRADE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SUBJECT = "9f8c1d2e-1111-4222-8333-444455556666";
const PKG_CODE = "riyaziyyat-olimpiada-2026";
const SUBJECT_CODE = "math";

// ---- Supabase stub -------------------------------------------------------
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const fromCalls: string[] = [];
const storageRemoved: { bucket: string; paths: string[] }[] = [];
const mediaRowsDeleted: string[][] = [];
let codeRow: { code: string } | null = { code: PKG_CODE };
let rpcResults: Record<string, { data: unknown; error: unknown }> = {};

function codeBuilder() {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({
      data: codeRow,
      error: codeRow ? null : { code: "PGRST116" },
    }),
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
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      if (mode === "select") {
        return Promise.resolve(
          resolve({
            data: ids.map((id) => ({ id, bucket: "olympiad-media", path: `pool/${id}.png` })),
            error: null,
          }),
        );
      }
      mediaRowsDeleted.push(ids);
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  });
  return b as never;
}

function makeSupabase() {
  return {
    from(table: string) {
      fromCalls.push(table);
      return table === "media_assets" ? mediaBuilder() : codeBuilder();
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
function guardError(hint: string, blocks: { hint: string; count?: number }[]) {
  return {
    code: "23514",
    hint,
    details: JSON.stringify({ blocks }),
    message: 'new row for relation "x" violates check constraint',
  };
}

async function olympiad() {
  return await import("../olympiad");
}
async function subject() {
  return await import("../subject-deletion");
}

beforeEach(() => {
  order.length = 0;
  rpcCalls.length = 0;
  fromCalls.length = 0;
  storageRemoved.length = 0;
  mediaRowsDeleted.length = 0;
  codeRow = { code: PKG_CODE };
  rpcResults = {
    admin_delete_olympiad_package: {
      data: {
        package_id: PKG,
        package_deleted: true,
        package_archived: false,
        deleted_questions: 40,
        archived_questions: 0,
        retained_questions: 0,
        orphaned_media_ids: ["11111111-1111-4111-8111-111111111111"],
        media_truncated: false,
      },
      error: null,
    },
    admin_delete_olympiad_grade_pool: {
      data: {
        package_id: PKG,
        grade_id: GRADE,
        grade_dropped: true,
        deleted_questions: 12,
        archived_questions: 3,
        retained_questions: 3,
        reset_rotations: 2,
        package_demoted: false,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    },
    admin_unarchive_olympiad_package: {
      data: { package_id: PKG, status: "inactive" },
      error: null,
    },
    admin_purge_subject_questions: {
      data: {
        subject_id: SUBJECT,
        deleted_questions: 7,
        archived_questions: 2,
        retained_questions: 2,
        already_archived: 0,
        repaired_practice_sets: 1,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    },
    admin_delete_subject: {
      data: {
        subject_id: SUBJECT,
        subject_deleted: true,
        subject_archived: false,
        deleted_questions: 0,
        retained_questions: 0,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    },
  };
  requireAdmin.mockClear();
  writeAuditLog.mockClear();
  revalidatePath.mockClear();
});

// ---------------------------------------------------------------------------

describe("authorization happens before any client input is read", () => {
  it.each([
    ["deleteOlympiadPackageAction", { __id: PKG, __code: PKG_CODE }],
    ["deleteOlympiadGradePoolAction", { __id: PKG, grade_id: GRADE, __code: PKG_CODE, drop_grade: "1" }],
    ["unarchiveOlympiadPackageAction", { __id: PKG }],
  ])("%s guards first", async (name, fields) => {
    const mod = (await olympiad()) as unknown as Record<string, any>;
    await mod[name](null, form(fields));
    expect(order[0]).toBe("guard");
    expect(order.filter((x) => x === "guard")).toHaveLength(1);
  });

  it.each([
    ["purgeSubjectQuestions", { __id: SUBJECT, __code: SUBJECT_CODE }],
    ["deleteSubject", { __id: SUBJECT, __code: SUBJECT_CODE }],
  ])("%s guards first", async (name, fields) => {
    codeRow = { code: SUBJECT_CODE };
    const mod = (await subject()) as unknown as Record<string, any>;
    await mod[name](null, form(fields));
    expect(order[0]).toBe("guard");
  });

  it("the previews guard before validating their ids", async () => {
    const { loadOlympiadPackageDeletionPreview } = await olympiad();
    await loadOlympiadPackageDeletionPreview("not-a-uuid");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("a malformed id never reaches the database", () => {
  // Surrounding whitespace is deliberately absent: the actions trim their form
  // fields, so " <uuid> " is a VALID id, not a rejection case.
  const BAD = ["", "not-a-uuid", "1 OR 1=1", "3f2504e0-4f89-11d3-9a0c", `${PKG}x`];

  it("package delete refuses every malformed id", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    for (const bad of BAD) {
      const res = await deleteOlympiadPackageAction(null, form({ __id: bad, __code: PKG_CODE }));
      expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    }
    expect(rpcCalls).toHaveLength(0);
    expect(fromCalls).toHaveLength(0);
  });

  it("grade pool delete refuses a malformed grade id even with a valid package", async () => {
    const { deleteOlympiadGradePoolAction } = await olympiad();
    for (const bad of BAD) {
      const res = await deleteOlympiadGradePoolAction(
        null,
        form({ __id: PKG, grade_id: bad, __code: PKG_CODE, drop_grade: "1" }),
      );
      expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("unarchive refuses a malformed id", async () => {
    const { unarchiveOlympiadPackageAction } = await olympiad();
    const res = await unarchiveOlympiadPackageAction(null, form({ __id: "nope" }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    expect(rpcCalls).toHaveLength(0);
  });

  it("the previews return null rather than querying", async () => {
    const {
      loadOlympiadPackageDeletionPreview,
      loadOlympiadGradePoolDeletionPreview,
    } = await olympiad();
    expect(await loadOlympiadPackageDeletionPreview("nope")).toBeNull();
    expect(await loadOlympiadGradePoolDeletionPreview(PKG, "nope")).toBeNull();
    expect(await loadOlympiadGradePoolDeletionPreview("nope", GRADE)).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("an unconfirmed deletion never becomes a destructive call", () => {
  const MISMATCH = {
    ok: false,
    error: "del.err.blocked",
    blocks: ["del.hint.confirmationMismatch"],
  };

  it("package delete refuses a missing token without querying at all", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: "" }));
    expect(res).toEqual(MISMATCH);
    expect(rpcCalls).toHaveLength(0);
    // An empty token is refused on its own terms — not even the code lookup runs.
    expect(fromCalls).toHaveLength(0);
  });

  it("package delete refuses a wrong token before the RPC", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(
      null,
      form({ __id: PKG, __code: "riyaziyyat-olimpiada-2025" }),
    );
    expect(res).toEqual(MISMATCH);
    expect(rpcCalls).toHaveLength(0);
    expect(fromCalls).toEqual(["olympiad_packages"]);
  });

  it("grade pool delete refuses a wrong token on both branches", async () => {
    const { deleteOlympiadGradePoolAction } = await olympiad();
    for (const drop of ["1", "0"]) {
      const res = await deleteOlympiadGradePoolAction(
        null,
        form({ __id: PKG, grade_id: GRADE, __code: "wrong", drop_grade: drop }),
      );
      expect(res).toEqual(MISMATCH);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("subject purge and delete refuse a wrong token", async () => {
    codeRow = { code: SUBJECT_CODE };
    const { purgeSubjectQuestions, deleteSubject } = await subject();
    expect(await purgeSubjectQuestions(null, form({ __id: SUBJECT, __code: "maths" }))).toEqual(
      MISMATCH,
    );
    expect(await deleteSubject(null, form({ __id: SUBJECT, __code: "" }))).toEqual(MISMATCH);
    expect(rpcCalls).toHaveLength(0);
  });

  it("a correct token reaches the RPC, which is handed the token again", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(res).toMatchObject({ ok: true, message: "del.done.packageDeleted" });
    expect(rpcCalls).toHaveLength(1);
    // The pre-check is a cheap refusal, NOT a replacement: the database still
    // compares p_expected_code under its own lock.
    expect(rpcCalls[0].args.p_expected_code).toBe(PKG_CODE);
  });

  it("an unreadable code falls through to the RPC instead of blaming the typist", async () => {
    // A package that no longer exists must answer "not found", not "wrong code".
    codeRow = null;
    const { deleteOlympiadPackageAction } = await olympiad();
    await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(rpcCalls).toHaveLength(1);
  });
});

describe("the destructive flag is read strictly", () => {
  it("only the literal '1' detaches the grade", async () => {
    const { deleteOlympiadGradePoolAction } = await olympiad();
    for (const [value, expected] of [
      ["1", true],
      ["0", false],
      ["", false],
      ["true", false],
      ["yes", false],
    ] as const) {
      rpcCalls.length = 0;
      await deleteOlympiadGradePoolAction(
        null,
        form({ __id: PKG, grade_id: GRADE, __code: PKG_CODE, drop_grade: value }),
      );
      expect(rpcCalls[0].args.p_drop_grade, `drop_grade=${value}`).toBe(expected);
    }
  });
});

describe("every destructive call is audited and sweeps its orphaned media", () => {
  it("package delete writes a warning row with counts only", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = writeAuditLog.mock.calls[0][0] as Record<string, any>;
    expect(entry.severity).toBe("warning");
    expect(entry.action).toBe("admin.olympiad.package_delete");
    expect(entry.targetTable).toBe("olympiad_packages");
    expect(entry.targetId).toBe(PKG);
    expect(entry.metadata.deleted).toBe(40);
    // Never the deleted content itself — an audit row is a record, not a backup.
    expect(JSON.stringify(entry.metadata)).not.toContain("body");
  });

  it("the returned orphan ids lose their bucket objects AND their rows", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(storageRemoved).toEqual([
      { bucket: "olympiad-media", paths: ["pool/11111111-1111-4111-8111-111111111111.png"] },
    ]);
    expect(mediaRowsDeleted).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });

  it("archiving instead of deleting is audited as its own action", async () => {
    rpcResults.admin_delete_olympiad_package = {
      data: {
        package_id: PKG,
        package_deleted: false,
        package_archived: true,
        reason: "answered_questions_retained",
        deleted_questions: 10,
        archived_questions: 4,
        retained_questions: 4,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    };
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    // The button must not claim a delete that did not happen.
    expect(res).toEqual({ ok: true, message: "del.done.packageArchived" });
    const entry = writeAuditLog.mock.calls[0][0] as Record<string, any>;
    expect(entry.action).toBe("admin.olympiad.archive_instead_of_delete");
    expect(entry.metadata.reason).toBe("answered_questions_retained");
  });

  it("only the delete branch navigates away from the page it deleted", async () => {
    const { deleteOlympiadPackageAction } = await olympiad();
    const deleted = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(deleted).toMatchObject({ redirectTo: "/olympiad" });
  });

  it("an auto-demoted package says so in the success message", async () => {
    rpcResults.admin_delete_olympiad_grade_pool = {
      data: {
        package_id: PKG,
        grade_id: GRADE,
        grade_dropped: false,
        deleted_questions: 9,
        archived_questions: 1,
        retained_questions: 1,
        reset_rotations: 0,
        package_demoted: true,
        orphaned_media_ids: [],
        media_truncated: false,
      },
      error: null,
    };
    const { deleteOlympiadGradePoolAction } = await olympiad();
    const res = await deleteOlympiadGradePoolAction(
      null,
      form({ __id: PKG, grade_id: GRADE, __code: PKG_CODE, drop_grade: "0" }),
    );
    expect(res).toMatchObject({ ok: true });
    expect((res as { message: string }).message).toContain("del.done.demoted");
  });

  it("unarchive is INFO, not warning — it destroys nothing", async () => {
    const { unarchiveOlympiadPackageAction } = await olympiad();
    const res = await unarchiveOlympiadPackageAction(null, form({ __id: PKG }));
    expect(res).toEqual({ ok: true, message: "del.done.restored" });
    const entry = writeAuditLog.mock.calls[0][0] as Record<string, any>;
    expect(entry.severity).toBe("info");
    expect(entry.action).toBe("admin.olympiad.unarchive");
    // Restored to INACTIVE: activating re-fires the pool guard and would put
    // the package straight back on sale under a possibly expired window.
    expect(entry.metadata.status).toBe("inactive");
  });
});

describe("a refusal renders its own reasons, never a raw database string", () => {
  it("one blocking reason becomes one sentence", async () => {
    rpcResults.admin_delete_olympiad_package = {
      data: null,
      error: guardError("package_has_purchases", [{ hint: "package_has_purchases", count: 3 }]),
    };
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.packageHasPurchases"],
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("several reasons all arrive at once, so clearing one is not a guessing game", async () => {
    rpcResults.admin_delete_subject = {
      data: null,
      error: guardError("subject_not_deletable", [
        { hint: "subject_in_subscriptions", count: 4 },
        { hint: "subject_has_topics", count: 12 },
        { hint: "subject_has_attempts", count: 91 },
      ]),
    };
    codeRow = { code: SUBJECT_CODE };
    const { deleteSubject } = await subject();
    const res = await deleteSubject(null, form({ __id: SUBJECT, __code: SUBJECT_CODE }));
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: [
        "del.hint.subjectInSubscriptions",
        "del.hint.subjectHasTopics",
        "del.hint.subjectHasAttempts",
      ],
    });
  });

  it("a raw Postgres message never reaches the client", async () => {
    rpcResults.admin_unarchive_olympiad_package = {
      data: null,
      error: {
        code: "42883",
        hint: null,
        details: null,
        message: 'function public.admin_unarchive_olympiad_package(uuid) does not exist',
      },
    };
    const { unarchiveOlympiadPackageAction } = await olympiad();
    const res = await unarchiveOlympiadPackageAction(null, form({ __id: PKG }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    expect(JSON.stringify(res)).not.toContain("does not exist");
  });

  it("not_archived is a named reason, not a generic failure", async () => {
    rpcResults.admin_unarchive_olympiad_package = {
      data: null,
      error: { code: "23514", hint: "not_archived", details: null, message: "x" },
    };
    const { unarchiveOlympiadPackageAction } = await olympiad();
    const res = await unarchiveOlympiadPackageAction(null, form({ __id: PKG }));
    expect(res).toEqual({
      ok: false,
      error: "del.err.blocked",
      blocks: ["del.hint.notArchived"],
    });
  });

  it("an unknown hint is dropped rather than printed", async () => {
    rpcResults.admin_delete_olympiad_package = {
      data: null,
      error: guardError("brand_new_reason_the_ui_never_learned", [
        { hint: "brand_new_reason_the_ui_never_learned", count: 1 },
      ]),
    };
    const { deleteOlympiadPackageAction } = await olympiad();
    const res = await deleteOlympiadPackageAction(null, form({ __id: PKG, __code: PKG_CODE }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
  });

  it("a malformed DETAIL still yields the HINT's sentence", async () => {
    const blocks = parseDeletionBlocks({ hint: "live_attempts", details: "{not json" });
    expect(blocks).toEqual([{ hint: "live_attempts" }]);
  });
});

// ---------------------------------------------------------------------------

// Every hint migration 111 can raise, taken from the SQL rather than from the
// map under test — a hint added to one and not the other is exactly the drift
// that turns a deliberate refusal into "server error".
const SQL_HINTS = [
  // olympiad package
  "package_has_purchases",
  "package_is_active",
  "package_not_deletable",
  "not_archived",
  // olympiad grade pool
  "grade_pool_not_deletable",
  "last_grade",
  "grade_has_purchases",
  "grade_has_purchases_purge",
  // subject
  "subject_not_deletable",
  "subject_in_subscriptions",
  "subject_has_billing_history",
  "subject_has_attempts",
  "subject_has_points",
  "subject_in_olympiad_packages",
  "subject_has_topics",
  "subject_has_questions",
  "subject_has_round_attempts",
  // shared
  "live_attempts",
  "confirmation_mismatch",
  "answered_questions_retained",
  // a consequence, not a block
  "subject_purge_active_subscribers",
];

// Every hint literal actually present in the migration, read off the file.
//
// SQL_HINTS above is hand-written so the it.each cases stay readable, and a
// hand-written list is exactly the thing that silently falls behind the SQL.
// The set below is parsed from migration 111 itself and compared against it, so
// the "taken from the SQL" claim is checked rather than trusted.
function hintsInMigration(): Set<string> {
  const src = readFileSync(
    resolve(process.cwd(), "..", "supabase/sql/migrations/2026_08_12_111_guarded_deletion.sql"),
    "utf8",
  );
  // Comment lines are dropped first: these functions are heavily commented and
  // the prose names hints it does not raise (the `comment on function` bodies
  // list them all), which would otherwise inflate the set with false members.
  const code = src.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const found = new Set<string>();
  //   jsonb_build_object('hint', 'x')   — the previews' blocked_by[] entries
  for (const m of code.matchAll(/'hint'\s*,\s*'([a-z_]+)'/g)) found.add(m[1]);
  //   raise … using hint = 'x'          — the mutations' refusals
  for (const m of code.matchAll(/hint\s*=\s*'([a-z_]+)'/g)) found.add(m[1]);
  //   'reason', 'x'                     — the archive-instead-of-delete outcome
  for (const m of code.matchAll(/'reason'\s*,\s*'([a-z_]+)'/g)) found.add(m[1]);
  //   hint = case when … then 'x' else 'y' end — the one-reason/generic split
  //   and the drop-vs-purge purchase pair. `v_blocks->0->>'hint'` appears
  //   inside these, so the literal 'hint' is excluded.
  for (const m of code.matchAll(/(?:'hint'\s*,|hint\s*=)\s*case[\s\S]*?end/g)) {
    for (const s of m[0].matchAll(/'([a-z_]+)'/g)) if (s[1] !== "hint") found.add(s[1]);
  }
  return found;
}

describe("every hint the SQL can raise has trilingual copy", () => {
  // The guard on the whole family: a hint added to the SQL without copy would
  // otherwise reach the admin as a bare "server error" (toFailure falls back to
  // err.server when no block maps), which is precisely the deliberate,
  // explainable refusal this migration exists to make legible.
  it("the SQL raises exactly the hints this suite claims it does", () => {
    expect([...hintsInMigration()].sort()).toEqual([...SQL_HINTS].sort());
  });

  it.each(SQL_HINTS)("%s maps to a key", (hint) => {
    expect(deletionHintKey(hint)).toBeTruthy();
  });

  it.each(SQL_HINTS)("%s reads naturally in az, en and ru", (hint) => {
    const key = deletionHintKey(hint) as string;
    const az = messages.az[key];
    const en = messages.en[key];
    const ru = messages.ru[key];
    for (const [loc, text] of [["az", az], ["en", en], ["ru", ru]] as const) {
      expect(text, `${key} is missing in ${loc}`).toBeTruthy();
      // A whole sentence, not a label: every refusal has to name the reason AND
      // the way forward (archiving), which does not fit in two words.
      expect(text.length, `${key} in ${loc} is too short to explain anything`)
        .toBeGreaterThan(30);
    }
    // Three distinct languages, not one string copied across the locales.
    expect(new Set([az, en, ru]).size).toBe(3);
  });

  it("an unknown hint deliberately maps to nothing", () => {
    expect(deletionHintKey("something_new")).toBeNull();
    expect(deletionHintKey("")).toBeNull();
    expect(deletionHintKey(null)).toBeNull();
  });
});

describe("the deletion dialogs are fully translated", () => {
  const delKeys = (loc: "az" | "en" | "ru") =>
    Object.keys(messages[loc]).filter((k) => k.startsWith("del."));

  it("az, en and ru carry exactly the same del.* keys", () => {
    const az = delKeys("az").sort();
    expect(delKeys("en").sort()).toEqual(az);
    expect(delKeys("ru").sort()).toEqual(az);
    expect(az.length).toBeGreaterThan(40);
  });

  it("no del.* string is empty in any locale", () => {
    for (const loc of ["az", "en", "ru"] as const) {
      for (const k of delKeys(loc)) {
        expect(messages[loc][k].trim(), `${k} in ${loc}`).not.toBe("");
      }
    }
  });

  // The dialog substitutes these; a placeholder present in one locale and
  // missing in another prints a number in one language and swallows it in the
  // other.
  it("placeholders match across locales", () => {
    const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const k of delKeys("az")) {
      const az = placeholders(messages.az[k]);
      expect(placeholders(messages.en[k]), `${k} en`).toBe(az);
      expect(placeholders(messages.ru[k]), `${k} ru`).toBe(az);
    }
  });
});
