// Round 40 contract: the catalog fetcher scopes the RPC per caller. A parent
// passing a LINKED child's profile id must send it as p_student (the server
// then returns only that child's grade packages with per-child counts); no id
// must send an explicit null (family union for parents, own grade for
// students). Stub the Supabase client so the payload itself is asserted
// (jest hoists the mock above the import).
import { fetchOlympiadCatalog } from "@/lib/data";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: jest.fn(async () => ({ data: [], error: null })) },
}));

const rpc = supabase.rpc as unknown as jest.Mock;

const CHILD = "11111111-2222-3333-4444-555555555555";

describe("fetchOlympiadCatalog — p_student scoping", () => {
  beforeEach(() => rpc.mockClear());

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

  it("keeps the server-computed my_question_count on the mapped row", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "pkg-1",
          price_amount: 5,
          duration_minutes: 60,
          my_question_count: "40", // numeric arrives as text over PostgREST
          title_az: "Paket",
          description_az: "",
          grades: [],
        },
      ],
      error: null,
    });
    const rows = await fetchOlympiadCatalog("az", CHILD);
    expect(rows).toHaveLength(1);
    expect(rows[0].my_question_count).toBe(40);
  });

  it("throws when the RPC errors (foreign/unlinked id is server-rejected)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("not linked") });
    await expect(fetchOlympiadCatalog("az", CHILD)).rejects.toThrow();
  });
});
