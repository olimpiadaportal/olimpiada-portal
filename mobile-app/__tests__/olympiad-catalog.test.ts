// Round 40 contract: the catalog fetcher scopes the RPC per caller. A parent
// passing a LINKED child's profile id must send it as p_student (the server
// then returns only that child's grade packages with per-child counts); no id
// must send an explicit null (family union for parents, own grade for
// students). Stub the Supabase client so the payload itself is asserted
// (jest hoists the mock above the import). Round 51: the fetcher additionally
// stitches questions_per_attempt in via a direct table read (the catalog RPC
// predates the rotation model), so the stub carries a chainable `from` too.
import { fetchOlympiadCatalog } from "@/lib/data";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: [], error: null })),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(async () => ({ data: [], error: null })),
      })),
    })),
  },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;

/** One-shot stub of the questions_per_attempt follow-up read. */
function stubPerAttempt(rows: { id: string; questions_per_attempt: number }[]) {
  from.mockReturnValueOnce({
    select: jest.fn(() => ({
      in: jest.fn(async () => ({ data: rows, error: null })),
    })),
  });
}

const CHILD = "11111111-2222-3333-4444-555555555555";

describe("fetchOlympiadCatalog — p_student scoping", () => {
  beforeEach(() => {
    rpc.mockClear();
    from.mockClear();
  });

  it("sends the child's profile id when one is given (child-scoped catalog)", async () => {
    await fetchOlympiadCatalog("az", CHILD);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_olympiad_catalog", { p_student: CHILD });
  });

  it("sends an explicit null when no id is given (family union / student self)", async () => {
    await fetchOlympiadCatalog("az");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_olympiad_catalog", { p_student: null });
  });

  it("keeps the server-computed my_question_count + olympiad type on the mapped row", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "pkg-1",
          price_amount: 5,
          duration_minutes: 60,
          my_question_count: "40", // numeric arrives as text over PostgREST
          olympiad_type: "Beynəlxalq",
          title_az: "Paket",
          description_az: "",
          grades: [],
        },
      ],
      error: null,
    });
    // Round 51: the rotation size arrives from the direct table read and must
    // NEVER replace the real pool count on the row.
    stubPerAttempt([{ id: "pkg-1", questions_per_attempt: 25 }]);
    const rows = await fetchOlympiadCatalog("az", CHILD);
    expect(rows).toHaveLength(1);
    expect(rows[0].my_question_count).toBe(40);
    expect(rows[0].questions_per_attempt).toBe(25);
    expect(rows[0].typeName).toBe("Beynəlxalq");
  });

  it("maps an absent olympiad type to null (no marquee / no type row)", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "pkg-2",
          price_amount: 0,
          duration_minutes: 30,
          my_question_count: 0,
          title_az: "Paket",
          description_az: "",
          grades: [],
        },
      ],
      error: null,
    });
    const rows = await fetchOlympiadCatalog("az");
    expect(rows[0].typeName).toBeNull();
    // No stitched row → per-attempt count degrades to 0 (detail row hidden).
    expect(rows[0].questions_per_attempt).toBe(0);
  });

  it("throws when the RPC errors (foreign/unlinked id is server-rejected)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("not linked") });
    await expect(fetchOlympiadCatalog("az", CHILD)).rejects.toThrow();
  });
});
