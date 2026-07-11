import {
  clearPendingLink,
  consumePendingLink,
  isSafeRelativeUrl,
  resolveDeepLink,
  storePendingLink,
} from "@/lib/deeplink";

describe("isSafeRelativeUrl (web parity)", () => {
  it("accepts plain relative paths", () => {
    expect(isSafeRelativeUrl("/")).toBe(true);
    expect(isSafeRelativeUrl("/child-login")).toBe(true);
    expect(isSafeRelativeUrl("/child/test/result/abc-123")).toBe(true);
    expect(isSafeRelativeUrl("/news/some-slug?x=1")).toBe(true);
  });

  it("rejects absolute, protocol, backslash and control-char inputs", () => {
    expect(isSafeRelativeUrl("https://evil.example")).toBe(false);
    expect(isSafeRelativeUrl("//evil.example")).toBe(false);
    expect(isSafeRelativeUrl("/\\evil")).toBe(false);
    expect(isSafeRelativeUrl("/a\\b")).toBe(false);
    expect(isSafeRelativeUrl("/x://y")).toBe(false);
    expect(isSafeRelativeUrl("/a\tb")).toBe(false);
    expect(isSafeRelativeUrl("")).toBe(false);
    expect(isSafeRelativeUrl(`/${"a".repeat(600)}`)).toBe(false);
  });
});

describe("resolveDeepLink allowlist", () => {
  it("opens public routes for everyone", () => {
    expect(resolveDeepLink("/", null)).toEqual({ kind: "open", target: "/(public)/welcome" });
    expect(resolveDeepLink("/login", null)).toEqual({ kind: "open", target: "/(public)/login" });
    expect(resolveDeepLink("/child-login", "parent")).toEqual({
      kind: "open",
      target: "/(public)/login?tab=student",
    });
    expect(resolveDeepLink("/news/some-article", null)).toEqual({
      kind: "open",
      target: "/(public)/welcome",
    });
  });

  it("routes role links for the matching role", () => {
    expect(resolveDeepLink("/dashboard", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/home",
    });
    expect(resolveDeepLink("/dashboard/news/slug", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/news",
    });
    expect(resolveDeepLink("/child", "student")).toEqual({
      kind: "open",
      target: "/(student)/arena",
    });
    expect(resolveDeepLink("/child/test/run/xyz", "student")).toEqual({
      kind: "open",
      target: "/(student)/tests",
    });
  });

  it("defers role links when signed out", () => {
    expect(resolveDeepLink("/analytics", null)).toEqual({
      kind: "deferred",
      path: "/analytics",
      audience: "parent",
    });
    expect(resolveDeepLink("/child/leaderboard", null)).toEqual({
      kind: "deferred",
      path: "/child/leaderboard",
      audience: "student",
    });
  });

  it("reports a role mismatch instead of opening", () => {
    expect(resolveDeepLink("/dashboard", "student")).toEqual({ kind: "mismatch" });
    expect(resolveDeepLink("/child", "parent")).toEqual({ kind: "mismatch" });
  });

  it("resolves unknown and unsafe paths to null", () => {
    expect(resolveDeepLink("/totally/unknown", "parent")).toBeNull();
    expect(resolveDeepLink("//evil", "parent")).toBeNull();
    expect(resolveDeepLink("https://x", "parent")).toBeNull();
    // "/" is exact — it must not swallow arbitrary paths.
    expect(resolveDeepLink("/nope", null)).toBeNull();
  });
});

describe("deferred link replay", () => {
  afterEach(() => clearPendingLink());

  it("replays for the matching role only", () => {
    storePendingLink("/analytics", "parent");
    expect(consumePendingLink("student")).toBeNull();
    storePendingLink("/analytics", "parent");
    expect(consumePendingLink("parent")).toBe("/(parent)/analytics");
    // consumed — a second read is empty
    expect(consumePendingLink("parent")).toBeNull();
  });
});
