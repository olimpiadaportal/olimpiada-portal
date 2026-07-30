// Cosmetic DEMO payment confirm sheet (web DemoPaymentModal parity, phone
// form factor): a card-look visual + summary rows + one confirm button.
// PURELY presentational — the caller's onConfirm hits the BFF, which is the
// only place any money state changes. Never rendered in 'real' or 'off' mode.
import React from "react";
import { ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { BRAND_GRADIENT, radius, spacing } from "@/theme/tokens";
import { KeyRow, SheetShell } from "./ui";
import { useT } from "@/i18n/useT";

export function DemoPaySheet({
  visible,
  onClose,
  onConfirm,
  pending,
  rows,
  totalLabel,
  totalValue,
  thenText,
  note,
  confirmLabel,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  /** Context rows above the total (package/child, subtotal/discount, …). */
  rows: { label: string; value: string }[];
  totalLabel: string;
  totalValue: string;
  /** Optional sentence under the total (web DemoPaymentModal thenLabel):
   *  e.g. the subjedit.nextBillingLine post-payment recurring rate. */
  thenText?: string | null;
  /** Demo disclaimer (pay.note / poly.modal.mockNote). */
  note: string;
  confirmLabel: string;
  error?: string | null;
}) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <SheetShell
      visible={visible}
      onClose={pending ? () => {} : onClose}
      closeLabel={t("dpay.cancel")}
    >
      {/* Short screens (320×568): the sheet caps at 88% height — the body
          scrolls instead of clipping the confirm button out of reach. */}
      <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText variant="title">{t("pay.title")}</AppText>
        <View
          style={{
            backgroundColor: tokens.accent2,
            borderRadius: radius.sm,
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
          }}
        >
          <AppText variant="label" color="#ffffff" style={{ fontSize: 11 }}>
            {t("pay.demoBadge")}
          </AppText>
        </View>
      </View>

      {/* Card-look visual (cosmetic — nothing is entered, nothing is charged). */}
      <LinearGradient
        colors={[...BRAND_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <AppText variant="label" color="rgba(255,255,255,0.85)">
            {t("pay.cardName")}
          </AppText>
          <AppText variant="label" color="#ffffff">
            {t("pay.demoBadge")}
          </AppText>
        </View>
        {/* Number, never truncated: scales down on 320pt instead of wrapping. */}
        {/* Round 55 (store compliance): the simulated card number, expiry and
            CVC are GONE. A card-entry surface for digital goods inside the
            binary is Guideline 3.1.1(a)/2.3.1 exposure, and a plausible-looking
            test PAN reads as a real payment sheet to a reviewer. The masked
            placeholder below is deliberately not a valid card shape. */}
        <AppText
          variant="mono"
          color="#ffffff"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: 20, letterSpacing: 2 }}
        >
          •••• •••• •••• ••••
        </AppText>
      </LinearGradient>

      <View>
        {rows.map((r) => (
          <KeyRow key={r.label + r.value} label={r.label} value={r.value} />
        ))}
        <View style={{ height: 1, backgroundColor: tokens.border, marginVertical: spacing.sm }} />
        <KeyRow label={totalLabel} value={totalValue} strong />
        {thenText ? (
          <AppText variant="muted" style={{ marginTop: spacing.xs }}>
            {thenText}
          </AppText>
        ) : null}
      </View>

      <AppText variant="muted">{note}</AppText>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      {/* The sheet's one brand-moment CTA. */}
      <Button
        title={confirmLabel}
        variant="gradient"
        pending={pending}
        pendingTitle={t("pay.processing")}
        onPress={onConfirm}
      />
      <Button title={t("dpay.cancel")} variant="ghost" disabled={pending} onPress={onClose} />
      </ScrollView>
    </SheetShell>
  );
}
