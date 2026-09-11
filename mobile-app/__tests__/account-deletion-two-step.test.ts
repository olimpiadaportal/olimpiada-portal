// DELETING THE ACCOUNT IS THE ONE ACTION IN THIS APP THAT CANNOT BE UNDONE.
//
// `bffDeleteAccount()` takes the parent, every child under them and every
// answer those children ever gave. There is no soft-delete, no undo and no
// console to restore it from. The gate in front of it is a two-step sheet —
// two presses, on two DIFFERENT questions — and until this file existed that
// whole rule was three inline expressions inside a JSX prop, asserted by
// nothing. The sheet was rewritten this round (it used to draw its own Modal
// with no safe-area inset, no clamp and no scroll, so on a three-button
// Android phone its buttons sat behind the navigation bar); a rewrite is
// exactly when a rule that nothing pins goes missing.
//
// WHAT IS PINNED HERE
//   1. the danger button opens the FIRST question, never the final one;
//   2. one press never deletes anything, whatever else has happened;
//   3. the second press deletes exactly once;
//   4. backing out costs the whole gate again — a reopened sheet is never one
//      tap away from deleting the account;
//   5. the REQUEST refuses a step it has not been confirmed from, so a button
//      wired wrong in some future edit still cannot delete on one press;
//   6. the two steps ask different questions, and the sheet is strictly modal
//      while the request is in flight.
//
// No component is rendered: the machine is pure and lives in
// features/profile/deleteAccount.ts precisely so it can be held to this
// without a renderer. The driver below is a transcription of DangerZone's
// three handlers, and the last describe pins the transcription against the
// real file so the two cannot drift apart.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  advanceDelete,
  canRequestDelete,
  closeDelete,
  openDelete,
  DELETE_FINAL_STEP,
  DELETE_FIRST_STEP,
  type DeleteStep,
} from "@/features/profile/deleteAccount";

/** Source with comments blanked: prose describing a guard must never satisfy
 *  an assertion that the code applies it. */
