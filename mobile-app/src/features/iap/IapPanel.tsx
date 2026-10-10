// THE iOS PURCHASE SURFACE. One card, one child, one section per sellable
// subject.
//
// LAYOUT (owner feedback, 2026-10-10): this used to be one flat row per SKU —
// seven subjects times three periods, twenty-one price buttons in a column. It
// is now the standard paywall shape, grouped by subject (offerGroups.ts): each
// subject is an accordion row; the open one lists its periods as radio options
// with StoreKit's price on each, and carries ONE action whose label repeats the
// chosen price. One section is open at a time, the first by default, so a
// price is on screen without a tap. Monthly is preselected.
//
// WHAT A REVIEWER MUST NEVER SEE HERE: a blank area, a spinner that does not
// end, a purchase button with no price, a raw error, or a red screen. Every
// branch below renders a sentence somebody wrote on purpose.
//
// PRICES ARE StoreKit'S OWN STRINGS. `displayPrice` is rendered verbatim on the
// period option and in the action's label — already localised, already in the
// viewer's storefront currency, already correct about tax. This app formats no
// amount anywhere, and a helper that could print one is exactly how a wrong
// price gets back onto a screen.
//
// The panel is also given the current server-resolved availability. During an
// admin giveaway, scheduled free access, or payment-off state it renders
// nothing and its press handler refuses to start. The BFF repeats the gate
// before an intent is written, so a stale frame cannot open StoreKit.
import React, { useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import { INTERVAL_NAME_KEY } from "@/features/parent/commerce";
import { bffIapApi } from "./api";
import { runPurchase } from "./purchaseFlow";
import { appleStore } from "./store";
import {
  groupIapOffers,
  openSubjectId,
  selectedOffer,
  type IapInterval,
  type IapOfferGroup,
} from "./offerGroups";
import type { IapOffer } from "./catalog";
import type { IapSurfaceState } from "./queries";
import type { PurchaseOutcome } from "./types";

export function IapPanel({
  studentProfileId,
  state,
  offers,
  refetch,
  onSettled,
  purchaseEnabled = true,
}: {
  studentProfileId: string;
  state: IapSurfaceState;
  offers: IapOffer[];
  refetch: () => void;
  /** Refresh whatever shows entitlement, so access appears without a reload. */
  onSettled: () => void;
  /** Runtime admin gate. Android remains excluded by the platform boundary. */
  purchaseEnabled?: boolean;
}) {
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
  // Built from the FILTERED list, never the raw prop — a grouped subject the
  // panel has just sold would put its price options straight back.
  const groups = groupIapOffers(visibleOffers);
  // Presentation only: which section is open and which period each subject
  // has chosen. Neither is about money — the purchase below is always for the
  // offer the open section DISPLAYS, resolved from the live list at press time.
  const [chosenSubject, setChosenSubject] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<Record<string, IapInterval>>({});
  const openId = openSubjectId(groups, chosenSubject);

  function toggleSubject(subjectId: string) {
    if (pendingId !== null) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChosenSubject(openId === subjectId ? null : subjectId);
  }

  async function buy(offer: IapOffer) {
    if (!purchaseEnabled || pendingId !== null) return;
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
  if (!purchaseEnabled || state === "off" || state === "none") return null;

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
        <SubjectList
          groups={groups}
          openId={openId}
          picked={picked}
          pendingId={pendingId}
          onToggle={toggleSubject}
          onPick={(subjectId, interval) =>
            setPicked((prev) => ({ ...prev, [subjectId]: interval }))
          }
          onActivate={(offer) => void buy(offer)}
        />
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

/**
 * The grouped offer list: one accordion row per subject inside a single
 * bordered group (a nested card per subject would stack seven shadows inside
 * the panel's own). Only the open section shows periods and the action.
 */
function SubjectList({
  groups,
  openId,
  picked,
  pendingId,
  onToggle,
  onPick,
  onActivate,
}: {
  groups: IapOfferGroup[];
  openId: string | null;
  picked: Record<string, IapInterval>;
  pendingId: string | null;
  onToggle: (subjectId: string) => void;
  onPick: (subjectId: string, interval: IapInterval) => void;
  onActivate: (offer: IapOffer) => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const busy = pendingId !== null;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.border,
        borderRadius: radius.md,
        overflow: "hidden",
      }}
    >
      {groups.map((group, index) => {
        const isOpen = openId === group.subjectId;
        const label = subjectLabel(t, group.subjectCode, group.subjectName);
        const chosen = selectedOffer(group, picked[group.subjectId]);
        return (
          <View
            key={group.subjectId}
            style={index > 0 ? { borderTopWidth: 1, borderTopColor: tokens.border } : null}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded: isOpen, disabled: busy }}
              onPress={() => onToggle(group.subjectId)}
              disabled={busy}
              android_ripple={{ color: tokens.chipBg }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                minHeight: 52,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {/* flex + minWidth:0 so a long az/ru subject name wraps instead of
                  pushing the chevron off a 320pt screen. */}
              <AppText
                variant="label"
                numberOfLines={2}
                style={{ flex: 1, minWidth: 0, fontSize: 15 }}
              >
                {label}
              </AppText>
              <View style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
                <ChevronDown
                  size={18}
                  color={isOpen ? tokens.accent : tokens.muted}
                  strokeWidth={2}
                />
              </View>
            </Pressable>

            {isOpen && chosen ? (
              <View
                style={{
                  paddingHorizontal: spacing.md,
                  paddingBottom: spacing.md,
                  gap: spacing.md,
                }}
              >
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t("mob.iap.choosePeriod")}
                  style={{ gap: spacing.sm }}
                >
                  {group.offers.map((offer) => (
                    <PeriodOption
                      key={offer.productId}
                      offer={offer}
                      selected={offer.productId === chosen.productId}
                      disabled={busy}
                      onPress={() => onPick(group.subjectId, offer.interval)}
                    />
                  ))}
                </View>
                {/* ONE action per subject. Its label carries the chosen
                    period's price — Apple's string, untouched — so what the
                    sheet will charge is written on the button that opens it. */}
                <Button
                  title={`${t("mob.iap.activate")} · ${chosen.displayPrice}`}
                  pending={pendingId === chosen.productId}
                  pendingTitle={t("mob.iap.working")}
                  disabled={busy && pendingId !== chosen.productId}
                  onPress={() => onActivate(chosen)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** One period of one subject: a radio option with StoreKit's price on it. */
function PeriodOption({
  offer,
  selected,
  disabled,
  onPress,
}: {
  offer: IapOffer;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const period = t(INTERVAL_NAME_KEY[offer.interval]);
  return (
    <Pressable
      accessibilityRole="radio"
      // The price is part of what is being chosen, so it is part of the label.
      accessibilityLabel={`${period}, ${offer.displayPrice}`}
      accessibilityState={{ checked: selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 48,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.sm,
        // Same width selected or not, so choosing a period never shifts the
        // rows; only the colour changes.
        borderWidth: 2,
        borderColor: selected ? tokens.accent : tokens.border,
        backgroundColor: selected ? tokens.pillBg : tokens.surface,
        // One-decimal opacities: this module's no-amount sweep treats any
        // two-decimal literal as a price, and it is right to be that blunt.
        opacity: disabled && !selected ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {/* Radio mark — fixed-size art, not layout. */}
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? tokens.accent : tokens.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          <View
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent }}
          />
        ) : null}
      </View>
      <AppText variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>
        {period}
      </AppText>
      {/* Apple's string, untouched. Allowed to wrap rather than truncate: a
          clipped price is worse than a taller row. */}
      <AppText
        variant="label"
        // pillText, not accent: it is the readable ink on pillBg in both themes.
        color={selected ? tokens.pillText : tokens.text}
        style={{ flexShrink: 1, textAlign: "right" }}
      >
        {offer.displayPrice}
      </AppText>
    </Pressable>
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
