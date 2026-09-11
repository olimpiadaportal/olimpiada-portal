// Form inputs: TextField (base), PasswordField (show/hide, web PasswordInput
// parity), ChildIdField (dedicated 8-digit numeric entry, grouped "1234 5678"
// display, autofill OFF — child credentials never hit password managers).
//
// AUTOFILL IS DECLARED, NOT GUESSED (2026-09-10). Left unset, Android's autofill
// framework identifies fields by HEURISTIC and iOS falls back to its own — which
// is how a form ends up with a phone field the platform believes it may rewrite.
// Every credential field in this app therefore states its own combination
// explicitly, and PasswordField makes the one distinction that cannot be
// guessed: a password being CHOSEN versus one being RECALLED (see
// `PasswordPurpose`).
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
        // AN EXPLICIT accessibilityLabel WINS. This line sits AFTER the spread,
        // so it used to overwrite a caller's own label with `undefined`
        // whenever `label` was absent — and `label` is absent exactly where the
        // caller has to supply one by hand: a composite field (PhoneField)
        // renders one visible label above a ROW of controls, leaving its text
        // input to reach a screen reader as an unnamed "edit box".
        accessibilityLabel={rest.accessibilityLabel ?? label}
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

/** Which credential a password field holds — see `PASSWORD_AUTOFILL`. */
export type PasswordPurpose = "new" | "current" | "none";

/**
 * iOS Password AutoFill rules for a password about to be CHOSEN, kept in
 * lock-step with `checkNewPassword` (@/lib/passwordPolicy): 8–128 characters,
 * one uppercase letter, one ASCII symbol. Without it iOS's strong-password
 * generator can produce a password our own client-side check then rejects.
 *
 * The symbol set is spelled out rather than using Apple's `required: special`,
 * because Apple's "special" class INCLUDES THE SPACE and `PASSWORD_SPECIAL_RE`
 * does not — a generated password whose only symbol was a space would fail on
 * the very next line.
 */
export const NEW_PASSWORD_RULES =
  "minlength: 8; maxlength: 128; required: upper; required: [-!#$%&*+=?@^_~];";

type PasswordAutofill = {
  autoComplete: TextInputProps["autoComplete"];
  textContentType: TextInputProps["textContentType"];
  importantForAutofill: TextInputProps["importantForAutofill"];
  passwordRules?: string;
};

/**
 * The three answers, in one table so a test can read them and no call site can
 * invent a fourth.
 *
 * `new-password` / `current-password` are the CROSS-PLATFORM spellings. RN maps
 * them itself — `new-password` -> Android `password-new`, iOS `newPassword`
 * (TextInput.js:830 and :870) — and the Android-only spellings (`password-new`,
 * `password`) produce NOTHING on iOS, because `autoComplete` is dropped entirely
 * there (`Platform.OS === 'android' ? … : undefined`) and iOS reads only the
 * derived `textContentType`. The union is RN's own, so the compiler checks these
 * against node_modules rather than against anybody's memory.
 *
 * WHY CHILD CREDENTIALS GET NOTHING (deliberate). A child signs in with an
 * 8-DIGIT SERVER-ISSUED ID and the PARENT's password, and neither belongs in a
 * credential store:
 *
 *   * the ID is an account number for a MINOR — not a username the child chose
 *     or can change — and children sign in on shared family devices where the
 *     password manager belongs to somebody else;
 *   * the password is the PARENT's. Both platforms key saved credentials to the
 *     app's associated domain and there is exactly one domain here, so a manager
 *     that learned "<8 digits> + <parent password>" would file a SECOND
 *     credential against the same domain as the parent's own. The next parent
 *     login gets an ambiguous picker, and an "update saved password?" prompt on
 *     the child sheet can overwrite the parent's real entry — an account
 *     lockout, produced by a convenience feature.
 *
 * Hence `off` + `importantForAutofill: "no"` (on Android `off` is a hint, the
 * flag is the exclusion). `oneTimeCode` on iOS is not a claim about the content
 * so much as the value that reliably suppresses the automatic strong-password
 * overlay on a `secureTextEntry` field — `"none"` does not, and that overlay is
 * exactly the "shall I save this?" path being refused here. It predates this
 * change and is kept on purpose.
 */
export const PASSWORD_AUTOFILL: Record<PasswordPurpose, PasswordAutofill> = {
  new: {
    autoComplete: "new-password",
    textContentType: "newPassword",
    importantForAutofill: "yes",
    passwordRules: NEW_PASSWORD_RULES,
  },
  current: {
    autoComplete: "current-password",
    textContentType: "password",
    importantForAutofill: "yes",
  },
  none: {
    autoComplete: "off",
    textContentType: "oneTimeCode",
    importantForAutofill: "no",
  },
};

export function PasswordField({
  label,
  error,
  showLabel,
  hideLabel,
  purpose = "none",
  ref,
  ...rest
}: BaseProps & {
  showLabel: string;
  hideLabel: string;
  /**
   * WHICH credential this field holds. A password manager offers to SAVE on a
   * password being chosen and to FILL on one being recalled, so this is the one
   * thing the platform cannot work out for itself — and getting it wrong is why
   * sign-up never offered to save the password it had just watched a parent
   * type.
   *
   * Defaults to "none", so a field that forgets to answer stays out of every
   * credential store instead of guessing its way into one.
   */
  purpose?: PasswordPurpose;
}) {
  const autofill = PASSWORD_AUTOFILL[purpose];
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
          // An explicit label wins here too — see TextField above.
          accessibilityLabel={rest.accessibilityLabel ?? label}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={autofill.textContentType}
          autoComplete={autofill.autoComplete}
          importantForAutofill={autofill.importantForAutofill}
          passwordRules={autofill.passwordRules}
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
  | "textContentType"
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
        // An explicit label wins here too — see TextField above.
        accessibilityLabel={rest.accessibilityLabel ?? label}
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
        // A minor's account number, never a username: see PASSWORD_AUTOFILL for
        // why nothing about a child credential may reach a password manager.
        // `textContentType` is stated rather than left to RN's `off` -> `none`
        // derivation, so the iOS half survives an edit to `autoComplete`.
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        textContentType="none"
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
