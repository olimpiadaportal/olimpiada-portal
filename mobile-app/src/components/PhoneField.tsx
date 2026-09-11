// E.164 phone entry (web PhoneField parity): compact "AZ +994" trigger opens a
// searchable country sheet; the national number is typed separately and the
// composed +<dial><national> value is what the caller submits. The server
// re-validates — this composition is UX, not security.
//
// THE FIELD IS OPTIONAL (2026-08-31). Apple rejected the app under Guideline
// 5.1.1(v) — an app may not REQUIRE personal information its core functionality
// does not need. The label therefore carries an "(optional)" suffix and an
// empty field emits the EMPTY STRING (see composeE164), which every server path
// normalizes to NULL. Do not reinstate a mandatory phone.
//
// THE VALUE LIVES IN THE CALLER (2026-09-10, owner bug report: a parent typed a
// phone number, moved to the password field, and the phone was CLEARED — on
// both platforms). The country + national pair used to be this component's OWN
// useState, so anything that remounted this subtree reset it to the default
// country and an empty number, with nothing on screen to say so. It is now a
// controlled `value` / `onChange` pair owned by the screen (`usePhoneValue`) —
// state a remount of THIS component cannot reach. `onChangeE164` still emits
// exactly what it always emitted, so no submit path changed.
//
// AND THE SANITISER REFUSES TO BLANK A FILLED FIELD (`applyPhoneEdit`). Six of
// the seven candidate causes were eliminated with file:line evidence; the one
// left standing is PLATFORM AUTOFILL, which writes into UNFOCUSED inputs when a
// dataset is chosen in a sibling field — and a dataset carrying no phone writes
// an EMPTY value. That is precisely "focus the password, watch the phone
// empty". A write that would turn a filled number into nothing is therefore
// refused unless the user is demonstrably doing it themselves. RN then restores
// the refused text for free: TextInput._onChange always bumps two useState
// values, so the input re-renders and its useLayoutEffect pushes `props.value`
// back to the native view (react-native/Libraries/Components/TextInput/
// TextInput.js:200 and :493). That only works while the value is CONTROLLED —
// the two halves of this fix hold each other up.
//
// AND THE TRUNK PREFIX IS THE LIBRARY'S CALL, NOT THIS FILE'S (2026-09-10).
// A national number is WRITTEN with its trunk prefix — "050 123 45 67" in Baku
// — and that is what a person types, what a contact card holds and what Android
// autofill hands this field now that it declares `tel-national`. E.164 has no
// room for it (+994 50 123 45 67), so it comes off ONCE, at compose time, and
// the digits stay on screen exactly as they were entered. WHICH digits count is
// a fact about the numbering PLAN that nothing in this repository decides any
// more: `@/lib/phoneE164` hands the text to libphonenumber-js and returns what
// it says. Two hand-rolled attempts came first — a greedy leading-zero strip
// that flattened Italy's +39 06 …, then a hand-maintained trunk table that ate
// the 8 of Russia's 812 area code — and both produced a DIFFERENT, perfectly
// well-formed number that every check in this stack accepted.

import React, { useMemo, useRef, useState } from "react";
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
import { COUNTRIES } from "@/lib/countries";
import {
  applyPhoneEdit,
  composeE164,
  countryFor,
  EMPTY_PHONE,
  type PhoneValue,
} from "@/lib/phoneE164";
import { useT } from "@/i18n/useT";

// EVERY RULE ABOUT WHAT A NUMBER MEANS LIVES IN @/lib/phoneE164, in a file that
// is byte-identical to the web app's copy — one composition, one answer,
// whichever surface the parent used. They are re-exported from here because
// that is where the screens, the profile editor and the suites already import
// them from, and a component that renders a phone field is an honest place to
// look for them. What stays in THIS file is the React surface.
export {
  applyPhoneEdit,
  composeE164,
  countryFor,
  matchDialCode,
  parseToE164,
  splitE164,
  E164_RE,
  EMPTY_PHONE,
  PHONE_MAX_DIGITS,
  type PhoneValue,
} from "@/lib/phoneE164";

