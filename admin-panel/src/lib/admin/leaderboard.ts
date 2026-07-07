"use server";

// Leaderboard management — Administrator-only server actions (L2).
//
// The reset RPC (public.admin_reset_leaderboard) is SERVICE-ROLE ONLY by design
// (EXECUTE revoked from anon + authenticated), so this action authorizes FIRST
// via requireAdmin() and only then reaches for the service-role admin client.
//   - 'season' : archives the CURRENT month into leaderboard_snapshots, then
//                zeroes the monthly caches (all-time points are untouched);
//   - 'hard'   : wipes the points ledger + activity history + every cached
//                point/streak value — destructive, double-confirmed in the UI.
// Errors are never surfaced raw: the client gets a generic trilingual key and
// the detail goes to the server log only.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

const RESET_MODES = ["season", "hard"] as const;
type ResetMode = (typeof RESET_MODES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEASON_NAME_MAX = 120;

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export type LeaderboardResetState = {
  ok?: boolean;
  mode?: ResetMode;
  error?: string; // i18n key, resolved client-side
} | null;

export async function resetLeaderboard(
  _prev: LeaderboardResetState,
  formData: FormData,
): Promise<LeaderboardResetState> {
  // Authorize FIRST — before touching any input.
  const ctx = await requireAdmin();

  const modeRaw = String(formData.get("mode") ?? "");
  if (!(RESET_MODES as readonly string[]).includes(modeRaw)) {
    return { error: "lb.reset.error" };
  }
  const mode = modeRaw as ResetMode;

  if (!hasServiceRole()) {
    console.error("[admin] leaderboard reset skipped: no service-role key");
    return { error: "lb.reset.error", mode };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reset_leaderboard", {
    p_mode: mode,
  });
  if (error) {
    // Never leak raw DB text to the client.
    console.error("[admin] leaderboard reset failed", mode, error.message);
    return { error: "lb.reset.error", mode };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.reset",
    targetTable: "students",
    metadata: { mode },
    severity: mode === "hard" ? "critical" : "warning",
  });

  revalidatePath("/leaderboard");
  return { ok: true, mode };
}

// ===========================================================================
// Named competition seasons (leaderboard_seasons) — Administrator-only CRUD.
//
// Reads are done on the admin's SESSION client (RLS policy lseasons_admin lets
// an admin SELECT). Every WRITE goes exclusively through the SERVICE-ROLE RPCs
// (create/update/delete/close/reopen_leaderboard_season), which are the only
// path that may mutate the table. As everywhere in this module:
//   1) requireAdmin() runs FIRST — before any FormData is read;
//   2) the service-role client is created only AFTER that check;
//   3) every client id is UUID-validated before the privileged RPC;
//   4) raw DB text is never returned — the client gets a generic trilingual
//      message and the detail goes to the server log;
//   5) each mutation records a best-effort audit_logs row.
// Status is derived in TS from the row (closed_at / starts_at / ends_at) — the
// table has no status column.
// ===========================================================================

// Shape the /leaderboard page maps its session-client rows into and passes to
// <SeasonManager/>. Timestamps stay ISO strings; the client formats them.
export type SeasonRow = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  createdAt: string;
};

// useActionState-compatible result for the create/update forms and the
// confirm dialogs. `error` is already-resolved trilingual text (never a raw
// DB message, never an i18n key the client must resolve).
export type SeasonActionState = { ok?: true; error?: string } | null;

// A single standings row (rank/name/value) for the standings modal.
export type SeasonStandingRow = {
  rank: number;
  displayName: string | null;
  value: number;
};

