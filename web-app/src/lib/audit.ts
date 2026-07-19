import "server-only";

// Best-effort audit-log writer for privileged PARENT-initiated web mutations
// (registration, child create/password-reset, subscription create/change/
// cancel, olympiad purchase, account deletion). Mirrors the shape of the
// admin-panel helper (admin-panel/src/lib/admin/audit.ts) so both apps write
// the exact same audit_logs row shape — kept as a separate, independently
// maintained module per the web-app/admin-panel repo boundary (no cross-app
// imports).
//
// audit_logs (008) columns: actor_profile_id, action, target_table, target_id
// (uuid), metadata_json, severity, success.
//
// - RLS: audit_logs has NO client insert policy (append-only by design);
//   writes happen via the SERVICE ROLE. This helper therefore uses the
//   service-role admin client — every caller MUST have already authorized the
//   acting parent (requireParent/getParent on web, resolveBearerParent on the
//   mobile BFF) before calling this.
// - actorProfileId is EXPLICIT, never resolved here: the service-role client
//   carries no session/cookies, so there is no "current profile" to infer —
//   every call site passes the acting parent's own profile id.
// - Best-effort: an audit failure must NEVER block or fail the mutation —
//   every failure path is swallowed and surfaced only in server logs (never
//   secrets, never request bodies).
// - Severity MUST match the DB enum public.audit_severity, exactly
//   ('info','warning','critical') — there is NO 'error' member. An
//   out-of-enum value would make the INSERT throw and silently drop the row.
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditLogOptions = {
  targetTable?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  success?: boolean;
};

// Metadata stays a SMALL diff-ish payload — never large bodies. Any string
// value is capped defensively.
const META_STRING_CAP = 200;

function capMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v === undefined) continue;
    out[k] =
      typeof v === "string" && v.length > META_STRING_CAP
        ? `${v.slice(0, META_STRING_CAP)}…`
        : v;
  }
  return out;
}

/**
 * Records ONE privileged parent-initiated mutation. `actorProfileId` is the
 * acting parent's OWN profile id — pass it explicitly from whatever already
 * authorized the request. Never throws; a logging failure must not surface to
 * the caller or block the mutation it documents.
 */
export async function writeAuditLog(
  actorProfileId: string | null,
  action: string,
  opts: AuditLogOptions = {},
): Promise<void> {
  try {
    if (!isServiceRoleConfigured) {
      // Auditing is best-effort: without the service key we cannot write
      // (audit_logs is service-role-only), but the mutation must still succeed.
      console.error("[audit] skipped (no service-role key)", action);
      return;
    }
    const admin = getAdminClient();

    // target_id is a uuid column: coerce empty/blank to NULL so a missing id
    // never becomes ""::uuid (which Postgres rejects and would drop the row).
    const targetId =
      typeof opts.targetId === "string" && opts.targetId.trim() !== ""
        ? opts.targetId
        : null;

    const { error } = await admin.from("audit_logs").insert({
      actor_profile_id: actorProfileId,
      action,
      target_table: opts.targetTable ?? null,
      target_id: targetId,
      metadata_json: capMetadata(opts.metadata),
      severity: opts.severity ?? "info",
      success: opts.success ?? true,
    });
    if (error) {
      // Non-fatal by design, but do not let a failed write masquerade as a
      // recorded event — make the failure visible in server logs.
      console.error("[audit] failed to record entry", action, error.message);
    }
  } catch (e) {
    // never let auditing break the operation
    console.error("[audit] unexpected error recording entry", action, e);
  }
}
