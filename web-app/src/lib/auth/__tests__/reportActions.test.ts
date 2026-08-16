// "Report a problem" server action (migration 115).
//
// What is pinned here is the set of properties that fail SILENTLY. An action
// that reads its input before its guard still works for a signed-in child; a
// locale taken from the payload still renders a plausible admin row; a raw
// Postgres message still "shows an error". None of those show up in a click
// through the UI — they only show up as a wrong row in the reports table, or as
// database internals on a child's screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_MESSAGE_MAX } from "@/lib/reportMessage";

// Order of the two things that must never swap: authorization and reading input.
const order: string[] = [];

const requireChild = vi.fn(async () => {
  order.push("guard");
  return { profileId: "child-profile" };
});
const rateLimitAllow = vi.fn(() => true);
const getLocale = vi.fn(async () => "ru");

type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcResult: { data: unknown; error: { code?: string; message?: string } | null } = {
  data: "report-id",
  error: null,
};

vi.mock("@/lib/auth/session", () => ({ requireChild: () => requireChild() }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimitAllow: (...a: unknown[]) => rateLimitAllow(...(a as [])),
}));
vi.mock("@/i18n/server", () => ({ getLocale: () => getLocale() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      order.push("rpc");
      rpcCalls.push({ name, args });
      return rpcResult;
    },
  }),
}));

const { reportQuestionProblem } = await import("@/lib/auth/reportActions");

const QUESTION = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const ATTEMPT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

beforeEach(() => {
  order.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: "report-id", error: null };
  requireChild.mockClear();
  rateLimitAllow.mockClear();
  rateLimitAllow.mockReturnValue(true);
});

describe("reportQuestionProblem — authorization", () => {
  it("calls requireChild BEFORE touching the payload or the database", async () => {
    await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: ATTEMPT,
      message: "Cavab səhvdir",
    });
    expect(order[0]).toBe("guard");
    expect(order).toContain("rpc");
    expect(order.indexOf("guard")).toBeLessThan(order.indexOf("rpc"));
  });

  it("propagates the guard's redirect and never reaches the database", async () => {
    requireChild.mockImplementationOnce(async () => {
      order.push("guard");
      throw new Error("NEXT_REDIRECT");
    });
    await expect(
      reportQuestionProblem({ questionId: QUESTION, attemptId: null, message: "x" }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(rpcCalls).toHaveLength(0);
  });

  it("throttles before writing anything", async () => {
    rateLimitAllow.mockReturnValueOnce(false);
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "Şəkil görünmür",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.err.tooMany" });
    expect(rpcCalls).toHaveLength(0);
    // The profile id is the bucket key — never anything the client sent.
    expect(rateLimitAllow).toHaveBeenCalledWith("questionReport", "child-profile", 5, 60_000);
  });
});

describe("reportQuestionProblem — input validation", () => {
  it("rejects an empty message without calling the RPC", async () => {
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.emptyErr" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("treats a whitespace-only message as empty", async () => {
    // Postgres btrim() would have kept the newlines (single-argument btrim
    // strips SPACES only), so this has to be caught before it is stored.
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "  \n\t ",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.emptyErr" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses an over-long message instead of silently truncating it", async () => {
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "a".repeat(REPORT_MESSAGE_MAX + 1),
    });
    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("accepts a message exactly at the cap and sends it trimmed", async () => {
    const body = "a".repeat(REPORT_MESSAGE_MAX);
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: `  ${body}  `,
    });
    expect(res).toEqual({ ok: true });
    expect(rpcCalls[0]!.args.p_message).toBe(body);
  });

  it("refuses a malformed question id", async () => {
    const res = await reportQuestionProblem({
      questionId: "not-a-uuid",
      attemptId: null,
      message: "Cavab səhvdir",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.err.generic" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("DROPS a malformed attempt id rather than losing the report", async () => {
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: "../../etc/passwd",
      message: "Cavab səhvdir",
    });
    expect(res).toEqual({ ok: true });
    expect(rpcCalls[0]!.args.p_attempt_id).toBeNull();
  });
});

describe("reportQuestionProblem — metadata is derived server-side", () => {
  it("sends only the message and the two ids; locale and platform are the server's", async () => {
    await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: ATTEMPT,
      message: "Sual oxunmur",
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.name).toBe("submit_question_report");
    expect(rpcCalls[0]!.args).toEqual({
      p_question_id: QUESTION,
      p_attempt_id: ATTEMPT,
      p_message: "Sual oxunmur",
      // getLocale(), not anything the caller passed.
      p_locale: "ru",
      p_platform: "web",
      p_app_version: null,
    });
  });

  it("never forwards a caller-supplied reporter, status, platform or locale", async () => {
    await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: ATTEMPT,
      message: "Sual oxunmur",
      // A tampered client sending extra fields must change nothing.
      ...({
        reporter_profile_id: "someone-else",
        status: "resolved",
        platform: "ios",
        locale: "en",
      } as unknown as object),
    });
    const args = rpcCalls[0]!.args;
    expect(Object.keys(args).sort()).toEqual([
      "p_app_version",
      "p_attempt_id",
      "p_locale",
      "p_message",
      "p_platform",
      "p_question_id",
    ]);
    expect(args.p_platform).toBe("web");
    expect(args.p_locale).toBe("ru");
  });
});

describe("reportQuestionProblem — error mapping", () => {
  it("maps the open-report unique violation to the calm duplicate message", async () => {
    rpcResult = { data: null, error: { code: "23505", message: 'duplicate key value violates "uq_question_reports_open_per_reporter"' } };
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "Yenə eyni problem",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.err.duplicate" });
  });

  it("maps the database throttle to the tooMany message", async () => {
    rpcResult = { data: null, error: { code: "23514", message: "report: rate limited" } };
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "Yenə",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.err.tooMany" });
  });

  it("never returns raw Postgres text for an unexpected failure", async () => {
    rpcResult = {
      data: null,
      error: { code: "42P01", message: 'relation "public.question_reports" does not exist' },
    };
    const res = await reportQuestionProblem({
      questionId: QUESTION,
      attemptId: null,
      message: "Cavab səhvdir",
    });
    expect(res).toEqual({ ok: false, errorKey: "test.report.err.generic" });
  });
});
