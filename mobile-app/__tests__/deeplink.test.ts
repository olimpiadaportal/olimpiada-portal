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
    // Signed out, marketing links stay on the public surface as today.
    expect(resolveDeepLink("/news/some-article", null)).toEqual({
      kind: "open",
      target: "/(public)/welcome",
    });
    expect(resolveDeepLink("/news", null)).toEqual({
      kind: "open",
      target: "/(public)/welcome",
    });
  });

  it("routes /news to the signed-in role's own news surface", () => {
    expect(resolveDeepLink("/news", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/news",
    });
    expect(resolveDeepLink("/news", "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/news",
    });
    // A single-slug article opens the role's OWN article route — the actual
    // ARTICLE inside the role shell, never the shared (public) screen.
    expect(resolveDeepLink("/news/summer-camp-2026", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/news/summer-camp-2026",
    });
    expect(resolveDeepLink("/news/summer-camp-2026", "student")).toEqual({
      kind: "open",
      target: "/(student)/news/summer-camp-2026",
    });
    // Multi-segment /news paths fall through to the list rule.
    expect(resolveDeepLink("/news/a/b", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/news",
    });
  });

  it("opens the info pages in-session, except pricing for students", () => {
    expect(resolveDeepLink("/about", "parent")).toEqual({
      kind: "open",
      target: "/(public)/about",
    });
    expect(resolveDeepLink("/faq", "student")).toEqual({ kind: "open", target: "/(public)/faq" });
    expect(resolveDeepLink("/contact", "parent")).toEqual({
      kind: "open",
      target: "/(public)/contact",
    });
    expect(resolveDeepLink("/pricing", "parent")).toEqual({
      kind: "open",
      target: "/(public)/pricing",
    });
    expect(resolveDeepLink("/pricing", null)).toEqual({
      kind: "open",
      target: "/(public)/pricing",
    });
    // Children never see commerce — a student session must not open pricing.
    expect(resolveDeepLink("/pricing", "student")).toEqual({ kind: "mismatch" });
    // The subjects catalog is informational (NOT commerce): open for everyone,
    // students included.
    expect(resolveDeepLink("/subjects", null)).toEqual({
      kind: "open",
      target: "/(public)/subjects",
    });
    expect(resolveDeepLink("/subjects", "parent")).toEqual({
      kind: "open",
      target: "/(public)/subjects",
    });
    expect(resolveDeepLink("/subjects", "student")).toEqual({
      kind: "open",
      target: "/(public)/subjects",
    });
  });

  it("routes role links for the matching role", () => {
    expect(resolveDeepLink("/dashboard", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/home",
    });
    expect(resolveDeepLink("/dashboard/news/slug", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/news",
    });
    expect(resolveDeepLink("/child", "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/home",
    });
    expect(resolveDeepLink("/child/test/run/xyz", "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/tests",
    });
  });

  it("deep-links UUID result/review pages; non-UUIDs fall back to the Tests tab", () => {
    const id = "2b6c8a1e-4f3d-4a2b-9c1d-0e5f6a7b8c9d";
    // Safe to open directly: the result/review RPCs are owner+graded gated.
    expect(resolveDeepLink(`/child/test/result/${id}`, "student")).toEqual({
      kind: "open",
      target: `/(student)/test/result/${id}`,
    });
    expect(resolveDeepLink(`/child/test/review/${id}`, "student")).toEqual({
      kind: "open",
      target: `/(student)/test/review/${id}`,
    });
    // Non-UUID suffixes keep landing on the Tests tab (never the runner).
    expect(resolveDeepLink("/child/test/result/not-a-uuid", "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/tests",
    });
    expect(resolveDeepLink(`/child/test/result/${id}/extra`, "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/tests",
    });
    // Signed out → deferred with the full path, replayable after login.
    expect(resolveDeepLink(`/child/test/result/${id}`, null)).toEqual({
      kind: "deferred",
      path: `/child/test/result/${id}`,
      audience: "student",
    });
    // The other role never opens it.
    expect(resolveDeepLink(`/child/test/result/${id}`, "parent")).toEqual({ kind: "mismatch" });
  });

  it("routes /leaderboard to the parent full-board screen", () => {
    expect(resolveDeepLink("/leaderboard", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/leaderboard",
    });
    // Signed out → deferred for the parent audience; a student session never
    // opens the parent board (its own board keeps the /child/leaderboard rule).
    expect(resolveDeepLink("/leaderboard", null)).toEqual({
      kind: "deferred",
      path: "/leaderboard",
      audience: "parent",
    });
    expect(resolveDeepLink("/leaderboard", "student")).toEqual({ kind: "mismatch" });
    expect(resolveDeepLink("/child/leaderboard", "student")).toEqual({
      kind: "open",
      target: "/(student)/(tabs)/ranking",
    });
  });

  it("routes a child's olympiad page to the parent olympiads tab", () => {
    const id = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
    expect(resolveDeepLink(`/children/${id}/olympiads`, "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/olympiads",
    });
    // Other /children paths keep going to the parent home.
    expect(resolveDeepLink("/children", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/home",
    });
    expect(resolveDeepLink(`/children/${id}/edit`, "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/home",
    });
    expect(resolveDeepLink("/children/not-a-uuid/olympiads", "parent")).toEqual({
      kind: "open",
      target: "/(parent)/(tabs)/home",
    });
    expect(resolveDeepLink(`/children/${id}/olympiads`, "student")).toEqual({ kind: "mismatch" });
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

  it("routes a push payload action_url like any other deep link", () => {
    // The processor sends data.action_url as a RELATIVE web path (contract §4).
    const actionUrl = "/child/notifications";
    expect(isSafeRelativeUrl(actionUrl)).toBe(true);
    expect(resolveDeepLink(actionUrl, "student")).toEqual({
      kind: "open",
      target: "/(student)/notifications",
    });
    // Tap while signed out → deferred, replayed after login.
    expect(resolveDeepLink(actionUrl, null)).toEqual({
      kind: "deferred",
      path: actionUrl,
      audience: "student",
    });
    // Payloads are display data, never authorization: the other role's link
    // is a mismatch, and an absolute URL never routes at all.
    expect(resolveDeepLink(actionUrl, "parent")).toEqual({ kind: "mismatch" });
    expect(resolveDeepLink("https://evil.example/child/notifications", "student")).toBeNull();
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
    expect(consumePendingLink("parent")).toBe("/(parent)/(tabs)/analytics");
    // consumed — a second read is empty
    expect(consumePendingLink("parent")).toBeNull();
  });

  it("replays a dynamic UUID link with the id preserved", () => {
    const id = "2b6c8a1e-4f3d-4a2b-9c1d-0e5f6a7b8c9d";
    storePendingLink(`/child/test/result/${id}`, "student");
    expect(consumePendingLink("student")).toBe(`/(student)/test/result/${id}`);
  });
});
