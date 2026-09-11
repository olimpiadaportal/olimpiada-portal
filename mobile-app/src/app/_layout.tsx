import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { installAppStateFocus } from "@/lib/queryFocus";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { ToastHost } from "@/components/Toast";
import { RootGate } from "@/features/boot/RootGate";
import { initSentry } from "@/lib/sentry";

// MODULE SCOPE, not an effect. Under `expo-router/entry` this file is the
// earliest application code that runs, and an error thrown during the first
// render — the boot gate, the theme provider, a bad cached session — happens
// before any effect fires. Initialising here is what makes those reportable.
// It is a no-op in dev and whenever EXPO_PUBLIC_SENTRY_DSN is unset; see
// `src/lib/sentry.ts` for what is and is not sent, and why.
initSentry();

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
