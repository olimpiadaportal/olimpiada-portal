import "server-only";

// The READ behind the Accounts Excel download. Its own module ON PURPOSE — it
// used to live in accounts.ts and must never go back.
//
// accounts.ts is a `"use server"` file, and in such a file EVERY export becomes
// a Server Action: Next registers it in server-reference-manifest.json and gives
// it its own POST endpoint, callable by id by anything that can reach the app.
// That is the right shape for the account mutations there. It is the wrong shape
// for this function, which returns every family's name and email and every
// child's 8-digit login id. Exported from a "use server" module it was a SECOND
// network path to the identical full-PII snapshot: still admin-only, but with no
// audit row, so an export taken that way left no record of who took it.
//
// A plain server-only module has no such endpoint. The route handler imports it
// like any other function, and GET /api/accounts/export — which authorizes AND
// audits — stays the only way this data reaches the network.
//
// requireAdmin() still runs here as well as in the route: the guard belongs to
// the read, not to one caller of it.
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import {
  buildAccountsExport,
  type AccountsExport,
  type ExportChild,
  type ExportParent,
  type StudentGender,
} from "@/lib/admin/accounts-export";

// ONE QUERY SHAPE, ONE PASS. Parents and their children arrive together via a
// PostgREST embed, so there is no per-parent round trip: the children of every
// parent on the page come back inside that parent's row. The embed is FK-hinted
// (`students!created_by_parent_profile_id`) because `students` has TWO foreign
// keys to `profiles` — `profile_id` (the child's own profile) and
// `created_by_parent_profile_id` (the parent who created them) — and without
// the hint PostgREST cannot tell which relationship is meant.
//
// The LEFT embed is the point: a parent with no children still comes back, with
// an empty children array, and becomes a row with the child columns blank.
//
// WHY IT LOOPS. PostgREST caps a response at `db.max_rows` (1000 on a default
// Supabase project), and a cap silently TRUNCATES rather than erroring — an
// export that quietly stopped at parent 1000 would be worse than one that
// failed. So the same query is walked in ordered pages. For any database up to
// EXPORT_PAGE_ROWS parents that is exactly one round trip; beyond it the cost
// is O(parents / 1000), never O(parents).
//
// RLS, not the service role: `profiles`, `students` and `child_credentials` all
// carry admin SELECT policies (010), which is precisely how the Accounts page
// itself reads them. The service key buys nothing HERE — this read needs no
// privilege the signed-in administrator lacks. It is still required for the
// EXPORT to complete: the route refuses to release the file unless the audit
// row lands, and audit_logs is service-role-only.
//
// `students.gender` comes from migration 169 and the query depends on it: the
// migration applies BEFORE this code deploys, per the database-first rule.

// Written without whitespace, matching the Accounts page's own select. (supabase-js
// strips unquoted spaces anyway; keeping the two selects in the same style makes
// them comparable at a glance.)
const EXPORT_SELECT =
  "id,display_name,email,status,created_at," +
  "profile_roles!profile_id!inner(roles!inner(code))," +
  "students!created_by_parent_profile_id(" +
  "profile_id,child_unique_id,first_name,last_name,gender," +
  "access_status,created_at," +
  "child_credentials(student_profile_id)" +
  ")";

// One PostgREST page. Sized to the default Supabase `db.max_rows` so the common
// case is a single request.
const EXPORT_PAGE_ROWS = 1000;

// Hard ceiling on the snapshot. Chosen well above any plausible size for this
// platform and well below Excel's own 1,048,576-row sheet limit. Exceeding it
// REFUSES rather than truncating: a partial export that looks complete is the
// one failure mode nobody downstream could detect.
const EXPORT_MAX_ROWS = 200_000;

const GENDERS: ReadonlySet<string> = new Set(["female", "male", "unspecified"]);

// Narrow the enum coming off the wire instead of casting it. Anything the app
// does not recognise (a value added to the DB enum later, a NULL) becomes null
// — "never asked" — which is the honest reading of "no answer this code knows".
function toGender(v: unknown): StudentGender | null {
  return typeof v === "string" && GENDERS.has(v) ? (v as StudentGender) : null;
}

type RawChild = {
  profile_id: string;
  child_unique_id: string | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  access_status: string | null;
  created_at: string | null;
  // to-one embed: PostgREST has returned this as an object and (older versions)
  // as a single-element array, so both are accepted.
  child_credentials: unknown;
};

type RawParent = {
  id: string;
  display_name: string | null;
  email: string | null;
  status: string | null;
  created_at: string | null;
  students: RawChild[] | null;
};

function hasCredentialRow(embedded: unknown): boolean {
  if (Array.isArray(embedded)) return embedded.length > 0;
  return embedded !== null && embedded !== undefined;
}

function toChild(raw: RawChild): ExportChild {
  return {
    childUniqueId: raw.child_unique_id,
    firstName: raw.first_name,
    lastName: raw.last_name,
    gender: toGender(raw.gender),
    accessStatus: raw.access_status ?? "inactive",
    createdAt: raw.created_at,
    hasCredentials: hasCredentialRow(raw.child_credentials),
  };
}

export type AccountsExportResult =
  | { ok: true; data: AccountsExport }
  | { ok: false; reason: "server" | "tooLarge" };

export async function readAccountsExportSnapshot(): Promise<AccountsExportResult> {
  await requireAdmin(); // authorize FIRST — this reads every family's PII
  const supabase = await createClient();

  const parents: ExportParent[] = [];
  let sheetRows = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select(EXPORT_SELECT)
      .eq("profile_roles.roles.code", "parent")
      // Ordered by REGISTRATION, tie-broken by the primary key. Two reasons,
      // both about correctness rather than looks: a non-unique sort can repeat
      // or skip rows across pages, and an append-only order means a parent who
      // registers mid-export lands past the cursor instead of shifting an
      // already-read row out of the window. Presentation order is applied once,
      // below, over the complete snapshot.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + EXPORT_PAGE_ROWS - 1);

    if (error) {
      // Never return raw Postgres/PostgREST text to the client.
      console.error("[admin] accounts export query failed", error.message);
      return { ok: false, reason: "server" };
    }

    const page = (data ?? []) as unknown as RawParent[];
    if (page.length === 0) break;
    // Advance by what ARRIVED, not by what was asked for. A PostgREST instance
    // configured with a smaller db.max_rows than EXPORT_PAGE_ROWS would
    // otherwise look like the end of the table, and the export would stop early
    // while claiming to be complete.
    from += page.length;

    for (const p of page) {
      const kids = (p.students ?? []).map(toChild);
      // Same order the Accounts page shows children in: oldest first.
      kids.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      // A childless parent still costs one row, so the ceiling is measured in
      // the rows the sheet will actually carry.
      sheetRows += Math.max(1, kids.length);
      parents.push({
        profileId: p.id,
        displayName: p.display_name,
        email: p.email,
        status: p.status ?? "pending",
        createdAt: p.created_at,
        children: kids,
      });
    }

    if (sheetRows > EXPORT_MAX_ROWS) return { ok: false, reason: "tooLarge" };
  }

  // Presentation order, applied once over the whole snapshot: by parent name,
  // then email, so an unnamed account still lands somewhere predictable.
  parents.sort(
    (a, b) =>
      (a.displayName ?? "").localeCompare(b.displayName ?? "") ||
      (a.email ?? "").localeCompare(b.email ?? ""),
  );

  return { ok: true, data: buildAccountsExport(parents) };
}
