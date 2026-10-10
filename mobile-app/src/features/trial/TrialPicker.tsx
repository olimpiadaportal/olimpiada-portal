// The Add-Child wizard's free-access step (2026-10-10), identical in shape to
// the web wizard: "Choose 2 subjects and enjoy 24 hours of FREE access!" →
// pick exactly two of the subjects the child's grade studies → start. No card,
// no price, no store sheet and no external link on EITHER platform — the BFF
// grants a server-side window (POST /api/mobile/v1/children/[id]/trial), and
// every rule (once per child, two subjects, the per-email cap) lives in the
// database. "Skip for now" leaves without one.
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check, Gift } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { fetchActiveSubjects } from "@/lib/data";
import { bffStartTrial } from "@/lib/api";
import { sortSubjectsByLabel } from "@/lib/subjectLabel";
import { requiredTrialSubjects, trialErrorKey } from "@/lib/trialClock";

export type StartedTrial = {
  endsAt: string;
  serverNow: string | null;
  receivedAt: number;
  subjectNames: string[];
};

export function TrialPicker({
  childId,
  gradeId,
  onStarted,
  onSkip,
}: {
  childId: string;
  gradeId: string | null;
  onStarted: (trial: StartedTrial) => void;
  onSkip: () => void;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same grade rule as every subject list (subjects_taught_to_grade).
  const subjectsQ = useQuery({
    queryKey: ["trial-picker", "subjects", gradeId ?? "none"],
    queryFn: () => fetchActiveSubjects(gradeId ?? null),
    staleTime: 10 * 60_000,
  });
  const subjects = useMemo(
    () => sortSubjectsByLabel(t, locale, subjectsQ.data ?? []),
    [subjectsQ.data, t, locale],
  );
  const required = requiredTrialSubjects(subjects.length);
  const ready = required > 0 && selected.length === required;

  function toggle(id: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= required
          ? prev
          : [...prev, id],
    );
  }

  async function start() {
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await bffStartTrial(childId, selected, locale);
      if (!res.ok) {
        setError(t(trialErrorKey(res.error)));
        return;
      }
      onStarted({
        endsAt: res.data.ends_at,
        serverNow: res.data.server_now ?? null,
        receivedAt: Date.now(),
        subjectNames: subjects.filter((s) => selected.includes(s.id)).map((s) => s.label),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <Card variant="hero" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Gift size={22} color={tokens.accent} strokeWidth={2} />
          <AppText variant="heading" style={{ flex: 1, minWidth: 0 }}>
            {t("mob.trial.title")}
          </AppText>
        </View>
        <AppText variant="muted">{t("mob.trial.body")}</AppText>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="eyebrow">{t("mob.trial.pick")}</AppText>
        {subjectsQ.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </View>
        ) : subjects.length === 0 ? (
          <AppText variant="muted">{t("mob.trial.none")}</AppText>
        ) : (
          subjects.map((s) => {
            const on = selected.includes(s.id);
            const locked = !on && selected.length >= required;
            return (
              <Pressable
                key={s.id}
                onPress={() => toggle(s.id)}
                disabled={pending || locked}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: pending || locked }}
                accessibilityLabel={s.label}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  minHeight: 52,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.lg,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? tokens.accent : tokens.border,
                  backgroundColor: on ? tokens.pillBg : tokens.surface,
                  opacity: locked ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <AppText style={{ flex: 1, minWidth: 0, fontWeight: on ? "700" : "500" }}>
                  {s.label}
                </AppText>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: on ? tokens.accent : tokens.border,
                    backgroundColor: on ? tokens.accent : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {on ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })
        )}
        {required > 0 ? (
          <AppText variant="muted" accessibilityLiveRegion="polite">
            {t("mob.trial.count")
              .replace("{n}", String(selected.length))
              .replace("{total}", String(required))}
          </AppText>
        ) : null}
      </View>

      {error ? (
        <AppText variant="muted" color={tokens.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <Button
        title={t("mob.trial.start")}
        variant="gradient"
        pending={pending}
        disabled={!ready}
        onPress={() => void start()}
      />
      <Button title={t("mob.trial.skip")} variant="ghost" disabled={pending} onPress={onSkip} />
    </View>
  );
}
