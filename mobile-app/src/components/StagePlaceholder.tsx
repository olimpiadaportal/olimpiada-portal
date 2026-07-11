// Placeholder body for tabs whose real screens land in M2 (parent) / M3
// (student). The tab STRUCTURE ships now so navigation, gating and theming are
// final from day one.
import React from "react";
import { View } from "react-native";
import { Screen } from "./Screen";
import { EmptyState } from "./StatusViews";
import { useT } from "@/i18n/useT";

export function StagePlaceholder({ background }: { background?: string }) {
  const { t } = useT();
  return (
    <Screen background={background}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <EmptyState title={t("mob.placeholder.title")} body={t("mob.placeholder.body")} />
      </View>
    </Screen>
  );
}
