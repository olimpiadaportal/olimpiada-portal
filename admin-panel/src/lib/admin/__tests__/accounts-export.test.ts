// Accounts export — row flattening, login-status derivation and the summary
// arithmetic. These are the parts of the export that can be wrong SILENTLY: a
// wrong number in a spreadsheet looks exactly like a right one.
//
// The three properties worth pinning are the ones the migration-169 header and
// the owner's brief both insist on:
//   * a parent with no children still produces a row;
//   * NULL gender and 'unspecified' gender are never merged;
//   * an empty database exports zeroes, not a division by zero.
import { describe, expect, it } from "vitest";
import {
  buildAccountsExport,
  childLoginStatus,
  EXPORT_FILENAME_RE,
  exportFilename,
  type ExportChild,
  type ExportParent,
  type StudentGender,
} from "../accounts-export";

const child = (over: Partial<ExportChild> = {}): ExportChild => ({
  childUniqueId: "12345678",
  firstName: "Aysu",
  lastName: "Məmmədova",
  gender: null,
  accessStatus: "active",
  createdAt: "2026-05-01T10:00:00Z",
  hasCredentials: true,
  ...over,
});

const parent = (over: Partial<ExportParent> = {}): ExportParent => ({
  profileId: "11111111-1111-1111-1111-111111111111",
  displayName: "Kamil Piriyev",
  email: "kamil@example.com",
  status: "active",
  createdAt: "2026-04-01T08:00:00Z",
  children: [],
  ...over,
});

describe("childLoginStatus", () => {
  it("is 'canSignIn' only with BOTH a credential row and an 8-digit id", () => {
    expect(childLoginStatus(child())).toBe("canSignIn");
  });

  it("is 'noLoginId' when credentials exist but no id has been allocated", () => {
    // Real state: the id is allocated on the first subscription/grant, so a
    // freshly created child has credentials and no username yet.
    expect(childLoginStatus(child({ childUniqueId: null }))).toBe("noLoginId");
  });

  it("is 'noCredentials' when no auth user is mapped, id or not", () => {
    expect(childLoginStatus(child({ hasCredentials: false }))).toBe(
      "noCredentials",
    );
    expect(
      childLoginStatus(child({ hasCredentials: false, childUniqueId: null })),
    ).toBe("noCredentials");
  });
});

