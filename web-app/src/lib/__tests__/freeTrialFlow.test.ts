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

describe("Add Child is trial-first (owner, 2026-10-10)", () => {
  const wizard = read("src/components/AddChildWizard.tsx");
  const page = read("src/app/(parent)/children/new/page.tsx");
  const picker = read("src/components/FreeTrialActivation.tsx");

  it("runs info → trial → done, with no subscription or payment step", () => {
    expect(wizard).toContain('real: ["info", "trial", "done"]');
    for (const gone of ["subscribeChild", "quoteSubscription", "CheckoutRedirect", '"payment"', '"plan"']) {
      expect(wizard, gone).not.toContain(gone);
    }
  });
  it("renders the ONE trial picker inline and advances on success", () => {
    expect(wizard).toContain("<FreeTrialActivation");
    expect(wizard).toMatch(/onActivated=\{\(endsAt, ids\) => \{/);
    expect(picker).toContain("if (state.ok && onActivated) return null;");
  });
  it("offers only the subjects the chosen grade studies", () => {
    expect(page).toContain("TAUGHT_SUBJECTS_RPC");
    expect(wizard).toContain("taughtByGrade[gradeId]");
  });
  it("asks for exactly two subjects", () => {
    expect(picker).toContain("const required = Math.min(TRIAL_MAX_SUBJECTS, subjects.length);");
    expect(picker).toContain("disabled={!ready || pending}");
  });
  it("can be skipped, and the done step then leads to Manage Subscription", () => {
    expect(wizard).toContain('{tt("addchild.trial.skip")}');
    expect(wizard).toMatch(/href=\{`\/children\/\$\{studentProfileId\}\/subscribe`\}/);
    expect(wizard).toContain('{tt("addchild.manageSubscription")}');
  });
  it("reveals the 8-digit ID that was issued with the child", () => {
    expect(wizard).toContain("setChildUniqueId(res.childUniqueId ?? null);");
    expect(wizard).toContain("<CopyableId id={childUniqueId}");
  });
  it("has every key it renders in the page's dictionary", () => {
    const keys = new Set([...wizard.matchAll(/tt\("([^"]+)"\)/g)].map((m) => m[1]));
    for (const k of keys) expect(page, k).toContain(`"${k}"`);
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
  it("the onboarding offer exists in all three languages and names 24 hours and 2 subjects", () => {
    for (const loc of locales) {
      const title = messages[loc]["addchild.trial.title"];
      expect(title?.trim(), `${loc} title`).toBeTruthy();
      expect(title, `${loc} title`).toMatch(/24/);
      expect(title, `${loc} title`).toMatch(/2/);
      for (const k of [
        "addchild.step.trial", "addchild.trial.body", "addchild.trial.skip",
        "addchild.trial.started", "addchild.trial.subjects", "addchild.created",
        "addchild.manageSubscription",
      ]) {
        expect(messages[loc][k]?.trim(), `${loc} ${k}`).toBeTruthy();
      }
    }
    expect(messages.en["addchild.trial.title"]).toBe(
      "Choose 2 subjects and enjoy 24 hours of FREE access!",
    );
  });
  it("never asks for a card or a price in the offer", () => {
    for (const loc of locales) {
      expect(messages[loc]["addchild.trial.title"]).not.toMatch(/AZN|₼|\d+[.,]\d{2}/);
    }
  });
});
