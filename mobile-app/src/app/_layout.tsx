import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { RootGate } from "@/features/boot/RootGate";

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedStatusBar />
          <RootGate />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
