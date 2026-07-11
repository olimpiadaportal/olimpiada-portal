import React from "react";
import { StagePlaceholder } from "@/components/StagePlaceholder";
import { arenaTokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

export default function StudentOlympiads() {
  const { theme } = useTheme();
  return <StagePlaceholder background={arenaTokens(theme, "default").bg} />;
}
