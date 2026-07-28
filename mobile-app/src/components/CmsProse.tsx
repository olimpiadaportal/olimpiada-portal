// The React Native counterpart of the web's <CmsProse>: renders a CMS string
// with its paragraph breaks intact. RN has no <p>, so the paragraph rhythm is a
// gap'd <View> holding one <AppText> per paragraph; a single newline stays
// inside its paragraph's Text, where RN already draws it as a soft break.
//
// Spacing comes from the `spacing` tokens (never a literal), so the rhythm is
// identical in light, dark and every locale — az/en/ru only change how many
// lines a paragraph wraps to, never the gap between paragraphs.
//
// Text nodes only. The string is never parsed as markup, so there is no XSS
// surface and no sanitiser to maintain — the same stance lib/notifMarkdown.tsx
// takes for admin notification bodies. Admins get paragraphs and line breaks,
// not tags.
//
// Twin of web-app/src/components/CmsProse.tsx, sharing the split rules via the
// ported lib/cmsParagraphs.ts. The one intentional difference: the web always
// wraps in an element (it needs one to carry `.cms-prose`), while a
// single-paragraph string here renders as a bare <AppText> — a wrapper View
// would change RN layout, and there is no CSS class to hang rhythm on anyway.
// A call site that DOES need the wrapper says so with `containerStyle`, and
// then gets it at every paragraph count, so no admin content edit can change
// the measured layout of a screen.
import React from "react";
import { View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { AppText } from "@/components/AppText";
import { spacing } from "@/theme/tokens";
import { toParagraphs } from "@/lib/cmsParagraphs";

type AppTextProps = React.ComponentProps<typeof AppText>;

export function CmsProse({
  text,
  variant = "muted",
  color,
  style,
  containerStyle,
  gap = spacing.md,
  numberOfLines,
  ...rest
}: Omit<AppTextProps, "children" | "style" | "numberOfLines"> & {
  text: string | null | undefined;
  /** Applied to EVERY paragraph, so blocks stay typographically identical. */
  style?: StyleProp<TextStyle>;
  /** Layout style for the wrapper View. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Vertical rhythm between paragraphs — pass a spacing token, not a number. */
  gap?: number;
  /**
   * Clamp escape hatch, for a collapsed block with a read-more control next to
   * it (mobile-app/src/app/(public)/about.tsx is the worked example). RN can
   * only clamp ONE Text, so the paragraphs are joined into a single Text for
   * the clamped state — with a blank line between them, so the break is still
   * visible in the lines that DO fit. Nothing is dropped: expanding (passing
   * `undefined`) restores the real paragraph blocks.
   */
  numberOfLines?: number;
}) {
  const paragraphs = toParagraphs(text);
  if (paragraphs.length === 0) return null;

  // Identity-bearing props must land on exactly ONE node. Spreading `rest` over
  // every paragraph would duplicate a testID/nativeID the moment an admin adds a
  // second paragraph — a query that passes today would start matching N nodes.
  const { testID, nativeID, accessibilityRole, accessibilityLabel, ...textRest } =
    rest;
  const identity = { testID, nativeID, accessibilityRole, accessibilityLabel };

  // Single Text: the clamped state, and the single-paragraph shape of every
  // catalog default today. No wrapper View means adopting CmsProse can never
  // shift an existing layout (row children, alignItems: "center" parents,
  // measured card heights) — unless the call site asked for one via
  // `containerStyle`, which then applies whatever the paragraph count is, so
  // the layout cannot change under a CONTENT edit.
  const single = numberOfLines !== undefined || paragraphs.length === 1;
  if (single && !containerStyle) {
    return (
      <AppText
        {...textRest}
        {...identity}
        variant={variant}
        color={color}
        style={style}
        numberOfLines={numberOfLines}
      >
        {paragraphs.map((lines) => lines.join("\n")).join("\n\n")}
      </AppText>
    );
  }

  const blocks = single
    ? [paragraphs.map((lines) => lines.join("\n")).join("\n\n")]
    : paragraphs.map((lines) => lines.join("\n"));

  return (
    <View style={[{ gap }, containerStyle]}>
      {blocks.map((block, i) => (
        <AppText
          key={i}
          {...textRest}
          {...(i === 0 ? identity : null)}
          variant={variant}
          color={color}
          style={style}
          numberOfLines={numberOfLines}
        >
          {block}
        </AppText>
      ))}
    </View>
  );
}
