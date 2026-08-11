// Migration 106 — per-grade question count + duration.
//
// This parser decides what an olympiad attempt SERVES. A silent fallback here
// is invisible until a student sits the exam, so the cases that matter most are
// the ones where the admin typed something the form's min/max never saw: the
// attributes are UX, the post is hostile.
//
// The single most important behaviour is the NULL: an empty field must store
// "no override", never the package's current number. Storing the number would
// SHADOW the package value, and editing the package-level count later would
// silently do nothing.
import { describe, expect, it } from "vitest";
import { parsePerGradeConfig } from "../olympiad-per-attempt";

const G1 = "11111111-1111-1111-1111-111111111111";
const G2 = "22222222-2222-2222-2222-222222222222";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("parsePerGradeConfig", () => {
  it("stores NULL when a grade posts nothing, so the package value applies", () => {
    const res = parsePerGradeConfig(fd({}), [G1]);
    expect(res).toEqual({
      ok: true,
      rows: [{ grade_id: G1, questions_per_attempt: null, duration_minutes: null }],
    });
  });

  it("treats an EMPTY field as inherit, not as zero", () => {
    const res = parsePerGradeConfig(fd({ [`qpa_${G1}`]: "", [`dur_${G1}`]: "  " }), [G1]);
    expect(res).toEqual({
      ok: true,
      rows: [{ grade_id: G1, questions_per_attempt: null, duration_minutes: null }],
    });
  });

  it("keeps each grade's own values independent", () => {
    const res = parsePerGradeConfig(
      fd({
        [`qpa_${G1}`]: "10",
        [`dur_${G1}`]: "30",
        [`qpa_${G2}`]: "40",
        [`dur_${G2}`]: "90",
      }),
      [G1, G2],
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { grade_id: G1, questions_per_attempt: 10, duration_minutes: 30 },
        { grade_id: G2, questions_per_attempt: 40, duration_minutes: 90 },
      ],
    });
  });

  it("lets one grade override while another inherits", () => {
    const res = parsePerGradeConfig(fd({ [`qpa_${G2}`]: "40" }), [G1, G2]);
    expect(res).toEqual({
      ok: true,
      rows: [
        { grade_id: G1, questions_per_attempt: null, duration_minutes: null },
        { grade_id: G2, questions_per_attempt: 40, duration_minutes: null },
      ],
    });
  });

  it("ignores fields for grades that were not selected", () => {
    const res = parsePerGradeConfig(fd({ [`qpa_${G2}`]: "500" }), [G1]);
    expect(res).toEqual({
      ok: true,
      rows: [{ grade_id: G1, questions_per_attempt: null, duration_minutes: null }],
    });
  });

  it("accepts the exact bounds", () => {
    const res = parsePerGradeConfig(
      fd({ [`qpa_${G1}`]: "1", [`dur_${G1}`]: "5", [`qpa_${G2}`]: "500", [`dur_${G2}`]: "240" }),
      [G1, G2],
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { grade_id: G1, questions_per_attempt: 1, duration_minutes: 5 },
        { grade_id: G2, questions_per_attempt: 500, duration_minutes: 240 },
      ],
    });
  });

  // A present-but-invalid value is an ERROR, never a fallback: quietly
  // substituting the package number would create a package the admin believes
  // is configured one way and that behaves another.
  it.each([
    ["0", "below the minimum"],
    ["501", "above the maximum"],
    ["12.5", "fractional"],
    ["abc", "not a number"],
    ["-5", "negative"],
  ])("rejects a question count of %s (%s)", (value) => {
    expect(parsePerGradeConfig(fd({ [`qpa_${G1}`]: value }), [G1])).toEqual({
      ok: false,
      errorKey: "oly2.err.perAttempt",
    });
  });

  it.each([
    ["4", "below the minimum"],
    ["241", "above the maximum"],
    ["30.5", "fractional"],
    ["soon", "not a number"],
  ])("rejects a duration of %s (%s)", (value) => {
    expect(parsePerGradeConfig(fd({ [`dur_${G1}`]: value }), [G1])).toEqual({
      ok: false,
      errorKey: "oly2.err.duration",
    });
  });

  it("reports the FIRST invalid grade rather than partially applying", () => {
    const res = parsePerGradeConfig(
      fd({ [`qpa_${G1}`]: "999", [`qpa_${G2}`]: "20" }),
      [G1, G2],
    );
    expect(res).toEqual({ ok: false, errorKey: "oly2.err.perAttempt" });
  });

  it("returns no rows for no grades", () => {
    expect(parsePerGradeConfig(fd({}), [])).toEqual({ ok: true, rows: [] });
  });
});