describe("buildAccountsExport rows", () => {
  it("emits one row per child with the parent columns repeated", () => {
    const { rows } = buildAccountsExport([
      parent({
        children: [
          child({ childUniqueId: "10000001", firstName: "Aysu" }),
          child({ childUniqueId: "10000002", firstName: "Elvin" }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.childUniqueId)).toEqual(["10000001", "10000002"]);
    expect(new Set(rows.map((r) => r.parentEmail))).toEqual(
      new Set(["kamil@example.com"]),
    );
    expect(rows.every((r) => r.childCount === 2)).toBe(true);
    // The relation key is the parent email, repeated verbatim.
    expect(rows.every((r) => r.relationKey === r.parentEmail)).toBe(true);
  });

  it("keeps a childless parent as a row with the child columns blank", () => {
    const { rows } = buildAccountsExport([parent({ children: [] })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].parentEmail).toBe("kamil@example.com");
    expect(rows[0].childCount).toBe(0);
    expect(rows[0].childUniqueId).toBe("");
    expect(rows[0].childName).toBe("");
    expect(rows[0].childStatus).toBe("");
    // null, NOT 'notAsked' — the two must stay distinguishable, or a parent
    // with no children reads as a child nobody has been asked about.
    expect(rows[0].childGender).toBeNull();
    expect(rows[0].childLogin).toBeNull();
  });

  it("marks a real child's missing answer 'notAsked', never null", () => {
    const { rows } = buildAccountsExport([
      parent({ children: [child({ gender: null })] }),
    ]);

    expect(rows[0].childGender).toBe("notAsked");
  });

  it("formats dates as sortable Baku wall clock", () => {
    const { rows } = buildAccountsExport([
      parent({ createdAt: "2026-04-01T21:30:00Z", children: [child()] }),
    ]);
    // 21:30 UTC is already the 2nd in Baku (+4).
    expect(rows[0].parentRegisteredAt).toBe("2026-04-02 01:30");
  });
});

describe("buildAccountsExport statistics", () => {
  it("counts NULL gender and 'unspecified' gender separately", () => {
    const genders: Array<StudentGender | null> = [
      "female",
      "female",
      "male",
      "unspecified",
      null,
      null,
      null,
    ];
    const { stats } = buildAccountsExport([
      parent({ children: genders.map((g) => child({ gender: g })) }),
    ]);

    expect(stats.genderFemale).toBe(2);
    expect(stats.genderMale).toBe(1);
    expect(stats.genderUnspecified).toBe(1); // asked, declined
    expect(stats.genderNotAsked).toBe(3); // never asked — its own bucket
    // Every child lands in exactly one bucket and none is lost.
    expect(
      stats.genderFemale +
        stats.genderMale +
        stats.genderUnspecified +
        stats.genderNotAsked,
    ).toBe(stats.totalChildren);
  });

  it("derives the parent/child totals, splits and ratios", () => {
    const { stats } = buildAccountsExport([
      parent({
        profileId: "p1",
        status: "active",
        children: [
          child({ accessStatus: "active" }),
          child({ accessStatus: "trialing" }),
          child({ accessStatus: "expired" }),
        ],
      }),
      parent({ profileId: "p2", status: "suspended", children: [child()] }),
      parent({ profileId: "p3", status: "active", children: [] }),
      parent({ profileId: "p4", status: "pending", children: [] }),
    ]);

    expect(stats.totalParents).toBe(4);
    expect(stats.activeParents).toBe(2);
    expect(stats.inactiveParents).toBe(2);
    expect(stats.totalChildren).toBe(4);
    expect(stats.activeChildren).toBe(2); // 'trialing' is NOT counted as active
    expect(stats.inactiveChildren).toBe(2);
    expect(stats.parentsWithChildren).toBe(2);
    expect(stats.parentsWithoutChildren).toBe(2);
    expect(stats.avgChildrenPerParent).toBe(1);
    expect(stats.fracActiveChildren).toBe(0.5);
    expect(stats.fracParentsWithChildren).toBe(0.5);
  });

  it("reports the full status breakdown the two-way split hides", () => {
    const { stats } = buildAccountsExport([
      parent({
        children: [
          child({ accessStatus: "trialing" }),
          child({ accessStatus: "trialing" }),
          child({ accessStatus: "locked" }),
        ],
      }),
    ]);
    // Sorted count-descending, so the largest bucket leads.
    expect(stats.childStatusCounts).toEqual([
      ["trialing", 2],
      ["locked", 1],
    ]);
  });

  it("exports an EMPTY database as zeroes, never a division by zero", () => {
    const { rows, stats } = buildAccountsExport([]);

    expect(rows).toEqual([]);
    expect(stats.totalParents).toBe(0);
    expect(stats.totalChildren).toBe(0);
    expect(stats.avgChildrenPerParent).toBe(0);
    expect(stats.fracActiveChildren).toBe(0);
    expect(stats.fracParentsWithChildren).toBe(0);
    for (const n of Object.values(stats)) {
      if (typeof n === "number") expect(Number.isFinite(n)).toBe(true);
    }
  });

  it("guards the per-child ratio when parents exist but children do not", () => {
    const { stats } = buildAccountsExport([parent({ children: [] })]);
    expect(stats.fracActiveChildren).toBe(0);
    expect(stats.avgChildrenPerParent).toBe(0);
  });
});

describe("exportFilename", () => {
  it("builds the exact name the owner specified", () => {
    const name = exportFilename("2026-09-08_14-32");
    expect(name).toBe("OlympIQ_Accounts_Export_2026-09-08_14-32.xlsx");
    expect(EXPORT_FILENAME_RE.test(name)).toBe(true);
  });

  it("rejects anything that is not that shape (client-side download guard)", () => {
    for (const bad of [
      "OlympIQ_Accounts_Export.xlsx",
      "../../etc/passwd",
      "OlympIQ_Accounts_Export_2026-09-08_14-32.xlsx.exe",
      "Other_2026-09-08_14-32.xlsx",
    ]) {
      expect(EXPORT_FILENAME_RE.test(bad)).toBe(false);
    }
  });
});
