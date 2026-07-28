// Form inputs: TextField (base), PasswordField (show/hide, web PasswordInput
// parity), ChildIdField (dedicated 8-digit numeric entry, grouped "1234 5678"
// display, autofill OFF — child credentials never hit password managers).
//
// All three take part in the app-wide keyboard contract:
//   * they forward `ref`, so a screen can chain focus ("Next" -> next field).
//     React 19 passes `ref` as a plain prop, so no forwardRef — the codebase
//     has none;
//   * they report focus/blur to the nearest keyboard-aware scroll container
//     (`@/lib/useKeyboardAware`), which scrolls the field clear of the keyboard.
//     What is reported is the WRAPPER View — label + input + inline validation
//     message — so the container clears the whole cluster and an error already
//     on screen is measured at its real height instead of estimated. With no
//     such container above them (a Modal that declared a
//     `KeyboardFocusBoundary`) this is a no-op and the field behaves exactly as
//     it did before;
//   * `returnKeyType` / `onSubmitEditing` / `submitBehavior` pass straight
//     through. None of them is set by default, so a field given none of these
//     props renders and behaves identically to before this change.
import React, { useRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/tokens";
import { useFieldKeyboardFocus } from "@/lib/useKeyboardAware";
import { useMergedRef } from "@/lib/refs";

type BaseProps = TextInputProps & {
  label?: string;
  error?: string | null;
  /** Focus chaining: `const next = useRef<TextInput>(null)` -> `ref={next}`. */
  ref?: React.Ref<TextInput>;
};

export function TextField({ label, error, style, ref, ...rest }: BaseProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const node = useRef<TextInput | null>(null);
  const wrap = useRef<View | null>(null);
  const setRef = useMergedRef(ref, node);
  const keyboard = useFieldKeyboardFocus();
  return (
    <View ref={wrap} style={{ gap: spacing.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        {...rest}
        ref={setRef}
        accessibilityLabel={label}
        placeholderTextColor={tokens.muted}
        onFocus={(e) => {
          setFocused(true);
          keyboard?.onFieldFocus(wrap.current);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          keyboard?.onFieldBlur(wrap.current);
          rest.onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: tokens.surface,
            color: tokens.text,
            borderWidth: 1.5,
            borderColor: error ? tokens.danger : focused ? tokens.accent : tokens.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            fontSize: fontSize.md,
            minHeight: 48,
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function EyeIcon({ off, color }: { off: boolean; color: string }) {
  return off ? (
    <EyeOff size={20} color={color} strokeWidth={2} />
  ) : (
    <Eye size={20} color={color} strokeWidth={2} />
  );
}

export function PasswordField({
  label,
  error,
  showLabel,
  hideLabel,
  isParentCredential = false,
  ref,
  ...rest
}: BaseProps & {
  showLabel: string;
  hideLabel: string;
  /** Only PARENT credentials get autofill hints; child fields never do. */
  isParentCredential?: boolean;
}) {
  const { tokens } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const node = useRef<TextInput | null>(null);
  const wrap = useRef<View | null>(null);
  const setRef = useMergedRef(ref, node);
  const keyboard = useFieldKeyboardFocus();
  return (
    <View ref={wrap} style={{ gap: spacing.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tokens.surface,
          borderWidth: 1.5,
          borderColor: error ? tokens.danger : focused ? tokens.accent : tokens.border,
          borderRadius: radius.md,
          minHeight: 48,
        }}
      >
        <TextInput
          {...rest}
          ref={setRef}
          accessibilityLabel={label}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={isParentCredential ? "password" : "oneTimeCode"}
          autoComplete={isParentCredential ? "password" : "off"}
          placeholderTextColor={tokens.muted}
          onFocus={(e) => {
            setFocused(true);
            keyboard?.onFieldFocus(wrap.current);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            keyboard?.onFieldBlur(wrap.current);
            rest.onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: tokens.text,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            fontSize: fontSize.md,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? hideLabel : showLabel}
          onPress={() => setVisible((v) => !v)}
          style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
        >
          <EyeIcon off={visible} color={tokens.muted} />
        </Pressable>
      </View>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const CHILD_ID_LEN = 8;

/**
 * Props the caller may NOT set: the child-credential rules (numeric keypad,
 * length, autofill OFF) are non-negotiable, so they are applied AFTER the
 * spread and the value/change pair stays owned by this component.
 */
type ChildIdFieldProps = Omit<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "maxLength"
  | "keyboardType"
  | "inputMode"
  | "autoComplete"
  | "autoCorrect"
  | "importantForAutofill"
> & {
  label: string;
  error?: string | null;
  /** Digits only (max 8); the field renders them grouped "1234 5678". */
  value: string;
  onChangeDigits: (digits: string) => void;
  placeholder?: string;
  ref?: React.Ref<TextInput>;
  /**
   * Fires on the RISING EDGE of completeness — the edit that takes the ID from
   * incomplete to 8 digits, never again while it stays at 8. The iOS number pad
   * has NO return key, so this is the only way to move focus off this field
   * there; a caller that wants "ID filled -> jump to password" wires it here
   * instead of to `onSubmitEditing`. Optional: unset means nothing happens.
   *
   * The edge matters: firing on every change that lands on 8 digits would yank
   * focus away mid-correction (tap back in, fix one digit, retype) and on any
   * paste of a longer string, which is sliced to 8.
   */
  onComplete?: () => void;
};

export function ChildIdField({
  label,
  error,
  value,
  onChangeDigits,
  placeholder,
  onComplete,
  style,
  ref,
  ...rest
}: ChildIdFieldProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const node = useRef<TextInput | null>(null);
  const wrap = useRef<View | null>(null);
  const setRef = useMergedRef(ref, node);
  const keyboard = useFieldKeyboardFocus();
  // Latches at 8 digits and releases below it, so `onComplete` is an edge, not
  // a level. Nothing else reads it — the value itself stays owned by the caller.
  const wasComplete = useRef(value.length === CHILD_ID_LEN);
  const grouped = value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value;
  return (
    <View ref={wrap} style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...rest}
        ref={setRef}
        accessibilityLabel={label}
        value={grouped}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, CHILD_ID_LEN);
          onChangeDigits(digits);
          const complete = digits.length === CHILD_ID_LEN;
          const rising = complete && !wasComplete.current;
          wasComplete.current = complete;
          if (rising) onComplete?.();
        }}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={CHILD_ID_LEN + 1}
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        placeholder={placeholder}
        placeholderTextColor={tokens.muted}
        onFocus={(e) => {
          setFocused(true);
          keyboard?.onFieldFocus(wrap.current);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          keyboard?.onFieldBlur(wrap.current);
          rest.onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: tokens.surface,
            color: tokens.text,
            borderWidth: 1.5,
            borderColor: error ? tokens.danger : focused ? tokens.accent : tokens.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            fontSize: fontSize.lg,
            letterSpacing: 2,
            fontVariant: ["tabular-nums"],
            minHeight: 48,
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
