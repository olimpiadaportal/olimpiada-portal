// The commerce posture after the demo payment mode was deleted (owner,
// 2026-08-18) and the app went purchase-silent: three modes, no demoPay, and
// no branch that could put a checkout back on screen.
//
// Plus accessPill: the parent Home card's label, which read "No access" over a
// child their parent had just paid for.
import { accessPill, resolvePosture } from "@/features/parent/commerce";
import { buildOlympiadDetailRows } from "@/features/olympiads/details";
import type { OlympiadPackageRow } from "@/lib/data";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("accessPill", () => {
  // THE FIRST SCREEN A PARENT LANDS ON labelled a just-paid child "No access".
  // `students.access_status` is written by the subscription rail alone, and an
  // Apple purchase writes one entitlement row and nothing else — so the column
  // the card read had not changed and pulling to refresh could not move it.
  it("reports access for an entitlement the access_status column cannot see", () => {
    expect(accessPill("inactive", true)).toEqual({
      key: "mob.sub.accessActive",
      tone: "ok",
    });
  });

  // The reader fails to an EMPTY list, so `false` is what a broken RPC yields.
  // It must land on exactly the old behaviour — never a blank, never an "ok".
  it("falls back to the access_status pill when the entitlement read fails", () => {
    expect(accessPill("inactive", false)).toEqual({ key: "access.inactive", tone: "muted" });
    expect(accessPill("expired", false)).toEqual({ key: "access.expired", tone: "bad" });
    expect(accessPill(null, false)).toEqual({ key: "access.inactive", tone: "muted" });
    expect(accessPill("nonsense", false)).toEqual({ key: "access.inactive", tone: "muted" });
  });

  // A family with a live subscription keeps subscription vocabulary: the
  // entitlement mirror knowing about them is not a reason to rename their pill.
  it("leaves a status that already reads as access alone", () => {
    expect(accessPill("active", true)).toEqual({ key: "access.active", tone: "ok" });
    expect(accessPill("trialing", true)).toEqual({ key: "access.trialing", tone: "ok" });
  });

  // Every key it can return has to exist in all three locales, or the fix
  // renders the raw key to a reviewer.
  it("returns only keys the catalogues carry", () => {
    const keys = new Set(
      ["inactive", "trialing", "active", "locked", "expired", "nonsense", null].flatMap((s) => [
        accessPill(s, false).key,
        accessPill(s, true).key,
      ]),
    );
    const web = readFileSync(resolve(__dirname, "..", "src", "i18n", "messages.generated.ts"), "utf8");
    const mobile = readFileSync(resolve(__dirname, "..", "src", "i18n", "messages.mobile.ts"), "utf8");
    for (const key of keys) {
      const hits = (web + mobile).match(new RegExp(`"${key.replace(".", "\.")}":`, "g")) ?? [];
      expect({ key, locales: hits.length }).toEqual({ key, locales: 3 });
    }
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
