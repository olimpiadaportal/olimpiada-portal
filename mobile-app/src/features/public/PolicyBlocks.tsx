// Rendering primitives for LONG-FORM LEGAL COPY (the privacy policy screen).
// The pure half — turning one i18n string into items/rows — lives in
// lib/policyContent.ts, which is a port of the web module of the same name, so
// both platforms split the SAME catalog string identically.
//
// These are the RN counterparts of the <PolicyList>/<PolicyTable>/<Kv> helpers
// inside web-app/src/components/PrivacyPolicy.tsx. Same content, different
// shape where a phone demands it:
//
//   * A TABLE becomes one stacked card per row — exactly what the web page does
//     itself below 700px via `data-h`. A 3-column grid at 320pt would give each
//     cell ~90pt and shred every sentence into a vertical ladder of syllables.
//     The first cell is the row's heading (the web's `<th scope="row">`) and the
//     remaining cells render as "column header → value" pairs, so a value is
//     never separated from the question it answers.
//   * A LIST keeps its marker in a fixed-width gutter and the text in a
//     `flex: 1, minWidth: 0` column, so a long az/ru item wraps under itself
//     instead of pushing the row off-screen.
//
// SECURITY: every value is emitted as a React Native <Text> node. RN has no
// innerHTML, nothing here parses markup, and no string is ever handed to
// Linking — the same stance as components/CmsProse.tsx.
import React from "react";
import { View } from "react-native";
import { Check, X } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, lineHeight, radius, spacing } from "@/theme/tokens";
import { toPolicyList, toPolicyTable } from "@/lib/policyContent";

/** Marker gutter width — one value for every variant so items left-align. */
const MARKER = 20;

export type PolicyListVariant = "dot" | "yes" | "no" | "num";

function Marker({ variant, index }: { variant: PolicyListVariant; index: number }) {
  const { tokens } = useTheme();
  // Markers sit on the first line of the text, whatever the item wraps to.
  const box = {
    width: MARKER,
    alignItems: "center" as const,
    // Optical centering against a 20pt line box.
    paddingTop: 3,
  };

  if (variant === "yes") {
    return (
      <View style={box}>
        <Check size={15} color={tokens.ok} strokeWidth={2.5} />
      </View>
    );
  }
  if (variant === "no") {
    return (
      <View style={box}>
        <X size={15} color={tokens.danger} strokeWidth={2.5} />
      </View>
    );
  }
  if (variant === "num") {
    return (
      <View style={box}>
        <AppText variant="mono" color={tokens.accent} style={{ fontSize: fontSize.xs }}>
          {index + 1}.
        </AppText>
      </View>
    );
  }
  return (
    <View style={[box, { paddingTop: 8 }]}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: tokens.accent,
        }}
      />
    </View>
  );
}

/**
 * One item per line. `yes`/`no` draw the check/cross the web page draws in CSS —
 * they carry meaning here ("what we do" vs "what we never do"), so they are
 * mirrored rather than flattened to bullets.
 */
export function PolicyList({
  text,
  variant = "dot",
}: {
  text: string;
  variant?: PolicyListVariant;
}) {
  const items = toPolicyList(text);
  if (items.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.xs }}>
          <Marker variant={variant} index={i} />
          {/* minWidth: 0 lets the text column actually shrink — without it a
              long unbroken az/ru item would widen the row past the screen. */}
          <AppText
            variant="muted"
            style={{ flex: 1, minWidth: 0, lineHeight: lineHeight.compact }}
          >
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * "cell | cell | cell" rows whose first line is the header. Rendered as one
 * stacked card per row: the first cell titles the card, every other cell is
 * labelled with its own column header.
 */
export function PolicyTable({ text }: { text: string }) {
  const { tokens } = useTheme();
  const { head, rows } = toPolicyTable(text);
  if (head.length === 0 || rows.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.chipBg,
          }}
        >
          {/* Row heading = the web's <th scope="row">. It gets full text
              contrast because it is the thing being described. */}
          <AppText variant="label">{row[0]}</AppText>
          {row.slice(1).map((cell, ci) =>
            cell.length > 0 ? (
              <View key={ci} style={{ gap: 2 }}>
                {/* pillText, not muted: muted grey on chipBg is 2.86:1 in the
                    LIGHT theme (below AA) — the same measurement recorded in
                    (public)/about.tsx. pillText is 5.11:1 light / 8.26:1 dark. */}
                <AppText variant="eyebrow" color={tokens.pillText}>
                  {head[ci + 1]}
                </AppText>
                {/* Body colour at the small size for the same reason: these
                    cells ARE the data inventory a parent is reading. */}
                <AppText
                  style={{ fontSize: fontSize.sm, lineHeight: lineHeight.compact }}
                >
                  {cell}
                </AppText>
              </View>
            ) : null,
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * Label + value row for the contact block and the owner-supplied facts. An
 * unanswered value renders a neutral "to be confirmed" chip in the reader's
 * language — never an invented date, region or retention period.
 */
export function PolicyKv({
  label,
  value,
  tbd,
}: {
  label: string;
  value: string;
  /** t("privacy.tbd") — the localized "to be confirmed" wording. */
  tbd: string;
}) {
  const { tokens } = useTheme();
  const v = value.trim();

  return (
    <View style={{ gap: 2 }}>
      <AppText variant="eyebrow">{label}</AppText>
      {v ? (
        <AppText style={{ fontSize: fontSize.sm, lineHeight: lineHeight.compact }}>
          {v}
        </AppText>
      ) : (
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: tokens.pillBg,
            borderRadius: 999,
            paddingVertical: 3,
            paddingHorizontal: spacing.sm,
          }}
        >
          <AppText variant="eyebrow" color={tokens.pillText}>
            {tbd}
          </AppText>
        </View>
      )}
    </View>
  );
}
