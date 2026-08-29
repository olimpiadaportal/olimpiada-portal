// PHYSICS IS A GRADES 7-11 SUBJECT, AND THE RULE THAT SAYS SO NOW LIVES IN ONE
// PLACE (migration 155).
//
// WHY THESE TESTS EXIST. The rule was already here — hand-written, client-side,
// and pasted byte-identically into lib/childSubjects.ts and app/child/page.tsx.
// It carried three defects, and the one that mattered is the one a test would
// have caught immediately: it ran INSIDE the `if (freeNow)` branch, so the only
// children ever grade-filtered were the ones paying nothing. A child on a real
// subscription, and a parent buying for that child, saw Fizika at every grade.
//
// So the assertions below are deliberately split:
//   * the pure half (taughtSubjectSet / keepTaughtSubjects) pins the "unknown =>
//     do not filter" contract, because the tempting simplification — treat an
//     empty answer as "no subjects" — turns one failed read into a family with
//     an empty catalogue;
//   * getChildSubjectAccess is exercised on the SUBSCRIBED path with the free
//     window OFF. That is defect (i), and it is the reason this file mocks a
//     Supabase client rather than testing the pure helper alone;
//   * the SQL half is asserted by reading the migration, in the style of
//     lib/__tests__/reinstateSubject.test.ts — the client filter is cosmetic if
//     the database rule ever drops `status = 'active'` or starts demanding an
//     exact grade match again.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keepTaughtSubjects, taughtSubjectSet } from "@/lib/gradeSubjects";

// childSubjects.ts is a server module; vitest runs in plain node, where the
// `server-only` package throws on import by design.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/paymentMode", () => ({ isGiveawayActive: vi.fn(async () => false) }));
vi.mock("@/lib/freeAccess", () => ({ getChildFreeAccessActive: vi.fn(async () => false) }));
vi.mock("@/lib/freeTrial", () => ({
  getMyFreeTrial: vi.fn(async () => ({
    active: false,
    used: false,
    endsAt: null,
    subjects: [],
  })),
}));

const { createClient } = await import("@/lib/supabase/server");
const { isGiveawayActive } = await import("@/lib/paymentMode");
const { getChildSubjectAccess } = await import("@/lib/childSubjects");

const CHILD = "00000000-0000-4000-8000-000000000001";
const MATH = "11111111-1111-4111-8111-111111111111";
const FIZIKA = "22222222-2222-4222-8222-222222222222";
const FUTURE = "2099-01-01T00:00:00.000Z";

/** Minimal thenable query builder — every chain this module uses ends in a
 *  promise of the same canned result. */
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  const done = () => Promise.resolve(result);
  Object.assign(b, {
    select: self,
    eq: self,
    in: done,
    maybeSingle: done,
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(ok, err),
  });
  return b;
}

/** A grade-3 child on a LIVE subscription that covers Maths and Physics. */
function stubClient(taughtIds: string[]) {
  return {
    from: (table: string) => {
      if (table === "students") {
        return builder({ data: { access_status: "active", grade_id: "grade-3" } });
      }
      if (table === "child_subscriptions") {
        return builder({
          data: [
            {
              status: "active",
              current_period_end: FUTURE,
              subscription_subjects: [
                {
                  remove_at: null,
                  current_period_end: FUTURE,
                  subjects: { id: MATH, code: "math", name: "Riyaziyyat" },
                },
                {
                  remove_at: null,
                  current_period_end: FUTURE,
                  subjects: { id: FIZIKA, code: "fizika", name: "Fizika" },
                },
              ],
            },
          ],
        });
      }
      if (table === "subjects") {
        return builder({
          data: [
            { id: MATH, code: "math", name: "Riyaziyyat" },
            { id: FIZIKA, code: "fizika", name: "Fizika" },
          ],
        });
      }
      return builder({ data: [] });
    },
    rpc: vi.fn(async () => ({ data: taughtIds, error: null })),
  };
}

