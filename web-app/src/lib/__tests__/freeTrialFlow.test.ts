// The 24-hour free trial on the web (2026-10-09).
//
// Production had ZERO free_trials rows: nobody had ever been able to start the
// trial. Two independent breaks, both pinned here.
//
//   1. The confirm button did nothing. It sits in a <Modal>, Modal renders
//      through createPortal into <body>, so in the DOM the button was OUTSIDE
//      the <form> it is written inside. A submit button with no form submits
//      nothing. Fixed with the HTML `form` attribute.
//   2. Add Child led only to the bank. With the old 7-day subscription trial
//      retired (migration 142), the wizard's last step always asked for
//      payment and never mentioned the trial, which lived on a page the wizard
//      did not link to.
//
// The trial's RULES — 24 hours, at most two subjects, once per child, only the
// creating parent, no charge, expiry by the clock — live in the database
// (activate_free_trial, migration 140) and were exercised end to end on staging.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${p}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("the trial confirm button", () => {
  const src = read("src/components/FreeTrialActivation.tsx");
  const modal = read("src/components/Modal.tsx");

  it("is rendered in a portal, which is why it needs an explicit form link", () => {
    expect(modal).toContain("createPortal(");
  });
  it("is bound to the activation form by id", () => {
    expect(src).toMatch(/const formId = useId\(\);/);
    expect(src).toMatch(/<form\s+id=\{formId\}/);
    const confirm = src.slice(src.indexOf("<Modal"), src.indexOf("</Modal>"));
    expect(confirm).toMatch(/<button type="submit" form=\{formId\}/);
  });
  it("still cannot be bypassed by a direct submit — the confirm step stays the gate", () => {
    expect(src).toMatch(/if \(!confirming\) \{\s*e\.preventDefault\(\);/);
  });
});

describe("Add Child offers the trial before any payment", () => {
  const wizard = read("src/components/AddChildWizard.tsx");
  const page = read("src/app/(parent)/children/new/page.tsx");

  it("shows the owner's note in the payment section", () => {
    expect(wizard).toContain('{tt("addchild.trialNote")}');
    expect(page).toContain('"addchild.trialNote"');
  });
  it("links to the one trial picker instead of duplicating it", () => {
    expect(wizard).toMatch(/href=\{`\/children\/\$\{studentProfileId\}\/subscribe`\}/);
    expect(wizard).toContain('{tt("addchild.startTrial")}');
  });
  it("keeps paying now available, as the secondary action", () => {
    expect(wizard).toContain("onClick={confirmPayment}");
    expect(wizard).toContain('className={payableNow && studentProfileId ? "btn-ghost" : "btn"}');
  });
});

describe("after the trial, payment happens in the parent's area", () => {
  it("the subscription page offers the trial first, then the paid form once it is used", () => {
    const sub = read("src/app/(parent)/children/[id]/subscribe/page.tsx");
    expect(sub).toMatch(/!trial\.used \? \(/);
    expect(sub.indexOf("<FreeTrialActivation")).toBeGreaterThan(sub.indexOf("!trial.used ? ("));
    expect(sub).toContain("<SubscribeForm");
  });
});

describe("copy", () => {
  it("exists in all three languages, and the note names 24 hours and 2 subjects", () => {
    for (const loc of locales) {
      const note = messages[loc]["addchild.trialNote"];
      expect(note?.trim(), `${loc} note`).toBeTruthy();
      expect(note, `${loc} note`).toMatch(/24/);
      expect(note, `${loc} note`).toMatch(/2/);
      expect(messages[loc]["addchild.startTrial"]?.trim(), `${loc} cta`).toBeTruthy();
    }
    expect(messages.en["addchild.trialNote"]).toBe(
      "Note: You will receive a free 24-hour trial for 2 subjects of your choice. After the trial expires, payment must be completed through the Parent Profile to continue using the platform.",
    );
  });
});
