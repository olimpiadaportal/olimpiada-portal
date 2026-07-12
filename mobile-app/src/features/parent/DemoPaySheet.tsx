// Cosmetic DEMO payment confirm sheet (web DemoPaymentModal parity, phone
// form factor): a card-look visual + summary rows + one confirm button.
// PURELY presentational — the caller's onConfirm hits the BFF, which is the
// only place any money state changes. Never rendered in 'real' or 'off' mode.
import React from "react";
import { View } from "react-native";
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
        <AppText variant="mono" color="#ffffff" style={{ fontSize: 20, letterSpacing: 2 }}>
          4242 4242 4242 4242
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.xl }}>
          <AppText variant="muted" color="rgba(255,255,255,0.85)">
            {t("pay.expiry")} 12/29
          </AppText>
          <AppText variant="muted" color="rgba(255,255,255,0.85)">
            {t("pay.cvc")} •••
          </AppText>
        </View>
      </LinearGradient>

      <View>
        {rows.map((r) => (
          <KeyRow key={r.label + r.value} label={r.label} value={r.value} />
        ))}
        <View style={{ height: 1, backgroundColor: tokens.border, marginVertical: spacing.sm }} />
        <KeyRow label={totalLabel} value={totalValue} strong />
      </View>

      <AppText variant="muted">{note}</AppText>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      <Button
        title={confirmLabel}
        pending={pending}
        pendingTitle={t("pay.processing")}
        onPress={onConfirm}
      />
      <Button title={t("dpay.cancel")} variant="ghost" disabled={pending} onPress={onClose} />
    </SheetShell>
  );
}
