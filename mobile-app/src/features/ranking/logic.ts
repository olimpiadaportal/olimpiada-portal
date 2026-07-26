// Pure leaderboard display rules (Round 51 audit — web /child/leaderboard
// parity), kept free of React/supabase imports so jest exercises them directly
// (__tests__/ranking-logic.test.ts). The types come in via `import type` only.
import type { Board, Scope } from "./data";
import type { LbRow, MyRank } from "./parse";

/**
 * The sticky my-rank card's fallback message when the viewer has NO rank and
 * is NOT provisional (web page parity): under a non-global percent filter the
 * honest answer is "you are not on the board under this filter", not the
 * generic "not ranked yet".
 */
export function myRankFallbackKey(board: Board, scope: Scope): string {
  return board === "percent" && scope !== "global"
    ? "lb.myRank.notInFilter"
    : "lb.myRank.none";
}

/**
 * Provisional legend visibility (web showProvHint parity): on the percent
 * board whenever ANY provisional context is visible — a provisional row on the
 * board OR the viewer themselves — even when the listed rows are empty. The
 * threshold value itself comes from the my-rank payload, so a missing payload
 * hides the legend (nothing to substitute into "{n}").
 */
export function showProvisionalLegend(
  board: Board,
  rows: readonly Pick<LbRow, "is_provisional">[],
  me: Pick<MyRank, "is_provisional"> | null,
): boolean {
  if (board !== "percent" || me === null) return false;
  return rows.some((r) => r.is_provisional) || me.is_provisional;
}

/**
 * District picker clamp: an explicit valid selection wins; otherwise default
 * to the child's OWN rayon when it is in the city's list; otherwise the first
 * rayon; null only when the city has none (the tab is hidden then anyway).
 */
export function resolveDistrictId(
  districts: readonly { id: string }[],
  selectedId: string | null,
  ownDistrictId: string | null,
): string | null {
  return (
    districts.find((d) => d.id === selectedId)?.id ??
    districts.find((d) => d.id === ownDistrictId)?.id ??
    districts[0]?.id ??
    null
  );
}
