// Public runtime config. EXPO_PUBLIC_* values are compiled into the JS bundle —
// ONLY the Supabase URL, the anon key and the BFF origin may ever live here.
// The service-role key never exists in this app in any form.
import Constants from "expo-constants";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Dev-only: on a physical device (Expo Go), "localhost" is the PHONE, not the
 * dev machine — every BFF call would die on the network layer while parent
 * login (direct Supabase) still works. The bundle was loaded from the dev
 * machine's LAN address (Constants hostUri), so substitute that host and keep
 * the configured port. Release builds never enter this branch: __DEV__ is
 * false and EAS profiles set a real https origin.
 * Pure (url, hostUri, isDev) → url so the rule is unit-testable.
 */
export function resolveDevBffHost(url: string, hostUri: string, isDev: boolean): string {
  if (!isDev || !/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(url)) return url;
  const host = hostUri.split(":")[0]?.trim() ?? "";
  if (!host || host === "localhost" || host === "127.0.0.1") return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${host}`);
}

export const bffUrl = resolveDevBffHost(
  (process.env.EXPO_PUBLIC_BFF_URL ?? "").replace(/\/+$/, ""),
  Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ??
    "",
  __DEV__,
);

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
export const isBffConfigured = bffUrl.length > 0;
