// Public runtime config. EXPO_PUBLIC_* values are compiled into the JS bundle —
// ONLY the Supabase URL, the anon key and the BFF origin may ever live here.
// The service-role key never exists in this app in any form.
import Constants from "expo-constants";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const BFF_IS_LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i;

/**
 * True only for a PRIVATE-LAN IPv4 host. Metro binds one of these when it
 * serves over the LAN, whereas an `expo start --tunnel` host is always a public
 * domain (…​.exp.direct) and a deployed BFF is a real hostname. This is the one
 * case where the localhost→host rewrite is meaningful — swapping the phone's
 * own loopback for the dev machine ON THE SAME NETWORK. Rewriting to a tunnel
 * or public host would be actively wrong: the Expo tunnel forwards ONLY the
 * Metro bundler port, so `http://<tunnel-host>:3000` is unreachable and every
 * BFF call (student login and every write) dies as an opaque transport error.
 */
export function isPrivateLanIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // 169.254.0.0/16 link-local (phone hotspots)
  );
}

/**
 * Dev-only: on a physical device (Expo Go), "localhost" is the PHONE, not the
 * dev machine — every BFF call would die on the network layer while parent
 * login (direct Supabase) still works. When Metro serves over the LAN, the
 * bundle's host (Constants hostUri) IS the dev machine, so substitute it and
 * keep the configured port. Under `--tunnel` (or any remote host) the rewrite
 * is skipped: the BFF cannot be reached that way, so the configured URL is
 * returned as-is and the developer is expected to point EXPO_PUBLIC_BFF_URL at
 * a PUBLIC origin (see remoteBffHint). Release builds never enter this branch:
 * __DEV__ is false and EAS profiles set a real https origin.
 * Pure (url, hostUri, isDev) → url so the rule is unit-testable.
 */
export function resolveDevBffHost(url: string, hostUri: string, isDev: boolean): string {
  if (!isDev || !BFF_IS_LOCAL_RE.test(url)) return url;
  const host = hostUri.split(":")[0]?.trim() ?? "";
  if (!isPrivateLanIpv4(host)) return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${host}`);
}

/**
 * Dev diagnostic string (or null) for the ONE misconfiguration the LAN rewrite
 * cannot paper over: Metro is serving over a tunnel/remote host while the BFF
 * still points at localhost. A tester on another network (the whole reason to
 * run `--tunnel`) then cannot reach the BFF at all — student login and every
 * write fail, exactly the way they did before the LAN fix. Pure so it is
 * unit-testable; the caller decides whether to warn.
 */
export function remoteBffHint(url: string, hostUri: string, isDev: boolean): string | null {
  if (!isDev) return null;
  const host = hostUri.split(":")[0]?.trim() ?? "";
  const metroIsRemote =
    host.length > 0 && host !== "localhost" && host !== "127.0.0.1" && !isPrivateLanIpv4(host);
  if (metroIsRemote && BFF_IS_LOCAL_RE.test(url)) {
    return (
      "[bff] Metro is serving over a tunnel/remote host but EXPO_PUBLIC_BFF_URL " +
      "points at localhost — a phone on another network cannot reach it, so " +
      "student login and every write will fail. Expose the web-app (port 3000) " +
      "publicly and set EXPO_PUBLIC_BFF_URL to that https origin (your Vercel " +
      "deployment, or `cloudflared tunnel --url http://localhost:3000`)."
    );
  }
  return null;
}

const rawBffUrl = (process.env.EXPO_PUBLIC_BFF_URL ?? "").replace(/\/+$/, "");
const metroHostUri =
  Constants.expoConfig?.hostUri ??
  (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ??
  "";

export const bffUrl = resolveDevBffHost(rawBffUrl, metroHostUri, __DEV__);

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * A usable BFF origin must be an ABSOLUTE http(s) URL: a scheme-less value
 * ("localhost:3000") or a leftover placeholder would pass a length check, skip
 * the LAN rewrite above and then fail at fetch time as an opaque transport
 * error — indistinguishable from a phone that is simply offline.
 */
export const isBffConfigured = /^https?:\/\/\S+$/i.test(bffUrl);

// Dev-only, and only when something is actually wrong: EXPO_PUBLIC_* values are
// compiled into the bundle, so a bad origin survives until Metro is restarted
// and otherwise surfaces much later as a generic "could not be saved".
if (__DEV__ && !isBffConfigured) {
  console.warn(
    "[bff] EXPO_PUBLIC_BFF_URL is missing or is not an absolute http(s) URL — every BFF call will fail fast.",
  );
} else if (__DEV__) {
  // The tunnel trap: a well-formed localhost URL that a remote --tunnel device
  // still cannot reach. Warn with the fix rather than let it look like a bug.
  const hint = remoteBffHint(rawBffUrl, metroHostUri, __DEV__);
  if (hint) console.warn(hint);
}
