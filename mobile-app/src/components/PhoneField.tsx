// E.164 phone entry (web PhoneField parity): compact "AZ +994" trigger opens a
// searchable country sheet; the national number is typed separately and the
// composed +<dial><national> value is what the caller submits. The server
// re-validates — this composition is UX, not security.
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { TextField } from "./TextField";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/tokens";
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
}: {
  label: string;
  searchPlaceholder: string;
  closeLabel: string;
  error?: string | null;
  onChangeE164: (value: string) => void;
}) {
  const { tokens } = useTheme();
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
            value={national}
            onChangeText={(t) => {
              const clean = t.replace(/[^\d ]/g, "").slice(0, 14);
              setNational(clean);
              update(country, clean);
            }}
            inputMode="tel"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={error}
          />
        </View>
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: tokens.bg, padding: spacing.lg, gap: spacing.md }}>
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
                  justifyContent: "space-between",
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: tokens.border,
                }}
              >
                <AppText style={{ fontSize: fontSize.md }}>{item.name}</AppText>
                <AppText variant="muted">+{item.dial}</AppText>
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
      </Modal>
    </View>
  );
}
