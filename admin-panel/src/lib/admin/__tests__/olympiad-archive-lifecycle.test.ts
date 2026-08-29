// Archiving an olympiad package, and the two things about it that fail
// SILENTLY in a click-through.
//
//   1. THE SWALLOWED FAILURE. The previous archive action used the Supabase
//      error only to decide whether to write the audit row, then revalidated
//      and redirected to /olympiad regardless. A refused archive — RLS
//      filtering the row, a row a second admin already removed — therefore left
//      exactly the screen a successful one left, and reads to an owner as "the
//      system blocked me". Nothing in a browser distinguishes the two, which is
//      why it is pinned here rather than tested by hand.
//   2. THE DISCARDED OWNER COUNT. `olympiad_package_deletion_blocks` reports
//      {hint, count} per reason, and localizeBlocks flattens each one into a
//      sentence. The dialog needs the bare number too: "42 purchases" is the
//      fact the admin weighs when choosing archive over delete, and a number
//      buried mid-sentence inside a refusal is not a fact they can read.
//
// What is NOT tested here, deliberately: that archiving is ALLOWED on a
// purchased package. That is a database property (every UPDATE trigger on
// olympiad_packages short-circuits for a non-'active' status, and
// can_view_olympiad_package's purchase branch never reads the status at all),
// and asserting it against a stub would only prove the stub.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";

// Order of the two things that must not swap: authorization and reading input.
const order: string[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});
const writeAuditLog = vi.fn(async (_entry: unknown) => {});
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/guards", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: (a: unknown) => writeAuditLog(a) }));
// getT returns the key, so an assertion names the message rather than copying
// its wording — a rewording must not turn into a red test.
vi.mock("@/i18n/server", () => ({
  getT: async () => (k: string) => k,
  getLocale: async () => "az",
}));

const PKG = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

// ---- Supabase stub -------------------------------------------------------
type Row = { id: string; status: string } | null;

const fromCalls: string[] = [];
const updates: Record<string, unknown>[] = [];
let readRow: Row = { id: PKG, status: "active" };
let readError: { code: string } | null = null;
let updateResult: { data: unknown; error: { code: string } | null } = {
  data: [{ id: PKG }],
  error: null,
};
let previewResult: { data: unknown; error: unknown } = { data: null, error: null };

// One builder serves both chains the action uses:
//   .select("id, status").eq("id", …).maybeSingle()   — the re-verification read
//   .update({…}).eq("id", …).select("id")             — the archive itself
// The second ends in .select(), so the builder is a thenable as well as a
// chain; `mode` is what decides which of the two an await resolves.
function packageBuilder() {
  let mode: "read" | "update" = "read";
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    update: (patch: Record<string, unknown>) => {
      mode = "update";
      updates.push(patch);
      return b;
    },
    eq: () => b,
    maybeSingle: async () => ({ data: readRow, error: readError }),
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve(
        resolve(mode === "update" ? updateResult : { data: readRow, error: readError }),
      );
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      fromCalls.push(table);
      return packageBuilder();
    },
    async rpc(_name: string, _args: Record<string, unknown>) {
      return previewResult;
    },
  }),
}));

/** FormData that records the order in which the action reads its fields. */
class SpyFormData extends FormData {
  override get(name: string): FormDataEntryValue | null {
    order.push(`read:${name}`);
    return super.get(name);
  }
}

