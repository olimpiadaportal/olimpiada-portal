// Parent analytics dashboard body (mobile port of the web AnalyticsDashboard).
// Round 51 audit: full web parity — an analytics-type switch (Fənlər |
// Olimpiadalar → the RPC p_scope) plus per-subject chips in subjects mode.
// Renders the six KPI tiles (skipped is its OWN tile — Round-18: wrong is
// never recomputed as questions-correct), best/weak/last facts, the two
// charts, per-topic strength bars and the mistakes list; the olympiads scope
// reuses the same layout, relabels the attempts KPI and appends the
// per-package results (the web hides only the subject tabs there — packages
// aren't subject-gated). Pure presentational: the screen owns the queries.
// PURCHASE-SILENT: unlike the web, locked subjects never render here — no
// subscribe hints/CTAs exist anywhere in the store binary (compliance doc).
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { formatPercent } from "@/lib/formatPercent";
import { WeeklyBars, TrendLine } from "./charts";
import {
  computeTopicStanding,
  topicStandingHint,
  dayKey,
  fmtDate,
  fmtDayMonth,
  lbHasActivity,
  num,
  type AnalyticsMode,
  type DashPayload,
  type LbSummary,
} from "./helpers";

type T = (key: string) => string;

/* ------------------------------ child chips ------------------------------ */

