// E.164 phone entry (web PhoneField parity): compact "AZ +994" trigger opens a
// searchable country sheet; the national number is typed separately and the
// composed +<dial><national> value is what the caller submits. The server
// re-validates — this composition is UX, not security.
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
  type SubmitBehavior,
  type TextInputSubmitEditingEventData,
  type NativeSyntheticEvent,
  type ReturnKeyTypeOptions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { TextField } from "./TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/tokens";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { COUNTRIES, DEFAULT_ISO2, type Country } from "@/lib/countries";

export const E164_RE = /^\+[1-9][0-9]{6,14}$/;

export function composeE164(dial: string, national: string): string {
  const digits = national.replace(/[^\d]/g, "").replace(/^0+/, "");
  return `+${dial}${digits}`;
}

export function PhoneField({
  label,
  searchPlaceholder,
  closeLabel,
  error,
  onChangeE164,
  inputRef,
  returnKeyType,
  submitBehavior,
  onSubmitEditing,
}: {
  label: string;
  searchPlaceholder: string;
  closeLabel: string;
  error?: string | null;
  onChangeE164: (value: string) => void;
  /**
   * Handle on the NATIONAL-NUMBER input, so a form can chain focus through the
   * phone row ("Next" from e-mail lands here, "Next" from here goes on to the
   * password). The country trigger is a Pressable and never joins a chain.
   */
  inputRef?: React.Ref<TextInput>;
  returnKeyType?: ReturnKeyTypeOptions;
  submitBehavior?: SubmitBehavior;
  onSubmitEditing?: (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [country, setCountry] = useState<Country>(
    () => COUNTRIES.find((c) => c.iso2 === DEFAULT_ISO2) ?? COUNTRIES[0],
  );
  const [national, setNational] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        `+${c.dial}`.includes(q),
    );
  }, [query]);

  function update(c: Country, n: string) {
    onChangeE164(composeE164(c.dial, n));
  }

  // iOS renders `phone-pad` as a keypad with NO return key at all, so a focus
  // chain that routes THROUGH this row (register: e-mail -> phone -> password)
  // would dead-end here on iOS while working end to end on Android — an
  // Android-only path by omission, which the root rules forbid. When the return
  // key actually has somewhere to go, iOS gets `numbers-and-punctuation`, whose
  // layout does have one; Android's phone IME always shows an action key, so it
  // keeps the true phone pad. A row with no `onSubmitEditing` (the profile's
  // phone section, whose return key would only dismiss) keeps the phone pad on
  // both platforms — the better keypad is only traded away when it buys the
  // user something.
  //
  // `inputMode` has to go with it: RN resolves `inputMode` OVER `keyboardType`
  // (TextInput.js -> `inputMode ? inputModeToKeyboardTypeMap[inputMode] :
  // keyboardType`, and `tel` maps to `phone-pad`), so leaving it set would make
  // the `keyboardType` switch a silent no-op.
  //
  // No validation changes: the sanitizer below already strips everything except
  // digits and spaces, and the server re-validates the composed E.164 anyway.
  const iosNeedsReturnKey = Platform.OS === "ios" && Boolean(onSubmitEditing);

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${country.iso2} +${country.dial}`}
          onPress={() => setOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            backgroundColor: tokens.chipBg,
            borderWidth: 1.5,
            borderColor: tokens.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            minHeight: 48,
          }}
        >
          <AppText variant="label">{country.iso2}</AppText>
          <AppText variant="muted">+{country.dial}</AppText>
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            ref={inputRef}
            value={national}
            onChangeText={(t) => {
              const clean = t.replace(/[^\d ]/g, "").slice(0, 14);
              setNational(clean);
              update(country, clean);
            }}
            inputMode={iosNeedsReturnKey ? undefined : "tel"}
            keyboardType={iosNeedsReturnKey ? "numbers-and-punctuation" : "phone-pad"}
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType={returnKeyType}
            submitBehavior={submitBehavior}
            onSubmitEditing={onSubmitEditing}
            error={error}
          />
        </View>
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {/* The search field autoFocuses, so the keyboard is already up when this
            opens — and the "Close" row sits at the bottom of the column, right
            under it. A Modal is its OWN NATIVE WINDOW: it inherits neither the
            activity's soft-input mode nor the screen's keyboard-aware scroll
            container, so it has to avoid the keyboard itself. `padding` is the
            right behavior on BOTH platforms here — the view spans the modal
            window from y=0, so there is no header to offset against, and if
            Android did resize the window its measured frame already shrank and
            the computed padding falls to 0. The safe-area padding lives on the
            inner View because KeyboardAvoidingView overwrites paddingBottom.

            It is NOT its own REACT tree, though: context reaches straight
            through a Modal. Without the boundary the autoFocused search field
            below would report focus to the screen's ScrollView behind this
            sheet, which would then compare a rect measured in THIS window
            against its own and scroll the form underneath — on the parent
            profile that walks the page back to the top while the sheet is open.
            `KeyboardFocusBoundary` cuts the channel; the KeyboardAvoidingView
            above is all this window needs. */}
        <KeyboardFocusBoundary>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.bg }}>
            <View
              style={{
                flex: 1,
                gap: spacing.md,
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.lg,
                paddingLeft: insets.left + spacing.lg,
                paddingRight: insets.right + spacing.lg,
              }}
            >
              <TextField
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                autoFocus
                autoCorrect={false}
              />
              <FlatList
                data={filtered}
                keyExtractor={(c) => c.iso2}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCountry(item);
                      update(item, national);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: tokens.border,
                    }}
                  >
                    {/* Long ru names shrink; the dial code never truncates. */}
                    <AppText
                      numberOfLines={1}
                      style={{ fontSize: fontSize.md, flexShrink: 1, minWidth: 0 }}
                    >
                      {item.name}
                    </AppText>
                    <AppText variant="muted" style={{ flexShrink: 0 }}>
                      +{item.dial}
                    </AppText>
                  </Pressable>
                )}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpen(false)}
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
