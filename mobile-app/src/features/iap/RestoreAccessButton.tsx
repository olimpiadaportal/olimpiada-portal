// RESTORE. Apple requires this control to exist and to be findable — its
// absence is itself a rejection reason — so it is rendered on every parent money
// surface, INDEPENDENTLY of whether anything is currently for sale. A family
// that reinstalls, changes phone or signs in on a second device has to be able
// to get back what they already paid for without paying again.
//
// IT MUST BE PLEASANT WHEN THERE IS NOTHING TO RESTORE. That is the ordinary
// answer for most taps, and it is certainly the answer a store reviewer gets on
// a fresh device: a calm sentence, in the muted tone, never an error colour and
// never a red screen.
import React, { useState } from "react";
import { View } from "react-native";
import { RotateCcw } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useInvalidateParentData } from "@/features/parent/queries";
import { bffIapApi } from "./api";
import { runRestore } from "./restoreFlow";
import { appleStore } from "./store";
import type { RestoreOutcome } from "./types";

export function RestoreAccessButton({ compact = false }: { compact?: boolean }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const invalidate = useInvalidateParentData();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);

  async function onPress() {
    if (pending) return;
    setPending(true);
    setOutcome(null);
    // runRestore never throws — every branch resolves to an outcome. The
    // try/finally is only here so an impossible throw still releases the button
    // instead of leaving a permanent spinner.
    let result: RestoreOutcome = { status: "failed", messageKey: "mob.iap.err.generic" };
    try {
      result = await runRestore({ store: appleStore, api: bffIapApi });
    } catch {
      // Deliberately swallowed: `result` already holds the generic message.
    } finally {
      setPending(false);
    }
    setOutcome(result);
    // A restore can only ADD access, so refreshing is always safe and is what
    // makes a recovered subject appear without leaving the screen.
    if (result.status === "restored") invalidate();
  }

  const message =
    outcome === null
      ? null
      : outcome.status === "restored"
        ? { text: t("mob.iap.restoreDone"), color: tokens.ok }
        : outcome.status === "nothing"
          ? // NOT an error tone. Nothing went wrong.
            { text: t("mob.iap.restoreNothing"), color: tokens.muted }
          : { text: t(outcome.messageKey), color: tokens.danger };

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        title={t("mob.iap.restore")}
        variant="ghost"
        pending={pending}
        pendingTitle={t("mob.iap.restoreWorking")}
        onPress={() => void onPress()}
        icon={<RotateCcw size={18} color={tokens.text} strokeWidth={2} />}
      />
      {compact ? null : (
        <AppText variant="muted" style={{ fontSize: 13 }}>
          {t("mob.iap.restoreHint")}
        </AppText>
      )}
      {message ? (
        <AppText variant="muted" color={message.color}>
          {message.text}
        </AppText>
      ) : null}
    </View>
  );
}
