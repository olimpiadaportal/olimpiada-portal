// A missing i18n key is invisible to tsc and to `next build`: getT() falls back
// to the raw key, so the page renders "contact.responseTime" to a real visitor.
// These assertions are the only thing that catches it, and the contact card is
// the surface where it would be least noticed — three pages render it, and
// nobody opens the student one while reviewing.
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

/** Every key ContactInfo resolves. */
const CONTACT_KEYS = [
  "contact.generalTitle",
  "contact.generalDesc",
  "contact.supportTitle",
  "contact.supportDesc",
  "contact.responseTime",
  "contact.address",
  "contact.phoneLabel",
  "contact.whatsappLabel",
  "contact.mapsCaption",
] as const;

describe("contact i18n", () => {
  for (const locale of locales) {
    it(`${locale}: every key the contact card renders resolves to real text`, () => {
      const dict = messages[locale] as Record<string, string | undefined>;
      const missing = CONTACT_KEYS.filter((k) => {
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

  // Migration 117 withdrew the separate bug-report feature: the contact card is
  // now mailto links only. A stray bug.* key would be a dead string nobody
  // renders, and the next person to read the dictionary would look for the form.
  it("no bug-report keys survive in any locale", () => {
    for (const locale of locales) {
      const stray = Object.keys(messages[locale]).filter((k) =>
        k.startsWith("bug.") || k.startsWith("contact.bugCta"),
      );
      expect(stray).toEqual([]);
    }
  });
});
