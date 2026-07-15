// Header notification bell: live unread badge (Realtime-backed), tap opens the
// role's notifications screen. Hidden entirely when the notifications flag is
// off (web parity: gated surfaces disappear). Lucide glyph (redesign icon
// language).
import React from "react";
import { Pressable, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useRouter } from "expo-router";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { weight } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { useNotifications } from "@/features/notifications/useNotifications";

export function HeaderBell({ target }: { target: string }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const { unreadCount } = useNotifications(8);

  if (!config.data?.flags.notifications) return null;
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("notif.bell")}
      onPress={() => router.push(target as never)}
      hitSlop={8}
      style={({ pressed }) => ({ marginRight: 4, padding: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <Bell size={22} color={tokens.text} strokeWidth={2} />
      {unreadCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: -2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: tokens.danger,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <AppText color="#ffffff" style={{ fontSize: 10, fontWeight: weight.bold }}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
