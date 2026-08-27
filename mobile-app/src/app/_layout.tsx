import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { installAppStateFocus } from "@/lib/queryFocus";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { ToastHost } from "@/components/Toast";
import { RootGate } from "@/features/boot/RootGate";

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  // Drive React Query's focus manager from AppState. Installed ONCE here, at
  // the only component guaranteed to outlive every screen — a per-screen
  // listener would fire one refetch per mounted tab on every foreground.
  useEffect(() => installAppStateFocus(), []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedStatusBar />
          <RootGate />
          {/* Last sibling so it paints over every stack and tab screen. */}
          <ToastHost />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
