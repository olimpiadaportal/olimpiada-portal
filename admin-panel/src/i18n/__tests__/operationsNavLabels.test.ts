// ƏMƏLİYYATLAR — the two sidebar entries the owner renamed on 2026-08-19.
//
// This is a DISPLAY-LABEL change and nothing else. The i18n keys, the routes,
// the permission flags and the component names all stay, because every one of
// them is referenced from somewhere a rename would quietly break: a changed key
// renders as the key itself (getDict() has no cross-locale fallback and every
// consumer does `dict[k] ?? k`), and a changed href breaks bookmarks, the
// notification deep links and the middleware's route matching.
//
// So this suite asserts both halves: the labels moved, and nothing else did.
// It also pins the two strings that REPEAT a renamed label — alerts.pageTitle is
// the /alerts page heading, and it carried the old "Bildirişlərim" wording, so a
// rename that touched only the sidebar would leave the page contradicting the
// menu item that leads to it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "@/i18n/messages";
import { locales, type Locale } from "@/i18n/config";
import { NAV } from "@/lib/admin/nav";
import { localStrings as alertsStrings } from "@/app/(protected)/alerts/labels";

const QUESTION_REPORTS: Record<Locale, string> = {
  az: "Texniki dəstək",
  en: "Technical support",
  ru: "Техническая поддержка",
};

const ALERTS: Record<Locale, string> = {
  az: "Admin bildirişləri",
  en: "Admin notifications",
  ru: "Уведомления администратора",
};

/** Unchanged by this round — asserted so a future edit cannot drift it. */
const NOTIFICATIONS: Record<Locale, string> = {
  az: "Bildirişlər",
  en: "Notifications",
  ru: "Уведомления",
};

/** Every wording the rename replaced, in every language it existed in. */
const RETIRED = [
  "Sual bildirişləri",
  "Question reports",
  "Жалобы на вопросы",
  "Bildirişlərim",
  "My Alerts",
  "Мои уведомления",
];

describe("the renamed operations labels", () => {
  for (const locale of locales) {
    it(`${locale}: nav.questionReports reads "${QUESTION_REPORTS[locale]}"`, () => {
      expect(messages[locale]["nav.questionReports"]).toBe(QUESTION_REPORTS[locale]);
    });

    it(`${locale}: nav.alerts reads "${ALERTS[locale]}"`, () => {
      expect(alertsStrings(locale)("nav.alerts")).toBe(ALERTS[locale]);
    });

    it(`${locale}: the /alerts page heading matches its own menu entry`, () => {
      expect(alertsStrings(locale)("alerts.pageTitle")).toBe(ALERTS[locale]);
    });

    it(`${locale}: nav.notifications is untouched`, () => {
      expect(messages[locale]["nav.notifications"]).toBe(NOTIFICATIONS[locale]);
    });
  }

  it("the three labels are distinct in every language", () => {
    // Two sidebar rows both reading "Bildirişlər…" is the confusion the rename
    // exists to end; a translation that collapsed two of them would restore it.
    for (const locale of locales) {
      const row = [
        messages[locale]["nav.notifications"],
        alertsStrings(locale)("nav.alerts"),
        messages[locale]["nav.questionReports"],
      ];
      expect(new Set(row).size, `${locale} has duplicate sidebar labels`).toBe(3);
    }
  });

  it("no retired wording survives in either dictionary", () => {
    const files = [
      readFileSync(resolve(process.cwd(), "src/i18n/messages.ts"), "utf8"),
      readFileSync(resolve(process.cwd(), "src/app/(protected)/alerts/labels.ts"), "utf8"),
    ];
    for (const source of files) {
      for (const retired of RETIRED) {
        expect(source, `"${retired}" is still shipped`).not.toContain(`"${retired}"`);
      }
    }
  });
});

describe("only the labels moved", () => {
  const operations = NAV.find((g) => g.label === "group.operations");

  it("the ƏMƏLİYYATLAR group still exists", () => {
    expect(operations).toBeDefined();
  });

  it("the question-reports entry keeps its key, route and admin-only flag", () => {
    const item = operations!.items.find((i) => i.label === "nav.questionReports");
    expect(item).toEqual({
      label: "nav.questionReports",
      href: "/question-reports",
      adminOnly: true,
    });
    // No `permission` field, so there is no code a content manager could ever
    // be granted by accident — the page reveals answer keys.
    expect(item).not.toHaveProperty("permission");
  });

  it("the alerts entry keeps its key and route, and stays open to panel users", () => {
    const item = operations!.items.find((i) => i.label === "nav.alerts");
    expect(item).toEqual({ label: "nav.alerts", href: "/alerts" });
  });

  it("nav.alerts is still resolved by the local fallback, not messages.ts", () => {
    // The layout's navLabel chain tries t(key) first and falls through to the
    // local trilingual modules. Defining nav.alerts in messages.ts as well would
    // give one label two sources, and the losing one would be edited forever.
    for (const locale of locales) {
      expect(messages[locale]["nav.alerts"]).toBeUndefined();
    }
  });
});
