// Form inputs: TextField (base), PasswordField (show/hide, web PasswordInput
// parity), ChildIdField (dedicated 8-digit numeric entry, grouped "1234 5678"
// display, autofill OFF — child credentials never hit password managers).
import React, { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/tokens";

type BaseProps = TextInputProps & {
  label?: string;
  error?: string | null;
};

export function TextField({ label, error, style, ...rest }: BaseProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={tokens.muted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
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
  return (
    <View style={{ gap: spacing.xs }}>
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
          accessibilityLabel={label}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={isParentCredential ? "password" : "oneTimeCode"}
          autoComplete={isParentCredential ? "password" : "off"}
          placeholderTextColor={tokens.muted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
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

export function ChildIdField({
  label,
  error,
  value,
  onChangeDigits,
  placeholder,
}: {
  label: string;
  error?: string | null;
  /** Digits only (max 8); the field renders them grouped "1234 5678". */
  value: string;
  onChangeDigits: (digits: string) => void;
  placeholder?: string;
}) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const grouped = value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={grouped}
        onChangeText={(t) => onChangeDigits(t.replace(/\D/g, "").slice(0, CHILD_ID_LEN))}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={CHILD_ID_LEN + 1}
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        placeholder={placeholder}
        placeholderTextColor={tokens.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
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
        }}
      />
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
