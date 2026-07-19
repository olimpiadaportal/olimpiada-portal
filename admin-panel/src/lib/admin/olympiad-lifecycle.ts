// Derived catalog lifecycle of an olympiad package, computed SERVER-SIDE from
// DB-fetched fields against the server clock (never the client's). Mirrors the
// public visibility/purchase rule the DATABASE enforces (RLS + purchase RPC):
//
//   public = status 'active'
//            AND (sale_starts_at IS NULL OR sale_starts_at <= now())
//            AND (sale_ends_at   IS NULL OR sale_ends_at   >  now())
//
// Admins always see every package (including expired/archived ones); this
// module only names the state for the UI. Plain module (no "use server") so
// server pages can import the pure helpers.

export type OlympiadLifecycleState =
  | "archived" // status archived — hidden from the public catalog
  | "inactive" // status inactive (never published) — hidden from the public catalog
  | "scheduled" // active, sale_starts_at in the future
  | "active" // active, sale window open (also when no dates are set)
  | "expired"; // active, sale_ends_at passed — purchasers keep lifetime access

export type OlympiadLifecycleInput = {
  status: string;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

export function olympiadLifecycleState(
  pkg: OlympiadLifecycleInput,
  nowMs: number,
): OlympiadLifecycleState {
  if (pkg.status === "archived") return "archived";
  if (pkg.status !== "active") return "inactive";
  const start = pkg.sale_starts_at ? Date.parse(pkg.sale_starts_at) : NaN;
  const end = pkg.sale_ends_at ? Date.parse(pkg.sale_ends_at) : NaN;
  if (Number.isFinite(start) && start > nowMs) return "scheduled";
  if (Number.isFinite(end) && end <= nowMs) return "expired";
  return "active";
}

// Pill color class for a lifecycle chip (globals.css: pill-ok/pill-warn/pill-muted).
export function lifecyclePillClass(state: OlympiadLifecycleState): string {
  switch (state) {
    case "active":
      return "pill-ok";
    case "expired":
    case "archived":
      return "pill-warn";
    default:
      // scheduled | inactive
      return "pill-muted";
  }
}
