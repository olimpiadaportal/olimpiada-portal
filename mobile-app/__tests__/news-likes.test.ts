import {
  nextLikedIds,
  patchArticleLikeCount,
  patchListLikeCount,
} from "@/features/news/likeCache";

describe("nextLikedIds", () => {
  it("adds and removes the id", () => {
    expect(nextLikedIds([], "a", true)).toEqual(["a"]);
    expect(nextLikedIds(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("seeds a like even before the query has loaded, but never an unlike", () => {
    expect(nextLikedIds(undefined, "a", true)).toEqual(["a"]);
    // Nothing to remove and nothing cached — do not fabricate a cache entry.
    expect(nextLikedIds(undefined, "a", false)).toBeUndefined();
  });

  it("keeps the array identity when the state already matches (no re-render)", () => {
    const ids = ["a"];
    expect(nextLikedIds(ids, "a", true)).toBe(ids);
    expect(nextLikedIds(ids, "b", false)).toBe(ids);
  });
});

describe("patchListLikeCount", () => {
  const list = [
    { id: "a", like_count: 2 },
    { id: "b", like_count: null },
  ];

  it("returns a like and its undo to the original count", () => {
    const up = patchListLikeCount(list, "a", 1)!;
    expect(up[0].like_count).toBe(3);
    expect(patchListLikeCount(up, "a", -1)![0].like_count).toBe(2);
  });

  it("floors at 0 like the DB trigger, and treats NULL as 0", () => {
    expect(patchListLikeCount(list, "b", -1)![1].like_count).toBe(0);
    expect(patchListLikeCount(list, "b", 1)![1].like_count).toBe(1);
  });

  it("leaves other articles untouched", () => {
    const next = patchListLikeCount(list, "a", 1)!;
    expect(next[1]).toBe(list[1]);
  });

  it("is a no-op for an unknown id or a cache that has not loaded", () => {
    expect(patchListLikeCount(list, "zzz", 1)).toBe(list);
    expect(patchListLikeCount(undefined, "a", 1)).toBeUndefined();
  });
});

describe("patchArticleLikeCount", () => {
  const article = { id: "a", like_count: 1 };

  it("patches only the matching article", () => {
    expect(patchArticleLikeCount(article, "a", 1)).toEqual({ id: "a", like_count: 2 });
    expect(patchArticleLikeCount(article, "b", 1)).toBe(article);
    expect(patchArticleLikeCount(undefined, "a", 1)).toBeUndefined();
  });

  it("floors at 0", () => {
    expect(patchArticleLikeCount({ id: "a", like_count: 0 }, "a", -1)).toEqual({
      id: "a",
      like_count: 0,
    });
  });
});
