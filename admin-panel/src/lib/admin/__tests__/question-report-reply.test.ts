// Migration 122 — the administrator writes the answer a student receives.
//
// The message is assembled TWICE: once by the database, which is what actually
// sends it (public.question_report_reply_text, called from
// trg_notify_question_report_status), and once in TypeScript, which is what the
// composer previews while the admin types. A preview that disagreed with the
// send would be worse than no preview — the admin approves one message and the
// student reads another — so this suite pins the two together LITERAL BY
// LITERAL, against both copies of the SQL: the migration and the canonical 011
// backport a from-zero rebuild actually runs.
//
// Nothing here touches a database. Everything asserted below is invisible to a
// query until after the damage: a frame rendered in UTC still looks like a
// timestamp, a notifier that swallows a failed send still returns success, and
// a freeze trigger that "completes" its column list still moves the status.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPLY_CLOSING,
  REPLY_JOIN,
  REPLY_MAX_LENGTH,
  REPLY_MIN_LENGTH,
  REPLY_OPENING,
  bakuFilingStamp,
  buildReportReply,
  normalizeReportLocale,
  replyLength,
  trimReplyBody,
  validateReplyBody,
} from "@/lib/admin/question-report-reply";
import { locales } from "@/i18n/config";
import { messages } from "@/i18n/messages";

// Resolved from the vitest root (admin-panel), NOT with `new URL(…,
// import.meta.url)`: Vite rewrites that pattern into an asset import and then
// refuses to serve a file outside the project. Same helper as
// guarded-deletion-sql.test.ts.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const MIGRATION = read("supabase/sql/migrations/2026_08_19_122_question_report_reply.sql");
const SQL_008 = read("supabase/sql/008_notifications_support_audit.sql");
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");

/** A function's dollar-quoted body — the part that must match across copies. */
function body(sql: string, name: string): string {
  const decl = sql.indexOf(`create or replace function public.${name}(`);
  expect(decl, `${name} is declared`).toBeGreaterThan(-1);
  const at = sql.indexOf("\nas $$\n", decl);
  expect(at, `${name} has a dollar-quoted body`).toBeGreaterThan(decl);
  const end = sql.indexOf("\n$$;", at);
  expect(end, `${name} body is terminated`).toBeGreaterThan(at);
  return sql.slice(at, end + 4);
}

const FREEZE_MIGRATION = body(MIGRATION, "question_report_freeze");
const FRAME_MIGRATION = body(MIGRATION, "question_report_reply_text");
const FRAME_011 = body(SQL_011, "question_report_reply_text");
const NOTIFIER_MIGRATION = body(MIGRATION, "notify_question_report_status_tg");
const NOTIFIER_011 = body(SQL_011, "notify_question_report_status_tg");
const FREEZE_011 = body(SQL_011, "question_report_freeze");

// 2026-08-19 05:30 UTC. Baku is UTC+4 with no DST, so a student must read 09:30.
const FILED_AT = "2026-08-19T05:30:00.000Z";

describe("the reply frame is one definition, not two", () => {
  it("the migration and the canonical 011 backport carry the same function", () => {
    expect(FRAME_011).toBe(FRAME_MIGRATION);
  });

  it("the notifier is backported byte-for-byte too", () => {
    expect(NOTIFIER_011).toBe(NOTIFIER_MIGRATION);
  });

  it("so is the freeze trigger the migration only re-commented", () => {
    // The canonical file is what a from-zero rebuild runs. A migration whose
    // copy has drifted applies one behaviour to the live database and leaves a
    // different one waiting in the file a rebuild would use.
    expect(FREEZE_011).toBe(FREEZE_MIGRATION);
  });

  for (const locale of locales) {
    it(`${locale}: every literal of the opening line exists in the SQL`, () => {
      // The SQL builds the opening by concatenation, so the template's fixed
      // segments are what can be compared. An empty segment (az starts with
      // {date}) has nothing to assert.
      const parts = REPLY_OPENING[locale].split(/\{date\}|\{time\}/);
      expect(parts.length).toBe(3);
      for (const part of parts) {
        if (part === "") continue;
        expect(FRAME_MIGRATION, `${locale} opening segment ${JSON.stringify(part)}`)
          .toContain(`'${part}'`);
      }
    });

    it(`${locale}: the closing line exists in the SQL verbatim`, () => {
      expect(FRAME_MIGRATION).toContain(`'${REPLY_CLOSING[locale]}'`);
    });
  }

  it("the SQL formats the filing moment in Asia/Baku, dd.MM.yyyy and HH:mm", () => {
    expect(FRAME_MIGRATION).toContain("'Asia/Baku'");
    expect(FRAME_MIGRATION).toContain("'DD.MM.YYYY'");
    expect(FRAME_MIGRATION).toContain("'HH24:MI'");
    // UTC would show every student a moment four hours before the one they
    // remember, and would still look like a valid timestamp.
    expect(FRAME_MIGRATION).not.toContain("at time zone 'UTC'");
  });

  it("the SQL joins the three parts with BLANK lines and trims the body", () => {
    // Two occurrences: opening→body and body→closing.
    expect(FRAME_MIGRATION.split("E'\\n\\n'").length - 1).toBe(2);
    expect(FRAME_MIGRATION).toContain("btrim(coalesce(p_body, '')");
  });

  it("an unrecognised locale falls back to az on both sides", () => {
    expect(FRAME_MIGRATION).toContain("when p_locale in ('en','ru') then p_locale else 'az'");
    expect(normalizeReportLocale("tr")).toBe("az");
    expect(normalizeReportLocale(undefined)).toBe("az");
    expect(normalizeReportLocale("ru")).toBe("ru");
  });
});