/**
 * The two lines a screen uses to own a phone value:
 *
 *   const [phoneValue, setPhoneValue] = usePhoneValue();
 *   <PhoneField value={phoneValue} onChange={setPhoneValue} onChangeE164={setPhone} … />
 *
 * Deliberately a plain useState in the CALLER's component, so the value
 * outlives any remount of the field itself.
 */
export function usePhoneValue(initial: PhoneValue = EMPTY_PHONE) {
  return useState<PhoneValue>(initial);
}

export function PhoneField({
  label,
  searchPlaceholder,
  closeLabel,
  error,
  value,
  onChange,
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
  /** Controlled: the country + national pair, owned by the caller. */
  value: PhoneValue;
  onChange: (next: PhoneValue) => void;
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
  // Resolved HERE rather than passed in, so every phone row in the app (sign-up
  // and the parent profile alike) says "optional" the same way and none of them
  // can forget to. `t` returns the raw key when the catalogue has no entry — the
  // synced web catalogue is regenerated separately — so an unresolved key must
  // render as NO suffix, never as the literal "field.optional".
  const { t } = useT();
  const optionalRaw = t("field.optional");
  const optionalSuffix = optionalRaw === "field.optional" ? "" : optionalRaw;
  // ONE string for the eye and for the screen reader. The national input sits
  // in a ROW beside the country trigger, so it cannot carry a visible label of
  // its own — and with no explicit `accessibilityLabel` it reaches a
  // screen-reader user as a bare "edit box", the label above it announced as
  // unrelated text. No new i18n string: this is the label already on screen, so
  // it is trilingual by construction.
  const fieldLabel = optionalSuffix ? `${label} ${optionalSuffix}` : label;
  const country = countryFor(value.iso2);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // A ref, not state: `applyPhoneEdit` only READS focus, and re-rendering on
  // focus would buy nothing. The platform writes into an UNFOCUSED input, so
  // this flag is what separates "the user cleared it" from "something else
  // did".
  const focused = useRef(false);

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

  function commit(next: PhoneValue) {
    onChange(next);
    onChangeE164(composeE164(countryFor(next.iso2).dial, next.national));
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
  // No validation changes: the sanitizer above already strips everything except
  // digits and spaces, and the server re-validates the composed E.164 anyway.
  const iosNeedsReturnKey = Platform.OS === "ios" && Boolean(onSubmitEditing);

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{fieldLabel}</AppText>
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
          {/* AUTOFILL, DECLARED PRECISELY. `tel-national` is the Android hint
              for a number WITHOUT its country code, which is exactly what this
              input holds — plain `tel` invited a full E.164 number into a
              national field. RN drops `autoComplete` entirely on iOS
              (TextInput.js: `Platform.OS === 'android' ? … : undefined`) and
              iOS has no content type for a national-only number, so
              `telephoneNumber` is the closest true statement there;
              `applyPhoneEdit` strips the dial code a contact card fills in and
              moves the country trigger to match. */}
          <TextField
            ref={inputRef}
            value={value.national}
            accessibilityLabel={fieldLabel}
            onChangeText={(text) =>
              commit(applyPhoneEdit({ raw: text, prev: value, focused: focused.current }))
            }
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
            }}
            inputMode={iosNeedsReturnKey ? undefined : "tel"}
            keyboardType={iosNeedsReturnKey ? "numbers-and-punctuation" : "phone-pad"}
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            importantForAutofill="yes"
            autoCapitalize="none"
            autoCorrect={false}
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
              {/* A country SEARCH box, not a credential: nothing typed here
                  should ever reach an autofill service or a password manager. */}
              <TextField
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
              />
              <FlatList
                data={filtered}
                keyExtractor={(c) => c.iso2}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      commit({ iso2: item.iso2, national: value.national });
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
