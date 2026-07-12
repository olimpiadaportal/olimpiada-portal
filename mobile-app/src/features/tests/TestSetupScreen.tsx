// TEST ENGINE (M3) — setup screen (web /child/test/[subjectId] + TestSetup
// parity, Round-19 contract): single-select Topic (EXAM-scoped taxonomy) then
// Subtopic — BOTH MANDATORY, subtopic waived only when the topic has zero
// subtopics; changing topic resets the subtopic; pressing the (visually)
// disabled Start surfaces the trilingual warning + highlights the missing
// field. The instructions/consent gate precedes start_topic_test_attempt;
// client checks are UX only — the RPC re-enforces everything server-side.
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { startTopicTestAttempt } from "./api";
import { useSetupTopics, useSubjectAccess } from "./queries";
import { setupSelectionValid } from "./logic";
import { SelectField } from "./SelectField";
import { ArenaButton, BackBar, Eyebrow, Notice, Panel, tint, useArena } from "./ui";

export function TestSetupScreen({ subjectId }: { subjectId: string }) {
  const { t } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const accessQ = useSubjectAccess();
  const topicsQ = useSetupTopics(subjectId);

  const [topicId, setTopicId] = useState("");
  const [subId, setSubId] = useState("");
  const [consent, setConsent] = useState(false);
  const [warned, setWarned] = useState(false);
  const [starting, setStarting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const pad = {
    paddingTop: insets.top + spacing.md,
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
    paddingBottom: insets.bottom + spacing.xl,
    gap: spacing.lg,
  } as const;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(student)/(tabs)/tests");
  };

  if (accessQ.isPending || topicsQ.isPending) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg }]}>
        <Skeleton height={16} width="30%" />
        <Skeleton height={26} width="60%" />
        <Skeleton height={130} />
        <Skeleton height={220} />
      </View>
    );
  }

  if (accessQ.isError || topicsQ.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <ErrorRetry
          message={t("test.err.generic")}
          retryLabel={t("mob.retry")}
          onRetry={() => {
            void accessQ.refetch();
            void topicsQ.refetch();
          }}
        />
      </View>
    );
  }

  const access = accessQ.data!;
  const subject = access.subjects.find((s) => s.id === subjectId) ?? null;

  // Availability check (web parity: the start RPC re-checks; this keeps the UI
  // honest) — a subject outside the covered/free set never shows a picker.
  if (!access.hasAccess || !subject) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg }]}>
        <BackBar arena={arena} label={t("test.run.back")} onPress={goBack} />
        <Notice arena={arena} warn>
          {t("test.err.noAccess")}
        </Notice>
      </View>
    );
  }

  const topics = topicsQ.data ?? [];
  const topic = topics.find((tp) => tp.id === topicId) ?? null;
  const hasSubs = (topic?.subtopics.length ?? 0) > 0;
  const selectionValid = setupSelectionValid(topicId, hasSubs, subId);

  const showWarn = warned && !selectionValid;
  const topicInvalid = showWarn && topicId === "";
  const subInvalid = showWarn && topicId !== "" && hasSubs && subId === "";
  const startDisabled = starting || !consent || !selectionValid;

  const start = async () => {
    // A press on the visually-disabled button surfaces the selection warning
    // (web wrapper-click parity); consent/pending presses stay inert.
    if (!selectionValid) {
      setWarned(true);
      return;
    }
    if (!consent || starting) return;
    setStarting(true);
    setServerError(null);
    try {
      const res = await startTopicTestAttempt(
        subjectId,
        [topicId],
        subId ? [subId] : [],
      );
      if (res.ok) {
        // replace: leaving the runner must never land back on the consent gate.
        router.replace({
          pathname: "/(student)/test/run/[attemptId]",
          params: { attemptId: res.data.attempt_id, resumed: res.data.resumed ? "1" : "0" },
        });
        return;
      }
      setServerError(t(res.errorKey));
    } catch {
      setServerError(t("test.err.generic"));
    }
    setStarting(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: arena.bg }} contentContainerStyle={pad}>
      <BackBar arena={arena} label={t("test.run.back")} onPress={goBack} />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow arena={arena}>{t("test.setup.eyebrow")}</Eyebrow>
        <AppText variant="heading" color={arena.ink}>
          {subject.name}
        </AppText>
      </View>

      {/* ---- Topic + subtopic picker (both mandatory) ---- */}
      <AppText variant="title" color={arena.ink}>
        {t("test.setup.topicsTitle")}
      </AppText>
      <Panel arena={arena} style={{ gap: spacing.lg }}>
        <AppText color={arena.muted} style={{ fontSize: 13, lineHeight: 19 }}>
          {t("test.setup.pickHint")}
        </AppText>
        {topics.length === 0 ? (
          <AppText color={arena.muted}>{t("test.setup.noTopics")}</AppText>
        ) : (
          <>
            <SelectField
              arena={arena}
              label={t("test.setup.topic")}
              placeholder={t("test.setup.topicPh")}
              options={topics.map((tp) => ({ id: tp.id, name: tp.name }))}
              value={topicId}
              invalid={topicInvalid}
              onSelect={(id) => {
                setTopicId(id);
                // Changing the topic always resets the chosen subtopic.
                setSubId("");
              }}
            />
            <SelectField
              arena={arena}
              label={t("test.setup.subtopic")}
              placeholder={
                topic && !hasSubs ? t("test.setup.noSubtopics") : t("test.setup.subtopicPh")
              }
              options={(topic?.subtopics ?? []).map((s) => ({ id: s.id, name: s.name }))}
              value={subId}
              disabled={!topic || !hasSubs}
              invalid={subInvalid}
              note={topic && !hasSubs ? t("test.setup.noSubtopics") : undefined}
              onSelect={setSubId}
            />
          </>
        )}
      </Panel>

      {/* ---- Instructions / consent gate ---- */}
      <AppText variant="title" color={arena.ink}>
        {t("test.setup.rulesTitle")}
      </AppText>
      <Panel arena={arena} style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {[t("test.setup.qCount"), t("test.setup.duration")].map((fact) => (
            <View
              key={fact}
              style={{
                backgroundColor: arena.panel2,
                borderColor: arena.line,
                borderWidth: 1,
                borderRadius: radius.sm,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
              }}
            >
              <AppText variant="mono" color={arena.ink} style={{ fontSize: 13 }}>
                {fact}
              </AppText>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={{ flexDirection: "row", gap: spacing.sm }}>
              <AppText color={arena.dim}>•</AppText>
              <AppText color={arena.muted} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {t(`test.setup.rule${n}`)}
              </AppText>
            </View>
          ))}
        </View>

        <AppText color={arena.muted} style={{ fontSize: 14, lineHeight: 20 }}>
          <AppText variant="label" color={arena.ink} style={{ fontSize: 14 }}>
            {t("test.setup.scoringTitle")}:
          </AppText>{" "}
          {t("test.setup.scoring")}
        </AppText>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          accessibilityLabel={t("test.setup.consent")}
          onPress={() => setConsent((c) => !c)}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: consent ? arena.lime : arena.line,
              backgroundColor: consent ? tint(arena.lime, 0.18) : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {consent ? (
              <AppText color={arena.lime} style={{ fontSize: 13, lineHeight: 15 }}>
                ✓
              </AppText>
            ) : null}
          </View>
          <AppText color={arena.ink} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
            {t("test.setup.consent")}
          </AppText>
        </Pressable>

        {showWarn ? (
          <AppText color={arena.red} style={{ fontSize: 13 }}>
            {t("test.setup.selectWarn")}
          </AppText>
        ) : null}
        {serverError ? (
          <AppText color={arena.red} style={{ fontSize: 13 }}>
            {serverError}
          </AppText>
        ) : null}

        <ArenaButton
          arena={arena}
          title={t("test.setup.start")}
          pendingTitle={t("test.setup.starting")}
          pending={starting}
          disabled={startDisabled}
          pressThroughDisabled
          onPress={start}
        />
      </Panel>
    </ScrollView>
  );
}
