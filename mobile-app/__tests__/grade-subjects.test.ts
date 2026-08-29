// PHYSICS IS A GRADES 7-11 SUBJECT, AND THIS APP USED TO OFFER IT AT EVERY
// GRADE (migration 155).
//
// REPORTED: the web hides Fizika for a younger child; both mobile apps still
// listed it, and tapping it landed on an empty "no questions" screen. The rule
// existed only as a hand-written client effect in two WEB files and was never
// ported here — and those copies had a defect of their own that this app must
// not inherit: the filter ran inside the free-window branch, so a child on a
// real subscription was never grade-filtered at all.
//
// So every list builder in this app is asserted below, on the SUBSCRIBED path
// as well as the free one, because "grade 3 never receives fizika" is only true
// if it is true of all of them. The rule itself is answered by the database;
// what these tests pin is that each builder asks and applies the answer.
import {
  fetchActiveSubjects,
  fetchSubjectsPricing,
  fetchTaughtSubjectIds,
  keepTaughtSubjects,
  taughtSubjectSet,
} from "@/lib/data";
import { fetchMySubjects, fetchPricedSubjects } from "@/features/arena/queries";
import { fetchSubjectAccess } from "@/features/tests/api";
import { supabase } from "@/lib/supabase";

// `auth` is here because importing arena/queries pulls in authStore, which
// registers an onAuthStateChange listener at module load.
jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: [], error: null })),
    from: jest.fn(),
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;

const CHILD = "00000000-0000-4000-8000-000000000001";
const MATH = "11111111-1111-4111-8111-111111111111";
const FIZIKA = "22222222-2222-4222-8222-222222222222";
const FUTURE = "2099-01-01T00:00:00.000Z";

/** Thenable query builder — every chain used by these modules ends in the same
 *  canned result, whether it terminates on .in(), .maybeSingle() or the await. */
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  const done = () => Promise.resolve(result);
  Object.assign(b, {
    select: self,
    eq: self,
    order: self,
    in: done,
    maybeSingle: done,
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(ok, err),
  });
  return b;
}

const SUBJECT_ROWS = [
  { id: MATH, code: "math", name: "Riyaziyyat" },
  { id: FIZIKA, code: "fizika", name: "Fizika" },
];

const PRICING_ROWS = [
  { subject_id: MATH, interval: "month", amount: 9, currency: "AZN", subject: { code: "math", name: "Riyaziyyat" } },
  { subject_id: FIZIKA, interval: "month", amount: 9, currency: "AZN", subject: { code: "fizika", name: "Fizika" } },
];

/** A live subscription covering BOTH subjects — the paying child, i.e. the one
 *  the web's original rule never filtered. */
const SUBSCRIPTION_ROWS = [
  {
    status: "active",
    current_period_end: FUTURE,
    subscription_subjects: [
      { remove_at: null, current_period_end: FUTURE, subjects: SUBJECT_ROWS[0] },
      { remove_at: null, current_period_end: FUTURE, subjects: SUBJECT_ROWS[1] },
    ],
  },
];

/** Routes each table read to its canned rows; unknown tables return nothing. */
function stubTables() {
  from.mockImplementation((table: string) => {
    if (table === "subjects") return builder({ data: SUBJECT_ROWS, error: null });
    if (table === "subjects_pricing") {
      // arena/queries selects the nested subject; lib/data selects flat columns.
      return builder({
        data: PRICING_ROWS.map((r) => ({
          ...r,
          subjects: SUBJECT_ROWS.find((s) => s.id === r.subject_id),
        })),
        error: null,
      });
    }
    if (table === "child_subscriptions") return builder({ data: SUBSCRIPTION_ROWS, error: null });
    if (table === "students") {
      return builder({ data: { access_status: "active" }, error: null });
    }
    return builder({ data: [], error: null });
  });
}

/** Every RPC the builders make: the grade rule answers `taught`, the access
 *  windows answer "no free window, no trial" so the SUBSCRIBED path is tested. */
function stubRpc(taught: string[]) {
  rpc.mockImplementation(async (name: string) => {
    if (name === "my_taught_subjects" || name === "subjects_taught_to_grade") {
      return { data: taught, error: null };
    }
    if (name === "my_free_access_active") return { data: false, error: null };
    if (name === "my_free_trial") return { data: { active: false }, error: null };
    return { data: null, error: null };
  });
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  stubTables();
});

describe("taughtSubjectSet — 'unknown' must never collapse to 'no subjects'", () => {
  it("reads the RPC's bare uuid strings", () => {
    expect(taughtSubjectSet([MATH, FIZIKA])?.size).toBe(2);
  });

  it("accepts the single-column object shape too", () => {
    expect(taughtSubjectSet([{ subjects_taught_to_grade: MATH }])?.has(MATH)).toBe(true);
  });

  it("returns null on an error, an empty answer, or a non-array", () => {
    expect(taughtSubjectSet([MATH], { message: "boom" })).toBeNull();
    expect(taughtSubjectSet([])).toBeNull();
    expect(taughtSubjectSet(undefined)).toBeNull();
  });
});