// Validate name + the two client-converted UTC-ISO datetimes shared by
// create/update. Returns either the parsed values or a resolved error string.
function parseSeasonForm(
  formData: FormData,
  t: (key: string) => string,
):
  | { ok: true; name: string; startsAt: string; endsAt: string }
  | { ok: false; error: string } {
  const name = f(formData, "name");
  const startsRaw = f(formData, "starts_at");
  const endsRaw = f(formData, "ends_at");

  if (name.length < 1 || name.length > SEASON_NAME_MAX) {
    return { ok: false, error: t("lbseason.err.name") };
  }

  const start = new Date(startsRaw);
  const end = new Date(endsRaw);
  if (
    !startsRaw ||
    !endsRaw ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return { ok: false, error: t("lbseason.err.dates") };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: t("lbseason.endBeforeStart") };
  }

  return {
    ok: true,
    name,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

// ---- createSeason ---------------------------------------------------------
export async function createSeason(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const ctx = await requireAdmin(); // authorize FIRST
  const t = await getT();
  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parsed = parseSeasonForm(formData, t);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();
  const { data: newId, error } = await admin.rpc("create_leaderboard_season", {
    p_name: parsed.name,
    p_starts_at: parsed.startsAt,
    p_ends_at: parsed.endsAt,
  });
  if (error) {
    console.error("[admin] create_leaderboard_season failed", error.message);
    return { error: t("lbseason.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.season.create",
    targetTable: "leaderboard_seasons",
    targetId: typeof newId === "string" ? newId : null,
    metadata: { name: parsed.name },
  });

  revalidatePath("/leaderboard");
  return { ok: true };
}

// ---- updateSeason (RPC raises if the season is already closed) ------------
export async function updateSeason(
  _prev: SeasonActionState,
  formData: FormData,
): Promise<SeasonActionState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return { error: t("lbseason.err.failed") };

  const parsed = parseSeasonForm(formData, t);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();
  const { error } = await admin.rpc("update_leaderboard_season", {
    p_id: id,
    p_name: parsed.name,
    p_starts_at: parsed.startsAt,
    p_ends_at: parsed.endsAt,
  });
  if (error) {
    console.error("[admin] update_leaderboard_season failed", error.message);
    return { error: t("lbseason.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.season.update",
    targetTable: "leaderboard_seasons",
    targetId: id,
    metadata: { name: parsed.name },
  });

  revalidatePath("/leaderboard");
  return { ok: true };
}

// ---- deleteSeason ---------------------------------------------------------
export async function deleteSeason(
  formData: FormData,
): Promise<SeasonActionState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return { error: t("lbseason.err.failed") };

  const admin = createAdminClient();
  const { error } = await admin.rpc("delete_leaderboard_season", { p_id: id });
  if (error) {
    console.error("[admin] delete_leaderboard_season failed", error.message);
    return { error: t("lbseason.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.season.delete",
    targetTable: "leaderboard_seasons",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/leaderboard");
  return { ok: true };
}

// ---- closeSeason (freezes current standings into standings_json) ----------
export async function closeSeason(
  formData: FormData,
): Promise<SeasonActionState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return { error: t("lbseason.err.failed") };

  const admin = createAdminClient();
  const { error } = await admin.rpc("close_leaderboard_season", { p_id: id });
  if (error) {
    console.error("[admin] close_leaderboard_season failed", error.message);
    return { error: t("lbseason.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.season.close",
    targetTable: "leaderboard_seasons",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/leaderboard");
  return { ok: true };
}

// ---- reopenSeason (clears closed_at + standings_json) ---------------------
export async function reopenSeason(
  formData: FormData,
): Promise<SeasonActionState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return { error: t("lbseason.err.failed") };

  const admin = createAdminClient();
  const { error } = await admin.rpc("reopen_leaderboard_season", { p_id: id });
  if (error) {
    console.error("[admin] reopen_leaderboard_season failed", error.message);
    return { error: t("lbseason.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.leaderboard.season.reopen",
    targetTable: "leaderboard_seasons",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/leaderboard");
  return { ok: true };
}

// ---- fetchSeasonStandings (read-only, NOT audited) ------------------------
// Live from the ledger while the season is open; the frozen standings_json
// once it is closed — the RPC handles that branch server-side.
export async function fetchSeasonStandings(
  id: string,
): Promise<SeasonStandingRow[]> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return [];
  if (!UUID_RE.test(id)) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_season_standings", {
    p_id: id,
    p_limit: 100,
  });
  if (error || !data) {
    if (error) {
      console.error("[admin] get_season_standings failed", error.message);
    }
    return [];
  }

  return (data as any[]).map((r) => ({
    rank: Number(r.rank),
    displayName: r.display_name ?? null,
    value: Number(r.value),
  }));
}
