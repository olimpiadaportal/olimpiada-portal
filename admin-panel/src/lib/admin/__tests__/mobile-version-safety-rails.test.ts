// The two ways the update gate can brick every installed copy of the app.
//
// Neither is a crash and neither shows up in a click-through of the happy path,
// because both produce a perfectly valid-looking row. What they produce on the
// DEVICE is a boot screen with nothing behind it:
//
//   (i)  force_update = true with an empty store_url — ForceUpdateScreen builds
//        its only button from store_url, so an empty one renders a full-screen
//        block with no button, no back gesture and no navigator. Production
//        ships both platform rows with store_url = '', so this is one checkbox
//        away, not a hypothetical.
//   (ii) min_version above latest_version — every install is told to update to
//        a version that, by the panel's own record, does not exist.
//
// The comparison behind (ii) is the part most likely to be "simplified" later:
// a string compare is correct for every version this project has shipped and
// starts lying at exactly 1.10, so the 1.9.0/1.10.0 pair below is the whole
// reason compareVersions is a function instead of an operator.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import {
  compareVersions,
  isSemver,
  versionGateProblem,
} from "@/lib/admin/mobile-version";

// ---- order tape ----------------------------------------------------------
const order: string[] = [];
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("guard");
  return { profileId: "admin-profile" };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/guards", () => ({
  requireAdmin: () => requireAdmin(),
  requirePanelAccess: () => requireAdmin(),
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: async (a: {
    action: string;
    metadata?: Record<string, unknown>;
  }) => {
    audits.push(a);
  },
}));

// ---- Supabase stub -------------------------------------------------------
type Op = { table: string; op: string; payload?: Record<string, unknown> };
const ops: Op[] = [];

const ROW_ID = "aaaabbbb-cccc-4ddd-8eee-ffff00001111";

/** The live production shape: pure defaults, gate inert, store link EMPTY. */
function defaultRow(): Record<string, unknown> {
  return {
    id: ROW_ID,
    min_version: "1.0.0",
    latest_version: "1.0.0",
    force_update: false,
    store_url: "",
    message_az: "",
    message_en: "",
    message_ru: "",
  };
}

let existingRow: Record<string, unknown> = defaultRow();
let updateError: { message?: string } | null = null;

function builder(table: string) {
  let mode: "select" | "update" = "select";
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    order: () => b,
    update: (payload: Record<string, unknown>) => {
      mode = "update";
      ops.push({ table, op: "update", payload });
      return b;
    },
    maybeSingle: async () => {
      ops.push({ table, op: "select" });
      return { data: existingRow, error: null };
    },
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      if (mode === "update") {
        return Promise.resolve(res({ data: null, error: updateError }));
      }
      return Promise.resolve(res({ data: [existingRow], error: null }));
    },
  });
  return b as never;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
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

const STORE_URL = "https://play.google.com/store/apps/details?id=ai.olympiq.app";

const GOOD: Record<string, string> = {
  platform: "android",
  min_version: "1.9.0",
  latest_version: "1.13.0",
  store_url: STORE_URL,
  message_az: "Yeni versiya hazırdır.",
  message_en: "A new version is available.",
  message_ru: "Доступна новая версия.",
};

import { updateMobileVersion } from "../mobileApp";

beforeEach(() => {
  order.length = 0;
  audits.length = 0;
  ops.length = 0;
  updateError = null;
  existingRow = defaultRow();
  vi.clearAllMocks();
});

// =========================================================================
describe("compareVersions is numeric, not lexicographic", () => {
  it("orders 1.9.0 BELOW 1.10.0 — the case a string compare gets backwards", () => {
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    // Proof the trap is real and not theoretical: the naive form returns the
    // opposite answer for the same pair.
    expect("1.10.0" < "1.9.0").toBe(true);
  });

  it("compares major, then minor, then patch", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.13.0", "1.13.0")).toBe(0);
    expect(compareVersions("1.12.0", "1.12.1")).toBe(-1);
    expect(compareVersions("10.0.0", "9.0.0")).toBe(1);
  });

  it("accepts only three numeric segments", () => {
    expect(isSemver("1.13.0")).toBe(true);
    expect(isSemver("1.13")).toBe(false);
    expect(isSemver("v1.13.0")).toBe(false);
    expect(isSemver("1.13.0-beta")).toBe(false);
  });
});

describe("versionGateProblem — the rules the form and the action share", () => {
  const base = {
    minVersion: "1.0.0",
    latestVersion: "1.13.0",
    forceUpdate: false,
    storeUrl: "",
  };

  it("passes a sane configuration", () => {
    expect(versionGateProblem(base)).toBeNull();
    expect(
      versionGateProblem({
        ...base,
        forceUpdate: true,
        storeUrl: STORE_URL,
      }),
    ).toBeNull();
  });

  it("refuses a forced update with no store link", () => {
    expect(versionGateProblem({ ...base, forceUpdate: true })).toBe(
      "mobileapp.err.forceNoUrl",
    );
    // Whitespace is not a store link.
    expect(
      versionGateProblem({ ...base, forceUpdate: true, storeUrl: "   " }),
    ).toBe("mobileapp.err.forceNoUrl");
  });

  it("refuses a minimum above the latest, across the 1.10 boundary", () => {
    expect(
      versionGateProblem({
        ...base,
        minVersion: "1.10.0",
        latestVersion: "1.9.0",
      }),
    ).toBe("mobileapp.err.minAboveLatest");
    // ...and allows the same two numbers the right way round, which a string
    // compare would reject.
    expect(
      versionGateProblem({
        ...base,
        minVersion: "1.9.0",
        latestVersion: "1.10.0",
      }),
    ).toBeNull();
    // Equal is fine: everyone must be on the newest build.
    expect(
      versionGateProblem({
        ...base,
        minVersion: "1.13.0",
        latestVersion: "1.13.0",
      }),
    ).toBeNull();
  });

  it("leaves malformed versions to the semver check instead of guessing", () => {
    expect(
      versionGateProblem({ ...base, minVersion: "abc", latestVersion: "1.0.0" }),
    ).toBeNull();
  });
});

