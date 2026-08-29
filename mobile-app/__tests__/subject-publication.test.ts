// PUBLISHING A SUBJECT IS THE ADMIN'S SWITCH, AND PRICING IS NOT.
//
// WHY THIS TEST EXISTS. Two mistakes travelled together through this app, and
// each one is invisible from the other side:
//
//   (a) reading the catalog THROUGH `subjects_pricing`. A price answers "what
//       does it cost", not "does it exist", so a subject an admin had created
//       but not yet priced was absent from the child's screens while
//       has_subject_access() happily allowed it server-side — three of the
//       seven live subjects were in exactly that state. The web abandoned this
//       shape deliberately (lib/childSubjects.ts); mobile kept it.
//
//   (b) filtering the PRICE row's status and never the SUBJECT's. Archiving a
//       subject does not deactivate its price rows, so an archived subject
//       stayed listed — and buyable — on the mobile subscribe screen and stayed
//       a tab on mobile analytics long after the web had dropped it.
//
// The stub below APPLIES `.eq()` rather than merely recording it, so "an
// archived subject never reaches a user-facing list" is an assertion about the
// code and not a restatement of the fixture.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchSubjectsPricing } from "@/lib/data";
import { fetchPricedSubjects } from "@/features/arena/queries";
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
const KIMYA = "33333333-3333-4333-8333-333333333333";
const ARCHIVED = "44444444-4444-4444-8444-444444444444";

/** The admin's catalog. KIMYA is the freshly created subject nobody has priced;
 *  ARCHIVED still carries live price rows, which is what made it leak. */
const SUBJECTS = [
  { id: MATH, code: "math", name: "Riyaziyyat", status: "active" },
  { id: FIZIKA, code: "fizika", name: "Fizika", status: "active" },
  { id: KIMYA, code: "kimya", name: "Kimya", status: "active" },
  { id: ARCHIVED, code: "kohne", name: "Köhnə fənn", status: "archived" },
];

const PRICING = [MATH, FIZIKA, ARCHIVED].map((id) => ({
  subject_id: id,
  interval: "month",
  amount: 9,
  currency: "AZN",
  status: "active",
  subject: SUBJECTS.find((s) => s.id === id) ?? null,
}));

/** Applies `.eq()` to the canned rows; the chain resolves wherever it ends. */
function filtering(rows: Record<string, unknown>[]) {
  let out = [...rows];
  const b: Record<string, unknown> = {};
  const done = () => Promise.resolve({ data: out, error: null });
  Object.assign(b, {
    select: () => b,
    order: () => b,
    eq: (col: string, val: unknown) => {
      out = out.filter((r) => r[col] === val);
      return b;
    },
    in: done,
    maybeSingle: () => Promise.resolve({ data: out[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      done().then(ok, err),
  });
  return b;
}

/** For reads whose filters address columns the fixture does not carry. */
function passthrough(result: unknown) {
  const b: Record<string, unknown> = {};
  const done = () => Promise.resolve(result);
  Object.assign(b, {
    select: () => b,
    order: () => b,
    eq: () => b,
    in: done,
    maybeSingle: done,
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      done().then(ok, err),
  });
  return b;
}

/** Tables read during one call — the "never through pricing" assertions use it. */
let touched: string[] = [];

beforeEach(() => {
  touched = [];
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation((table: string) => {
    touched.push(table);
    if (table === "subjects") return filtering(SUBJECTS);
    if (table === "subjects_pricing") return filtering(PRICING);
    // No subscription: the child under test reaches subjects only through the
    // free window, which is the branch that used to read pricing.
    if (table === "child_subscriptions") return passthrough({ data: [], error: null });
    if (table === "students") {
      return passthrough({ data: { access_status: "active" }, error: null });
    }
    return passthrough({ data: [], error: null });
  });
  // The grade rule answers "unknown", so these assertions isolate publication.
  rpc.mockImplementation(async (name: string) => {
    if (name === "my_free_access_active") return { data: false, error: null };
    if (name === "my_free_trial") return { data: { active: false }, error: null };
    return { data: [], error: null };
  });
});

describe("the purchase catalogue drops a subject the admin archived", () => {
  it("keeps published+priced subjects and refuses the archived one", async () => {
    const ids = (await fetchSubjectsPricing()).map((r) => r.subject_id).sort();
    expect(ids).toEqual([MATH, FIZIKA].sort());
  });

  it("still reads the price from subjects_pricing — publication is a separate question", async () => {
    await fetchSubjectsPricing();
    expect(touched).toContain("subjects_pricing");
    expect(touched).toContain("subjects");
  });
});

describe("the free window unlocks PUBLISHED subjects, not priced ones", () => {
  it("arena home lists an active-but-unpriced subject and hides the archived one", async () => {
    const ids = (await fetchPricedSubjects()).map((s) => s.id).sort();
    expect(ids).toEqual([MATH, FIZIKA, KIMYA].sort());
    expect(ids).not.toContain(ARCHIVED);
  });

  it("arena home no longer reads the catalog through pricing", async () => {
    await fetchPricedSubjects();
    expect(touched).toContain("subjects");
    expect(touched).not.toContain("subjects_pricing");
  });

  it("the tests home builds the same set, from the same table", async () => {
    const access = await fetchSubjectAccess(CHILD, true);
    expect(access.freeNow).toBe(true);
    const ids = access.subjects.map((s) => s.id).sort();
    expect(ids).toEqual([MATH, FIZIKA, KIMYA].sort());
    expect(touched).not.toContain("subjects_pricing");
  });

  it("a child with no free window and no subscription is offered nothing", async () => {
    const access = await fetchSubjectAccess(CHILD, false);
    expect(access.freeNow).toBe(false);
    expect(access.subjects).toEqual([]);
  });
});

describe("the public Subjects screen is data-driven and stays purchase-silent", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "src", "app", "(public)", "subjects.tsx"),
    "utf8",
  );
  // Comments are stripped before the compliance scan: the header explains what
  // must never ship, and naming a banned token in that explanation is not the
  // same as rendering it. (Safe here because the file contains no URL literal.)
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("renders no fixed subject.* catalog any more", () => {
    expect(code).not.toMatch(/t\(\s*["'`]subject\./);
    expect(code).toContain("fetchActiveSubjects");
  });

  it("hands the catalog query to the pull, not only the CMS copy", () => {
    expect(code).toContain("usePullRefresh([overridesQ, subjectsQ])");
  });

  it("names no price, no currency and no purchase destination", () => {
    // docs/STORE_PAYMENTS_COMPLIANCE.md §4/§5: the binary sells nothing, and
    // this screen is reachable by BOTH roles from one binary.
    expect(code).not.toMatch(/\bAZN\b/);
    expect(code).not.toContain("olympiq.ai");
    expect(code).not.toContain("price");
    expect(code).not.toContain("fetchSubjectsPricing");
  });
});
