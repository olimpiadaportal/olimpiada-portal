// RN port of the web's XSS-safe minimal-markdown renderer for admin
// notification bodies (`**bold**`, `*italic*`, `[label](url)`). React Native
// has no innerHTML, so instead of escape-then-format we PARSE into typed
// segments and render <Text> nodes — nothing can ever become markup. The link
// whitelist is identical to the web (http(s) or root-relative; backslashes and
// protocol-relative //host rejected); disallowed links stay literal text.
import React from "react";
import { Linking } from "react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { isSafeRelativeUrl } from "./deeplink";

export type MarkdownSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Whitelisted link target (http(s) or root-relative web path). */
  url?: string;
};

function isAllowedLinkUrl(url: string): boolean {
  if (url.includes("\\")) return false;
  if (/^https?:\/\//i.test(url)) return true;
  if (url[0] === "/" && url[1] !== "/") return true;
  return false;
}

const CAP = 4000;
const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

/** Parse the minimal subset into flat segments (links win over bold/italic). */
export function parseNotificationMarkdown(text: string | null | undefined): MarkdownSegment[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const src = text.slice(0, CAP);
  const out: MarkdownSegment[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: src.slice(last, idx) });
    if (m[1] !== undefined && m[2] !== undefined) {
      if (isAllowedLinkUrl(m[2])) out.push({ text: m[1], url: m[2] });
      else out.push({ text: m[0] }); // disallowed link stays literal
    } else if (m[3] !== undefined) {
      out.push({ text: m[3], bold: true });
    } else if (m[4] !== undefined) {
      out.push({ text: m[4], italic: true });
    }
    last = idx + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

/**
 * Render parsed segments. Root-relative links go through `onOpenPath` (the
 * caller routes them via the deep-link allowlist); https links open externally.
 */
export function RichBody({
  text,
  onOpenPath,
}: {
  text: string | null | undefined;
  onOpenPath?: (path: string) => void;
}) {
  const { tokens } = useTheme();
  const segments = parseNotificationMarkdown(text);
  if (segments.length === 0) return null;
  return (
    <AppText>
      {segments.map((s, i) => {
        if (s.url) {
          const url = s.url;
          const external = /^https?:\/\//i.test(url);
          return (
            <AppText
              key={i}
              color={tokens.accent}
              style={{ textDecorationLine: "underline" }}
              onPress={() => {
                if (external) void Linking.openURL(url);
                else if (onOpenPath && isSafeRelativeUrl(url)) onOpenPath(url);
              }}
            >
              {s.text}
            </AppText>
          );
        }
        return (
          <AppText
            key={i}
            style={{
              fontWeight: s.bold ? "700" : undefined,
              fontStyle: s.italic ? "italic" : undefined,
            }}
          >
            {s.text}
          </AppText>
        );
      })}
    </AppText>
  );
}