// =========================================================================
describe("updateMobileVersion — authorization order", () => {
  it("guards before reading a single client field", async () => {
    await updateMobileVersion(null, form(GOOD));
    expect(order[0]).toBe("guard");
    expect(order.filter((o) => o.startsWith("read:")).length).toBeGreaterThan(0);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("updateMobileVersion — the safety rails refuse before any write", () => {
  it("refuses force_update with an empty store link", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, store_url: "", force_update: "on" }),
    );
    expect(res).toEqual({
      error: "mobileapp.err.forceNoUrl",
      platform: "android",
    });
    // Nothing was written, so a refused save leaves the live gate untouched.
    expect(ops.filter((o) => o.op === "update")).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("refuses a minimum above the latest version", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, min_version: "1.10.0", latest_version: "1.9.0" }),
    );
    expect(res).toEqual({
      error: "mobileapp.err.minAboveLatest",
      platform: "android",
    });
    expect(ops.filter((o) => o.op === "update")).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("accepts min 1.9.0 with latest 1.10.0 — the pair a string compare inverts", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, min_version: "1.9.0", latest_version: "1.10.0" }),
    );
    expect(res).toEqual({ ok: true, platform: "android" });
  });

  it("still refuses a malformed version with its own message", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, min_version: "1.9" }),
    );
    expect(res).toEqual({ error: "mobileapp.err.semver", platform: "android" });
    expect(ops.filter((o) => o.op === "update")).toHaveLength(0);
  });

  it("still refuses a non-https store link", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, store_url: "http://play.google.com/x" }),
    );
    expect(res).toEqual({ error: "mobileapp.err.url", platform: "android" });
    expect(ops.filter((o) => o.op === "update")).toHaveLength(0);
  });
});

describe("updateMobileVersion — the valid path still saves", () => {
  it("writes the row, audits the change and reports success", async () => {
    const res = await updateMobileVersion(
      null,
      form({ ...GOOD, force_update: "on" }),
    );
    expect(res).toEqual({ ok: true, platform: "android" });

    const write = ops.find((o) => o.op === "update");
    expect(write?.table).toBe("mobile_app_versions");
    expect(write?.payload?.force_update).toBe(true);
    expect(write?.payload?.min_version).toBe("1.9.0");
    expect(write?.payload?.store_url).toBe(STORE_URL);

    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("admin.mobile_version.update");
    // Field NAMES only — an update message body never lands in the audit log.
    expect(String(audits[0].metadata?.fields)).toContain("force_update");
    expect(JSON.stringify(audits[0].metadata)).not.toContain(GOOD.message_az);
  });

  it("never returns raw database text to the client", async () => {
    updateError = {
      message: 'new row violates check constraint "mobile_app_versions_x"',
    };
    const res = await updateMobileVersion(null, form(GOOD));
    expect(res).toEqual({ error: "mobileapp.err.server", platform: "android" });
  });
});

// =========================================================================
describe("the strings exist in all three languages", () => {
  const KEYS = [
    "mobileapp.err.forceNoUrl",
    "mobileapp.err.minAboveLatest",
    "mobileapp.forceWarn",
    "mobileapp.minGuidance",
  ];

  for (const key of KEYS) {
    it(`${key} is translated az/en/ru`, () => {
      const az = messages.az[key];
      const en = messages.en[key];
      const ru = messages.ru[key];
      for (const value of [az, en, ru]) {
        expect(typeof value === "string" && value.length > 0).toBe(true);
      }
      // Three distinct translations, not one string copied three times.
      expect(new Set([az, en, ru]).size).toBe(3);
    });
  }
});

// =========================================================================
// The database backstop. The app-level rail above is the readable error; the
// constraint is what closes every write path nobody has written yet.
describe("migration 161 makes the dead-end state unrepresentable", () => {
  // Resolved from the vitest root (admin-panel), NOT with `new URL(…,
  // import.meta.url)`: Vite rewrites that pattern into an asset import and then
  // refuses to serve a file outside the project.
  const SQL = readFileSync(
    resolve(
      process.cwd(),
      "..",
      "supabase/sql/migrations/2026_08_29_161_force_update_needs_store_url.sql",
    ),
    "utf8",
  )
    .split("\r\n")
    .join("\n");

  it("adds the force_update/store_url CHECK", () => {
    expect(SQL).toContain("mobile_app_versions_force_needs_store_url");
    expect(SQL).toContain("check (force_update = false or store_url <> '')");
  });

  it("is rerun-safe — the constraint is added only when absent", () => {
    expect(SQL).toContain("from pg_constraint");
    expect(SQL).toContain("if not exists");
  });

  it("names its canonical backport target", () => {
    expect(SQL).toContain("008_notifications_support_audit.sql");
  });

  it("verifies the constraint at the end instead of assuming it", () => {
    expect(SQL).toContain("raise exception");
    expect(SQL).toContain("convalidated");
  });
});
