// RN port of the web's XSS-safe minimal-markdown renderer for admin
// notification bodies (`**bold**`, `*italic*`, `[label](url)`). React Native
// has no innerHTML, so instead of escape-then-format we PARSE into typed
// segments and render <Text> nodes — nothing can ever become markup. The PARSER
// whitelist is identical to the web (http(s) or root-relative; backslashes and
// protocol-relative //host rejected); disallowed links stay literal text.
//
// WHERE THIS DIVERGES FROM THE WEB: parsing and RENDERING are two decisions, and
// only the parser is shared. An external http(s) link is still parsed as a link
// (so the label reads correctly) but is rendered NON-TAPPABLE here — see the
// note on RichBody. The web twin keeps them live; a website is governed by
// neither app store.
import React from "react";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { isSafeRelativeUrl } from "./deeplink";

/**
 * A link this app may follow ITSELF: root-relative only.
 *
 * `Linking` is deliberately NOT imported into this module. Nothing here may
 * open an external URL, and removing the import is what makes that structural
 * rather than a rule someone has to remember — a future edit has to add the
 * import back, which is visible in a diff.
 */
export function isInAppPath(url: string): boolean {
  return url[0] === "/" && url[1] !== "/" && !url.includes("\\");
}

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
 * caller routes them via the deep-link allowlist).
 *
 * EXTERNAL http(s) LINKS ARE NOT TAPPABLE IN THIS APP. They render as plain
 * text — no underline, no accent colour, no press handler.
 *
 * This is a STORE rule, not a style choice (docs/STORE_PAYMENTS_COMPLIANCE.md
 * §5 and finding I5). Notification bodies are ADMIN-SUPPLIED and arrive after
 * review, and this renderer is used on the STUDENT notification screen. Opening
 * them meant:
 *   * Apple 3.1.1(a) — an admin could push `[Abunə ol](https://olympiq.ai/…)`
 *     and steer users to a non-IAP purchase page that the reviewer never saw.
 *     Dynamic steering is the violation whether or not money moves.
 *   * a child-safety problem — an ungated link-out to an arbitrary website,
 *     from a screen a MINOR reads.
 *
 * The label still renders, so the sentence an administrator wrote still makes
 * sense; only the tap is removed. Relative paths are unaffected and still route
 * through `isSafeRelativeUrl`.
 *
 * NOTE: the WEB twin of this renderer deliberately keeps external links live.
 * A website is governed by neither store; this restriction belongs to the
 * binary and must not be "tidied up" into the shared web version.
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
        // Tappable ONLY for a root-relative path we can route ourselves. An
        // external URL falls through to the plain-text branch below — see the
        // note on this component.
        if (s.url && isInAppPath(s.url)) {
          const url = s.url;
          return (
            <AppText
              key={i}
              color={tokens.accent}
              style={{ textDecorationLine: "underline" }}
              onPress={() => {
                if (onOpenPath && isSafeRelativeUrl(url)) onOpenPath(url);
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
