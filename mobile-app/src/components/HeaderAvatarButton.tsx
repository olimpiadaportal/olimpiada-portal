// Round header button that opens the AccountSheet (web .pnav-right avatar
// trigger parity). M1 shows initials only; the real avatar arrives with the
// profile screens.
import React, { useState } from "react";
import { Pressable } from "react-native";
import { AppText } from "./AppText";
import { AccountSheet } from "./AccountSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";

export function HeaderAvatarButton() {
  const { tokens } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("drawer.profileBtn")}
        onPress={() => setOpen(true)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: tokens.chipBg,
          borderWidth: 1,
          borderColor: tokens.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <AppText variant="label" color={tokens.accent}>
          •
        </AppText>
      </Pressable>
      <AccountSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
