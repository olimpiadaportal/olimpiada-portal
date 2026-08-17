// A missing i18n key is invisible to tsc and to `next build`: getT() falls back
// to the raw key, so the page renders "contact.responseTime" to a real visitor.
// These assertions are the only thing that catches it, and the contact card is
// the surface where it would be least noticed — three pages render it, and
// nobody opens the student one while reviewing.
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import { BUG_DIALOG_KEYS } from "@/lib/support/bugReport";

/** Everything ContactInfo resolves itself; the dialog's keys come from the shared list. */
const CONTACT_KEYS = [
  "contact.generalTitle",
  "contact.generalDesc",
  "contact.supportTitle",
  "contact.supportDesc",
  "contact.responseTime",
  "contact.bugCtaHint",
  "contact.address",
  "contact.phoneLabel",
  "contact.whatsappLabel",
  "contact.mapsCaption",
] as const;

describe("contact + report-a-bug i18n", () => {
  for (const locale of locales) {
    it(`${locale}: every key the contact card renders resolves to real text`, () => {
      const dict = messages[locale] as Record<string, string | undefined>;
      const missing = [...CONTACT_KEYS, ...BUG_DIALOG_KEYS].filter((k) => {
        const v = dict[k];
        return typeof v !== "string" || v.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }

  // Trilingual is a house rule, not a preference: a key added to az only would
  // fall back to Azerbaijani text on the English and Russian sites.
  it("az / en / ru declare the same key set", () => {
    const az = Object.keys(messages.az).sort();
    expect(Object.keys(messages.en).sort()).toEqual(az);
    expect(Object.keys(messages.ru).sort()).toEqual(az);
  });

  // The server returns these keys verbatim (lib/support/bugReportCore.ts); the
  // dialog looks them up in `dict`. If the two lists drift, a real error turns
  // into a raw key on screen at exactly the moment something is already wrong.
  it("every error key the server can return is in the dialog's key list", () => {
    const serverKeys = [
      "bug.emptyErr",
      "bug.err.tooLong",
      "bug.err.tooMany",
      "bug.err.duplicate",
      "bug.err.generic",
    ];
    for (const k of serverKeys) {
      expect(BUG_DIALOG_KEYS).toContain(k);
    }
  });
});
