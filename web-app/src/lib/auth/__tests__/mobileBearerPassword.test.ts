// Self-service password change on the mobile BFF — the write itself.
//
// WHAT THIS PINS, AND WHY IT IS NOT OBVIOUS. From 2026-08-29 to 2026-09-01 this
// path was DETERMINISTICALLY broken for every parent and every student: the
// route called `createBearerClient(token).auth.updateUser({ password })`, and
// `updateUser` is SESSION-bound. A bearer client carries a global Authorization
// header — which authorizes PostgREST, RPC and Storage — but auth-js resolves
// the session from its own storage, which `persistSession: false` leaves empty.
// It threw AuthSessionMissingError before a single packet left the server, the
// route mapped that to a flat 400, and the app rendered "Yenilənmə alınmadı".
//
// The reason it survived review is the reason these tests are written against
// the NETWORK BOUNDARY rather than against a mocked SDK: any test that stubs
// `auth.updateUser` to resolve `{ error: null }` passes happily on the broken
// implementation, because the bug is precisely that the real method never gets
// as far as the transport. So `fetch` is what is asserted here — the request
// that does or does not go out, and what is in it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` is a BUILD-TIME guard with no runtime behaviour and no package
// to resolve under Vite. Stubbing the marker keeps the guard in the production
// file rather than tempting anyone to delete it to make a test pass.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: "anon-key",
}));

// Pulled in by the module under test but irrelevant to the write path.
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => {
    throw new Error("the password write must never reach the service-role client");
  },
  isServiceRoleConfigured: () => true,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({}),
}));

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.body.sig";
const PASSWORD = "Nahid4576797@";

let calls: { url: string; init: RequestInit }[] = [];

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function subject() {
  const mod = await import("@/lib/auth/mobileBearer");
  return mod.updateOwnPasswordWithBearer;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("updateOwnPasswordWithBearer", () => {
  it("actually sends a request — the regression that broke it sent none", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const update = await subject();

    const result = await update(TOKEN, PASSWORD);

    expect(result).toBeNull();
    // The whole bug in one assertion. The old implementation produced zero.
    expect(calls).toHaveLength(1);
  });

  it("PUTs to GoTrue's user endpoint with the caller's own token", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const update = await subject();

    await update(TOKEN, PASSWORD);

    const [call] = calls;
    expect(call.url).toBe("https://project.supabase.co/auth/v1/user");
    expect(call.init.method).toBe("PUT");

    const headers = call.init.headers as Record<string, string>;
    // The token is what authorizes this. GoTrue re-validates it, so the endpoint
    // can only ever change the password of the user who called it — the property
    // that a service-role write would give away.
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.apikey).toBe("anon-key");
    expect(JSON.parse(String(call.init.body))).toEqual({ password: PASSWORD });
  });

  it("refuses an empty token without calling out", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const update = await subject();

    expect(await update("", PASSWORD)).toEqual({ status: 0, code: "no_token" });
    expect(calls).toHaveLength(0);
  });

  it("separates a rejection from an unreachable server", async () => {
    // These are different failures with different owners: one is the user's
    // password, the other is our infrastructure. The old code collapsed every
    // outcome into one flat 400, which is what hid the defect for three days.
    mockFetch(new TypeError("fetch failed"));
    let update = await subject();
    expect(await update(TOKEN, PASSWORD)).toEqual({ status: 0, code: "unreachable" });

    vi.unstubAllGlobals();
    calls = [];
    mockFetch(json(422, { error_code: "weak_password", msg: "Password is too weak" }));
    update = await subject();
    expect(await update(TOKEN, PASSWORD)).toEqual({ status: 422, code: "weak_password" });
  });

  it("keeps GoTrue's message out of the result, and only the code", async () => {
    // A GoTrue rejection message can quote the submitted password back. Nothing
    // returned from here may carry it, because callers log this value.
    mockFetch(
      json(400, { error_code: "same_password", msg: `New password Nahid4576797@ is invalid` }),
    );
    const update = await subject();

    const result = await update(TOKEN, PASSWORD);

    expect(result).toEqual({ status: 400, code: "same_password" });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });

  it("survives a non-JSON error body rather than throwing", async () => {
    mockFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const update = await subject();

    expect(await update(TOKEN, PASSWORD)).toEqual({ status: 502, code: "unknown" });
  });

  it("caps an absurd error code instead of logging it verbatim", async () => {
    mockFetch(json(400, { error_code: "x".repeat(500) }));
    const update = await subject();

    const result = await update(TOKEN, PASSWORD);
    expect(result?.code).toBe("unknown");
  });
});
