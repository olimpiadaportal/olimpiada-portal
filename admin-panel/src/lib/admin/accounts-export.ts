// Shape + arithmetic for the Accounts Excel export.
//
// PLAIN module (no "use server", no exceljs import) so it can be unit-tested
// and imported by both the query side (accounts-export-read.ts) and the
// workbook side (accountsWorkbook.ts) without dragging either into the other.
//
// WHY ROWS AND STATISTICS ARE BUILT TOGETHER. The two sheets must never
// disagree, and the cheapest way to guarantee that is structural rather than
// disciplinary: buildAccountsExport() takes ONE snapshot and returns both. No
// caller is able to pair sheet 1 with a different sheet 2, because there is no
// second entry point that produces either half on its own.
import { bakuSortableDateTime } from "./datetime";

// --------------------------------------------------------------------------
// Snapshot shape — exactly what the single query selects, nothing more. This
// is a MINOR'S PERSONAL DATA path (migration 169): a child's gender, name and
// 8-digit id are here because the export needs them, and nothing else about a
// child is carried.
// --------------------------------------------------------------------------

/** students.gender — NULL is "nobody has been asked yet" and is NOT a value. */
export type StudentGender = "female" | "male" | "unspecified";

export type ExportChild = {
  childUniqueId: string | null;
  firstName: string | null;
  lastName: string | null;
  /** NULL = never asked. 'unspecified' = asked and declined. Never collapsed. */
  gender: StudentGender | null;
  accessStatus: string;
  createdAt: string | null;
  /** A child_credentials row exists → an auth user is mapped to this child. */
  hasCredentials: boolean;
};

export type ExportParent = {
  profileId: string;
  displayName: string | null;
  email: string | null;
  status: string;
  createdAt: string | null;
  children: ExportChild[];
};

// --------------------------------------------------------------------------
// CHILD LOGIN STATUS — what the schema actually offers, and what was chosen.
//
// The question "can this child sign in?" is answered by the credential row and
// the 8-digit id, and by nothing else:
//   * `child_credentials` maps the child to an auth user. No row -> there is no
//     account to sign into at all.
//   * `child_unique_id` IS the username (child login is 8-digit id + password,
//     via the synthetic address c<id>@children.invalid). It is allocated on the
//     first subscription/grant, not at creation, so a child can legitimately
//     exist with credentials and still have no way to log in yet.
//
// Three candidates were checked and rejected, each for its own reason:
//   * `students.last_active_date` — streak bookkeeping for RATED play. A child
//     who signs in daily and never submits a rated round has NULL here, so it
//     answers "is this child studying?", not "can this child log in?".
//   * the child-login lockout (`is_child_login_locked` / `child_login_attempts`)
//     — a 15-minute window over recent FAILED attempts, cleared by the next
//     success. It would be stale before the file finished downloading, and it
//     would cost a second query the one-snapshot rule forbids.
//   * `child_credentials.password_set_at` — written only when an admin or
//     parent RESETS a password, never at creation. Every never-reset child
//     would be reported as having no password, which is false.
// --------------------------------------------------------------------------
export type ChildLoginStatus = "canSignIn" | "noLoginId" | "noCredentials";

export function childLoginStatus(child: ExportChild): ChildLoginStatus {
  if (!child.hasCredentials) return "noCredentials";
  return child.childUniqueId ? "canSignIn" : "noLoginId";
}

// --------------------------------------------------------------------------
// Rows: ONE per child, parent columns repeated. A parent with NO children is
// still a row — with every child column blank — because "which parents never
// added a child?" is one of the questions this export exists to answer, and a
// join that drops them cannot answer it.
// --------------------------------------------------------------------------

/**
 * Gender AS A ROW CARRIES IT, which is not the same set the column has. The
 * column has three values and a NULL; a row additionally has to be able to say
 * "there is no child on this line at all". So the never-asked NULL is named
 * here ('notAsked') and `null` is left to mean what it already means for
 * childLogin beside it: this row is a childless parent. Without the split, a
 * parent who never added a child rendered identically to a child nobody had
 * been asked about.
 */
export type GenderCell = StudentGender | "notAsked";

export type ExportRow = {
  parentId: string;
  parentName: string;
  parentEmail: string;
  parentStatus: string;
  parentRegisteredAt: string;
  childCount: number;
  childUniqueId: string;
  childName: string;
  /** null = no child on this row; 'notAsked' = a child, nobody asked yet. */
  childGender: GenderCell | null;
  childLogin: ChildLoginStatus | null;
  childStatus: string;
  childRegisteredAt: string;
  /** Repeat of the parent email, labelled as the key that joins the rows. */
  relationKey: string;
};

const fullName = (first: string | null, last: string | null): string =>
  [first, last].filter(Boolean).join(" ").trim();

