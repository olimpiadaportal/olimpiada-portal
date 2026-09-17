// Header notification bell: live unread badge (Realtime-backed), tap opens the
// role's notifications screen. Hidden entirely when the notifications flag is
// off (web parity: gated surfaces disappear). Lucide glyph (redesign icon
// language).
//
// The glyph sits centred in the box every header button shares
// (components/iconButtonLayout.ts) instead of in the symmetric padding it
// used to carry. Same 34pt result, but now it is the SAME 34pt as the back
// chevron, the home glyph and the avatar trigger — which is what makes the
// container iOS 26 draws behind each of them come out identical.
import React from "react";
import { Pressable, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useRouter } from "expo-router";
import { AppText } from "./AppText";
import {
  HEADER_BUTTON_HIT_SLOP,
  HEADER_GLYPH_SIZE,
  headerButtonBox,
} from "./iconButtonLayout";
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
      // 34pt box + 8pt slop = 50pt of touch, past iOS 44pt and Material 48dp.
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [
        headerButtonBox,
        // 16, not 4. The avatar sitting to the right claims 8pt of hitSlop, so
        // a 4pt gap put its touch region 4pt inside this button's VISIBLE box -
        // and as the later sibling it wins the overlap, so the right edge of a
        // bell you can see opened the account sheet. Two adjacent targets need a
        // gap of at least the slop they each claim (8 + 8); widening the gap is
        // the fix that takes reach away from neither.
        { marginRight: 16, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {/* The badge hangs off the GLYPH, not off the button box, so this
          content-sized view is what it is positioned against. Anchored to the
          box instead, the badge would drift as far as the centring inset the
          moment either size changed. */}
      <View>
        <Bell size={HEADER_GLYPH_SIZE} color={tokens.text} strokeWidth={2} />
        {unreadCount > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -6,
              right: -8,
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
      </View>
    </Pressable>
  );
}
