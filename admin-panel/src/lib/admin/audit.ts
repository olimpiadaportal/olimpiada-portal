import "server-only";

// Shared best-effort audit-log writer for sensitive Admin-only mutations.
// Extracted from the pattern in accounts.ts so news/olympiad/wallpapers/settings
// (and accounts) record the same audit_logs shape.
//
// PLAIN module (no "use server") so it may export types/constants and still be
// imported by "use server" action files.
//
// audit_logs (008) columns: actor_profile_id, action, target_table, target_id
// (uuid), metadata_json, severity, success.
//
// - RLS: audit_logs has NO client insert policy (append-only by design); writes
//   happen via SECURITY DEFINER triggers or the SERVICE ROLE. This helper
//   therefore uses the service-role admin client, created only inside the call
//   (callers have already passed requireAdmin()/requirePermission()).
// - Best-effort: an audit failure must NEVER block or fail the mutation — every
//   failure path is swallowed and surfaced only in server logs.
// - Severity MUST match the DB enum public.audit_severity, which is exactly
//   ('info','warning','critical') — there is NO 'error' member. An out-of-enum
//   value makes the INSERT throw and silently DROP the row, so AuditSeverity is
//   constrained to the real enum at compile time.
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEntry = {
  actorProfileId: string | null;
  action: string;
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

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    if (!hasServiceRole()) {
      // Auditing is best-effort: without the service key we cannot write
      // (audit_logs is service-role-only), but the mutation must still succeed.
      console.error("[audit] skipped (no service-role key)", entry.action);
      return;
    }
    const admin = createAdminClient();

    // target_id is a uuid column: coerce empty/blank to NULL so a missing id
    // never becomes ""::uuid (which Postgres rejects and would drop the row).
    const targetId =
      typeof entry.targetId === "string" && entry.targetId.trim() !== ""
        ? entry.targetId
        : null;

    const { error } = await admin.from("audit_logs").insert({
      actor_profile_id: entry.actorProfileId,
      action: entry.action,
      target_table: entry.targetTable ?? null,
      target_id: targetId,
      metadata_json: capMetadata(entry.metadata),
      severity: entry.severity ?? "info",
      success: entry.success ?? true,
    });
    if (error) {
      // Non-fatal by design, but do not let a failed write masquerade as a
      // recorded event — make the failure visible in server logs.
      console.error("[audit] failed to record entry", entry.action, error.message);
    }
  } catch (e) {
    // never let auditing break the operation
    console.error("[audit] unexpected error recording entry", entry.action, e);
  }
}
