import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("visible back navigation", () => {
  it.each([
    ["parent", "src/app/(parent)/_layout.tsx"],
    ["student", "src/app/(student)/_layout.tsx"],
    ["public information", "src/app/(public)/_layout.tsx"],
  ])("gives the %s stack a custom back arrow with a safe fallback", (_name, path) => {
    const text = source(path);
    expect(text).toContain("<BackButton");
    expect(text).toContain("backOrTo(");
    expect(text).toContain("headerBackVisible: false");
  });

  it("covers every parent and student secondary route through the shared header helper", () => {
    const parent = source("src/app/(parent)/_layout.tsx");
    const student = source("src/app/(student)/_layout.tsx");

    for (const route of [
      "notifications",
      "leaderboard",
      "profile",
      "news/[slug]",
      "add-child",
      "link-child",
      "children/[id]/edit",
      "children/[id]/subscribe",
    ]) {
      expect(parent).toContain(`name="${route}" options={secondary(`);
    }
    for (const route of ["notifications", "profile", "news/[slug]"]) {
      expect(student).toContain(`name="${route}" options={secondary(`);
    }
  });

  it.each([
    "src/features/tests/TestSetupScreen.tsx",
    "src/features/tests/TestRunnerScreen.tsx",
    "src/features/tests/TestResultScreen.tsx",
    "src/features/tests/TestReviewScreen.tsx",
  ])("keeps an explicit arrow in the custom-header exam flow: %s", (path) => {
    expect(source(path)).toContain("<BackBar");
  });
});
