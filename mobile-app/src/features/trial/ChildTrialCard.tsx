// The child's free-access card, at the top of the arena home (2026-10-10).
// Web twin: web-app/src/components/ChildTrialCard.tsx.
//
// "Your free access · 23h 45m 12s remaining · Subjects: …", and once the window
// is over, "Your free access has ended" with a note to talk to a parent.
// CHILD-FACING: it never says buy, pay or subscribe — a child has no purchase
// surface on either platform. The wording avoids "trial" vocabulary for the
// store-copy rules (__tests__/store-copy.test.ts); the meaning is the same.
//
// The countdown runs on server time (useTrialCountdown) and lives ONLY here —
// never on a parent screen (owner, 2026-10-10).
import React from "react";
import { View } from "react-native";
import { Clock3 } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import { formatRemaining, type TrialState } from "@/lib/trialClock";
import { useArena } from "@/features/arena/useArena";
import { useTrialCountdown } from "./useTrialCountdown";

export function ChildTrialCard({
  trial,
  onExpired,
}: {
  trial: TrialState;
  /** Called once when the window closes on screen — refetch access. */
  onExpired?: () => void;
}) {
  const { t } = useT();
  const { arena } = useArena();
  const remaining = useTrialCountdown(
    trial.active ? trial.endsAt : null,
    trial.serverNow,
    trial.receivedAt,
    onExpired,
  );
  const running = trial.active && !remaining.done;
  const tint = running ? arena.lime : arena.red;
  const names = trial.subjects.map((s) => subjectLabel(t, s.code, s.name)).join(", ");

  return (
    <View
      accessibilityRole={running ? "timer" : "alert"}
      style={{
        backgroundColor: arena.panel,
        borderWidth: 1,
        borderColor: tint,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
        <Clock3 size={18} color={tint} strokeWidth={2.2} />
        <AppText color={arena.ink} style={{ fontWeight: "800", fontSize: 16, flexShrink: 1 }}>
          {running ? t("mob.trial.card.title") : t("mob.trial.card.ended")}
        </AppText>
        {running && trial.extended ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: tint,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 1,
            }}
          >
            <AppText color={tint} style={{ fontSize: 11, fontWeight: "700" }}>
              {t("mob.trial.card.extended")}
            </AppText>
          </View>
        ) : null}
      </View>

      {running ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" }}>
            <AppText
              variant="mono"
              color={arena.ink}
              style={{ fontSize: 24, fontWeight: "800" }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatRemaining(remaining, {
                h: t("trial.time.h"),
                m: t("trial.time.m"),
                s: t("trial.time.s"),
              })}
            </AppText>
            <AppText color={arena.muted}>{t("mob.trial.card.remaining")}</AppText>
          </View>
          {names ? (
            <AppText color={arena.muted}>{t("mob.trial.subjects").replace("{subjects}", names)}</AppText>
          ) : null}
        </>
      ) : (
        <AppText color={arena.muted}>{t("mob.trial.card.endedNote")}</AppText>
      )}
    </View>
  );
}
