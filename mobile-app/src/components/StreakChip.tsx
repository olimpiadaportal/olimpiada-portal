// Header streak chip (web .arena-streak parity): 🔥 count + "day streak" label
// in gold mono on a panel pill, fed by the leaderboard engine's
// get_streak_status RPC (real consecutive-day streak, lazy-zeroed — never
// fabricated). When the streak is AT RISK (no round yet today) the chip turns
// red and the accessibility label carries the warning; the arena home shows
// the full at-risk note. Renders nothing until the first load (no 0-flash).
import React from "react";
import { Platform, View } from "react-native";
import { AppText } from "./AppText";
import { useArena } from "@/features/arena/useArena";
import { useStreakStatus } from "@/features/arena/queries";
import { useT } from "@/i18n/useT";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function StreakChip() {
  const { arena } = useArena();
  const { t } = useT();
  const streak = useStreakStatus();

  if (!streak.data) return null;
  const { current, state } = streak.data;
  const atRisk = state === "at_risk" && current > 0;
  const color = atRisk ? arena.red : arena.gold;
  const label = `${current} ${t("arena.streak")}`;

  return (
    <View
      accessible
      accessibilityLabel={atRisk ? `${label}. ${t("mob.arena.streakAtRisk")}` : label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: arena.panel2,
        borderWidth: 1,
        borderColor: atRisk ? color : arena.line,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
        marginRight: 6,
      }}
    >
      <AppText style={{ fontSize: 11 }}>{"\u{1F525}"}</AppText>
      <AppText
        color={color}
        numberOfLines={1}
        style={{ fontFamily: MONO, fontSize: 11, fontWeight: "700" }}
      >
        {label}
      </AppText>
    </View>
  );
}