function code(rel: string): string {
  return readFileSync(resolve(__dirname, "..", "src", rel), "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

describe("the two-step machine", () => {
  it("opens on the first question and never resumes a later one", () => {
    expect(openDelete()).toBe(DELETE_FIRST_STEP);
    expect(openDelete()).not.toBe(DELETE_FINAL_STEP);
  });

  it("advances from the first step WITHOUT submitting", () => {
    // The single most important line in the module: the first press is a
    // question, never an action.
    expect(advanceDelete(DELETE_FIRST_STEP)).toEqual({
      step: DELETE_FINAL_STEP,
      submit: false,
    });
  });

  it("submits only from the final step", () => {
    expect(advanceDelete(DELETE_FINAL_STEP)).toEqual({
      step: DELETE_FINAL_STEP,
      submit: true,
    });
  });

  it("does nothing at all from a closed sheet", () => {
    expect(advanceDelete(0)).toEqual({ step: 0, submit: false });
  });

  it("closes to CLOSED, from every step", () => {
    for (const step of [0, 1, 2] as DeleteStep[]) {
      void step;
      expect(closeDelete()).toBe(0);
    }
  });

  it("lets the request go from the final step and from nowhere else", () => {
    expect(canRequestDelete(0)).toBe(false);
    expect(canRequestDelete(1)).toBe(false);
    expect(canRequestDelete(2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The sheet, driven the way a thumb drives it
// ---------------------------------------------------------------------------

/**
 * DangerZone's three handlers with the network replaced by a counter. Every
 * line here has a twin in features/profile/sections.tsx, and the last describe
 * asserts those twins are still there.
 */
function makeSheet(outcome: "ok" | "fail" = "ok") {
  let step: DeleteStep = 0;
  let pending = false;
  let error: string | null = null;
  let deleted = false;
  let requests = 0;

  async function confirmDelete() {
    if (pending || !canRequestDelete(step)) return;
    pending = true;
    error = null;
    requests += 1;
    const ok = outcome === "ok";
    pending = false;
    if (!ok) {
      error = "mob.err.generic";
      return;
    }
    step = closeDelete();
    deleted = true;
  }

  return {
    get step() {
      return step;
    },
    get error() {
      return error;
    },
    get deleted() {
      return deleted;
    },
    /** How many times the account-deletion request actually went out. */
    get requests() {
      return requests;
    },
    /** The red button on the danger card. */
    open() {
      step = openDelete();
    },
    /** The sheet's primary (danger) button. */
    async primary() {
      const next = advanceDelete(step);
      step = next.step;
      if (next.submit) await confirmDelete();
    },
    /** Cancel / backdrop / Android back. */
    cancel() {
      if (pending) return;
      step = closeDelete();
      error = null;
    },
    /** A miswired button of the future: call the request from `at` directly. */
    async requestFrom(at: DeleteStep) {
      step = at;
      await confirmDelete();
    },
  };
}

describe("both steps are required", () => {
  it("ONE press deletes nothing", async () => {
    const s = makeSheet();
    s.open();
    await s.primary();
    expect(s.requests).toBe(0);
    expect(s.deleted).toBe(false);
    // ...and it has moved on to the second question, which is the only thing
    // that press is allowed to do.
    expect(s.step).toBe(DELETE_FINAL_STEP);
  });

  it("TWO presses delete the account, exactly once", async () => {
    const s = makeSheet();
    s.open();
    await s.primary();
    await s.primary();
    expect(s.requests).toBe(1);
    expect(s.deleted).toBe(true);
    expect(s.step).toBe(0);
  });

  it("a press after the account is gone sends nothing more", async () => {
    const s = makeSheet();
    s.open();
    await s.primary();
    await s.primary();
    await s.primary();
    expect(s.requests).toBe(1);
  });

  it("a press with the sheet CLOSED can never submit", async () => {
    const s = makeSheet();
    await s.primary();
    await s.primary();
    expect(s.requests).toBe(0);
    expect(s.step).toBe(0);
  });
});

describe("neither step can be short-circuited", () => {
  it("backing out at the final prompt costs the whole gate again", async () => {
    const s = makeSheet();
    s.open();
    await s.primary(); // now at the final question
    s.cancel();
    expect(s.step).toBe(0);

    s.open();
    expect(s.step).toBe(DELETE_FIRST_STEP); // NOT resumed at the final step
    await s.primary();
    expect(s.requests).toBe(0); // one press again, and again it does nothing
  });

  it("the REQUEST refuses a step it was not confirmed from", async () => {
    // The second lock. The button and the request are separate code and only
    // one of them is on screen; this is the half that holds when a future edit
    // wires the button to delete on the first press.
    const s = makeSheet();
    await s.requestFrom(1);
    expect(s.requests).toBe(0);
    await s.requestFrom(0);
    expect(s.requests).toBe(0);
    await s.requestFrom(2);
    expect(s.requests).toBe(1);
  });

  it("a failed delete stays on the final step, so the retry is one press", async () => {
    const s = makeSheet("fail");
    s.open();
    await s.primary();
    await s.primary();
    expect(s.requests).toBe(1);
    expect(s.deleted).toBe(false);
    expect(s.error).not.toBeNull();
    expect(s.step).toBe(DELETE_FINAL_STEP);
    await s.primary();
    expect(s.requests).toBe(2); // retried in place, not re-gated
  });
});

// ---------------------------------------------------------------------------
// ...and the screen really is wired to that machine
// ---------------------------------------------------------------------------

describe("DangerZone routes every transition through the machine", () => {
  const src = code("features/profile/sections.tsx");

  it("opens, advances and closes through the module, never inline", () => {
    expect(src).toContain("setStep(openDelete())");
    expect(src).toContain("const next = advanceDelete(step);");
    expect(src).toContain("if (next.submit) void confirmDelete();");
    expect(src).toContain("setStep(closeDelete())");
    // The literals the rule used to be made of. `setStep(1)` / `setStep(2)` in
    // a prop is exactly how this gate would quietly become one press again.
    expect(/setStep\(\s*[12]\s*\)/.test(src)).toBe(false);
  });

  it("re-checks the step at the request, not only at the button", () => {
    expect(src).toContain("if (pending || !canRequestDelete(step)) return;");
    // Exactly one place in the file can delete the account.
    expect(src.split("bffDeleteAccount()").length - 1).toBe(1);
  });

  it("asks two DIFFERENT questions", () => {
    // A second identical prompt trains a user to tap through it.
    expect(src).toContain('t("account.deleteConfirm")');
    expect(src).toContain('t("mob.prof.deleteFinal")');
  });

  it("is strictly modal while the request is in flight", () => {
    // A stray backdrop tap must not walk away from a request that is deciding
    // the account's fate, and Cancel must not fire beside a pending Delete.
    expect(src).toContain("onDismiss={pending ? undefined : close}");
    expect(src).toContain("disabled={pending}");
    expect(src).toContain("pending={pending}");
  });
});
