// The commerce posture after the demo payment mode was deleted (owner,
// 2026-08-18) and the app went purchase-silent: three modes, no demoPay, and
// no branch that could put a checkout back on screen.
import { resolvePosture } from "@/features/parent/commerce";
import { buildOlympiadDetailRows } from "@/features/olympiads/details";
import type { OlympiadPackageRow } from "@/lib/data";

describe("resolvePosture", () => {
  it("maps 'real' to read-only", () => {
    const p = resolvePosture("real", false);
    expect(p.webOnly).toBe(true);
    expect(p.freeFlow).toBe(false);
    expect(p.paymentsOff).toBe(false);
  });

  it("maps 'giveaway' — and a free-access window in any live mode — to the free flow", () => {
    expect(resolvePosture("giveaway", false).freeFlow).toBe(true);
    expect(resolvePosture("real", true).freeFlow).toBe(true);
  });

  it("keeps 'off' fail-closed: never free, never read-only-with-a-plan", () => {
    const p = resolvePosture("off", true);
    expect(p.paymentsOff).toBe(true);
    expect(p.freeFlow).toBe(false);
    expect(p.webOnly).toBe(false);
  });

  it("carries no demo flag any more", () => {
    expect(Object.keys(resolvePosture("real", false))).not.toContain("demoPay");
  });
});

describe("buildOlympiadDetailRows", () => {
  const pkg = {
    id: "p1",
    title: "Test",
    description: null,
    typeName: null,
    subject: null,
    grade: null,
    grades: [],
    price_amount: 25,
    currency: "AZN",
    questions_per_attempt: 0,
    duration_minutes: 0,
    my_question_count: 0,
    event_starts_at: null,
    sale_starts_at: null,
    sale_ends_at: null,
    cover: null,
  } as unknown as OlympiadPackageRow;

  it("never emits a price row, whatever the package costs", () => {
    const rows = buildOlympiadDetailRows(pkg, 40, "az", (k) => k);
    expect(rows.some((r) => r.key === "price")).toBe(false);
    expect(rows.map((r) => r.value).join(" ")).not.toMatch(/AZN|25/);
  });
});
