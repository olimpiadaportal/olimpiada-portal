// What the Accounts export tells someone it refuses.
//
// The refusal itself is not in question — a content manager must never receive
// this file, and the first assertion here is that the snapshot query is never
// even reached. What is in question is the SENTENCE. Both refusals used to
// arrive as a redirect, which fetch() follows, so the button saw one 200 with
// an HTML body for both and said "your session has expired" to a content
// manager whose session was perfectly alive. The advice was to re-authenticate,
// which cannot grant a permission.
//
// So the two cases must stay distinguishable on the wire (401 vs 403), and
// neither body may describe what the workbook contains — the refused caller is
// told about their own account, nothing else.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import type { AdminApiAuth } from "@/lib/admin/guards";

const ADMIN: AdminApiAuth = {
  ok: true,
  ctx: {
    userId: "user-1",
    email: "admin@example.com",
    profileId: "profile-1",
    roleCodes: ["administrator"],
    permissions: [],
    isAdmin: true,
    isContentManager: false,
  },
};

let auth: AdminApiAuth = ADMIN;
const readSnapshot = vi.fn(async () => ({ ok: false, reason: "error" }) as const);

vi.mock("@/lib/admin/guards", () => ({
  requireAdminApi: async () => auth,
}));
vi.mock("@/i18n/server", () => ({
  // The az dictionary is the default locale, so this is what a refused caller
  // actually reads unless they switched language.
  getT: async () => (key: string) => messages.az[key] ?? key,
  getLocale: async () => "az",
}));
vi.mock("@/lib/admin/accounts-export-read", () => ({
  readAccountsExportSnapshot: () => readSnapshot(),
}));
vi.mock("@/lib/admin/accountsWorkbook", () => ({
  buildAccountsWorkbook: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: async () => true }));

const { GET } = await import("@/app/api/accounts/export/route");

beforeEach(() => {
  auth = ADMIN;
  readSnapshot.mockClear();
});

describe("accounts export refusals", () => {
  it("refuses a signed-in non-admin with 403 and never runs the query", async () => {
    auth = { ok: false, reason: "notAdmin" };
    const res = await GET();

    expect(res.status).toBe(403);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("answers a missing session with 401, not the same status as a refusal", async () => {
    auth = { ok: false, reason: "unauthenticated" };
    const res = await GET();

    expect(res.status).toBe(401);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("gives the two cases different advice, in every language", async () => {
    auth = { ok: false, reason: "notAdmin" };
    const forbidden = await (await GET()).json();
    auth = { ok: false, reason: "unauthenticated" };
    const signedOut = await (await GET()).json();

    expect(forbidden.error).toBe(messages.az["accounts.export.forbidden"]);
    expect(signedOut.error).toBe(messages.az["accounts.export.signedOut"]);
    expect(forbidden.error).not.toBe(signedOut.error);

    for (const locale of ["az", "en", "ru"] as const) {
      expect(messages[locale]["accounts.export.forbidden"]).toBeTruthy();
      expect(messages[locale]["accounts.export.forbidden"]).not.toBe(
        messages[locale]["accounts.export.signedOut"],
      );
    }
  });

  it("says nothing about what the file holds", async () => {
    auth = { ok: false, reason: "notAdmin" };
    const body = JSON.stringify(await (await GET()).json()).toLowerCase();

    // The workbook's own vocabulary: none of it belongs in a refusal.
    for (const leak of ["xlsx", "excel", "email", "e-poçt", "uşaq", "valideyn"]) {
      expect(body).not.toContain(leak);
    }
  });
});