describe("keepTaughtSubjects", () => {
  it("drops what the grade does not study and passes an unknown rule through", () => {
    const list = [{ id: MATH }, { id: FIZIKA }];
    expect(keepTaughtSubjects(list, new Set([MATH]))).toEqual([{ id: MATH }]);
    expect(keepTaughtSubjects(list, null)).toEqual(list);
  });
});

describe("fetchTaughtSubjectIds — which reader is asked", () => {
  it("uses the caller-scoped reader when no grade is given (student sessions)", async () => {
    stubRpc([MATH]);
    await fetchTaughtSubjectIds();
    expect(rpc).toHaveBeenCalledWith("my_taught_subjects");
  });

  it("passes an explicit grade through (parent screens acting on one child)", async () => {
    stubRpc([MATH]);
    await fetchTaughtSubjectIds("grade-3");
    expect(rpc).toHaveBeenCalledWith("subjects_taught_to_grade", { p_grade: "grade-3" });
  });

  it("asks nothing at all when the caller passes null", async () => {
    stubRpc([MATH]);
    expect(await fetchTaughtSubjectIds(null)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("grade 3 never receives fizika from ANY list builder", () => {
  beforeEach(() => stubRpc([MATH]));

  it("fetchSubjectAccess (tests home) — on the SUBSCRIBED path, no free window", async () => {
    const access = await fetchSubjectAccess(CHILD, false);
    expect(access.freeNow).toBe(false);
    expect(access.hasAccess).toBe(true);
    expect(access.subjects.map((s) => s.id)).toEqual([MATH]);
  });

  it("fetchSubjectAccess — and during a giveaway, where the priced catalogue merges in", async () => {
    const access = await fetchSubjectAccess(CHILD, true);
    expect(access.freeNow).toBe(true);
    expect(access.subjects.map((s) => s.id)).toEqual([MATH]);
  });

  it("fetchMySubjects (arena home, subscribed set)", async () => {
    expect((await fetchMySubjects(CHILD)).map((s) => s.id)).toEqual([MATH]);
  });

  it("fetchPricedSubjects (arena home, free-window set)", async () => {
    expect((await fetchPricedSubjects()).map((s) => s.id)).toEqual([MATH]);
  });

  it("fetchActiveSubjects (ranking/leaderboard subject filter)", async () => {
    expect((await fetchActiveSubjects()).map((s) => s.id)).toEqual([MATH]);
  });

  it("fetchSubjectsPricing (the purchase catalogue) when the child's grade is passed", async () => {
    const rows = await fetchSubjectsPricing("grade-3");
    expect(rows.map((r) => r.subject_id)).toEqual([MATH]);
  });
});

describe("grade 9 still receives fizika", () => {
  beforeEach(() => stubRpc([MATH, FIZIKA]));

  it("from the subscribed test-engine list", async () => {
    const ids = (await fetchSubjectAccess(CHILD, false)).subjects.map((s) => s.id).sort();
    expect(ids).toEqual([MATH, FIZIKA].sort());
  });

  it("from the arena lists", async () => {
    expect((await fetchMySubjects(CHILD)).map((s) => s.id).sort()).toEqual(
      [MATH, FIZIKA].sort(),
    );
    expect((await fetchPricedSubjects()).map((s) => s.id).sort()).toEqual(
      [MATH, FIZIKA].sort(),
    );
  });

  it("from the purchase catalogue", async () => {
    const rows = await fetchSubjectsPricing("grade-9");
    expect(rows.map((r) => r.subject_id).sort()).toEqual([MATH, FIZIKA].sort());
  });
});

describe("a failed rule read leaves the lists alone rather than emptying them", () => {
  it("keeps every subject when the RPC errors", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "my_taught_subjects") return { data: null, error: { message: "boom" } };
      if (name === "my_free_access_active") return { data: false, error: null };
      if (name === "my_free_trial") return { data: { active: false }, error: null };
      return { data: null, error: null };
    });
    const ids = (await fetchSubjectAccess(CHILD, false)).subjects.map((s) => s.id).sort();
    expect(ids).toEqual([MATH, FIZIKA].sort());
  });
});

describe("the purchase catalogue is unfiltered unless a child's grade is given", () => {
  it("does not ask the caller-scoped reader by default — a parent spans grades", async () => {
    stubRpc([MATH]);
    const rows = await fetchSubjectsPricing();
    expect(rpc).not.toHaveBeenCalled();
    expect(rows.map((r) => r.subject_id).sort()).toEqual([MATH, FIZIKA].sort());
  });
});
