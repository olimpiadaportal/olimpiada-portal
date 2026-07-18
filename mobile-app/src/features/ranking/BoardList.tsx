// Shared leaderboard board pieces used by BOTH the student RankingScreen
// (arena palette) and the parent full-board screen (theme tokens): the mono
// font stack, the value formatter, the context-line composer and the top-50
// row list. Colors arrive as a small palette object so each surface stays
// token-driven — numeric ranks ONLY (no medals, web Round-20 rule), and the
// city/district/school/grade context renders exactly what the RPC returned
// (server-formatted "Firstname L." names are never re-derived locally).
import React from "react";
import { Platform, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { radius, spacing } from "@/theme/tokens";
import { formatGradeLabel } from "@/lib/gradeLabel";
import type { Locale } from "@/i18n";
import type { Board, LbRow } from "./data";

export const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type T = (key: string) => string;

/** Row/value palette — arena colors on the student board, theme tokens on the
 *  parent board. */
export type BoardListColors = {
  /** Primary text (names, values). */
  ink: string;
  /** Secondary text (ranks outside the top 3). */
  muted: string;
  /** Faint context line under the name. */
  dim: string;
  /** Row separators. */
  line: string;
  /** Self-row background tint. */
  selfBg: string;
  /** Highlight: top-3 rank, the self value and the "you" tag. */
  highlight: string;
};

/** Board value text: points = rounded number, streak = "N days". */
export function lbFormatValue(board: Board, value: number, t: T): string {
  return board === "points" ? String(Math.round(Number(value))) : `${Number(value)} ${t("lb.days")}`;
}

/** Context under the participant name, exactly what the web table shows
 *  (points: city/district/school/grade; streak: district only — its sole
 *  context column since migration 058). */
export function lbRowContext(r: LbRow, board: Board, locale: Locale): string {
  return (
    board === "points"
      ? [
          r.city?.trim() || null,
          r.district?.trim() || null,
          r.school?.trim() || null,
          r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
        ]
      : [r.district?.trim() || null]
  )
    .filter((p): p is string => !!p)
    .join(" · ");
}

/** The top-50 rows (rank / avatar / name+context / value) — the caller wraps
 *  them in its own panel (ArenaPanel or Card). */
export function BoardRowList({
  rows,
  board,
  colors,
  t,
  locale,
  selfSeed,
}: {
  rows: LbRow[];
  board: Board;
  colors: BoardListColors;
  t: T;
  locale: Locale;
  /** Stable avatar seed for the viewer's own row (student board only). */
  selfSeed?: string | null;
}) {
  return (
    <>
      {rows.map((r, i) => {
        const ctx = lbRowContext(r, board, locale);
        const name = (r.display_name ?? "").trim() || "—";
        return (
          <View
            key={`${r.rank}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.sm,
              backgroundColor: r.is_self ? colors.selfBg : "transparent",
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.line,
            }}
          >
            <View style={{ width: 34, alignItems: "center" }}>
              <AppText
                color={r.rank <= 3 ? colors.highlight : colors.muted}
                style={{
                  fontFamily: MONO,
                  fontVariant: ["tabular-nums"],
                  fontWeight: r.rank <= 3 ? "900" : "400",
                }}
              >
                {String(r.rank)}
              </AppText>
            </View>
            <Avatar name={name} seed={r.is_self && selfSeed ? selfSeed : name} size={34} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label" color={colors.ink} numberOfLines={1}>
                {name}
                {r.is_self ? (
                  <AppText variant="label" color={colors.highlight}>
                    {" "}
                    · {t("lb.you")}
                  </AppText>
                ) : null}
              </AppText>
              {ctx ? (
                <AppText color={colors.dim} style={{ fontSize: 11 }} numberOfLines={1}>
                  {ctx}
                </AppText>
              ) : null}
            </View>
            <AppText
              color={r.is_self ? colors.highlight : colors.ink}
              style={{ fontFamily: MONO, fontVariant: ["tabular-nums"], fontWeight: "700" }}
            >
              {lbFormatValue(board, r.value, t)}
            </AppText>
          </View>
        );
      })}
    </>
  );
}
