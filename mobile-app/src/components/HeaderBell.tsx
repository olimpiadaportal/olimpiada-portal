// Header notification bell: live unread badge (Realtime-backed), tap opens the
// role's notifications screen. Hidden entirely when the notifications flag is
// off (web parity: gated surfaces disappear).
import React from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
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
      style={{ marginRight: 4, padding: 6 }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
          stroke={tokens.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
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
          <AppText color="#ffffff" style={{ fontSize: 10, fontWeight: "700" }}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
