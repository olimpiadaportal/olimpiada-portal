// Cancel-subscription confirm sheet (web CancelSubscription modal parity):
// reason picker + what-you-lose warning → explicit confirm →
// bffCancelSubscription. After success the sheet shows cancel.done + the
// access-until-period-end note (the server keeps access to period end).
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { bffCancelSubscription } from "@/lib/api";
import { useT } from "@/i18n/useT";
import { SheetShell } from "./ui";

const REASONS = [
  { id: "price", key: "cancel.reason.price" },
  { id: "not_using", key: "cancel.reason.notUsing" },
  { id: "features", key: "cancel.reason.features" },
  { id: "temporary", key: "cancel.reason.temporary" },
  { id: "other", key: "cancel.reason.other" },
] as const;

export function CancelSheet({
  visible,
  onClose,
  subscriptionId,
  studentId,
  childName,
  onCanceled,
}: {
  visible: boolean;
  onClose: () => void;
  subscriptionId: string;
  studentId: string;
  childName: string;
  onCanceled: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [reason, setReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await bffCancelSubscription(subscriptionId, studentId, reason ?? undefined);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setDone(true);
    onCanceled();
  }

  function close() {
    if (pending) return;
    setError(null);
    setDone(false);
    setReason(null);
    onClose();
  }

  return (
    <SheetShell visible={visible} onClose={close} closeLabel={t("cancel.keep")}>
      {done ? (
        <>
          <AppText variant="title">{t("cancel.done")}</AppText>
          <AppText variant="muted">{t("mob.cancel.untilEnd")}</AppText>
          <Button title={t("poly.modal.close")} onPress={close} />
        </>
      ) : (
        <>
          <AppText variant="title">{t("cancel.title")}</AppText>
          <AppText variant="muted">{childName}</AppText>
          <AppText>{t("cancel.intro")}</AppText>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="label">{t("cancel.reasonLabel")}</AppText>
            {REASONS.map((r) => {
              const active = reason === r.id;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setReason(r.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    borderWidth: 1.5,
                    borderColor: active ? tokens.accent : tokens.border,
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: active ? tokens.accent : tokens.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {active ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: tokens.accent,
                        }}
                      />
                    ) : null}
                  </View>
                  <AppText style={{ flexShrink: 1 }}>{t(r.key)}</AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">{t("cancel.benefitsTitle")}</AppText>
            {[t("cancel.benefit1"), t("cancel.benefit2"), t("cancel.benefit3")].map((b) => (
              <AppText key={b} variant="muted">
                • {b}
              </AppText>
            ))}
          </View>

          {error ? (
            <AppText variant="muted" color={tokens.danger}>
              {error}
            </AppText>
          ) : null}
          <Button
            title={t("cancel.confirm")}
            variant="danger"
            pending={pending}
            onPress={() => void confirm()}
          />
          <Button title={t("cancel.keep")} variant="ghost" disabled={pending} onPress={close} />
        </>
      )}
    </SheetShell>
  );
}
