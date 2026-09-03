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
import { ChildAvatar } from "@/components/ChildAvatar";
import type { ChildAvatarFields } from "@/lib/childAvatar";
import { radius, spacing } from "@/theme/tokens";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { formatPercent } from "@/lib/formatPercent";
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

/** Board value text: percent = two-decimal locale percentage (never rounded
 *  to an integer), streak = "N days". */
export function lbFormatValue(board: Board, value: number, t: T, locale: Locale): string {
  return board === "percent"
    ? formatPercent(value, locale)
    : `${Number(value)} ${t("lb.days")}`;
}

/** Context under the participant name, exactly what the web table shows
 *  (percent: city/district/school/grade; streak: district only — its sole
 *  context column since migration 058). */
export function lbRowContext(r: LbRow, board: Board, locale: Locale): string {
  return (
    board === "percent"
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
  selfAvatar,
}: {
  rows: LbRow[];
  board: Board;
  colors: BoardListColors;
  t: T;
  locale: Locale;
  /** Stable avatar seed for the viewer's own row (student board only). */
  selfSeed?: string | null;
  /**
   * The VIEWER'S OWN avatar fields, rendered only on the `is_self` row.
   *
   * Deliberately not a per-row field: the board's rows carry no avatar data
   * from the server and must not, so this is the one avatar the client already
   * legitimately holds. Omit it and every row falls back to initials, which is
   * the correct behaviour for any surface showing other people's children.
   */
  selfAvatar?: ChildAvatarFields | null;
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
            {/* Provisional rows arrive rank=null — "—" in the rank slot. */}
            <View style={{ width: 34, alignItems: "center" }}>
              <AppText
                color={r.rank !== null && r.rank <= 3 ? colors.highlight : colors.muted}
                style={{
                  fontFamily: MONO,
                  fontVariant: ["tabular-nums"],
                  fontWeight: r.rank !== null && r.rank <= 3 ? "900" : "400",
                }}
              >
                {r.rank !== null ? String(r.rank) : "—"}
              </AppText>
            </View>
            {/* THE VIEWER'S OWN ROW shows the viewer's own photo — this is what
                a student means by "my picture isn't in the ranking". It exposes
                nothing: they are already looking at their own avatar on their
                own Profile screen, and storage RLS signs it with their own
                session (can_access_child_avatar → the student themself).

                EVERY OTHER ROW STAYS ON INITIALS, and that is not a styling
                choice. Those rows are OTHER PEOPLE'S CHILDREN, listed beside
                real names, city, district, school and grade. get_leaderboard
                deliberately returns no avatar column and no ids at all ("Numeric
                ranks only; no ids leave the server"), photos live in a PRIVATE
                bucket a peer cannot read, and get_leaderboard applies no
                ownership check on scope — any signed-in user can pull any
                school's board. Rendering peer photos here would require
                weakening all three, and migration 096 exists because that
                exposure already happened once: "a photograph of a MINOR was
                world-readable at a stable URL and could never be withdrawn." */}
            {r.is_self && selfAvatar ? (
              <ChildAvatar
                row={selfAvatar}
                name={name}
                seed={selfSeed ?? name}
                size={34}
              />
            ) : (
              <Avatar name={name} seed={r.is_self && selfSeed ? selfSeed : name} size={34} />
            )}
            {/* flex: 1 (basis 0) — this column absorbs every deficit, so both
                texts below measure against a real width and ellipsize INSIDE
                the row instead of pushing the value cell off a 320pt screen. */}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="label" color={colors.ink} numberOfLines={2}>
                {name}
                {r.is_self ? (
                  <AppText variant="label" color={colors.highlight}>
                    {" "}
                    · {t("lb.you")}
                  </AppText>
                ) : null}
              </AppText>
              {ctx ? (
                // Deliberately still clamped (1 → 2 lines): this is a dense
                // 50-row ranking TABLE, and the column is only ~92pt at 320pt
                // (rank gutter + avatar + value are fixed art), so an unclamped
                // city·rayon·school·grade string would ragged-wrap to 4 lines ×
                // 50 rows and destroy the board's scannability. Two lines fit
                // city + rayon then school + grade for realistic az names, and
                // the full context is on the student's own profile card.
                <AppText
                  color={colors.dim}
                  style={{ fontSize: 11 }}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {ctx}
                </AppText>
              ) : null}
              {r.is_provisional ? (
                <View
                  style={{
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 999,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                  }}
                >
                  <AppText
                    color={colors.dim}
                    style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 }}
                  >
                    {t("lb.provisional")}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText
              color={r.is_self ? colors.highlight : colors.ink}
              style={{ fontFamily: MONO, fontVariant: ["tabular-nums"], fontWeight: "700" }}
            >
              {lbFormatValue(board, r.value, t, locale)}
            </AppText>
          </View>
        );
      })}
    </>
  );
}
