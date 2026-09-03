// THE iOS PURCHASE SURFACE. One card, one child, one row per sellable subject.
//
// WHAT A REVIEWER MUST NEVER SEE HERE: a blank area, a spinner that does not
// end, a purchase button with no price, a raw error, or a red screen. Every
// branch below renders a sentence somebody wrote on purpose.
//
// PRICES ARE StoreKit'S OWN STRINGS. `displayPrice` is rendered verbatim as the
// button's label — already localised, already in the viewer's storefront
// currency, already correct about tax. This app formats no amount anywhere, and
// a helper that could print one is exactly how a wrong price gets back onto a
// screen.
//
// THE PANEL DOES NOT HIDE ITSELF WHEN ACCESS IS CURRENTLY FREE. The screens keep
// showing their free-window notice above it, so the parent reads both facts —
// but the purchase mechanism itself never appears and disappears with a
// server-resolved flag. A store binary whose payment surface is switched by a
// database row is the failure this project was already rejected for once, and
// the mirror image of it (a purchase path a reviewer cannot reach) is a second
// rejection under the same guideline.
import React, { useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import { INTERVAL_NAME_KEY } from "@/features/parent/commerce";
import { bffIapApi } from "./api";
import { runPurchase } from "./purchaseFlow";
import { appleStore } from "./store";
import type { IapOffer } from "./catalog";
import type { IapSurfaceState } from "./queries";
import type { PurchaseOutcome } from "./types";

export function IapPanel({
  studentProfileId,
  state,
  offers,
  refetch,
  onSettled,
}: {
  studentProfileId: string;
  state: IapSurfaceState;
  offers: IapOffer[];
  refetch: () => void;
  /** Refresh whatever shows entitlement, so access appears without a reload. */
  onSettled: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);

  async function buy(offer: IapOffer) {
    if (pendingId !== null) return;
    setPendingId(offer.productId);
    setOutcome(null);
    // runPurchase never throws. The catch is a last resort so an impossible
    // throw still leaves a translated sentence instead of a red screen.
    let result: PurchaseOutcome = { status: "failed", messageKey: "mob.iap.err.generic" };
    try {
      result = await runPurchase({
        store: appleStore,
        api: bffIapApi,
        productId: offer.productId,
        studentProfileId,
      });
    } catch {
      // Deliberately swallowed; `result` already carries the generic message.
    } finally {
      setPendingId(null);
    }
    // A CANCEL SAYS NOTHING. The parent closed a sheet they opened; a message
    // for that is how an app starts feeling broken.
    setOutcome(result.status === "cancelled" ? null : result);
    // Anything that reached the store is worth a refresh: granted access should
    // appear at once, and a purchase settled by the notification while we were
    // waiting shows up on the same pass.
    if (result.status !== "cancelled" && result.status !== "failed") onSettled();
  }

  // `off` and `none` render NOTHING — not an empty state. See queries.ts: an
  // "unavailable" placeholder under its own heading reads as an unfinished
  // feature, which is the 2.1.0 rejection this app already collected.
  if (state === "off" || state === "none") return null;

  const body =
    state === "loading" ? (
      <AppText variant="muted">{t("mob.iap.loading")}</AppText>
    ) : state === "unavailable" ? (
      // WE SELL SOMETHING BUT COULD NOT PRICE IT. Say so plainly and offer the
      // retry; never a bare spinner and never an unpriced button.
      <View style={{ gap: spacing.md }}>
        <AppText variant="muted">{t("mob.iap.err.unavailable")}</AppText>
        <Button title={t("mob.retry")} variant="ghost" onPress={refetch} />
      </View>
    ) : (
      <View style={{ gap: spacing.md }}>
        {offers.map((o) => (
          <View
            key={o.productId}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            {/* flex + minWidth:0 so a long az/ru subject name truncates instead
                of pushing the price button off a 320pt screen. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="label" numberOfLines={2}>
                {subjectLabel(t, o.subjectCode, o.subjectName)}
              </AppText>
              <AppText variant="muted" style={{ fontSize: 13 }}>
                {t(INTERVAL_NAME_KEY[o.interval])}
              </AppText>
            </View>
            {/* Apple's string, untouched. */}
            <Button
              title={o.displayPrice}
              pending={pendingId === o.productId}
              pendingTitle={t("mob.iap.working")}
              disabled={pendingId !== null && pendingId !== o.productId}
              onPress={() => void buy(o)}
            />
          </View>
        ))}
        <AppText variant="muted" style={{ fontSize: 13 }}>
          {t("mob.iap.noRenew")}
        </AppText>
      </View>
    );

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="subtitle">{t("mob.iap.title")}</AppText>
      <AppText variant="muted">{t("mob.iap.intro")}</AppText>
      {body}
      <PurchaseNotice outcome={outcome} />
    </Card>
  );
}

/** The outcome line. Tone matters more than wording here: only a purchase that
 *  charged NOTHING is allowed to look like an error. */
function PurchaseNotice({ outcome }: { outcome: PurchaseOutcome | null }) {
  const { tokens } = useTheme();
  const { t } = useT();
  if (outcome === null) return null;

  if (outcome.status === "granted") {
    return <AppText color={tokens.ok}>{t("mob.iap.done")}</AppText>;
  }
  if (outcome.status === "deferred") {
    return <AppText variant="muted">{t("mob.iap.deferred")}</AppText>;
  }
  if (outcome.status === "recorded") {
    // Verified by Apple, acknowledged by our server, no access created — the
    // SANDBOX answer, and therefore what App Review sees. Neutral, not red.
    return <AppText variant="muted">{t(outcome.messageKey)}</AppText>;
  }
  if (outcome.status === "pending") {
    // THE MOST IMPORTANT LINE IN THIS FILE. Money has moved and we could not
    // confirm the grant. The transaction was deliberately left unfinished, so
    // the notification, the reconcile sweep and Restore can all still settle it.
    // Telling this parent their payment failed would be a lie in the one
    // direction that costs them money.
    return (
      <View style={{ gap: spacing.xs }}>
        <AppText color={tokens.text}>{t("mob.iap.pending")}</AppText>
        {outcome.detailKey ? (
          <AppText variant="muted">{t(outcome.detailKey)}</AppText>
        ) : null}
      </View>
    );
  }
  // A cancel is stored as `null` above and never reaches here; the branch
  // exists so the union is exhaustive and a future outcome cannot fall through
  // into the DANGER tone by accident. Only `failed` — where nothing was charged
  // — is allowed to look like an error.
  if (outcome.status === "cancelled") return null;
  return <AppText color={tokens.danger}>{t(outcome.messageKey)}</AppText>;
}
