// The redesigned subject deletion dialog, asserted on its source.
//
// Source-level rather than rendered, and deliberately: the properties that
// broke here are CSS class names and the presence or absence of a control, both
// of which a jsdom render reports as "an element exists" without telling you it
// looked like an unstyled browser button on a red block. The repo already uses
// this shape for invariants that live in a file rather than in behaviour
// (guarded-deletion-sql, olympiad-pool-replace-sql, subject-status).
//
// What is pinned is the owner's punch list, one assertion per complaint:
//   "the destructive action button is an aggressive red block and the text is
//    difficult to read"          -> .btn-danger must COMPOSE with .btn
//   "too many red-bordered blocks without clear prioritization"
//                                -> refusals are amber + neutral chips, and
//                                   exactly one control in the dialog is red
//   "the difference between deleting questions, archiving a subject and
//    deleting a subject is not presented clearly"
//                                -> archive is offered INSIDE the dialog
//   "if content is long, use a clean scrollable body with a stable footer"
//                                -> the footer is sticky inside .modal-body
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

const SRC = readFileSync(
  resolve(process.cwd(), "src/components/SubjectDeleteButton.tsx"),
  "utf8",
)
  .split("\r\n")
  .join("\n");

describe("the destructive buttons are readable", () => {
  it("never uses .btn-danger without .btn", () => {
    // .btn-danger declares ONLY `background: #dc2626`. Without .btn there is no
    // white text, no padding, no border reset and no radius — the browser's
    // default 13px black system button sits on a red fill. That single missing
    // class is what the owner saw.
    const matches = SRC.match(/className="[^"]*btn-danger[^"]*"/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      // `btn-danger-ghost` is its own composed pair and is allowed.
      if (m.includes("btn-danger-ghost")) continue;
      expect(m, `${m} must compose with .btn`).toMatch(/"btn btn-danger"/);
    }
  });

  it("spends red on exactly one control", () => {
    // Two identical red buttons is what made "clear the bank" and "delete the
    // subject" indistinguishable. The bank purge is amber — the panel's
    // existing idiom for destructive-but-recoverable (LeaderboardResetControls
    // wipes a ledger behind btn-warn).
    const red = SRC.match(/className="btn btn-danger"/g) ?? [];
    expect(red).toHaveLength(1);
    expect(SRC).toContain('className="btn btn-warn"');
  });
});

describe("the three actions are separated, and the safe one is present", () => {
  it("offers Archive inside the dialog", () => {
    // Every one of the ten refusal sentences the database returns ends with
    // "archive the subject instead", and until now the only Archive control was
    // on the list row, outside the screen that made the recommendation.
    expect(SRC).toContain('from "@/lib/admin/subject-status"');
    expect(SRC).toContain('fd.set("__action", "archive")');
    expect(SRC).toContain("strings.archiveTitle");
  });

  it("keeps the purge and the delete in their own accented sections", () => {
    expect(SRC).toContain('accent="warn"');
    expect(SRC).toContain('accent="danger"');
    // The accent is a left rule (the .setting-card-warn formula), never a
    // filled red panel.
    expect(SRC).toContain("inset 3px 0 0 #dc2626");
    expect(SRC).toContain("setting-card-warn");
  });

  it("states the outcome before the click", () => {
    // The database decides delete-vs-archive from the answered-question count.
    // The admin should not learn which one happened from the success message.
    expect(SRC).toContain("questions.archivedInstead > 0");
    expect(SRC).toContain("strings.outcomeArchive");
    expect(SRC).toContain("strings.outcomeDelete");
  });

  it("explains a disabled purge instead of just greying it", () => {
    expect(SRC).toContain("strings.purgeEmpty");
    expect(SRC).toContain("strings.gateHint");
  });
});

describe("warnings are prioritised, not stacked", () => {
  it("renders refusals as one amber callout plus neutral chips", () => {
    // The old dialog gave every reason its own full red box (.form-error on the
    // heading AND on each <li>), so ten counted reasons became ten red blocks
    // and a REFUSAL looked identical to a CONSEQUENCE.
    expect(SRC).toContain('className="loc-impact-blocked"');
    expect(SRC).toContain('className="loc-impact"');
    expect(SRC).not.toMatch(/<li[^>]*className="form-error"/);
  });

  it("renders the purge consequence in amber, distinct from a refusal", () => {
    expect(SRC).toContain('className="cur-form-note"');
  });

  it("keeps the irreversible line as small muted text, not a red box", () => {
    const irreversible = SRC.slice(SRC.indexOf("strings.irreversible"));
    expect(SRC).toContain('className="loc-impact-note"');
    expect(irreversible.slice(0, 200)).not.toContain("form-error");
  });
});

describe("structure", () => {
  it("does not fork the shared destructive dialog", () => {
    // DestructiveConfirm still serves the olympiad package, the grade pool and
    // the bulk pool delete. Restyling it for a concept only subjects have
    // (a safe alternative) would have changed all three.
    // The prose header explains the split, so this asserts the IMPORT.
    expect(SRC).not.toMatch(/from "@\/components\/DestructiveConfirm"/);
  });

  it("keeps a stable footer over a scrollable body", () => {
    // .modal-body is the scroll container, so a sticky child rides its bottom
    // edge — Cancel is reachable without scrolling past ten blocking reasons.
    expect(SRC).toContain('position: "sticky"');
    expect(SRC).toContain("strings.cancel");
  });

  it("still confirms with the typed word and never posts the row's code", () => {
    // The word is validated in the action, which then reads the subject's OWN
    // code and hands THAT to the RPC — the browser can never supply the value
    // the database compares under its lock.
    expect(SRC).toContain("SUBJECT_DELETE_WORD");
    expect(SRC).toContain("typed === SUBJECT_DELETE_WORD");
    expect(SRC).toContain('name="__code"');
    expect(SRC).not.toContain("preview.code");
  });

  it("re-reads the counts after a purge so the delete is never offered on stale numbers", () => {
    expect(SRC).toContain("refresh()");
    expect(SRC).toContain("refreshKey");
  });
});

describe("the copy it asks for exists in all three languages", () => {
  const USED = Array.from(
    new Set(
      (
        readFileSync(
          resolve(process.cwd(), "src/app/(protected)/manage/subjects/strings.ts"),
          "utf8",
        ).match(/t\("([a-zA-Z.]+)"\)/g) ?? []
      ).map((m) => m.slice(3, -2)),
    ),
  );

  it("resolves every key the Subjects screens ask for", () => {
    expect(USED.length).toBeGreaterThan(30);
    for (const k of USED) {
      expect(messages.az[k], `az is missing ${k}`).toBeTruthy();
      expect(messages.en[k], `en is missing ${k}`).toBeTruthy();
      expect(messages.ru[k], `ru is missing ${k}`).toBeTruthy();
    }
  });
});
