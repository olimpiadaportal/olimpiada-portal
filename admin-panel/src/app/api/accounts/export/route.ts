// Accounts Excel export — the download endpoint behind the Accounts page button.
//
// SECURITY POSTURE. This response carries EVERY family's name, email and every
// child's 8-digit login id, which makes it the single most sensitive read in
// the panel:
//   1) requireAdminApi() runs FIRST, before anything else in the handler. It is
//      the same gate the Accounts page itself sits behind, checked server-side;
//      a content manager reaching this URL is refused, never served. It reports
//      the refusal (401 / 403) instead of redirecting, because a fetch() FOLLOWS
//      a redirect and would receive the login page with status 200 — which the
//      button could only read as a dead session, telling a signed-in content
//      manager to sign in again over a permission they will still not have.
//      Both refusals describe the CALLER; neither says anything about the file.
//   2) There is no input. Nothing here is parameterised by the caller, so there
//      is nothing to validate and nothing to widen the query with.
//   3) An audit row records WHO exported and HOW MANY rows they took, and it
//      is written BEFORE the file is handed over. If it cannot be written —
//      audit_logs is service-role-only, so a deployment without that key writes
//      nothing — the download is REFUSED. An unrecorded copy of every family's
//      details is worse than a failed export: the refusal is loud and fixable,
//      the silence was neither.
//   4) No raw Postgres/ExcelJS text ever reaches the client — failures come
//      back as the panel's own trilingual messages.
//
// READ AT CLICK TIME. force-dynamic plus no-store: no route cache, no CDN copy,
// no browser copy. Every click re-runs the query.
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/guards";
import { readAccountsExportSnapshot } from "@/lib/admin/accounts-export-read";
import { buildAccountsWorkbook } from "@/lib/admin/accountsWorkbook";
import { exportFilename } from "@/lib/admin/accounts-export";
import { writeAuditLog } from "@/lib/admin/audit";
import { bakuFileStamp, formatBakuDateTime } from "@/lib/admin/datetime";
import { getT, getLocale } from "@/i18n/server";

// ExcelJS is a Node library (streams, zlib) — never the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const NO_STORE = "no-store, no-cache, must-revalidate";

function problem(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": NO_STORE } },
  );
}

export async function GET(): Promise<Response> {
  const auth = await requireAdminApi(); // authorize FIRST
  const t = await getT();

  // 401 = no session at all, so signing in again is the fix. 403 = a live
  // session on an account that may not export, where signing in again is not.
  // Same refusal either way; the difference is only what the caller is told.
  if (!auth.ok) {
    return auth.reason === "unauthenticated"
      ? problem(t("accounts.export.signedOut"), 401)
      : problem(t("accounts.export.forbidden"), 403);
  }
  const ctx = auth.ctx;
  const locale = await getLocale();

  const snapshot = await readAccountsExportSnapshot();
  if (!snapshot.ok) {
    // 413 for the size refusal so the client can say something specific;
    // everything else is the generic server message (the real cause is in the
    // server log, never in the response).
    return snapshot.reason === "tooLarge"
      ? problem(t("accounts.export.tooLarge"), 413)
      : problem(t("err.server"), 500);
  }

  const now = new Date();
  const filename = exportFilename(bakuFileStamp(now));

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await buildAccountsWorkbook(
      snapshot.data,
      t,
      formatBakuDateTime(now, locale),
      ctx.email,
    );
  } catch (e) {
    console.error("[admin] accounts export workbook failed", (e as Error).message);
    return problem(t("err.server"), 500);
  }

  const { rows, stats } = snapshot.data;
  const recorded = await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.accounts.export",
    targetTable: "profiles",
    // A full-PII export is not routine bookkeeping — it should stand out in the
    // audit log the way a password reset or a deletion does.
    severity: "warning",
    metadata: {
      rows: rows.length,
      parents: stats.totalParents,
      children: stats.totalChildren,
      format: "xlsx",
    },
  });
  // Nothing has left the server yet, so "not recorded" can still become "not
  // exported" — which for a full-PII download is the right answer. 503, not
  // 500: the request was valid and the fix is a server configuration.
  if (!recorded) return problem(t("accounts.export.noAudit"), 503);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      // The filename is ASCII by construction (fixed prefix + numeric stamp),
      // so the plain form needs no RFC 5987 encoding.
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": NO_STORE,
    },
  });
}
