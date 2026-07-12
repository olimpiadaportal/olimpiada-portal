// TEST ENGINE (M3) — single-select field for the setup screen's Topic/Subtopic
// pickers (the mobile analogue of the web <select>): a pressable field opening
// a modal option list. Selection state lives in the caller (values are ids,
// never display labels — Round-19 forms rule).
import React, { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
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
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? null;

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
        <AppText
          color={selected ? arena.ink : arena.dim}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {selected?.name ?? placeholder}
        </AppText>
        <AppText color={arena.dim} style={{ fontSize: 12 }}>
          ▾
        </AppText>
      </Pressable>
      {note ? (
        <AppText variant="muted" color={arena.dim} style={{ fontSize: 12 }}>
          {note}
        </AppText>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityLabel={label}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: tint("#000000", 0.55),
            justifyContent: "center",
            padding: spacing.xl,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: arena.panel,
              borderColor: arena.line,
              borderWidth: 1,
              borderRadius: radius.lg,
              maxHeight: "70%",
              overflow: "hidden",
            }}
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
            <FlatList
              data={options}
              keyExtractor={(o) => o.id}
              renderItem={({ item }) => {
                const active = item.id === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.lg,
                      backgroundColor: active
                        ? tint(arena.blue, 0.14)
                        : pressed
                          ? arena.panel2
                          : "transparent",
                    })}
                  >
                    <AppText color={active ? arena.blue : arena.ink}>{item.name}</AppText>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
