// "Report a bug" submission path (migration 116).
//
// What is pinned here is the set of properties that fail SILENTLY. An action
// that reads its input before resolving the session still works for a signed-in
// parent; a locale or a reporter taken from the payload still produces a
// plausible admin row; an anonymous path that reaches for the service role
// before the honeypot still "works" in a click-through. None of these show up
// in manual testing — they show up as a wrong row, a leaked credential in
// route_path, or a lost report.
//
// The most important assertion in this file is the LAST one: a mail failure
// must still return ok, because the row is already committed by then.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUG_DESCRIPTION_MAX,
  BUG_STEPS_MAX,
  BUG_TITLE_MAX,
} from "@/lib/support/bugReport";

// Order of the things that must never swap: session resolution, honeypot, and
// touching a privileged client.
const order: string[] = [];

let parentResult: { profileId: string } | null = { profileId: "parent-profile" };
let childResult: { kind: string; profileId?: string } = { kind: "no" };

const getParent = vi.fn(async () => {
  order.push("resolveParent");
  return parentResult;
});
const getChildResolution = vi.fn(async () => {
  order.push("resolveChild");
  return childResult;
});
const rateLimitAllow = vi.fn(() => true);
const getLocale = vi.fn(async () => "ru");
const notifyBugReport = vi.fn(async () => {});
const getAdminClient = vi.fn(() => {
  order.push("serviceRole");
  return makeClient();
});

type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcResult: { data: unknown; error: { code?: string; message?: string } | null } = {
  data: "11111111-2222-3333-4444-555555555555",
  error: null,
};

function makeClient() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      order.push("rpc");
      rpcCalls.push({ name, args });
      return rpcResult;
    },
    // The read-back the core uses to build an accurate notification.
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  };
}

const headerMap = new Map<string, string>([
  ["user-agent", "Mozilla/5.0 (TestRunner)"],
  ["x-forwarded-for", "203.0.113.7, 10.0.0.1"],
]);

// The core is exercised for real here (that is the point of the suite), and it
// carries `import "server-only"` — a Next build-time guard with no runtime
// behaviour that the vitest node environment cannot resolve. Stubbed, not
// removed: the marker is what keeps the mail credentials out of client bundles.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerMap.get(k) ?? null }),
}));
vi.mock("@/lib/auth/session", () => ({
  getParent: () => getParent(),
  getChildResolution: () => getChildResolution(),
}));
vi.mock("@/lib/rateLimit", () => ({
  rateLimitAllow: (...a: unknown[]) => rateLimitAllow(...(a as [])),
}));
vi.mock("@/i18n/server", () => ({ getLocale: () => getLocale() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => getAdminClient(),
  isServiceRoleConfigured: true,
}));
vi.mock("@/lib/mail/bugReportMail", () => ({
  notifyBugReport: (...a: unknown[]) => notifyBugReport(...(a as [])),
}));

const { submitBugReport } = await import("@/lib/support/bugReportActions");

const VALID = {
  title: "Giriş işləmir",
  description: "Şagird ID ilə daxil ola bilmirəm, düymə heç nə etmir.",
  steps: "1. /login açdım\n2. ID yazdım",
  expected: "Daxil olmalıydım",
  actual: "Səhifə donur",
  severity: "high",
  routePath: "/login",
  contactEmail: "",
  website: "",
};

beforeEach(() => {
  order.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: "11111111-2222-3333-4444-555555555555", error: null };
  parentResult = { profileId: "parent-profile" };
  childResult = { kind: "no" };
  headerMap.set("user-agent", "Mozilla/5.0 (TestRunner)");
  vi.clearAllMocks();
  rateLimitAllow.mockReturnValue(true);
  notifyBugReport.mockResolvedValue(undefined);
});

