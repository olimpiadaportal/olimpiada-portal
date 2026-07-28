// Mobile stand-in for the web <select>: a field that opens a bottom-sheet list.
// Options carry the DATABASE id (UUID) as the value — the visible label is
// display-only, exactly like the web selects. Optional section headers mirror
// the web optgroups (private/public schools).
import React, { useState } from "react";
import { FlatList, Keyboard, Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
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
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? null;

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

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel={label}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        />
        <View
          style={{
            backgroundColor: tokens.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl,
            maxHeight: "70%",
            gap: spacing.md,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.border,
            }}
          />
          <AppText variant="title" style={{ fontSize: 16 }}>
            {label}
          </AppText>
          <FlatList
            data={options}
            keyExtractor={(o) => o.id}
            // One tap picks an option even if a keyboard is still up (Android
            // keeps it over a Modal); without this the first tap is swallowed.
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const showSection =
                !!item.section && (index === 0 || options[index - 1]?.section !== item.section);
              const active = item.id === value;
              return (
                <View>
                  {showSection ? (
                    <AppText variant="muted" style={{ paddingVertical: spacing.sm, fontSize: 12 }}>
                      {item.section}
                    </AppText>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    onPress={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.sm,
                      backgroundColor: active ? tokens.chipBg : pressed ? tokens.chipBg : "transparent",
                    })}
                  >
                    <AppText color={active ? tokens.accent : tokens.text}>{item.label}</AppText>
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
