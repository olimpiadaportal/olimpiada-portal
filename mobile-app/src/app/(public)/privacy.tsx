// Public Privacy Policy (web /privacy, /help/privacy and /child/help/privacy
// parity — the RN counterpart of web-app/src/components/PrivacyPolicy.tsx).
//
// WHY IT IS A REAL SCREEN AND NOT A LINK OUT
// ------------------------------------------
// Apple Guideline 5.1.4(b) expects a product directed at minors to carry its
// children's privacy policy INSIDE the app, not only in App Store Connect. On
// top of that, docs/STORE_PAYMENTS_COMPLIANCE.md forbids handing a CHILD an
// external https link out of the app at all. So the policy is rendered here,
// from the same `privacy.*` catalog keys the web page renders, and no
// Linking.openURL exists on this screen.
//
// REACHABLE FROM: the account sheet's INFO section (both roles, signed in) and
// the Login + Register screens (signed out — a store reviewer checks before
// creating an account). The (public) layout does NOT bounce this route for
// either role, so a student session reaches it exactly like About/FAQ/Contact.
//
// WHERE THE CONTENT COMES FROM
//   * the words  → the `privacy.*` keys synced from web-app/src/i18n/messages.ts
//     by scripts/sync-i18n.mjs, which mirror docs/PRIVACY_POLICY.md — the
//     document the owner submits to App Store Connect and Google Play. Nothing
//     is hardcoded here and nothing is duplicated into messages.mobile.ts.
//   * the facts the code cannot know (effective date, hosting region, retention
//     periods) → lib/privacyPolicy.ts, the guarded mirror of the web constant.
//     An unanswered one renders a neutral "to be confirmed" chip rather than an
//     invented fact.
//   * the contact details → the admin control plane (get_mobile_config
//     contact.*), the same source the Contact screen uses, so the policy can
//     never quote an address the rest of the product has moved on from.
//
// DRAFT STATE: with no effective date set the screen leads with a plain notice
// that the document is not yet in force. Filling `effectiveDate` in removes it.
//
// LAYOUT: everything is rendered expanded — a legal document behind accordions
// is a document a reviewer (and a parent) will not read. The section index at
// the top is the web page's table of contents; tapping a chip scrolls to that
// section using its measured offset, which is the RN equivalent of an anchor.
import React, { useCallback, useRef } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShieldCheck } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { CmsProse } from "@/components/CmsProse";
import { PolicyKv, PolicyList, PolicyTable } from "@/features/public/PolicyBlocks";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, lineHeight, radius, spacing } from "@/theme/tokens";
import { useContentOverrides, useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import {
  isPrivacyPolicyDraft,
  resolvePrivacyPolicyStatus,
} from "@/lib/privacyPolicy";
import { useT } from "@/i18n/useT";

const SECTION_IDS = [
  "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

export default function Privacy() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const config = useMobileConfig();

  // Every string is CMS-overridable and the contact rows come from the control
  // plane, so a pull must re-read both — same contract as About/FAQ/Contact.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([config, overridesQ]);

  // Section offsets for the index chips. Measured rather than estimated: the
  // three languages wrap to different heights and an estimated offset would
  // land mid-paragraph in ru.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionId, number>>>({});
  const measure = useCallback(
    (id: SectionId) => (y: number) => {
      offsets.current[id] = y;
    },
    [],
  );
  const jumpTo = (id: SectionId) => {
    const y = offsets.current[id];
    if (y === undefined) return;
    // A little headroom so the heading is not flush against the header.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
  };

  // Migration 097: the admin owns these facts. `config.data` is undefined on
  // first paint and stays undefined offline — and this screen MUST work signed
  // out and offline (Apple 5.1.4(b)) — so the resolver falls back to the
  // compiled-in defaults rather than rendering a page of "to be confirmed".
  const policy = resolvePrivacyPolicyStatus(config.data?.privacy);

  const draft = isPrivacyPolicyDraft(policy);
  const tbd = t("privacy.tbd");

  const supportEmail = (config.data?.contact.email ?? "").trim();
  // Dedicated privacy mailbox if the owner set one, otherwise the same support
  // address the Contact screen publishes — never a made-up one.
  const privacyEmail = policy.privacyEmail.trim() || supportEmail;
  const address = (config.data?.contact.address ?? "").trim() || t("privacy.s2.addressValue");

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.privacy"),
          headerStyle: { backgroundColor: tokens.surface },
          headerTitleStyle: { color: tokens.text },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            accessibilityLabel={t("mob.refreshing")}
          />
        }
      >
        {/* Hero */}
        <Card variant="hero" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.sm,
                backgroundColor: tokens.pillBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={18} color={tokens.accent} strokeWidth={2} />
            </View>
            {/* flex + minWidth:0 so the az/ru eyebrow truncates instead of
                pushing the chip off a 320pt screen. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="eyebrow" numberOfLines={1}>
                {t("privacy.eyebrow")}
              </AppText>
            </View>
          </View>
          <AppText
            variant="title"
            accessibilityRole="header"
            style={{ lineHeight: lineHeight.subtitle }}
          >
            {t("privacy.title")}
          </AppText>
          <CmsProse text={t("privacy.lead")} style={{ lineHeight: lineHeight.body }} />
          <View style={{ gap: spacing.sm }}>
            <PolicyKv
              label={t("privacy.effective")}
              value={policy.effectiveDate}
              tbd={tbd}
            />
            <PolicyKv
              label={t("privacy.updated")}
              value={policy.lastUpdated}
              tbd={tbd}
            />
          </View>
        </Card>

        {/* Draft notice — shown until an effective date is set. */}
        {draft ? (
          <Card
            accessibilityRole="summary"
            style={{
              gap: spacing.sm,
              borderColor: tokens.warn,
              backgroundColor: tokens.chipBg,
            }}
          >
            <AppText variant="label" color={tokens.warn}>
              {t("privacy.draft.title")}
            </AppText>
            {/* Full text colour, not muted: muted grey on chipBg measures
                2.86:1 in the LIGHT theme (below AA) — see (public)/about.tsx.
                The same applies to every tinted block on this screen. */}
            <CmsProse
              text={t("privacy.draft.body")}
              variant="body"
              style={{ fontSize: fontSize.sm, lineHeight: lineHeight.compact }}
            />
          </Card>
        ) : null}

        {/* Section index — the web page's table of contents. Wrapped chips so
            13 entries reflow rather than overflow at 320pt. */}
        <Card style={{ gap: spacing.md }}>
          <AppText variant="eyebrow">{t("privacy.toc")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {SECTION_IDS.map((id, i) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={t(`privacy.${id}.title`)}
                onPress={() => jumpTo(id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  backgroundColor: tokens.pillBg,
                  borderRadius: 999,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  // 36 matches the Contact screen's social pills. No hitSlop:
                  // the chips wrap with an 8pt gap and generous slop on
                  // neighbours steals taps (the lesson recorded in welcome.tsx).
                  minHeight: 36,
                  // Never wider than the card, however long the ru title runs.
                  maxWidth: "100%",
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <AppText variant="mono" color={tokens.pillText} style={{ fontSize: 11 }}>
                  {i + 1}
                </AppText>
                {/* Wraps to a second line rather than truncating: the longest
                    ru titles ("Ваши права и как ими воспользоваться") do not
                    fit one line inside a 256pt card at 320pt, and a clipped
                    index entry is worse than an uneven pill height. */}
                <AppText
                  variant="label"
                  color={tokens.pillText}
                  numberOfLines={2}
                  style={{ flexShrink: 1, minWidth: 0 }}
                >
                  {t(`privacy.${id}.title`)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* 1 — the short version */}
        <Section id="s1" t={t} onMeasure={measure("s1")}>
          <SubHeading>{t("privacy.s1.doTitle")}</SubHeading>
          <PolicyList text={t("privacy.s1.do")} variant="yes" />
          <SubHeading>{t("privacy.s1.dontTitle")}</SubHeading>
          <PolicyList text={t("privacy.s1.dont")} variant="no" />
        </Section>

        {/* 2 — who we are */}
        <Section id="s2" t={t} onMeasure={measure("s2")}>
          <View style={{ gap: spacing.md }}>
            <PolicyKv
              label={t("privacy.s2.product")}
              value={t("privacy.s2.productValue")}
              tbd={tbd}
            />
            <PolicyKv
              label={t("privacy.s2.operator")}
              value={t("privacy.s2.operatorValue")}
              tbd={tbd}
            />
            <PolicyKv label={t("privacy.s2.address")} value={address} tbd={tbd} />
            <PolicyKv label={t("privacy.s2.email")} value={supportEmail} tbd={tbd} />
            <PolicyKv
              label={t("privacy.s2.phone")}
              value={config.data?.contact.phone ?? ""}
              tbd={tbd}
            />
            <PolicyKv
              label={t("privacy.s2.website")}
              value={policy.websiteUrl}
              tbd={tbd}
            />
            <PolicyKv
              label={t("privacy.s2.requests")}
              value={privacyEmail}
              tbd={tbd}
            />
          </View>
          <Prose>{t("privacy.s2.note")}</Prose>
        </Section>

        {/* 3 — family account model */}
        <Section id="s3" t={t} onMeasure={measure("s3")}>
          <Prose>{t("privacy.s3.intro")}</Prose>
          <PolicyList text={t("privacy.s3.points")} />
          <Prose emphasis>{t("privacy.s3.result")}</Prose>
        </Section>

        {/* 4 — what we collect */}
        <Section id="s4" t={t} onMeasure={measure("s4")}>
          <SubHeading>{t("privacy.s4.parentTitle")}</SubHeading>
          <PolicyTable text={t("privacy.s4.parentTable")} />
          <Prose>{t("privacy.s4.parentNote")}</Prose>

          <SubHeading>{t("privacy.s4.childTitle")}</SubHeading>
          <PolicyTable text={t("privacy.s4.childTable")} />
          <Prose emphasis>{t("privacy.s4.childNoDob")}</Prose>
          <Prose>{t("privacy.s4.childEditable")}</Prose>

          <SubHeading>{t("privacy.s4.techTitle")}</SubHeading>
          <PolicyTable text={t("privacy.s4.techTable")} />
          <PolicyKv
            label={t("privacy.s4.logRetention")}
            value={policy.serverLogRetention}
            tbd={tbd}
          />

          <SubHeading>{t("privacy.s4.deviceTitle")}</SubHeading>
          <Prose>{t("privacy.s4.deviceIntro")}</Prose>
          <PolicyList text={t("privacy.s4.deviceList")} />
          <Prose>{t("privacy.s4.deviceNote")}</Prose>

          <SubHeading>{t("privacy.s4.cookiesTitle")}</SubHeading>
          <Prose>{t("privacy.s4.cookiesIntro")}</Prose>
          <PolicyList text={t("privacy.s4.cookiesList")} />
          <Prose emphasis>{t("privacy.s4.cookiesNote")}</Prose>
        </Section>

        {/* 5 — children's data (doubles as the children's privacy policy) */}
        <Section id="s5" t={t} onMeasure={measure("s5")}>
          <Callout>{t("privacy.s5.callout")}</Callout>

          <SubHeading>{t("privacy.s5.storedTitle")}</SubHeading>
          <Prose>{t("privacy.s5.stored")}</Prose>
          <Prose emphasis>{t("privacy.s5.notCollected")}</Prose>

          <SubHeading>{t("privacy.s5.neverTitle")}</SubHeading>
          <PolicyList text={t("privacy.s5.never")} variant="no" />

          <SubHeading>{t("privacy.s5.lbTitle")}</SubHeading>
          <Prose>{t("privacy.s5.lbIntro")}</Prose>
          <MinorHeading>{t("privacy.s5.lb1Title")}</MinorHeading>
          <Prose>{t("privacy.s5.lb1Intro")}</Prose>
          <PolicyTable text={t("privacy.s5.lb1Table")} />
          <Prose>{t("privacy.s5.lb1Note")}</Prose>
          <MinorHeading>{t("privacy.s5.lb2Title")}</MinorHeading>
          <Prose>{t("privacy.s5.lb2Body")}</Prose>
          <Warn>{t("privacy.s5.lbWarn")}</Warn>
          <Prose>{t("privacy.s5.lbNoMedals")}</Prose>

          <SubHeading>{t("privacy.s5.avatarTitle")}</SubHeading>
          <PolicyTable text={t("privacy.s5.avatarTable")} />
          <Warn>{t("privacy.s5.avatarWarn")}</Warn>
          <Prose>{t("privacy.s5.avatarUnlink")}</Prose>

          <SubHeading>{t("privacy.s5.removeTitle")}</SubHeading>
          <PolicyList text={t("privacy.s5.removeList")} />
          <Prose>{t("privacy.s5.removeNote")}</Prose>
        </Section>

        {/* 6 — how we use the data */}
        <Section id="s6" t={t} onMeasure={measure("s6")}>
          <SubHeading>{t("privacy.s6.useTitle")}</SubHeading>
          <PolicyList text={t("privacy.s6.use")} variant="num" />
          <SubHeading>{t("privacy.s6.notTitle")}</SubHeading>
          <PolicyList text={t("privacy.s6.not")} variant="no" />
        </Section>

        {/* 7 — who we share with */}
        <Section id="s7" t={t} onMeasure={measure("s7")}>
          {/* Internal access first — mirrors web PrivacyPolicy.tsx. */}
          <SubHeading>{t("privacy.s7.staffTitle")}</SubHeading>
          <Prose>{t("privacy.s7.staff")}</Prose>
          <Prose>{t("privacy.s7.intro")}</Prose>
          <PolicyTable text={t("privacy.s7.table")} />
          <Prose>
            {policy.pushLive ? t("privacy.s7.pushOn") : t("privacy.s7.pushOff")}
          </Prose>
          <Prose>{t("privacy.s7.otherIntro")}</Prose>
          <PolicyList text={t("privacy.s7.other")} />
          <PolicyKv
            label={t("privacy.s7.regionLabel")}
            value={policy.hostingRegion}
            tbd={tbd}
          />
        </Section>

        {/* 8 — payments */}
        <Section id="s8" t={t} onMeasure={measure("s8")}>
          <PolicyList text={t("privacy.s8.list")} />
          <Prose emphasis>
            {policy.paymentsLive
              ? t("privacy.s8.statusOn")
              : t("privacy.s8.statusOff")}
          </Prose>
        </Section>

        {/* 9 — retention and deletion */}
        <Section id="s9" t={t} onMeasure={measure("s9")}>
          <SubHeading>{t("privacy.s9.activeTitle")}</SubHeading>
          <Prose>{t("privacy.s9.activeBody")}</Prose>
          <Prose>{t("privacy.s9.notifRetention")}</Prose>
          <PolicyKv
            label={t("privacy.s9.otherRetention")}
            value={policy.learningDataRetention}
            tbd={tbd}
          />

          <SubHeading>{t("privacy.s9.howTitle")}</SubHeading>
          <Prose>{t("privacy.s9.howBody")}</Prose>
          <Prose emphasis>{t("privacy.s9.howNote")}</Prose>

          <SubHeading>{t("privacy.s9.erasedTitle")}</SubHeading>
          <Prose>{t("privacy.s9.erasedIntro")}</Prose>
          <PolicyList text={t("privacy.s9.erased")} />

          <SubHeading>{t("privacy.s9.survivesTitle")}</SubHeading>
          <Prose>{t("privacy.s9.survivesIntro")}</Prose>
          <PolicyTable text={t("privacy.s9.survivesTable")} />
          <Prose>{t("privacy.s9.backupNote")}</Prose>
          <PolicyKv
            label={t("privacy.s9.backupLabel")}
            value={policy.backupRetention}
            tbd={tbd}
          />

          <SubHeading>{t("privacy.s9.copyTitle")}</SubHeading>
          <Prose>{t("privacy.s9.copyBody")}</Prose>
        </Section>

        {/* 10 — security */}
        <Section id="s10" t={t} onMeasure={measure("s10")}>
          <Prose>{t("privacy.s10.intro")}</Prose>
          <PolicyList text={t("privacy.s10.list")} variant="yes" />
          <Warn>{t("privacy.s10.caveat")}</Warn>
        </Section>

        {/* 11 — your rights */}
        <Section id="s11" t={t} onMeasure={measure("s11")}>
          <PolicyTable text={t("privacy.s11.table")} />
          <Prose>{t("privacy.s11.note")}</Prose>
        </Section>

        {/* 12 — device permissions */}
        <Section id="s12" t={t} onMeasure={measure("s12")}>
          <PolicyTable text={t("privacy.s12.table")} />
          <Prose emphasis>{t("privacy.s12.never")}</Prose>
        </Section>

        {/* 13 — changes */}
        <Section id="s13" t={t} onMeasure={measure("s13")}>
          <Prose>{t("privacy.s13.body")}</Prose>
          <PolicyKv label={t("privacy.s13.contact")} value={privacyEmail} tbd={tbd} />
        </Section>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Local typography blocks — one tier below the web's desktop sizes.    */
/* ------------------------------------------------------------------ */

/** A numbered top-level section card that reports its own scroll offset. */
function Section({
  id,
  t,
  onMeasure,
  children,
}: {
  id: SectionId;
  t: (key: string) => string;
  onMeasure: (y: number) => void;
  children: React.ReactNode;
}) {
  return (
    <Card
      // Offset within the ScrollView's content, which is what scrollTo wants.
      onLayout={(e) => onMeasure(e.nativeEvent.layout.y)}
      style={{ gap: spacing.md }}
    >
      <AppText
        variant="subtitle"
        accessibilityRole="header"
        style={{ lineHeight: lineHeight.subtitle }}
      >
        {t(`privacy.${id}.title`)}
      </AppText>
      {children}
    </Card>
  );
}

/** h3 tier inside a section. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="label" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
      {children}
    </AppText>
  );
}

/** The web's `.pp-subhead` — a labelled block inside an h3 group. */
function MinorHeading({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <AppText variant="eyebrow" color={tokens.pillText} accessibilityRole="header">
      {children}
    </AppText>
  );
}

/** Body copy. `emphasis` = the web's `.pp-strong` (full text contrast). */
function Prose({
  children,
  emphasis = false,
}: {
  children: string;
  emphasis?: boolean;
}) {
  return (
    <CmsProse
      text={children}
      variant={emphasis ? "body" : "muted"}
      gap={spacing.sm}
      style={{ lineHeight: lineHeight.compact }}
    />
  );
}

/**
 * The web's `.pp-callout` and `.pp-warn` — a tinted, framed block. Both carry
 * FULL text colour rather than the muted tier used on the plain card surface:
 * muted grey on chipBg/pillBg measures 2.86:1 in the LIGHT theme (below AA),
 * the measurement recorded in (public)/about.tsx. These blocks also hold the
 * disclosures that matter most — the leaderboard re-identification warning and
 * the public-avatar-bucket warning — so they are the last place to be subtle.
 */
function TintedBlock({
  children,
  borderColor,
  backgroundColor,
}: {
  children: string;
  borderColor: string;
  backgroundColor: string;
}) {
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor,
        backgroundColor,
      }}
    >
      <CmsProse
        text={children}
        variant="body"
        gap={spacing.sm}
        style={{ fontSize: fontSize.sm, lineHeight: lineHeight.compact }}
      />
    </View>
  );
}

/** Accent-tinted: "read this, it explains the section". */
function Callout({ children }: { children: string }) {
  const { tokens } = useTheme();
  return (
    <TintedBlock borderColor={tokens.accent} backgroundColor={tokens.pillBg}>
      {children}
    </TintedBlock>
  );
}

/** Warn-tinted: an honest warning about a real weakness. */
function Warn({ children }: { children: string }) {
  const { tokens } = useTheme();
  return (
    <TintedBlock borderColor={tokens.warn} backgroundColor={tokens.chipBg}>
      {children}
    </TintedBlock>
  );
}