export function ChildChips({
  childrenList,
  selectedId,
  onSelect,
  label,
}: {
  childrenList: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const { tokens } = useTheme();
  if (childrenList.length <= 1) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="eyebrow">{label}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {childrenList.map((c) => {
            const active = c.id === selectedId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.name}
                onPress={() => onSelect(c.id)}
                android_ripple={{ color: tokens.pillBg }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.xs + 2,
                  paddingLeft: spacing.xs + 2,
                  paddingRight: spacing.lg,
                  minHeight: 44,
                  borderRadius: 999,
                  backgroundColor: active ? tokens.accent : tokens.chipBg,
                  borderWidth: 1,
                  borderColor: active ? tokens.accent : tokens.border,
                  opacity: pressed ? 0.85 : 1,
                  overflow: "hidden",
                })}
              >
                <Avatar name={c.name} seed={c.id} size={30} />
                <AppText variant="label" color={active ? "#ffffff" : tokens.chipText}>
                  {c.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------ subject chips ------------------------------ */

/**
 * Subjects-mode filter (web subject tabs, purchase-silent variant): only the
 * child's UNLOCKED subjects render — never locked tabs or subscribe hints.
 * `allId` ("all") appears only when the child has more than one subject.
 */
export function SubjectChips({
  subjects,
  selectedId,
  onSelect,
  label,
  allLabel,
}: {
  subjects: { id: string; label: string }[];
  /** "all" | subject uuid (already clamped by the screen). */
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
  /** Rendered as the leading chip only when subjects.length > 1. */
  allLabel: string;
}) {
  const { tokens } = useTheme();
  if (subjects.length === 0) return null;
  const chips: { id: string; label: string }[] = [
    ...(subjects.length > 1 ? [{ id: "all", label: allLabel }] : []),
    ...subjects,
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="eyebrow">{label}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {chips.map((c) => {
            const active = c.id === selectedId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.label}
                onPress={() => onSelect(c.id)}
                android_ripple={{ color: tokens.pillBg }}
                style={({ pressed }) => ({
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  minHeight: 40,
                  justifyContent: "center",
                  borderRadius: 999,
                  backgroundColor: active ? tokens.accent : tokens.chipBg,
                  borderWidth: 1,
                  borderColor: active ? tokens.accent : tokens.border,
                  opacity: pressed ? 0.85 : 1,
                  overflow: "hidden",
                })}
              >
                <AppText variant="label" color={active ? "#ffffff" : tokens.chipText}>
                  {c.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------ chart legend ------------------------------- */

function Legend({ items }: { items: { color: string; label: string }[] }) {
  const { tokens } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: it.color }} />
          <AppText variant="muted" style={{ fontSize: 12 }} color={tokens.muted}>
            {it.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------- KPI grid -------------------------------- */

function KpiGrid({ kpis }: { kpis: { label: string; value: string }[] }) {
  const { tokens } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {kpis.map((k) => (
        <View
          key={k.label}
          style={{
            flexBasis: "31%",
            flexGrow: 1,
            backgroundColor: tokens.surface,
            borderWidth: 1,
            borderColor: tokens.border,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.sm,
            alignItems: "center",
            gap: 2,
          }}
        >
          <AppText variant="mono" style={{ fontSize: 18, fontWeight: "700" }}>
            {k.value}
          </AppText>
          <AppText variant="muted" style={{ fontSize: 11, textAlign: "center" }}>
            {k.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------- facts row -------------------------------- */

function FactRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  /** Round 47: why this card has no value yet (never a bare dash). */
  hint?: string | null;
}) {
  const { tokens } = useTheme();
  const dot = tone === "ok" ? tokens.ok : tone === "warn" ? tokens.warn : tokens.muted;
  return (
    // alignItems flex-start, not center: with a hint the text column is taller
    // than the dot and centring would float the dot into the middle of it.
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
      <View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot, marginTop: 6 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" numberOfLines={1}>
          {value}
        </AppText>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="muted" style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            {hint}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/* ---------------------------- topic strength ------------------------------ */

function TopicBar({
  topic,
  answered,
  accuracy,
}: {
  topic: string;
  answered: number;
  accuracy: number;
}) {
  const { tokens } = useTheme();
  const pct = Math.min(100, Math.max(0, accuracy));
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
          {topic}
        </AppText>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {String(answered)}
        </AppText>
        <AppText variant="mono" style={{ fontSize: 13, fontWeight: "700", minWidth: 44, textAlign: "right" }}>
          {`${Math.round(pct)}%`}
        </AppText>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: tokens.chipBg,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: 8,
            borderRadius: 4,
            backgroundColor: tokens.accent,
          }}
        />
      </View>
    </View>
  );
}

/* ---------------------------- package results ----------------------------- */

/** Olympiads scope only: one purchased package's attempts/answers/accuracy
 * (the web per-package TABLE re-flowed as stacked rows — 320pt-safe). */
function PackageRow({
  title,
  meta,
  accuracy,
}: {
  title: string;
  meta: string;
  accuracy: number;
}) {
  const { tokens } = useTheme();
  const pct = Math.min(100, Math.max(0, accuracy));
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>
          {title}
        </AppText>
        <AppText
          variant="mono"
          style={{ fontSize: 13, fontWeight: "700", minWidth: 44, textAlign: "right" }}
        >
          {`${Math.round(pct)}%`}
        </AppText>
      </View>
      <AppText variant="muted" style={{ fontSize: 11 }}>
        {meta}
      </AppText>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: tokens.chipBg,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: 8,
            borderRadius: 4,
            backgroundColor: tokens.accent,
          }}
        />
      </View>
    </View>
  );
}

/* ------------------------------ dashboard body ---------------------------- */

export function DashboardBody({
  data,
  t,
  mode = "subjects",
}: {
  data: DashPayload;
  t: T;
  /** Drives the olympiad relabels + per-package section (web StatsBody mode). */
  mode?: AnalyticsMode;
}) {
  const { tokens } = useTheme();
  const totals = data.totals ?? {};

  const weekly = (data.weekly_activity ?? []).map((w) => ({
    date: String(w?.date ?? ""),
    attempts: num(w?.attempts),
  }));
  const weeklyCount = weekly.reduce((a, b) => a + b.attempts, 0);
  const dayLabels = weekly.map((w) => t(`ana.day.${dayKey(w.date)}`));

  const trendPts = (data.accuracy_trend ?? [])
    .filter((p) => p && p.accuracy != null)
    .map((p) => ({ label: fmtDayMonth(String(p.date)), value: num(p.accuracy) }));

  // per_topic rows are already answered-based server-side; a defensive null
  // accuracy still renders as 0% (num() → 0), never blank.
  const topics = (data.per_topic ?? []).map((r) => ({
    id: String(r?.topic_id ?? r?.topic ?? ""),
    topic: String(r?.topic ?? "—"),
    answered: num(r?.answered),
    accuracy: num(r?.accuracy),
  }));
  const mistakes = (data.mistakes ?? []).map((r) => ({
    topic: String(r?.topic ?? "—"),
    subtopic: String(r?.subtopic ?? "—"),
    wrong: num(r?.wrong),
  }));

  // Olympiads scope only: per-package rows (title = package translation).
  const packages =
    mode === "olympiads"
      ? (data.per_package ?? []).map((p) => ({
          id: String(p?.package_id ?? p?.title ?? ""),
          title: String(p?.title ?? "—"),
          attempts: num(p?.attempts),
          correct: num(p?.correct),
          wrong: num(p?.wrong),
          skipped: num(p?.skipped),
          accuracy: num(p?.accuracy),
        }))
      : [];

  // Round 47: ranking is COMPARATIVE — the helper returns a pair only when at
  // least two topics have a real sample AND their accuracies differ; otherwise
  // it reports which condition is missing so the card explains itself.
  const standing = computeTopicStanding(topics);
  const best = standing.kind === "ready" ? standing.best : null;
  const weak = standing.kind === "ready" ? standing.weak : null;
  const standingHint = topicStandingHint(standing, t);

  const totalMin = Math.max(0, Math.round(num(data.time_spent_minutes)));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const timeLabel =
    hours > 0 ? `${hours} ${t("ana.unit.h")} ${mins} ${t("ana.unit.m")}` : `${mins} ${t("ana.unit.m")}`;

  const kpis = [
    { label: t("ana.kpi.last7"), value: String(weeklyCount) },
    {
      // Olympiad mode relabels the completed-tests tile (web StatsBody parity).
      label: mode === "olympiads" ? t("ana.olymp.kpi.attempts") : t("ana.kpi.tests"),
      value: String(num(totals.attempts)),
    },
    { label: t("ana.kpi.correct"), value: String(num(totals.correct)) },
    { label: t("ana.kpi.wrong"), value: String(num(totals.wrong)) },
    { label: t("ana.kpi.skipped"), value: String(num(totals.skipped)) },
    { label: t("ana.kpi.time"), value: timeLabel },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("ana.rangeNote")}
      </AppText>

      <KpiGrid kpis={kpis} />

      <Card style={{ gap: spacing.md }}>
        <FactRow
          tone="ok"
          label={
            best ? `${t("ana.kpi.best")} · ${Math.round(best.accuracy)}%` : t("ana.kpi.best")
          }
          value={best ? best.topic : "—"}
          hint={standingHint}
        />
        <FactRow
          tone="warn"
          label={
            weak ? `${t("ana.kpi.weak")} · ${Math.round(weak.accuracy)}%` : t("ana.kpi.weak")
          }
          value={weak ? weak.topic : "—"}
          hint={standingHint}
        />
        <FactRow
          label={t("ana.kpi.last")}
          value={data.last_activity ? fmtDate(String(data.last_activity)) : "—"}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SectionHeader title={t("ana.chart.weekly")} />
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("ana.chart.weeklySub")}
        </AppText>
        <WeeklyBars
          values={weekly.map((w) => w.attempts)}
          days={dayLabels}
          ariaLabel={t("ana.chart.weekly")}
        />
        <Legend items={[{ color: tokens.accent, label: t("ana.th.attempts") }]} />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SectionHeader title={t("ana.chart.trend")} />
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("ana.chart.trendSub30")}
        </AppText>
        {trendPts.length === 0 ? (
          <AppText variant="muted">{t("ana.empty.trend")}</AppText>
        ) : (
          <>
            <TrendLine points={trendPts} ariaLabel={t("ana.chart.trend")} />
            <Legend items={[{ color: tokens.accent2, label: t("ana.th.accuracy") }]} />
          </>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionHeader title={t("ana.chart.topics")} />
        {topics.map((row) => (
          <TopicBar key={row.id} topic={row.topic} answered={row.answered} accuracy={row.accuracy} />
        ))}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <SectionHeader title={t("ana.chart.mistakes")} />
        {mistakes.length === 0 ? (
          <AppText variant="muted">{t("ana.empty.mistakes")}</AppText>
        ) : (
          mistakes.map((row, i) => (
            <View
              key={`${row.topic}|${row.subtopic}|${i}`}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="label" numberOfLines={1}>
                  {row.topic}
                </AppText>
                <AppText variant="muted" style={{ fontSize: 12 }} numberOfLines={1}>
                  {row.subtopic}
                </AppText>
              </View>
              <View
                style={{
                  minWidth: 30,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 3,
                  borderRadius: radius.sm,
                  backgroundColor: tokens.chipBg,
                  alignItems: "center",
                }}
              >
                <AppText variant="mono" color={tokens.danger} style={{ fontSize: 13, fontWeight: "700" }}>
                  {String(row.wrong)}
                </AppText>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Olympiads only: per-package results (web ana-table → stacked rows). */}
      {mode === "olympiads" && packages.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title={t("ana.olymp.perPackage")} />
          <AppText variant="muted" style={{ fontSize: 12 }}>
            {t("ana.olymp.perPackageSub")}
          </AppText>
          {packages.map((p) => (
            <PackageRow
              key={p.id}
              title={p.title}
              meta={[
                `${t("ana.th.attempts")}: ${p.attempts}`,
                `${t("ana.kpi.correct")}: ${p.correct}`,
                `${t("ana.kpi.wrong")}: ${p.wrong}`,
                `${t("ana.kpi.skipped")}: ${p.skipped}`,
              ].join(" · ")}
              accuracy={p.accuracy}
            />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/* ---------------------------- leaderboard panel ---------------------------- */

export function LeaderboardPanel({
  summary,
  t,
  locale,
  onViewFull,
}: {
  summary: LbSummary | null;
  t: T;
  locale: string;
  /** Opens the full parent leaderboard browser (SectionHeader action). */
  onViewFull?: () => void;
}) {
  // rank_* arrive null while provisional — the tile says why, never "#—".
  const provMonth = summary?.provisional_month === true;
  const provAll = summary?.provisional_all_time === true;
  const tiles = lbHasActivity(summary)
    ? [
        {
          label: provMonth
            ? `${t("plb.rankThisMonth")} · ${t("lb.provisional")}`
            : t("plb.rankThisMonth"),
          value: summary!.rank_month != null ? `#${summary!.rank_month}` : "—",
        },
        {
          label: provAll
            ? `${t("plb.rankAllTime")} · ${t("lb.provisional")}`
            : t("plb.rankAllTime"),
          value: summary!.rank_all_time != null ? `#${summary!.rank_all_time}` : "—",
        },
        { label: t("plb.pctMonth"), value: formatPercent(num(summary!.pct_month), locale) },
        { label: t("plb.pctAllTime"), value: formatPercent(num(summary!.pct_all_time), locale) },
        { label: t("plb.currentStreak"), value: `\u{1F525} ${num(summary!.current_streak)}` },
        { label: t("plb.bestStreak"), value: `\u{1F525} ${num(summary!.best_streak)}` },
      ]
    : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        title={t("plb.improvementTitle")}
        action={
          onViewFull ? { label: t("mob.plb.viewFull"), onPress: onViewFull } : undefined
        }
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("plb.improvementSub")}
      </AppText>
      {tiles ? (
        <>
          <KpiGrid kpis={tiles} />
          {provMonth || provAll ? (
            <AppText variant="muted" style={{ fontSize: 12 }}>
              {t("lb.provisionalHint").replace("{n}", String(num(summary!.min_attempts)))}
            </AppText>
          ) : null}
        </>
      ) : (
        <Card style={{ alignItems: "center", gap: spacing.xs }}>
          <AppText variant="label" style={{ textAlign: "center" }}>
            {t("plb.emptyTitle")}
          </AppText>
          <AppText variant="muted" style={{ textAlign: "center" }}>
            {t("plb.emptySub")}
          </AppText>
        </Card>
      )}
    </View>
  );
}
