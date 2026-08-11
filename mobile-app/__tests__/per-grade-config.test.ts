// Migration 106 — a package's question count and duration are stored PER
// TARGET GRADE, so one number can no longer describe a multi-grade package.
//
// The mobile app has no grade context at the point these rows are built: a
// parent's catalog spans every child's grade, and the student catalog RPC does
// not say which grade matched. So when the grades DISAGREE the honest answer is
// "no single value" and the row is dropped — showing one grade's figure to
// everyone is the bug this guards against.
import { sharedGradeValue } from "@/features/olympiads/details";

const g = (per: number | null, dur: number | null) => ({
  questions_per_attempt: per,
  duration_minutes: dur,
});

describe("sharedGradeValue", () => {
  it("falls back to the package value when there are no target grades", () => {
    expect(sharedGradeValue([], 25, "questions_per_attempt")).toBe(25);
  });

  it("returns the package value when every grade inherits", () => {
    expect(
      sharedGradeValue([g(null, null), g(null, null)], 25, "questions_per_attempt"),
    ).toBe(25);
  });

  it("returns the shared override when every grade agrees", () => {
    expect(sharedGradeValue([g(40, null), g(40, null)], 25, "questions_per_attempt")).toBe(40);
  });

  it("returns null when the grades disagree", () => {
    expect(sharedGradeValue([g(10, null), g(40, null)], 25, "questions_per_attempt")).toBeNull();
  });

  // The subtle one: an override that merely EQUALS the package value still
  // agrees with a grade that inherits it, because both resolve to the same
  // served count.
  it("treats an override equal to the package value as agreement", () => {
    expect(sharedGradeValue([g(25, null), g(null, null)], 25, "questions_per_attempt")).toBe(25);
  });

  it("disagrees when one grade overrides and another inherits a different value", () => {
    expect(sharedGradeValue([g(40, null), g(null, null)], 25, "questions_per_attempt")).toBeNull();
  });

  it("resolves duration independently of the question count", () => {
    const grades = [g(10, 60), g(40, 60)];
    expect(sharedGradeValue(grades, 25, "questions_per_attempt")).toBeNull();
    expect(sharedGradeValue(grades, 25, "duration_minutes")).toBe(60);
  });

  it("handles a single grade — the common case — without special-casing", () => {
    expect(sharedGradeValue([g(40, 90)], 25, "questions_per_attempt")).toBe(40);
    expect(sharedGradeValue([g(null, null)], 25, "duration_minutes")).toBe(25);
  });
});