// --------------------------------------------------------------------------
// Statistics — every number derived from the snapshot above, none hardcoded.
//
// ACTIVE, DEFINED. A parent is active when profiles.status = 'active'; a child
// is active when access_status = 'active'. Everything else counts as inactive,
// which lumps 'trialing' (real access) in with 'expired' (none) — so the full
// per-status breakdown ships alongside the two-way split rather than the split
// standing alone. A summary that hides where its own denominator went is worse
// than no summary.
// --------------------------------------------------------------------------
export type AccountsStats = {
  totalParents: number;
  activeParents: number;
  inactiveParents: number;
  parentStatusCounts: Array<[status: string, count: number]>;
  totalChildren: number;
  activeChildren: number;
  inactiveChildren: number;
  childStatusCounts: Array<[status: string, count: number]>;
  genderFemale: number;
  genderMale: number;
  /** Asked, declined to answer. */
  genderUnspecified: number;
  /** Never asked — the NULL bucket. Reported, never folded into the above. */
  genderNotAsked: number;
  parentsWithChildren: number;
  parentsWithoutChildren: number;
  /** Zero when there are no parents — an empty database exports, not crashes. */
  avgChildrenPerParent: number;
  /** FRACTION (0..1); the workbook formats it as a percentage. */
  fracActiveChildren: number;
  fracParentsWithChildren: number;
};

function tally(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

// Deterministic ordering so two exports of the same data are comparable:
// count descending, then status name.
function sortedCounts(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

export type AccountsExport = { rows: ExportRow[]; stats: AccountsStats };

export function buildAccountsExport(parents: ExportParent[]): AccountsExport {
  const rows: ExportRow[] = [];
  const parentStatuses = new Map<string, number>();
  const childStatuses = new Map<string, number>();

  let activeParents = 0;
  let totalChildren = 0;
  let activeChildren = 0;
  let parentsWithChildren = 0;
  let genderFemale = 0;
  let genderMale = 0;
  let genderUnspecified = 0;
  let genderNotAsked = 0;

  for (const p of parents) {
    const parentStatus = p.status || "pending";
    tally(parentStatuses, parentStatus);
    if (parentStatus === "active") activeParents += 1;
    if (p.children.length > 0) parentsWithChildren += 1;

    const base = {
      parentId: p.profileId,
      parentName: (p.displayName ?? "").trim(),
      parentEmail: (p.email ?? "").trim(),
      parentStatus,
      parentRegisteredAt: bakuSortableDateTime(p.createdAt),
      childCount: p.children.length,
      relationKey: (p.email ?? "").trim(),
    };

    if (p.children.length === 0) {
      rows.push({
        ...base,
        childUniqueId: "",
        childName: "",
        // null, not 'notAsked': there is no child here to have been asked.
        childGender: null,
        childLogin: null,
        childStatus: "",
        childRegisteredAt: "",
      });
      continue;
    }

    for (const c of p.children) {
      totalChildren += 1;
      const childStatus = c.accessStatus || "inactive";
      tally(childStatuses, childStatus);
      if (childStatus === "active") activeChildren += 1;

      // The NULL and 'unspecified' buckets are counted separately here and stay
      // separate all the way to the sheet.
      if (c.gender === "female") genderFemale += 1;
      else if (c.gender === "male") genderMale += 1;
      else if (c.gender === "unspecified") genderUnspecified += 1;
      else genderNotAsked += 1;

      rows.push({
        ...base,
        childUniqueId: c.childUniqueId ?? "",
        childName: fullName(c.firstName, c.lastName),
        childGender: c.gender ?? "notAsked",
        childLogin: childLoginStatus(c),
        childStatus,
        childRegisteredAt: bakuSortableDateTime(c.createdAt),
      });
    }
  }

  const totalParents = parents.length;

  return {
    rows,
    stats: {
      totalParents,
      activeParents,
      inactiveParents: totalParents - activeParents,
      parentStatusCounts: sortedCounts(parentStatuses),
      totalChildren,
      activeChildren,
      inactiveChildren: totalChildren - activeChildren,
      childStatusCounts: sortedCounts(childStatuses),
      genderFemale,
      genderMale,
      genderUnspecified,
      genderNotAsked,
      parentsWithChildren,
      parentsWithoutChildren: totalParents - parentsWithChildren,
      // Every ratio below is guarded: an empty database yields 0, never a
      // division by zero and never a #DIV/0! in the file.
      avgChildrenPerParent: totalParents === 0 ? 0 : totalChildren / totalParents,
      fracActiveChildren: totalChildren === 0 ? 0 : activeChildren / totalChildren,
      fracParentsWithChildren:
        totalParents === 0 ? 0 : parentsWithChildren / totalParents,
    },
  };
}

// --------------------------------------------------------------------------
// Filename. Fixed prefix + real Baku wall-clock stamp, exactly as specified:
//   OlympIQ_Accounts_Export_YYYY-MM-DD_HH-mm.xlsx
// The client re-validates the name it reads back out of Content-Disposition
// against EXPORT_FILENAME_RE before handing it to <a download> — the header is
// ours, but a filename arriving over the wire is still a filename.
// --------------------------------------------------------------------------
export const EXPORT_FILENAME_RE =
  /^OlympIQ_Accounts_Export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/;

export function exportFilename(stamp: string): string {
  return `OlympIQ_Accounts_Export_${stamp}.xlsx`;
}
