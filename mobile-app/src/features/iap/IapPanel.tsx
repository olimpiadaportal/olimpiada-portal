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
  // THE OUTCOME LINE, HELD WITH THE CHILD IT BELONGS TO — the same mount, the
  // same hazard as `sold` below, in the other direction. The subscription tab
  // keeps this panel mounted while the parent switches child chips, so an
  // unscoped outcome renders one child's answer under a SIBLING's price
  // buttons: a green "payment complete" for a child who bought nothing, or a
  // DANGER-coloured failure over offers that are perfectly fine. Scoped, the
  // line leaves with the chip that produced it and returns if the parent
  // switches back — which is what it says about that child either way.
  const [settled, setSettled] = useState<{
    studentProfileId: string;
    outcome: PurchaseOutcome | null;
  }>({ studentProfileId, outcome: null });
  const outcome = settled.studentProfileId === studentProfileId ? settled.outcome : null;
  // WHAT THIS PANEL HAS JUST SOLD — the covered set, one read ahead of the
  // server.
  //
  // onSettled() invalidates the screen's entitlement query, but that query
  // ALREADY HOLDS DATA, so it refetches in the `success` state: the screens'
  // `entitled.isPending` guard is a COLD-LOAD guard and is false for the whole
  // of that round trip. Until it lands, `offers` is still built from the covered
  // set as it was BEFORE the purchase — so the row the parent just bought keeps
  // its price button, and a second tap on it earns the server's double-billing
  // refusal (409 iap.err.alreadyActive) in the DANGER colour, directly under the
  // green "done" line. The grant is therefore applied here first and the read
  // confirms it afterwards, rather than the other way round.
  //
  // Held BY SUBJECT, because buildOffers() hides every interval of a covered
  // subject: a monthly purchase must not leave the yearly row of the same
  // subject on sale. Held WITH THE CHILD it was bought for, because the
  // subscription tab keeps this panel mounted while the parent switches child
  // chips — an offer suppressed for a sibling who bought nothing is the
  // fail-CLOSED direction, and hiding a purchase costs a family the thing they
  // came for, where offering one they hold costs a refusal they can read.
  const [sold, setSold] = useState<{ studentProfileId: string; subjectIds: string[] }>({
    studentProfileId,
    subjectIds: [],
  });
  const soldSubjectIds = sold.studentProfileId === studentProfileId ? sold.subjectIds : [];
  const visibleOffers = offers.filter((o) => !soldSubjectIds.includes(o.subjectId));

  async function buy(offer: IapOffer) {
    if (pendingId !== null) return;
    setPendingId(offer.productId);
    setSettled({ studentProfileId, outcome: null });
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
    setSettled({
      studentProfileId,
      outcome: result.status === "cancelled" ? null : result,
    });
    // ONLY A GRANT REMOVES THE OFFER. `granted` is the one outcome that means
    // the entitlement now EXISTS and the refetch below is merely on its way to
    // confirming it. `recorded` is Apple-verified but grants nothing, `deferred`
    // is still waiting on the family organiser and `pending` is a grant we could
    // not confirm — withdrawing a purchase button on the strength of any of
    // those would hide a sale that has not happened, which is the one direction
    // an offer filter must never fail in.
    //
    // `recorded` IS NOT WHAT APP REVIEW SEES. The reviewer signs a SANDBOX Apple
    // ID into the production build and the server GRANTS those purchases:
    // grantEntitlement.ts converts a sandbox grant into a real one under an
    // "sbx:" namespace, and APPLE_IAP_SANDBOX_GRANTS defaults to ON precisely so
    // that review passes. A reviewer's purchase therefore arrives here as
    // `granted` and its offer is withdrawn. `recorded` is what a sandbox
    // purchase becomes once that switch is turned OFF after launch.
    if (result.status === "granted") {
      setSold((prev) => {
        const base = prev.studentProfileId === studentProfileId ? prev.subjectIds : [];
        return base.includes(offer.subjectId)
          ? prev
          : { studentProfileId, subjectIds: [...base, offer.subjectId] };
      });
    }
    // Anything that reached the store is worth a refresh: granted access should
    // appear at once, and a purchase settled by the notification while we were
    // waiting shows up on the same pass.
    if (result.status !== "cancelled" && result.status !== "failed") onSettled();
  }

  // `off` and `none` render NOTHING — not an empty state. See queries.ts: an
  // "unavailable" placeholder under its own heading reads as an unfinished
  // feature, which is the 2.1.0 rejection this app already collected.
  if (state === "off" || state === "none") return null;

  // EVERYTHING THIS PANEL HAD TO SELL HAS JUST BEEN BOUGHT, and the screen's
  // entitlement read has not landed yet. There is nothing left to choose, so the
  // heading, the intro and the offer list all go — but the outcome line stays:
  // it is the confirmation of a payment that has just been taken, and yanking it
  // off the screen mid-sentence is how a purchase that worked starts looking
  // like one that did not. It leaves on its own when the read lands and the
  // screen's state turns "none".
  if (state === "ready" && visibleOffers.length === 0) {
    return outcome ? (
      <Card style={{ gap: spacing.md }}>
        <PurchaseNotice outcome={outcome} />
      </Card>
    ) : null;
  }

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
        {visibleOffers.map((o) => (
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
    // Verified by Apple, acknowledged by our server, no access created — a
    // sandbox purchase made while APPLE_IAP_SANDBOX_GRANTS is off, NOT what App
    // Review gets (see buy(): the reviewer's sandbox purchase is granted). No
    // real money moved, so neutral, not red.
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