describe("assembly: opening + body + closing, in the REPORT's language", () => {
  it("az", () => {
    expect(buildReportReply({ locale: "az", createdAt: FILED_AT, body: "Cavab düzəldildi." })).toBe(
      [
        "19.08.2026 tarixində saat 09:30-də ünvanladığınız sorğu araşdırılmışdır.",
        "Cavab düzəldildi.",
        "Diqqətiniz və anlayışınız üçün təşəkkür edirik.",
      ].join("\n\n"),
    );
  });

  it("en", () => {
    expect(
      buildReportReply({ locale: "en", createdAt: FILED_AT, body: "The answer key is fixed." }),
    ).toBe(
      [
        "Your report submitted on 19.08.2026 at 09:30 has been reviewed.",
        "The answer key is fixed.",
        "Thank you for your attention and understanding.",
      ].join("\n\n"),
    );
  });

  it("ru", () => {
    expect(
      buildReportReply({ locale: "ru", createdAt: FILED_AT, body: "Ключ ответа исправлен." }),
    ).toBe(
      [
        "Ваше обращение, направленное 19.08.2026 в 09:30, было рассмотрено.",
        "Ключ ответа исправлен.",
        "Благодарим за внимание и понимание.",
      ].join("\n\n"),
    );
  });

  it("the parts are separated by a BLANK line, not a single newline", () => {
    const out = buildReportReply({ locale: "en", createdAt: FILED_AT, body: "0123456789" });
    expect(REPLY_JOIN).toBe("\n\n");
    expect(out?.split("\n\n").length).toBe(3);
  });

  it("the same report yields three different frames for three locales", () => {
    const parts = locales.map((l) =>
      buildReportReply({ locale: l, createdAt: FILED_AT, body: "0123456789" }),
    );
    expect(new Set(parts).size).toBe(3);
  });

  it("the body is trimmed before it is framed", () => {
    const out = buildReportReply({
      locale: "en",
      createdAt: FILED_AT,
      body: "  \n\tThe answer key is fixed.\r\n ",
    });
    expect(out).toContain("\n\nThe answer key is fixed.\n\n");
  });

  it("an unusable created_at yields no preview rather than a wrong one", () => {
    expect(buildReportReply({ locale: "az", createdAt: "not-a-date", body: "0123456789" })).toBeNull();
    expect(buildReportReply({ locale: "az", createdAt: null, body: "0123456789" })).toBeNull();
  });
});

describe("Baku wall-clock, never the server's clock", () => {
  it("05:30 UTC is 09:30 in Baku, on the same day", () => {
    expect(bakuFilingStamp(FILED_AT)).toEqual({ date: "19.08.2026", time: "09:30" });
  });

  it("late-evening UTC rolls the DATE forward, which a UTC render would not", () => {
    expect(bakuFilingStamp("2026-08-19T21:15:00.000Z")).toEqual({
      date: "20.08.2026",
      time: "01:15",
    });
  });

  it("midwinter is the same offset — Azerbaijan has no DST", () => {
    expect(bakuFilingStamp("2026-01-15T00:00:00.000Z")).toEqual({
      date: "15.01.2026",
      time: "04:00",
    });
  });

  it("both fields are zero-padded", () => {
    expect(bakuFilingStamp("2026-03-05T01:05:00.000Z")).toEqual({
      date: "05.03.2026",
      time: "05:05",
    });
  });
});

