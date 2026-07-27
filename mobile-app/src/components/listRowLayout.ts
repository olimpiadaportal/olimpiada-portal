// Pure layout decisions for <ListRow> (same split as segmentedLayout.ts beside
// Segmented.tsx: the component keeps the JSX, the branch rules live here so
// they are testable and cannot drift).
//
// Why this exists: ListRow's trailing slot has three mutually exclusive modes
// and two invariants that are easy to break by editing the JSX ternaries —
//   (a) `trailing` ALWAYS wins over `value` (the biometric app-lock Switch row
//       in AccountSheet depends on it),
//   (b) the chevron rule is `trailing === undefined && (chevron ?? !!onPress)`
//       and must NOT learn about `valueWrap`, or every pressable row's chevron
//       shifts.
// Round 52 adds the "stacked" mode: an opt-in for rows whose value is an
// unbounded DB string (school name, city/rayon, olympiad type). Default stays
// "inline" so every existing consumer renders exactly as before.

/**
 * What occupies a row's trailing/value slot.
 *
 * - `custom`   — a caller-supplied node (Switch, Pill…). Wins over everything.
 * - `stacked`  — the value renders BELOW the title inside the text column and
 *                wraps freely (`valueWrap`). For unbounded values.
 * - `inline`   — the value renders as a trailing one-line cell (the default).
 * - `none`     — no trailing content at all.
 */
export type ListRowValueMode = "custom" | "stacked" | "inline" | "none";

export function listRowValueMode(input: {
  /** React node or undefined — only checked for `undefined`, never rendered here. */
  trailing: unknown;
  value: string | undefined;
  valueWrap: boolean | undefined;
}): ListRowValueMode {
  // `trailing={null}` is still "given" — matches the component's historical
  // `trailing !== undefined` check, which renders null and suppresses the value.
  if (input.trailing !== undefined) return "custom";
  if (input.value === undefined) return "none";
  return input.valueWrap === true ? "stacked" : "inline";
}

/** Unchanged since Round 22 — deliberately blind to `valueWrap`. */
export function listRowShowChevron(input: {
  trailing: unknown;
  chevron: boolean | undefined;
  onPress: unknown;
}): boolean {
  return input.trailing === undefined && (input.chevron ?? Boolean(input.onPress));
}

/**
 * A tall wrapped row must not float its 36pt icon chip in the vertical middle
 * (the row itself stays `alignItems: "center"` so the chevron keeps centring).
 */
export function listRowIconAlignSelf(mode: ListRowValueMode): "flex-start" | undefined {
  return mode === "stacked" ? "flex-start" : undefined;
}

/**
 * A11y label for a GROUPED row — a pressable row, or the non-pressable stacked
 * row the component wraps in `accessible`. Grouping merges every child into one
 * node whose label wins (RN's Pressable defaults `accessible` to true), so a
 * value that is not appended here is silently DROPPED, whether it renders
 * inside the text column (`stacked`) or beside it (`inline`). Both are spoken.
 *
 * `custom` is excluded on purpose: the trailing node (a Switch) suppresses the
 * value entirely, so speaking it would announce something that is not rendered.
 */
export function listRowA11yLabel(input: {
  accessibilityLabel: string | undefined;
  title: string;
  subtitle: string | undefined;
  value: string | undefined;
  mode: ListRowValueMode;
}): string {
  const parts = [input.title];
  if (input.subtitle) parts.push(input.subtitle);
  if ((input.mode === "stacked" || input.mode === "inline") && input.value) parts.push(input.value);
  return input.accessibilityLabel ?? parts.join(". ");
}
