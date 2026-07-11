// Theme state: light / dark / system, persisted, resolved against the OS
// scheme. Mirrors the web behavior (dark is the owner's reference design; the
// child arena additionally applies a palette on top — see arenaTokens()).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { APP_DARK, APP_LIGHT, type AppTokens, type ThemeName } from "./tokens";

export type ThemePreference = ThemeName | "system";

type ThemeContextValue = {
  preference: ThemePreference;
  theme: ThemeName;
  tokens: AppTokens;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORE_KEY = "olympiq.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => {
        if (alive && (v === "light" || v === "dark" || v === "system")) {
          setPreferenceState(v);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    SecureStore.setItemAsync(STORE_KEY, p).catch(() => {});
  }, []);

  const theme: ThemeName =
    preference === "system" ? (system === "light" ? "light" : "dark") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      tokens: theme === "dark" ? APP_DARK : APP_LIGHT,
      setPreference,
    }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