describe("taughtSubjectSet — unknown must never mean 'no subjects'", () => {
  it("builds a set from the RPC's bare uuid strings", () => {
    const set = taughtSubjectSet([MATH, FIZIKA]);
    expect(set?.has(FIZIKA)).toBe(true);
    expect(set?.size).toBe(2);
  });

  it("accepts the single-column object shape too", () => {
    expect(taughtSubjectSet([{ subjects_taught_to_grade: MATH }])?.has(MATH)).toBe(true);
  });

  it("returns null on an error, an empty answer, or a non-array", () => {
    expect(taughtSubjectSet([MATH], { message: "boom" })).toBeNull();
    expect(taughtSubjectSet([])).toBeNull();
    expect(taughtSubjectSet(null)).toBeNull();
  });
});

describe("keepTaughtSubjects", () => {
  const list = [{ id: MATH }, { id: FIZIKA }];

  it("drops a subject the grade does not study", () => {
    expect(keepTaughtSubjects(list, new Set([MATH]))).toEqual([{ id: MATH }]);
  });

  it("passes the list through untouched when the rule is unknown", () => {
    expect(keepTaughtSubjects(list, null)).toEqual(list);
  });
});

describe("getChildSubjectAccess — the grade filter applies off the free path", () => {
  beforeEach(() => {
    vi.mocked(isGiveawayActive).mockResolvedValue(false);
  });

  it("hides fizika from a SUBSCRIBED grade-3 child (defect (i): the filter used to run only during a free window)", async () => {
    vi.mocked(createClient).mockResolvedValue(stubClient([MATH]) as never);
    const { subjects, freeNow, hasAccess } = await getChildSubjectAccess(CHILD);
    expect(freeNow).toBe(false);
    expect(hasAccess).toBe(true);
    expect(subjects.map((s) => s.id)).toEqual([MATH]);
  });

  it("keeps fizika for a subscribed grade-9 child", async () => {
    vi.mocked(createClient).mockResolvedValue(stubClient([MATH, FIZIKA]) as never);
    const { subjects } = await getChildSubjectAccess(CHILD);
    expect(subjects.map((s) => s.id).sort()).toEqual([MATH, FIZIKA].sort());
  });

  it("still filters during a free window, where every active subject is merged in", async () => {
    vi.mocked(isGiveawayActive).mockResolvedValue(true);
    vi.mocked(createClient).mockResolvedValue(stubClient([MATH]) as never);
    const { subjects, freeNow } = await getChildSubjectAccess(CHILD);
    expect(freeNow).toBe(true);
    expect(subjects.map((s) => s.id)).toEqual([MATH]);
  });

  it("leaves the list alone when the rule cannot be resolved, rather than emptying it", async () => {
    const client = stubClient([]);
    client.rpc = vi.fn(async () => ({ data: null as never, error: { message: "x" } as never }));
    vi.mocked(createClient).mockResolvedValue(client as never);
    const { subjects } = await getChildSubjectAccess(CHILD);
    expect(subjects.map((s) => s.id).sort()).toEqual([MATH, FIZIKA].sort());
  });
});

describe("the SQL rule the clients depend on", () => {
  const sql = readFileSync(
    join(
      resolve(process.cwd(), ".."),
      "supabase",
      "sql",
      "migrations",
      "2026_08_29_155_subject_grade_availability.sql",
    ),
    "utf8",
  );

  it("filters topics to active ones — defect (ii): an archived topic kept a subject on offer", () => {
    expect(sql).toContain("t.status = 'active'");
  });

  it("treats a shared (grade-less) topic as available to every grade — defect (iii)", () => {
    expect(sql).toContain("t.grade_id is null or t.grade_id = p_grade");
  });

  it("revokes execute from anon and public explicitly, not just public", () => {
    for (const fn of [
      "public.subjects_taught_to_grade(uuid)",
      "public.subject_taught_to_grade(uuid, uuid)",
      "public.my_taught_subjects()",
    ]) {
      expect(sql).toContain(`revoke all on function ${fn} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${fn} to authenticated, service_role;`);
    }
  });
});
