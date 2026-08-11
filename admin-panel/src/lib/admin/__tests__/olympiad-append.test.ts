// appendOlympiadGradeQuestions — the ONE bulk path that reaches a package's own
// grade (migration 108). Security-sensitive: the grade id arrives in the posted
// form, and before the file is even read it must be proved to be a TARGET grade
// of THIS package, then handed to the RPC explicitly.
//
// Explicitly, because since 108 the RPC's `p_grade_id default null` falls back
// to the legacy olympiad_packages.grade_id. Before 108 the creation-only raise
// made that fallback harmless; now it would silently append into that legacy
// grade, so "the action always passes a grade id" is a rule worth pinning.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { olympiadLocalStrings } from "../olympiad-strings";
import { withLocalStrings } from "../question-flow-labels";

const requireAdmin = vi.fn(async () => ({ profileId: "admin-profile" }));
const writeAuditLog = vi.fn(async (_entry: unknown) => {});
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/guards", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: (a: unknown) => writeAuditLog(a) }));
// getT returns the key so a messages.ts string is recognisable as such; the two
// LOCAL dictionaries below are the real ones, because the action resolves most
// of its messages through them.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

/** Records every rpc call so the test can assert what reached the DB. */
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let packageExists = true;
let targetGrades: { grade_id: string; grades: { id: string; name: string; level: number } }[] = [];

// Minimal PostgREST-shaped stub: only the queries this action makes.
function makeSupabase() {
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const self = () => builder as never;
      Object.assign(builder, {
        select: self,
        eq: self,
        order: self,
        maybeSingle: async () =>
          table === "olympiad_packages"
            ? { data: packageExists ? { id: "pkg" } : null }
            : { data: null },
        // packageGradeRows awaits the builder itself.
        then(resolve: (v: { data: unknown }) => unknown) {
          return Promise.resolve(
            resolve({ data: table === "olympiad_package_grades" ? targetGrades : [] }),
          );
        },
      });
      return builder as never;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return {
        data: { total: 1, successful: 1, failed: 0, errors: [] },
        error: null,
      };
    },
  };
  return client;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeSupabase() }));

// The action resolves its messages through the same two local dictionaries the
// UI does, so the expectations are built from them rather than hardcoded — a
// wording change must not turn into a red test.
const lt = olympiadLocalStrings("az");
const tq = withLocalStrings((k: string) => k, "az");

const PKG = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const GRADE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const OTHER_GRADE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

/** One structurally valid olympiad row (5 options, exactly one correct). */
const VALID_ROW = {
  primary_locale: "az",
  translations: { az: { body: "2 + 2 = ?" } },
  options: [
    { is_correct: true, order_index: 0, text: { az: "4" } },
    { is_correct: false, order_index: 1, text: { az: "3" } },
    { is_correct: false, order_index: 2, text: { az: "5" } },
    { is_correct: false, order_index: 3, text: { az: "6" } },
    { is_correct: false, order_index: 4, text: { az: "7" } },
  ],
};

function form(over: Record<string, string> = {}, rows: unknown[] = [VALID_ROW]): FormData {
  const fd = new FormData();
  fd.set("__id", over.__id ?? PKG);
  fd.set("grade_id", over.grade_id ?? GRADE);
  fd.set("question_mode", over.question_mode ?? "text");
  fd.set(
    "file",
    new File([JSON.stringify(rows)], "import.json", { type: "application/json" }),
  );
  return fd;
}

async function append(fd: FormData) {
  const { appendOlympiadGradeQuestions } = await import("../olympiad");
  return appendOlympiadGradeQuestions(null, fd);
}

beforeEach(() => {
  rpcCalls.length = 0;
  packageExists = true;
  targetGrades = [
    { grade_id: GRADE, grades: { id: GRADE, name: "3-cü sinif", level: 3 } },
  ];
  requireAdmin.mockClear();
  writeAuditLog.mockClear();
});

describe("grade re-verification happens before anything is read", () => {
  it("refuses a grade this package does not target", async () => {
    const res = await append(form({ grade_id: OTHER_GRADE }));
    expect(res).toEqual({ error: lt("oly2.err.grades") });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a malformed grade id without touching the database", async () => {
    for (const bad of ["", "not-a-uuid", "1 OR 1=1"]) {
      const res = await append(form({ grade_id: bad }));
      expect(res).toEqual({ error: "err.server" });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a malformed package id", async () => {
    const res = await append(form({ __id: "nope" }));
    expect(res).toEqual({ error: "err.server" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a package that does not exist", async () => {
    packageExists = false;
    const res = await append(form());
    expect(res).toEqual({ error: "err.server" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("authorizes FIRST — requireAdmin runs even for a rejected grade", async () => {
    await append(form({ grade_id: OTHER_GRADE }));
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("the import type is mandatory and never defaulted", () => {
  it("refuses a missing or unknown mode", async () => {
    for (const mode of ["", "TEXT", "zip", "images"]) {
      const res = await append(form({ question_mode: mode }));
      expect(res).toEqual({ error: tq("bulk.mode.required") });
    }
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("the target grade is passed to the RPC explicitly", () => {
  it("sends p_grade_id rather than relying on the legacy package grade", async () => {
    const res = await append(form());
    expect(res).toEqual({ ok: true, result: { total: 1, successful: 1, failed: 0, errors: [] } });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("bulk_insert_olympiad_package_questions");
    expect(rpcCalls[0].args.p_grade_id).toBe(GRADE);
    expect(rpcCalls[0].args.p_package_id).toBe(PKG);
  });

  it("injects the TARGET grade's level into every row, ignoring meta.grade_level", async () => {
    // A stray grade_level in the file must never decide where a question lands.
    const res = await append(form({}, [{ ...VALID_ROW, meta: { grade_level: 11 } }]));
    expect(res).toMatchObject({ ok: true });
    const items = rpcCalls[0].args.p_questions as { meta: { grade_level: number } }[];
    expect(items[0].meta.grade_level).toBe(3);
  });

  it("never reaches the RPC when every row is invalid", async () => {
    const res = await append(form({}, [{ primary_locale: "az", translations: {}, options: [] }]));
    expect(res).toMatchObject({
      error: lt("oly2.err.gradeFiles").replace("{grades}", "3-cü sinif"),
    });
    expect(rpcCalls).toHaveLength(0);
  });
});
