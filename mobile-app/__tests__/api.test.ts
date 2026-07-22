// The BFF client's failure classifier. These cases ARE the contract that keeps
// an unreachable origin, an undeployed route, an expired session and a real
// validation rejection from all reading as one "changes could not be saved".
//
// api.ts pulls in the Supabase client only to attach the Bearer header; stub it
// so the pure classifier can be exercised without a real client or a real fetch
// (jest hoists the mock above the import).
import { classifyBffResponse, classifyBffThrow } from "@/lib/api";

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const FALLBACK = "childedit.err.generic";

function authed(status: number, body: Record<string, unknown> | null) {
  return classifyBffResponse({ status, body, fallbackErrorKey: FALLBACK, authed: true });
}

function anon(status: number, body: Record<string, unknown> | null) {
  return classifyBffResponse({ status, body, fallbackErrorKey: FALLBACK, authed: false });
}

describe("classifyBffResponse — transport vs server vs session vs rejection", () => {
  it("maps every 5xx to the server-unavailable key, ignoring the body", () => {
    expect(authed(500, { error: "profile.err.updateFailed", retryable: true })).toEqual({
      kind: "server",
      error: "mob.err.serverUnavailable",
      retryable: true,
    });
    expect(authed(503, null).error).toBe("mob.err.serverUnavailable");
  });

  it("treats an undeployed route (404/405, HTML body) as the server, not as a rejection", () => {
    // Next answers an unknown /api path with an HTML page → body === null.
    expect(anon(404, null)).toEqual({
      kind: "server",
      error: "mob.err.serverUnavailable",
      retryable: true,
    });
    expect(authed(405, { error: "whatever" }).kind).toBe("server");
  });

  it("any non-JSON body is a server failure, even on a 200", () => {
    expect(authed(200, null).error).toBe("mob.err.serverUnavailable");
    expect(authed(400, null).error).toBe("mob.err.serverUnavailable");
  });

  it("a 401 on a Bearer call is an expired session, never the server's login key", () => {
    // The BFF answers every rejected token with the generic parent.err.invalid
    // ("wrong email or password") — nonsense on an edit-child screen.
    expect(authed(401, { error: "parent.err.invalid", retryable: false })).toEqual({
      kind: "unauthorized",
      error: "mob.session.expired",
      retryable: false,
    });
  });

  it("a 401 on an anonymous call keeps the server's credential key", () => {
    expect(anon(401, { error: "auth.child.err.invalidCredentials", retryable: false })).toEqual({
      kind: "rejected",
      error: "auth.child.err.invalidCredentials",
      retryable: false,
    });
  });

  it("passes a real validation/business key through untouched", () => {
    expect(authed(400, { error: "addchild.err.districtRequired", retryable: false })).toEqual({
      kind: "rejected",
      error: "addchild.err.districtRequired",
      retryable: false,
    });
    // 423 lockout / 429 throttle are meaningful and retryable — not 5xx.
    expect(authed(429, { error: "auth.child.err.locked", retryable: true })).toEqual({
      kind: "rejected",
      error: "auth.child.err.locked",
      retryable: true,
    });
  });

  it("falls back to the endpoint key only when the server sent none", () => {
    expect(authed(400, {}).error).toBe(FALLBACK);
    expect(authed(400, { error: "" }).error).toBe(FALLBACK);
    expect(authed(400, { error: 42 }).error).toBe(FALLBACK);
  });

  it("keeps the full per-field validation array, dropping junk members", () => {
    expect(
      authed(400, {
        error: "addchild.err.districtRequired",
        errors: ["addchild.err.districtRequired", "addchild.err.schoolRequired", 7, ""],
      }).errors,
    ).toEqual(["addchild.err.districtRequired", "addchild.err.schoolRequired"]);
    // Absent rather than empty when there is nothing to map.
    expect(authed(400, { error: "x", errors: "nope" }).errors).toBeUndefined();
    expect(authed(400, { error: "x" }).errors).toBeUndefined();
  });

  it("never surfaces server prose or a status code (security posture)", () => {
    const leaky = authed(500, {
      error: 'relation "students" does not exist',
      message: "at Object.<anonymous> (/var/task/route.js:41)",
    });
    expect(leaky.error).toBe("mob.err.serverUnavailable");
    expect(leaky.error).not.toMatch(/students|route\.js|500/);
  });
});

describe("classifyBffThrow — the fetch never completed", () => {
  it("calls our own abort a timeout", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(classifyBffThrow(err)).toEqual({
      kind: "timeout",
      error: "mob.err.network",
      retryable: true,
    });
  });

  it("calls anything else the transport (DNS, refused, TLS, no route)", () => {
    expect(classifyBffThrow(new TypeError("Network request failed"))).toEqual({
      kind: "network",
      error: "mob.err.network",
      retryable: true,
    });
    // Never throws on a non-Error rejection value.
    expect(classifyBffThrow(undefined).kind).toBe("network");
    expect(classifyBffThrow("boom").error).toBe("mob.err.network");
  });
});