describe("the body is validated the same way in every layer", () => {
  it("refuses fewer than ten characters after trimming", () => {
    expect(validateReplyBody("        ")).toEqual({ ok: false, reason: "too_short" });
    expect(validateReplyBody("123456789")).toEqual({ ok: false, reason: "too_short" });
    expect(validateReplyBody("  123456789  ")).toEqual({ ok: false, reason: "too_short" });
    expect(validateReplyBody(undefined)).toEqual({ ok: false, reason: "too_short" });
  });

  it("accepts exactly ten and returns the TRIMMED body", () => {
    expect(validateReplyBody("  0123456789 \n")).toEqual({ ok: true, body: "0123456789" });
  });

  it("refuses more than a thousand", () => {
    expect(validateReplyBody("x".repeat(REPLY_MAX_LENGTH))).toEqual({
      ok: true,
      body: "x".repeat(REPLY_MAX_LENGTH),
    });
    expect(validateReplyBody("x".repeat(REPLY_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("trims the same four characters the database trims, and no more", () => {
    // A non-breaking space is NOT whitespace to btrim(x, ' \\t\\n\\r'), so it
    // must not be whitespace here either — otherwise the two layers measure
    // different lengths for the same string.
    expect(trimReplyBody(" \t\r\nabc \t\r\n")).toBe("abc");
    expect(trimReplyBody(" abc ")).toBe(" abc ");
  });

  it("the database holds the same bounds", () => {
    for (const sql of [MIGRATION, SQL_008]) {
      expect(sql).toContain("chk_question_reports_resolution_message");
      expect(sql).toContain("btrim(resolution_message");
      expect(sql).toContain(`between ${REPLY_MIN_LENGTH} and ${REPLY_MAX_LENGTH}`);
    }
  });
});

describe("the send is required, atomic and unswallowed", () => {
  it("the notifier composes the reply through the one assembler", () => {
    expect(NOTIFIER_MIGRATION).toContain("public.question_report_reply_text(");
  });

  it("a closing transition with nothing to say RAISES", () => {
    expect(NOTIFIER_MIGRATION).toContain("new.resolution_message");
    expect(NOTIFIER_MIGRATION).toMatch(/char_length\(v_reply\) < 10/);
    expect(NOTIFIER_MIGRATION).toContain("errcode = 'check_violation'");
  });

  it("migration 117's swallow is gone — a failed send aborts the transition", () => {
    expect(NOTIFIER_MIGRATION).not.toContain("exception when others");
    expect(NOTIFIER_MIGRATION).not.toContain("raise warning");
    expect(NOTIFIER_011).not.toContain("exception when others");
  });

  it("in_review keeps its fixed copy and opens no composer", () => {
    expect(NOTIFIER_MIGRATION).toContain("'question_report_in_review'");
    expect(NOTIFIER_MIGRATION).toContain("We got your report about the question");
  });

  it("reopening to 'new' still notifies nobody", () => {
    expect(NOTIFIER_MIGRATION).toContain(
      "-- Reopening a report to 'new' is an internal correction, not news.",
    );
  });

  it("the idempotency key survives, plus a discriminator for a corrected reply", () => {
    // Without the md5, an admin who reopens and re-closes with a CORRECTED
    // answer delivers nothing: the (report, status) key was spent on the first.
    expect(NOTIFIER_MIGRATION).toContain("'qreport:' || new.id::text");
    expect(NOTIFIER_MIGRATION).toContain("md5(v_body)");
  });

  it("the freeze leaves resolution_message writable BY OMISSION", () => {
    // It restores a fixed list; the reply is writable precisely because it is
    // not on that list. "Completing" the list breaks nothing visible and
    // discards every reply on its way to the notifier.
    expect(FREEZE_011).toContain("new.message             := old.message;");
    expect(FREEZE_011).not.toContain("new.resolution_message :=");
    expect(FREEZE_011).toContain("resolution_message is DELIBERATELY ABSENT");
  });

  it("013 asserts all of it from the live database", () => {
    expect(SQL_013).toContain("109_question_report_reply");
    expect(SQL_013).toContain("question_report_reply_text");
    expect(SQL_013).toContain("send_failure_aborts_triage");
  });
});

describe("the composer's own strings are trilingual", () => {
  const KEYS = [
    "report.reply.titleResolved",
    "report.reply.titleRejected",
    "report.reply.bodyLabel",
    "report.reply.bodyPlaceholder",
    "report.reply.autoNote",
    "report.reply.preview",
    "report.reply.charCount",
    "report.reply.send",
    "report.reply.cancel",
    "report.reply.tooShort",
    "report.reply.tooLong",
    "report.reply.failed",
    "report.reply.sentHeading",
  ] as const;

  for (const locale of locales) {
    it(`${locale}: every composer key resolves to real text`, () => {
      const dict = messages[locale] as Record<string, string | undefined>;
      const missing = KEYS.filter((k) => typeof dict[k] !== "string" || dict[k]!.trim() === "");
      expect(missing).toEqual([]);
    });
  }

  it("the detail page hands the component EVERY key it reads", () => {
    // The known failure shape in this panel: a page builds a FIXED key array
    // and the component does `dict[k] ?? k`, so an omitted key renders raw on
    // screen however well it was translated.
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(protected)/question-reports/[id]/page.tsx"),
      "utf8",
    );
    const component = readFileSync(
      resolve(process.cwd(), "src/components/QuestionReportStatus.tsx"),
      "utf8",
    );
    const readByComponent = new Set(
      [...component.matchAll(/tt\("([^"]+)"\)/g)].map((m) => m[1]),
    );
    // The error sentences are reached through ERROR_KEYS, not a tt() literal.
    for (const k of ["report.reply.tooShort", "report.reply.tooLong", "report.reply.failed"]) {
      readByComponent.add(k);
    }
    const handedByPage = new Set(
      [...page.matchAll(/"([a-z][A-Za-z0-9_.]*\.[A-Za-z0-9_.]+)"/g)].map((m) => m[1]),
    );
    const missing = [...readByComponent].filter((k) => !handedByPage.has(k));
    expect(missing).toEqual([]);
  });

  it("the three languages actually differ (no copied Azerbaijani)", () => {
    for (const k of KEYS) {
      // charCount is a pure format string; it is the same in every language on
      // purpose and would fail a difference test for the right reason.
      if (k === "report.reply.charCount") continue;
      const values = locales.map((l) => messages[l][k]);
      expect(new Set(values).size, `${k} is not translated`).toBe(3);
    }
  });
});

describe("the three gates agree on what they are counting", () => {
  // JS `.length` counts UTF-16 code units; `char_length()` counts characters.
  // A reply of six emoji reads as 12 in the browser and 6 in the database, so
  // the composer enabled Send, the server action agreed, and the DB CHECK
  // rejected it as the opaque generic failure with nothing to tell the admin.
  it("counts what the DATABASE counts, not UTF-16 units", () => {
    const sixAstral = "\u{1F600}".repeat(6);
    expect(sixAstral.length, "precondition: 12 UTF-16 units").toBe(12);
    expect(replyLength(sixAstral)).toBe(6);
    expect(validateReplyBody(sixAstral).ok, "6 characters is below the floor").toBe(false);

    const tenAstral = "\u{1F600}".repeat(10);
    expect(replyLength(tenAstral)).toBe(10);
    expect(validateReplyBody(tenAstral).ok).toBe(true);
  });

  it("still trims before measuring", () => {
    expect(validateReplyBody("   " + "a".repeat(9) + "   ").ok).toBe(false);
    expect(validateReplyBody("   " + "a".repeat(10) + "   ").ok).toBe(true);
  });
});

describe("a reply is never silently discarded", () => {
  // The guard was inherited from the payload-free transition action, where
  // returning ok on a no-op was harmless. Here the request CARRIES text the
  // admin just typed: the old branch skipped the update, the audit row and the
  // notification, then closed the dialog reporting success.
  const ACTIONS = read("admin-panel/src/lib/admin/questionReports.ts");

  it("reports the already-in-that-status case instead of faking success", () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function replyQuestionReport"));
    expect(
      fn.includes("if (current.status === to) return { ok: true };"),
      "a same-status reply must not return success without storing anything",
    ).toBe(false);
    expect(fn).toContain('if (current.status === to) return { ok: false, error: "already" };');
  });

  it("has a translated message for it in all three languages", () => {
    for (const l of locales) {
      expect(messages[l]["report.reply.already"], `missing in ${l}`).toBeTruthy();
    }
    expect(new Set(locales.map((l) => messages[l]["report.reply.already"])).size).toBe(3);
  });
});
