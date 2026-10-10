// Mobile stand-in for the web <select>: a field that opens a bottom-sheet list.
// Options carry the DATABASE id (UUID) as the value — the visible label is
// display-only, exactly like the web selects. Optional section headers mirror
// the web optgroups (private/public schools). Long lists get a search box
// (SEARCH_MIN_ITEMS) — the same one the add-child picker has, because a parent
// who can search while ADDING a child and not while EDITING one reports it as
// a new bug.
import React, { useMemo, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { SwipeDownSheet } from "@/components/SwipeDownSheet";
import { TextField } from "@/components/TextField";
import { useT } from "@/i18n/useT";
import { azFilter, SEARCH_MIN_ITEMS } from "@/lib/azFold";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

export type SelectOption = {
  id: string;
  label: string;
  /** Optional group header rendered above the first option of each section. */
  section?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  error,
}: {
  label: string;
  /** Selected option id ("" = nothing selected). */
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string | null;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value) ?? null;

  const searchable = options.length >= SEARCH_MIN_ITEMS;
  // `section` is passed as the group key so prefix matches are hoisted WITHIN a
  // section only: the headers below are derived from the order of this array,
  // so a globally re-ranked list would print "Özəl / Dövlət / Özəl".
  const visible = useMemo(
    () => (searchable ? azFilter(options, query, (o) => o.label, (o) => o.section) : options),
    [options, query, searchable],
  );

  function close() {
    setOpen(false);
    // A filter left over from the last visit reads as a list that lost rows.
    setQuery("");
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // A Pressable is `accessible` by default, so its label REPLACES the
        // child Text — without this the selected school is inaudible and the
        // trigger just announces "Məktəb, düymə" (matches tests/SelectField).
        accessibilityValue={{ text: selected ? selected.label : placeholder }}
        accessibilityState={{ disabled }}
        onPress={
          disabled
            ? undefined
            : () => {
                // Opened from the edit-child form right below the name fields:
                // a Modal is its own window and does not inherit the screen's
                // keyboard handling, so an open keyboard would cover the
                // option sheet (LocaleSwitcher precedent).
                Keyboard.dismiss();
                setOpen(true);
              }
        }
        style={{
          backgroundColor: tokens.surface,
          borderWidth: 1.5,
          borderColor: error ? tokens.danger : tokens.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {/* School/city labels are unbounded, so the trigger grows to two lines
            (minHeight 48 + paddingVertical absorb it) instead of clipping at
            one. It stays clamped — a form control that grows to five lines
            wrecks the field rhythm, and the untruncated label is one tap away
            in the option sheet below (and is announced via accessibilityValue).
            `minWidth: 0` so it can actually shrink beside the chevron.
            Mirrors features/parent/SelectField.tsx and features/tests/. */}
        <AppText
          color={selected ? tokens.text : tokens.muted}
          style={{ flexShrink: 1, minWidth: 0 }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {selected ? selected.label : placeholder}
        </AppText>
        <AppText variant="muted">{"▾"}</AppText>
      </Pressable>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        {/* The sheet sits ON the bottom edge, which is exactly where the
            keyboard opens, so the search box below needs the whole stack lifted
            — a Modal is its own window and inherits neither the activity's
            soft-input mode nor the screen's keyboard-aware container. It is not
            its own REACT tree, though: `KeyboardFocusBoundary` stops the search
            field reporting focus to the form scrolling behind this sheet
            (PhoneField precedent). */}
        <KeyboardFocusBoundary>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {/* minHeight: with the keyboard up this window is shorter than
                SwipeDownSheet's computed detents, the card flex-shrinks to fit,
                and this backdrop is what keeps its top below the status bar /
                camera cutout (a margin on the card would be an undimmed
                stripe). */}
            <Pressable
              accessibilityLabel={label}
              onPress={close}
              style={{ flex: 1, minHeight: insets.top, backgroundColor: "rgba(0,0,0,0.45)" }}
            />
            {/* The sheet sits ON the window's bottom edge, and under Android's
                edge-to-edge windows that edge is BEHIND the gesture/navigation
                bar — so this padding is the only thing keeping the last option
                out from under it. A flat spacing.xl covered a 24pt gesture pill
                and not a 48pt three-button bar, which is how the Ranking
                subject picker ended up with rows that could be neither scrolled
                to nor tapped: taps in that strip go to the system. Same
                insets.bottom + spacing.xl as SheetShell, for the same reason.

                The height cap is SwipeDownSheet's, not this file's: the sheet
                opens at most 80% of the window and the handle drags it up to
                just below the top inset. The handle, the title and the search
                box spend ~150pt before a single option renders, which is why
                the expanded detent exists — see select-sheet-insets.test.ts. */}
            <SwipeDownSheet
              visible={open}
              onDismiss={close}
              closeLabel={t("drawer.close")}
              style={{
                backgroundColor: tokens.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                paddingHorizontal: spacing.xl,
                paddingBottom: insets.bottom + spacing.xl,
                gap: spacing.md,
              }}
            >
              <AppText variant="title" style={{ fontSize: 16 }}>
                {label}
              </AppText>
              {searchable ? (
                // No autoFocus: the trigger dismissed the keyboard on purpose so
                // the sheet opens fully visible; typing is one tap away.
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
                keyExtractor={(o) => o.id}
                // The list is the sheet's only elastic row. ScrollView's base
                // style (flexShrink: 1) already shrinks it once the options
                // overflow the sheet's height cap, which is what makes it scroll
                // at all; flexGrow: 0 keeps a two-option sheet content-sized
                // instead of stretching to the full cap (the rules card in
                // TestsHomeScreen pins the same pair for the same reason).
                style={{ flexGrow: 0 }}
                // The CONTENT, not just the container, has to end clear of the
                // sheet edge: the container padding moves the list's frame up,
                // this is what lets the LAST row scroll into the clear. Count
                // of options is irrelevant — the padding travels with the
                // content, so it holds for six subjects and for sixty schools.
                contentContainerStyle={{ paddingBottom: spacing.md }}
                // One tap picks an option even if a keyboard is still up (Android
                // keeps it over a Modal); without this the first tap is swallowed.
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  // Only while filtering — an unfiltered empty list means the
                  // caller should have passed `disabled`.
                  query.trim() ? (
                    <AppText variant="muted" style={{ paddingVertical: spacing.md }}>
                      {t("mob.select.noResults")}
                    </AppText>
                  ) : null
                }
                renderItem={({ item, index }) => {
                  // Headers are derived from the RENDERED order, so a section
                  // whose rows all filtered out disappears with them.
                  const showSection =
                    !!item.section && (index === 0 || visible[index - 1]?.section !== item.section);
                  const active = item.id === value;
                  return (
                    <View>
                      {showSection ? (
                        <AppText
                          variant="muted"
                          style={{ paddingVertical: spacing.sm, fontSize: 12 }}
                        >
                          {item.section}
                        </AppText>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={item.label}
                        onPress={() => {
                          onChange(item.id);
                          close();
                        }}
                        style={({ pressed }) => ({
                          paddingVertical: spacing.md,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.sm,
                          backgroundColor: active
                            ? tokens.chipBg
                            : pressed
                              ? tokens.chipBg
                              : "transparent",
                        })}
                      >
                        <AppText color={active ? tokens.accent : tokens.text}>{item.label}</AppText>
                      </Pressable>
                    </View>
                  );
                }}
              />
            </SwipeDownSheet>
          </KeyboardAvoidingView>
        </KeyboardFocusBoundary>
      </Modal>
    </View>
  );
}
