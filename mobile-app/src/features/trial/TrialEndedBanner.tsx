// The parent home's "your child's free access has ended" banners (2026-10-10).
// Web twin: web-app/src/components/TrialExpiredBanner.tsx.
//
// PER BUILD, AS A BUILD-TIME FACT. Where the binary carries a store rail — iOS
// (StoreKit) and, since the owner decision of 2026-10-10, Android (Google Play
// Billing) — the banner carries one CTA to the child's subscription screen,
// where that rail lives. A build with no store rail states the fact and offers
// nothing: no price, no "subscribe", no link. The switch is
// IAP_PLATFORM_SUPPORTED, the same constant that gates the rail itself, never a
// server flag. The CTA is activation language and leads to an in-app screen
// only — never a URL, never a price of our own.
//
// DISMISSAL is per child and per window: the X stores the window's `endsAt`
// under the child's id, so a dismissed banner stays dismissed, and a later
// extension that ends in its turn brings a fresh one. SecureStore is the only
// persistent store in this app; if it fails the banner simply shows again.
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { X } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { IAP_PLATFORM_SUPPORTED } from "@/features/iap/platform";

export type EndedTrialItem = { childId: string; name: string; endsAt: string };

// SecureStore keys allow [A-Za-z0-9._-]; a profile uuid fits.
const keyFor = (childId: string) => `olympiq.trialEnded.${childId}`;

export function TrialEndedBanners({ items }: { items: EndedTrialItem[] }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const [visible, setVisible] = useState<EndedTrialItem[] | null>(null);
  const signature = items.map((i) => `${i.childId}:${i.endsAt}`).join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const shown: EndedTrialItem[] = [];
      for (const item of items) {
        let dismissed: string | null = null;
        try {
          dismissed = await SecureStore.getItemAsync(keyFor(item.childId));
        } catch {
          dismissed = null;
        }
        if (dismissed !== item.endsAt) shown.push(item);
      }
      if (alive) setVisible(shown);
    })();
    return () => {
      alive = false;
    };
    // `signature` captures every field of `items` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!visible || visible.length === 0) return null;

  function dismiss(item: EndedTrialItem) {
    setVisible((prev) => (prev ?? []).filter((i) => i.childId !== item.childId));
    SecureStore.setItemAsync(keyFor(item.childId), item.endsAt).catch(() => {
      // Not stored: it shows again next time, which is the safe direction.
    });
  }

  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      {visible.map((item) => (
        <View
          key={item.childId}
          accessibilityRole="alert"
          style={{
            borderWidth: 1,
            borderColor: tokens.warn,
            borderLeftWidth: 4,
            borderRadius: radius.lg,
            backgroundColor: tokens.surface,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
            <AppText style={{ flex: 1, minWidth: 0, fontWeight: "600" }}>
              {(IAP_PLATFORM_SUPPORTED ? t("mob.trial.banner.bodyStore") : t("mob.trial.banner.body")).replace(
                "{name}",
                item.name,
              )}
            </AppText>
            <Pressable
              onPress={() => dismiss(item)}
              accessibilityRole="button"
              accessibilityLabel={t("mob.trial.banner.dismiss")}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <X size={18} color={tokens.muted} strokeWidth={2.2} />
            </Pressable>
          </View>
          {IAP_PLATFORM_SUPPORTED ? (
            <Button
              title={t("mob.trial.banner.cta")}
              style={{ alignSelf: "stretch" }}
              onPress={() =>
                router.push({
                  pathname: "/(parent)/children/[id]/subscribe",
                  params: { id: item.childId },
                })
              }
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
