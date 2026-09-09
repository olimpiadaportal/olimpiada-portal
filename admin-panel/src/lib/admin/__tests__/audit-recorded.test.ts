// writeAuditLog answers a question one caller acts on: did a row actually land?
//
// The accounts export refuses to release its workbook on a false, so this
// return value is the difference between "every family's details left the
// server unrecorded" and "the download failed loudly". Each way the write can
// come up empty is pinned here, because all of them look identical from the
// call site: the function never throws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let serviceRole = true;
let insertError: { message: string } | null = null;
let clientThrows = false;
const inserted: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => serviceRole,
  createAdminClient: () => {
    if (clientThrows) throw new Error("boom");
    return {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: insertError };
        },
      }),
    };
  },
}));

import { writeAuditLog } from "@/lib/admin/audit";

const ENTRY = {
  actorProfileId: "admin-profile",
  action: "admin.accounts.export",
  targetTable: "profiles",
  severity: "warning" as const,
};

beforeEach(() => {
  serviceRole = true;
  insertError = null;
  clientThrows = false;
  inserted.length = 0;
  // The failure paths log by design; keep the suite output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeAuditLog reports whether the row landed", () => {
  it("is true when the insert succeeds", async () => {
    await expect(writeAuditLog(ENTRY)).resolves.toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it("is false with no service-role key, and writes nothing", async () => {
    serviceRole = false;
    await expect(writeAuditLog(ENTRY)).resolves.toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("is false when the insert is rejected", async () => {
    insertError = { message: "permission denied for table audit_logs" };
    await expect(writeAuditLog(ENTRY)).resolves.toBe(false);
  });

  it("is false when the client throws, rather than propagating", async () => {
    clientThrows = true;
    await expect(writeAuditLog(ENTRY)).resolves.toBe(false);
  });
});