function form(fields: Record<string, string>): FormData {
  const fd = new SpyFormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function olympiad() {
  return await import("../olympiad");
}

beforeEach(() => {
  order.length = 0;
  fromCalls.length = 0;
  updates.length = 0;
  readRow = { id: PKG, status: "active" };
  readError = null;
  updateResult = { data: [{ id: PKG }], error: null };
  previewResult = { data: null, error: null };
  writeAuditLog.mockClear();
  revalidatePath.mockClear();
  requireAdmin.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("archiveOlympiadPackageAction", () => {
  it("authorizes BEFORE it reads any client-supplied field", async () => {
    const { archiveOlympiadPackageAction } = await olympiad();
    await archiveOlympiadPackageAction(null, form({ __id: PKG }));
    expect(order[0]).toBe("guard");
    expect(order).toContain("read:__id");
  });

  it("refuses a non-UUID id without touching the database", async () => {
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: "nope" }));
    expect(res).toEqual({ ok: false, error: "err.server", blocks: [] });
    expect(fromCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("archives, audits the TRANSITION, and reports what happened", async () => {
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: PKG }));

    expect(res).toEqual({ ok: true, message: "del.done.packageArchivedNow" });
    expect(updates).toEqual([{ status: "archived" }]);
    // No redirect field: archiving destroys nothing, so both screens that offer
    // it are still there to read the answer.
    expect(res && res.ok && "redirectTo" in res).toBe(false);

    const entry = writeAuditLog.mock.calls.at(-1)![0] as Record<string, any>;
    expect(entry.action).toBe("admin.olympiad.archive");
    expect(entry.targetTable).toBe("olympiad_packages");
    expect(entry.targetId).toBe(PKG);
    expect(entry.severity).toBe("warning");
    // The status it came FROM, not only the one it lands on — a log that cannot
    // say what changed is not a record of a change.
    expect(entry.metadata).toEqual({ from: "active", status: "archived" });

    expect(revalidatePath).toHaveBeenCalledWith("/olympiad");
    expect(revalidatePath).toHaveBeenCalledWith(`/olympiad/${PKG}/edit`);
  });

  // THE BUG THIS FILE EXISTS FOR.
  it("reports a failed update instead of looking like a success", async () => {
    updateResult = { data: null, error: { code: "42501" } };
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: PKG }));

    expect(res).toEqual({ ok: false, error: "del.err.archiveFailed", blocks: [] });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("treats ZERO affected rows as a failure, not a success", async () => {
    // PostgREST answers a row RLS filtered out with success and no rows — the
    // shape that made the old action's `if (!error)` look fine.
    updateResult = { data: [], error: null };
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: PKG }));

    expect(res).toEqual({ ok: false, error: "del.err.archiveFailed", blocks: [] });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses an id that does not resolve to a readable package", async () => {
    readRow = null;
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: PKG }));

    expect(res).toEqual({ ok: false, error: "del.err.archiveFailed", blocks: [] });
    expect(updates).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not re-archive, and does not audit a change that never happened", async () => {
    readRow = { id: PKG, status: "archived" };
    const { archiveOlympiadPackageAction } = await olympiad();
    const res = await archiveOlympiadPackageAction(null, form({ __id: PKG }));

    expect(res).toEqual({ ok: true, message: "del.done.packageAlreadyArchived" });
    expect(updates).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("loadOlympiadPackageDeletionPreview — the raw owner counts", () => {
  it("carries purchases and entitlements as numbers, not only as sentences", async () => {
    previewResult = {
      data: {
        package: { id: PKG, code: "oly-2026", title_az: "Riyaziyyat", status: "active" },
        ok: false,
        blocked_by: [
          { hint: "package_has_purchases", count: 42 },
          { hint: "package_has_entitlements", count: 3 },
          { hint: "package_is_active" },
        ],
        outcome: "archive",
        questions: { total: 100, deletable: 80, archived_instead: 20, already_archived: 0 },
      },
      error: null,
    };
    const { loadOlympiadPackageDeletionPreview } = await olympiad();
    const p = await loadOlympiadPackageDeletionPreview(PKG);

    expect(p).not.toBeNull();
    // The two are never one figure: an Apple/Google grant, a school licence or
    // a manual comp has no purchase row at all (migration 124).
    expect(p!.owners).toEqual({ purchases: 42, entitlements: 3 });
    // …and the sentences are still produced, unchanged.
    expect(p!.blockedBy).toHaveLength(3);
  });

  it("reports zero owners when the SQL raises no ownership block at all", async () => {
    previewResult = {
      data: {
        package: { id: PKG, code: "oly-2026", title_az: "Riyaziyyat", status: "inactive" },
        ok: true,
        blocked_by: [],
        outcome: "delete",
        questions: { total: 0, deletable: 0, archived_instead: 0, already_archived: 0 },
      },
      error: null,
    };
    const { loadOlympiadPackageDeletionPreview } = await olympiad();
    const p = await loadOlympiadPackageDeletionPreview(PKG);

    expect(p!.owners).toEqual({ purchases: 0, entitlements: 0 });
    expect(p!.blockedBy).toEqual([]);
  });
});

describe("archive copy", () => {
  // Trilingual is project law, and a missing locale here is invisible until an
  // admin switches language and reads a raw key inside a confirmation dialog.
  const KEYS = [
    "del.package.intro",
    "del.package.impact",
    "del.package.impactOwners",
    "del.package.impactEntitlements",
    "del.package.impactQuestions",
    "del.package.impactMedia",
    "del.package.ownersNote",
    "del.package.noOwners",
    "del.package.archiveTitle",
    "del.package.archiveDesc",
    "del.package.archiveAction",
    "del.package.archivedAlready",
    "del.package.recommended",
    "del.package.confirmHeading",
    "del.package.confirmIntro",
    "del.package.gateHint",
    "del.done.packageArchivedNow",
    "del.done.packageAlreadyArchived",
    "del.err.archiveFailed",
  ];

  it("exists in az, en and ru", () => {
    for (const locale of ["az", "en", "ru"] as const) {
      for (const key of KEYS) {
        expect(messages[locale][key], `${locale}/${key}`).toBeTruthy();
      }
    }
  });

  // The counted lines are useless without their placeholder — "{n} purchases"
  // rendered as "purchases" is exactly the number the dialog exists to show.
  it("keeps every placeholder in every locale", () => {
    const PLACEHOLDERS: Record<string, string[]> = {
      "del.package.intro": ["{name}"],
      "del.package.impactOwners": ["{n}"],
      "del.package.impactEntitlements": ["{n}"],
      "del.package.impactQuestions": ["{total}", "{deletable}", "{archived}"],
      "del.package.impactMedia": ["{n}"],
    };
    for (const locale of ["az", "en", "ru"] as const) {
      for (const [key, tokens] of Object.entries(PLACEHOLDERS)) {
        for (const token of tokens) {
          expect(messages[locale][key], `${locale}/${key}/${token}`).toContain(token);
        }
      }
    }
  });

  // The row action has to name the remedy, not only the refusal: an admin who
  // only ever sees "Delete…" never learns that archiving is available here.
  it("names archiving on the package LIST row", () => {
    for (const locale of ["az", "en", "ru"] as const) {
      const rowOpen = messages[locale]["del.package.rowOpen"];
      const archive = messages[locale]["del.package.archiveAction"];
      expect(rowOpen.toLowerCase(), locale).toContain(archive.toLowerCase());
    }
  });
});