describe("submitBugReport — authorization ordering", () => {
  it("resolves the session BEFORE any privileged client is touched", async () => {
    await submitBugReport(VALID);
    expect(order[0]).toBe("resolveParent");
    expect(order.indexOf("resolveParent")).toBeLessThan(order.indexOf("rpc"));
    // A signed-in reporter never reaches the service role.
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it("uses the USER-SESSION client for a signed-in parent, never the service role", async () => {
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: true });
    expect(order).not.toContain("serviceRole");
  });

  it("falls through parent -> child -> anonymous and only then uses the service role", async () => {
    parentResult = null;
    childResult = { kind: "no" };
    await submitBugReport(VALID);
    expect(order.indexOf("resolveParent")).toBeLessThan(order.indexOf("resolveChild"));
    expect(order.indexOf("resolveChild")).toBeLessThan(order.indexOf("serviceRole"));
    expect(order.indexOf("serviceRole")).toBeLessThan(order.indexOf("rpc"));
  });

  it("throttles a signed-in reporter on the PROFILE ID, never on client input", async () => {
    rateLimitAllow.mockReturnValueOnce(false);
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: false, errorKey: "bug.err.tooMany" });
    expect(rpcCalls).toHaveLength(0);
    expect(rateLimitAllow).toHaveBeenCalledWith(
      "bugReport",
      "parent-profile",
      5,
      3_600_000,
    );
  });

  it("throttles an anonymous reporter on a HASHED ip, never the raw address", async () => {
    parentResult = null;
    await submitBugReport(VALID);
    const [scope, key, limit] = rateLimitAllow.mock.calls[0] as unknown as [
      string,
      string,
      number,
    ];
    expect(scope).toBe("bugReportAnon");
    expect(limit).toBe(3); // tighter than the signed-in budget
    // No IP is ever stored or keyed on: only a fixed-width salted hash.
    expect(key).not.toContain("203.0.113.7");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("submitBugReport — honeypot", () => {
  it("silently drops a bot submission and writes NOTHING", async () => {
    const res = await submitBugReport({ ...VALID, website: "http://spam.example" });
    // A FAKE success: telling a bot it failed teaches it which field to skip.
    expect(res).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(0);
    expect(getAdminClient).not.toHaveBeenCalled();
  });
});

describe("submitBugReport — input validation", () => {
  it("rejects an empty title without calling the RPC", async () => {
    const res = await submitBugReport({ ...VALID, title: "" });
    expect(res).toEqual({ ok: false, errorKey: "bug.emptyErr" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("treats a whitespace-only description as empty", async () => {
    // Postgres btrim() with the default argument strips SPACES only, so a
    // newline-only body has to be caught before it is stored.
    const res = await submitBugReport({ ...VALID, description: "  \n\t " });
    expect(res).toEqual({ ok: false, errorKey: "bug.emptyErr" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects a too-short description rather than storing a useless report", async () => {
    const res = await submitBugReport({ ...VALID, description: "pisdir" });
    expect(res).toEqual({ ok: false, errorKey: "bug.emptyErr" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("REFUSES over-cap fields instead of silently truncating them", async () => {
    for (const over of [
      { title: "a".repeat(BUG_TITLE_MAX + 1) },
      { description: "a".repeat(BUG_DESCRIPTION_MAX + 1) },
      { steps: "a".repeat(BUG_STEPS_MAX + 1) },
    ]) {
      rpcCalls.length = 0;
      const res = await submitBugReport({ ...VALID, ...over });
      expect(res.ok).toBe(false);
      expect(rpcCalls).toHaveLength(0);
    }
  });

  it("accepts a description exactly at the cap and sends it trimmed", async () => {
    const body = "a".repeat(BUG_DESCRIPTION_MAX);
    const res = await submitBugReport({ ...VALID, description: `  ${body}  ` });
    expect(res).toEqual({ ok: true });
    expect(rpcCalls[0]!.args.p_description).toBe(body);
  });

  it("falls back to 'normal' for a tampered severity rather than losing the report", async () => {
    const res = await submitBugReport({ ...VALID, severity: "catastrophic" });
    expect(res).toEqual({ ok: true });
    expect(rpcCalls[0]!.args.p_severity).toBe("normal");
  });
});

describe("submitBugReport — metadata is derived, not trusted", () => {
  it("takes locale from the server and hardcodes the platform", async () => {
    await submitBugReport({
      ...VALID,
      ...({ locale: "en", platform: "ios", status: "resolved" } as unknown as object),
    });
    const args = rpcCalls[0]!.args;
    expect(args.p_locale).toBe("ru"); // getLocale(), not the payload
    expect(args.p_platform).toBe("web");
    // Reporter, status and priority are not even expressible through the RPC.
    expect(Object.keys(args).sort()).toEqual([
      "p_actual",
      "p_app_version",
      "p_contact_email",
      "p_description",
      "p_expected",
      "p_locale",
      "p_platform",
      "p_route_path",
      "p_severity",
      "p_steps",
      "p_title",
      "p_user_agent",
    ]);
  });

  it("reads the user agent from the request HEADER, never from the payload", async () => {
    await submitBugReport({
      ...VALID,
      ...({ userAgent: "EvilBot/1.0" } as unknown as object),
    });
    expect(rpcCalls[0]!.args.p_user_agent).toBe("Mozilla/5.0 (TestRunner)");
  });

  it("STRIPS the query string and fragment from the route — credentials live there", async () => {
    await submitBugReport({ ...VALID, routePath: "/auth/callback?code=SECRET#access_token=T" });
    expect(rpcCalls[0]!.args.p_route_path).toBe("/auth/callback");
  });

  it("DROPS an absolute or malformed route rather than losing the report", async () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "not-a-path"]) {
      rpcCalls.length = 0;
      const res = await submitBugReport({ ...VALID, routePath: bad });
      expect(res).toEqual({ ok: true });
      expect(rpcCalls[0]!.args.p_route_path).toBeNull();
    }
  });

  it("ignores a typed contact email for a SIGNED-IN reporter", async () => {
    // The trigger uses the account's address; a child must never be able to
    // put a stranger's address on a report.
    await submitBugReport({ ...VALID, contactEmail: "someone@else.example" });
    expect(rpcCalls[0]!.args.p_contact_email).toBeNull();
  });

  it("keeps a valid typed email for an ANONYMOUS reporter", async () => {
    parentResult = null;
    await submitBugReport({ ...VALID, contactEmail: "  visitor@example.com " });
    expect(rpcCalls[0]!.args.p_contact_email).toBe("visitor@example.com");
  });

  it("drops a malformed anonymous email instead of failing the report", async () => {
    parentResult = null;
    const res = await submitBugReport({ ...VALID, contactEmail: "not an address" });
    expect(res).toEqual({ ok: true });
    expect(rpcCalls[0]!.args.p_contact_email).toBeNull();
  });
});

describe("submitBugReport — error mapping", () => {
  it("maps the open-report unique violation to the calm duplicate message", async () => {
    rpcResult = {
      data: null,
      error: { code: "23505", message: 'duplicate key value violates "uq_bug_reports_open_per_reporter"' },
    };
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: false, errorKey: "bug.err.duplicate" });
  });

  it("maps the database throttle to the tooMany message", async () => {
    rpcResult = { data: null, error: { code: "23514", message: "bug report: rate limited" } };
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: false, errorKey: "bug.err.tooMany" });
  });

  it("never returns raw Postgres text for an unexpected failure", async () => {
    rpcResult = {
      data: null,
      error: { code: "42P01", message: 'relation "public.bug_reports" does not exist' },
    };
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: false, errorKey: "bug.err.generic" });
  });

  it("does NOT notify when the write failed", async () => {
    rpcResult = { data: null, error: { code: "42P01", message: "boom" } };
    await submitBugReport(VALID);
    expect(notifyBugReport).not.toHaveBeenCalled();
  });
});

describe("submitBugReport — the report survives a mail failure", () => {
  it("returns ok when the notification THROWS: the row is already committed", async () => {
    notifyBugReport.mockRejectedValueOnce(new Error("brevo down"));
    const res = await submitBugReport(VALID);
    expect(res).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(1);
  });

  it("notifies only AFTER a successful write", async () => {
    await submitBugReport(VALID);
    expect(rpcCalls).toHaveLength(1);
    expect(notifyBugReport).toHaveBeenCalledTimes(1);
  });
});
