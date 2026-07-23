// Contact map card (web ContactInfo .map-frame parity): renders the SAME
// keyless https://www.google.com/maps?q=…&output=embed URL the web iframe
// loads, so the site and the app always show the identical pin. The admin
// configures the query as free text and Settings only length-caps it, so the
// value is treated as untrusted — it is percent-encoded into a fixed https
// origin and can never contribute a scheme, host or path. The frame is
// deliberately non-interactive: the screen body is a ScrollView and a pannable
// map would swallow its vertical gesture, so the whole card is one tap target
// that hands off to the device's maps app.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";
import { MapPin, Navigation } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

// ---- pure url helpers ------------------------------------------------------

/** Web parity: web-app/src/components/ContactInfo.tsx MAPS_FALLBACK_QUERY. */
export const MAPS_FALLBACK_QUERY = "Government House of Baku, Baku, Azerbaijan";

/** Mirrors the server-side cap on the setting (admin settings SHORT_STRING_MAX). */
const MAPS_QUERY_MAX = 300;

/** Strip control characters (deeplink.ts posture), collapse blanks, cap length. */
function sanitizeMapQuery(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  // Slice by CODE POINTS: a cap that lands mid-surrogate would make
  // encodeURIComponent throw on the resulting lone surrogate.
  return Array.from(clean).slice(0, MAPS_QUERY_MAX).join("");
}

/**
 * mapQuery → address → hardcoded fallback, exactly like web: the map always
 * has something to show, because a contact page without a map looks broken.
 */
export function resolveMapQuery(mapQuery: string, address: string): string {
  return sanitizeMapQuery(mapQuery) || sanitizeMapQuery(address) || MAPS_FALLBACK_QUERY;
}

/** The keyless embed the web iframe uses — byte-identical URL shape. */
export function buildMapEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

/**
 * iOS: the Google embed REFUSES to be a WKWebView's top-level document
 * ("Google Maps enabled API must be used in iframe" — Android tolerated it).
 * Rendering it through a local <iframe> wrapper satisfies that on both
 * platforms and keeps the web-parity URL. encodeURIComponent output contains
 * no quotes, so the src interpolation cannot break out of the attribute.
 */
export function buildMapWrapperHtml(query: string): string {
  const src = buildMapEmbedUrl(query);
  return (
    '<!doctype html><html><head>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}' +
    'iframe{border:0;width:100%;height:100%}</style></head>' +
    `<body><iframe src="${src}" allowfullscreen loading="eager" ` +
    'referrerpolicy="no-referrer-when-downgrade"></iframe></body></html>'
  );
}

/** Documented Maps URL scheme: opens turn-by-turn directions to the address. */
export function buildDirectionsUrl(query: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

// ---- webview lockdown ------------------------------------------------------

/**
 * The only destinations the frame may navigate to. Prefixes end at a path
 * separator so a lookalike host ("www.google.com.evil.test") can never match.
 */
const MAPS_URL_PREFIXES = ["https://www.google.com/maps", "https://maps.google.com/"];

function isAllowedMapUrl(url: string): boolean {
  // WKWebView starts some loads from a blank document; that is not a navigation
  // away from the embed.
  if (url === "about:blank") return true;
  return MAPS_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** A frame that never calls back (no system WebView, captive portal) must not sit blank forever. */
const MAP_LOAD_TIMEOUT_MS = 12000;

type MapStatus = "loading" | "ready" | "failed";

const CENTERED = { alignItems: "center", justifyContent: "center" } as const;

export function ContactMap({
  query,
  onOpenDirections,
}: {
  /** Already resolved through resolveMapQuery by the screen. */
  query: string;
  onOpenDirections: () => void;
}) {
  const { t } = useT();
  const { tokens } = useTheme();
  const [status, setStatus] = useState<MapStatus>("loading");

  const embedUrl = buildMapEmbedUrl(query);

  // A new target (the admin edited the address and the config poll picked it
  // up) re-arms the frame, and the timeout covers a WebView that never calls
  // back at all — a blank rectangle is not an acceptable resting state.
  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(
      () => setStatus((current) => (current === "loading" ? "failed" : current)),
      MAP_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [embedUrl]);

  const onShouldStartLoadWithRequest: NonNullable<
    WebViewProps["onShouldStartLoadWithRequest"]
  > = (request) => {
    // Sub-frame loads are the embed's own chrome; only a top-level navigation
    // can take the frame somewhere else, so that is what is gated.
    if (!request.isTopFrame || isAllowedMapUrl(request.url)) return true;
    setStatus("failed");
    return false;
  };

  const onError: NonNullable<WebViewProps["onError"]> = (event) => {
    // iOS reports a superseded navigation (a client-side redirect, or our own
    // policy refusal above) as NSURLErrorCancelled — the frame is not broken.
    if (event.nativeEvent.code === -999) return;
    setStatus("failed");
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {/* The frame itself is the tap target: every child is pointerEvents=none,
          so the map can never swallow a touch or the parent ScrollView's pan. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("mob.contact.mapLabel")}
        accessibilityHint={t("mob.contact.directions")}
        onPress={onOpenDirections}
        android_ripple={{ color: tokens.chipBg, foreground: true }}
        style={({ pressed }) => ({
          aspectRatio: 4 / 3,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tokens.border,
          // The Google embed is always light; the bordered, tinted frame keeps
          // it reading as a deliberate inset in the dark theme.
          backgroundColor: tokens.chipBg,
          overflow: "hidden",
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          <WebView
            source={{ html: buildMapWrapperHtml(query), baseUrl: "about:blank" }}
            // react-native-webview hands any url that fails `originWhitelist`
            // to Linking.openURL — an external open we never want — so the
            // whitelist stays wide and onShouldStartLoadWithRequest is the real
            // gate: it CANCELS instead of leaking the url to the OS.
            originWhitelist={["*"]}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            allowsLinkPreview={false}
            mixedContentMode="never"
            scrollEnabled={false}
            nestedScrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustContentInsets={false}
            androidLayerType="hardware"
            // The library's built-in error page is untranslated English; the
            // themed overlay below is the only failure UI the user may see.
            renderError={() => <View style={{ flex: 1, backgroundColor: tokens.chipBg }} />}
            onLoad={() => setStatus("ready")}
            onError={onError}
            onHttpError={() => setStatus("failed")}
            onRenderProcessGone={() => setStatus("failed")}
            onContentProcessDidTerminate={() => setStatus("failed")}
            style={{ flex: 1, backgroundColor: "transparent" }}
          />
        </View>

        {status === "loading" ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, CENTERED]}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : null}

        {status === "failed" ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              CENTERED,
              { backgroundColor: tokens.surface, padding: spacing.lg, gap: spacing.sm },
            ]}
          >
            <MapPin size={26} color={tokens.muted} strokeWidth={2} />
            <AppText variant="muted" style={{ textAlign: "center" }}>
              {t("mob.contact.mapUnavailable")}
            </AppText>
          </View>
        ) : null}
      </Pressable>

      <Button
        title={t("mob.contact.directions")}
        onPress={onOpenDirections}
        variant="ghost"
        icon={<Navigation size={18} color={tokens.accent} strokeWidth={2} />}
      />
    </View>
  );
}
