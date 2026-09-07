// TEST ENGINE (M3) — single-select field for the setup screen's Topic/Subtopic
// pickers (the mobile analogue of the web <select>): a pressable field opening
// a modal option list. Selection state lives in the caller (values are ids,
// never display labels — Round-19 forms rule).
import React, { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useT } from "@/i18n/useT";
import { azFilter, SEARCH_MIN_ITEMS } from "@/lib/azFold";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { fontSize, radius, shadow, spacing, type ArenaTokens } from "@/theme/tokens";
import { tint } from "./ui";

export type SelectOption = { id: string; name: string };

export function SelectField({
  arena,
  label,
  placeholder,
  options,
  value,
  onSelect,
  disabled = false,
  invalid = false,
  note,
}: {
  arena: ArenaTokens;
  label: string;
  placeholder: string;
  options: SelectOption[];
  /** Selected option id ("" = none). */
  value: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  /** Missing-field highlight (web aria-invalid red border parity). */
  invalid?: boolean;
  /** Muted helper line under the field (e.g. "no subtopics"). */
  note?: string;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value) ?? null;

  // A subject's subtopic list runs to dozens of rows; the topic list can too.
  const searchable = options.length >= SEARCH_MIN_ITEMS;
  const visible = useMemo(
    () => (searchable ? azFilter(options, query, (o) => o.name) : options),
    [options, query, searchable],
  );

  function close() {
    setOpen(false);
    // Reopening starts from the full list, never from the last filter.
    setQuery("");
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color={arena.muted}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{ text: selected?.name ?? placeholder }}
        onPress={disabled ? undefined : () => setOpen(true)}
        style={({ pressed }) => ({
          backgroundColor: arena.panel2,
          borderWidth: 1,
          borderColor: invalid ? arena.red : arena.line,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          minHeight: 48,
        })}
      >
        {/* Topic/subtopic names are unbounded DB text: two lines instead of
            one (the trigger's minHeight 48 + paddingVertical absorb it). Still
            clamped on purpose — the full name is in the option list one tap
            away, and an unbounded form control breaks the setup-form rhythm. */}
        <AppText
          color={selected ? arena.ink : arena.dim}
          style={{ flex: 1, minWidth: 0 }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {selected?.name ?? placeholder}
        </AppText>
        <ChevronDown size={16} color={arena.dim} strokeWidth={2} />
      </Pressable>
      {note ? (
        <AppText variant="muted" color={arena.dim} style={{ fontSize: 12 }}>
          {note}
        </AppText>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        {/* A Modal is its own native window (no soft-input mode, no screen
            scroller) but shares the React tree, so the search field needs both
            the keyboard avoidance and the focus boundary — see PhoneField. The
            dialog is vertically centred, so `padding` lifts it clear. */}
        <KeyboardFocusBoundary>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {/* The dialog is CENTRED inside this backdrop, so the backdrop's
                padding is what bounds it — which makes this, not the card, the
                place the safe-area insets belong.
                Unlike the profile sheet, this one was never actually reaching
                the navigation bar: a centred card clamped at a percentage of
                the window has empty space below it by construction, so the flat
                spacing.xl was enough in practice. The insets go in anyway
                because "enough in practice" is a property of today's numbers —
                a taller card, a shorter window or a deeper system bar each
                erase the margin silently, and the correct expression costs the
                same as the lucky one. A percentage maxHeight resolves against
                this padded content box, so the card cannot reach the notch or
                the gesture bar however many options it holds. */}
            <Pressable
              accessibilityLabel={label}
              onPress={close}
              style={{
                flex: 1,
                backgroundColor: tint("#000000", 0.55),
                justifyContent: "center",
                paddingHorizontal: spacing.xl,
                paddingTop: insets.top + spacing.xl,
                paddingBottom: insets.bottom + spacing.xl,
              }}
            >
              <Pressable
                onPress={() => {}}
                style={[
                  {
                    backgroundColor: arena.panel,
                    borderColor: arena.line,
                    borderWidth: 1,
                    borderRadius: radius.lg,
                    // 85% (was 70%): the header row and the search box eat ~120pt
                    // before the first option, which left about five rows on a
                    // 568pt-tall phone. 85% is what the other two arena dialogs
                    // already use (ReportQuestionSheet, the daily-round rules
                    // card) — the sheet's own family constant, not a fourth
                    // number. `overflow: hidden` stays: it is what clips the
                    // edge-to-edge rows to the rounded corners, and it never
                    // blocked scrolling (the list shrinks and scrolls inside).
                    maxHeight: "85%",
                    overflow: "hidden",
                  },
                  shadow("float"),
                ]}
              >
                <View
                  style={{
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: arena.line,
                  }}
                >
                  <AppText variant="label" color={arena.muted}>
                    {label}
                  </AppText>
                </View>
                {searchable ? (
                  // The arena runs its own palette, so this is a raw TextInput
                  // rather than the app-token TextField the other two pickers
                  // use — same behaviour, arena colours.
                  <View
                    style={{
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: arena.line,
                    }}
                  >
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      accessibilityLabel={t("mob.select.search")}
                      placeholder={t("mob.select.search")}
                      placeholderTextColor={arena.dim}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                      style={{
                        backgroundColor: arena.panel2,
                        color: arena.ink,
                        borderWidth: 1,
                        borderColor: arena.line,
                        borderRadius: radius.md,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        fontSize: fontSize.md,
                        minHeight: 48,
                      }}
                    />
                  </View>
                ) : null}
                <FlatList
                  data={visible}
                  keyExtractor={(o) => o.id}
                  // The list is the card's only elastic row: ScrollView's base
                  // flexShrink lets it shrink and scroll once the options
                  // overflow the maxHeight box, and flexGrow: 0 keeps a
                  // three-topic card content-sized instead of stretching to 85%.
                  style={{ flexGrow: 0 }}
                  // These rows run edge to edge, so without this the last one
                  // ends flush against the card's rounded corner and reads as
                  // "cut off". The padding travels with the CONTENT, so the
                  // final option always scrolls clear whatever the list length.
                  contentContainerStyle={{ paddingBottom: spacing.sm }}
                  // Matches the other two SelectFields: an option is picked in ONE
                  // tap even if a keyboard happens to be up over the modal.
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    query.trim() ? (
                      <AppText
                        variant="muted"
                        color={arena.dim}
                        style={{ padding: spacing.lg, fontSize: fontSize.sm }}
                      >
                        {t("mob.select.noResults")}
                      </AppText>
                    ) : null
                  }
                  renderItem={({ item }) => {
                    const active = item.id === value;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          onSelect(item.id);
                          close();
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.md,
                          minHeight: 48,
                          paddingVertical: spacing.md,
                          paddingHorizontal: spacing.lg,
                          backgroundColor: active
                            ? tint(arena.blue, 0.14)
                            : pressed
                              ? arena.panel2
                              : "transparent",
                        })}
                      >
                        <AppText color={active ? arena.blue : arena.ink} style={{ flex: 1 }}>
                          {item.name}
                        </AppText>
                        {active ? <Check size={16} color={arena.blue} strokeWidth={2.5} /> : null}
                      </Pressable>
                    );
                  }}
                />
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </KeyboardFocusBoundary>
      </Modal>
    </View>
  );
}
