// Select field for the add-child forms (web <select> parity on a phone):
// a field-shaped trigger opens a full-screen modal list (PhoneField country
// sheet pattern) with optional group headers (private/public schools), and a
// search box once the list is long enough to need one (SEARCH_MIN_ITEMS).
import React from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { TextField } from "@/components/TextField";
import { useT } from "@/i18n/useT";
import { azFilterSections, SEARCH_MIN_ITEMS } from "@/lib/azFold";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/tokens";

export type SelectItem =
  | { kind: "header"; label: string }
  | { kind: "option"; value: string; label: string };

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SelectField({
  label,
  placeholder,
  items,
  value,
  onChange,
  disabled = false,
  error,
  closeLabel,
}: {
  label: string;
  /** Trigger text while nothing is selected (or the disabled hint). */
  placeholder: string;
  items: SelectItem[];
  /** Selected option VALUE (always an id/UUID — Round-18 rule). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
  closeLabel: string;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = items.find((i) => i.kind === "option" && i.value === value) as
    | Extract<SelectItem, { kind: "option" }>
    | undefined;

  // Headers do not count: two captions over ten schools is still a list you can
  // scan. It is the OPTIONS that decide whether typing beats scrolling.
  const optionCount = items.reduce((n, i) => (i.kind === "option" ? n + 1 : n), 0);
  const searchable = optionCount >= SEARCH_MIN_ITEMS;
  const visible = React.useMemo(
    () =>
      searchable
        ? azFilterSections(items, query, {
            isHeader: (i) => i.kind === "header",
            label: (i) => (i.kind === "option" ? i.label : ""),
          })
        : items,
    [items, query, searchable],
  );

  function close() {
    setOpen(false);
    // Reopening must start from the full list — a filter left over from the
    // last visit reads as a list that lost half its rows.
    setQuery("");
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // A Pressable is `accessible` by default, so its label REPLACES the
        // child Text — without this the selected school/city is inaudible and
        // the trigger just announces "Məktəb, düymə". The visual clamp below is
        // acceptable precisely because the full label is announced here.
        accessibilityValue={{ text: selected ? selected.label : placeholder }}
        accessibilityState={{ disabled }}
        onPress={
          disabled
            ? undefined
            : () => {
                // These triggers sit directly under the name fields, and a
                // Modal is its own window that inherits neither the activity's
                // soft-input mode nor the screen's keyboard-aware container —
                // a keyboard left up would cover the option list
                // (LocaleSwitcher precedent).
                Keyboard.dismiss();
                setOpen(true);
              }
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: tokens.surface,
          borderWidth: 1.5,
          borderColor: error ? tokens.danger : tokens.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          minHeight: 48,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {/* School/city labels are unbounded, so the trigger grows to two lines
            (minHeight 48 + paddingVertical absorb it) instead of clipping at
            one. It stays clamped — a form control that grows to five lines
            wrecks the field rhythm, and the untruncated label is one tap away
            in the option sheet below. `minWidth: 0` so it can actually shrink
            beside the fixed 16pt chevron. */}
        <AppText
          color={selected ? tokens.text : tokens.muted}
          style={{ fontSize: fontSize.md, flexShrink: 1, minWidth: 0 }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {selected ? selected.label : placeholder}
        </AppText>
        <Chevron color={tokens.muted} />
      </Pressable>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        {/* A Modal is its own NATIVE window — it inherits neither the activity's
            soft-input mode nor the screen's keyboard-aware scroll container, so
            it avoids the keyboard itself. `padding` is right on both platforms
            here: the view spans the window from y=0, so there is no header to
            offset against. It is NOT its own REACT tree, though — without the
            boundary the search field below would report focus to the form's
            scroll container behind this sheet, which would then measure a rect
            from THIS window and scroll the page underneath (PhoneField
            precedent). */}
        <KeyboardFocusBoundary>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.bg }}>
            {/* Full-screen modal = its own window: apply the safe-area insets so
                the title clears the notch and the close row clears the gesture
                bar. */}
            <View
              style={{
                flex: 1,
                paddingHorizontal: spacing.lg,
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.lg,
                gap: spacing.md,
              }}
            >
              <AppText variant="title">{label}</AppText>
              {searchable ? (
                // Deliberately NOT autoFocus: the trigger dismisses the keyboard
                // before opening precisely so the whole list is visible, and a
                // keyboard that springs up over it would undo that. Typing is
                // one tap away for the parent who wants it.
                <TextField
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("mob.select.search")}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
              ) : null}
              <FlatList
                data={visible}
                // The list is the only elastic row: at 320pt with the keyboard
                // up it shrinks, and the search box and Close row stay put.
                style={{ flex: 1 }}
                keyExtractor={(item, i) => (item.kind === "option" ? item.value : `h-${i}`)}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  // Only while filtering: an empty list with no query at all is
                  // a caller that should have passed `disabled`.
                  query.trim() ? (
                    <AppText variant="muted" style={{ paddingVertical: spacing.lg }}>
                      {t("mob.select.noResults")}
                    </AppText>
                  ) : null
                }
                renderItem={({ item }) =>
                  item.kind === "header" ? (
                    <AppText
                      variant="label"
                      color={tokens.muted}
                      style={{ paddingTop: spacing.lg, paddingBottom: spacing.xs }}
                    >
                      {item.label}
                    </AppText>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.value === value }}
                      onPress={() => {
                        onChange(item.value);
                        close();
                      }}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: tokens.border,
                      }}
                    >
                      <AppText
                        style={{ fontSize: fontSize.md, flexShrink: 1 }}
                        color={item.value === value ? tokens.accent : tokens.text}
                      >
                        {item.label}
                      </AppText>
                      {item.value === value ? (
                        <AppText variant="label" color={tokens.accent}>
                          ✓
                        </AppText>
                      ) : null}
                    </Pressable>
                  )
                }
              />
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={{ alignItems: "center", padding: spacing.md }}
              >
                <AppText variant="label" color={tokens.accent}>
                  {closeLabel}
                </AppText>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </KeyboardFocusBoundary>
      </Modal>
    </View>
  );
}
