// TEST ENGINE (M3) — the timed player (web TestRunner.tsx ported natively).
// ONE shared engine for kind='test' AND kind='olympiad' (migration 047): the
// wording, exit tab and header label derive from the attempt's kind, never
// from the route. Server-authoritative countdown (local anchor recomputed from
// every save/get response; ticks never decrement state), 30s autosave +
// save-on-navigate/flag, palette, bookmark, confirmed submit/cancel, deadline
// auto-submit (server keeps a 60s grace), TRUE resume, and the leave guard
// (Android hardware back + navigation beforeRemove → confirm dialog; never for
// the runner's own controls).
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { cancelTestAttempt, saveTestAnswers, submitTestAttempt } from "./api";
import { useTestAttempt } from "./queries";
import {
  AUTOSAVE_MS,
  LETTERS,
  buildAnswerItems,
  countAnswered,
  deadlineFromRemaining,
  fmtClock,
  initialAnswers,
  initialFlags,
  remainingFrom,
  timerLevel,
  type AnswersMap,
} from "./logic";
import type { AttemptMeta, TestAttemptData } from "./types";
import { ConfirmModal } from "./ConfirmModal";
import { ArenaButton, Notice, Panel, tint, useArena } from "./ui";

const TESTS_TAB = "/(student)/(tabs)/tests" as const;
const OLYMPIADS_TAB = "/(student)/(tabs)/olympiads" as const;

// Instagram-style bookmark glyph (web BookmarkIcon parity).
function BookmarkIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? color : "none"}>
      <Path
        d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TestRunnerScreen({
  attemptId,
  resumed,
}: {
  attemptId: string;
  resumed: boolean;
}) {
  const { t, locale } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const q = useTestAttempt(attemptId, locale, attemptId.length > 0);
  const attempt = q.data?.attempt ?? null;

  // Closed attempts never open the player (web run-page guards).
  const isGraded = attempt?.status === "graded";
  const isClosed = attempt !== null && !isGraded && attempt.status !== "in_progress";
  const homeTab = attempt?.kind === "olympiad" ? OLYMPIADS_TAB : TESTS_TAB;

  useEffect(() => {
    if (isGraded) {
      router.replace({
        pathname: "/(student)/test/result/[attemptId]",
        params: { attemptId },
      });
    }
  }, [isGraded, attemptId, router]);

  const pad = {
    paddingTop: insets.top + spacing.md,
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
    paddingBottom: insets.bottom + spacing.xl,
  } as const;

  if (q.isPending || isGraded) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg, gap: spacing.lg }]}>
        <Skeleton height={26} />
        <Skeleton height={240} />
        <Skeleton height={48} />
        <Skeleton height={140} />
      </View>
    );
  }

  if (q.isError || !attempt) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <ErrorRetry
          message={t("test.err.generic")}
          retryLabel={t("mob.retry")}
          onRetry={() => void q.refetch()}
        />
      </View>
    );
  }

  if (isClosed) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg, gap: spacing.lg }]}>
        <Notice arena={arena} warn>
          {t("test.home.noticeClosed")}
        </Notice>
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={t("test.run.back")}
          onPress={() => router.replace(homeTab)}
        />
      </View>
    );
  }

  return (
    <RunnerActive
      key={attempt.attempt_id}
      attemptId={attemptId}
      attempt={attempt}
      meta={q.data!.meta}
      resumed={resumed}
      arena={arena}
      pad={pad}
    />
  );
}

// ---------------------------------------------------------------------------
// The live player — mounted only for an in_progress attempt with data present
// (state initializers can trust props, mirroring the web server→client split).
// ---------------------------------------------------------------------------
function RunnerActive({
  attemptId,
  attempt,
  meta,
  resumed,
  arena,
  pad,
}: {
  attemptId: string;
  attempt: TestAttemptData;
  meta: AttemptMeta;
  resumed: boolean;
  arena: ArenaTokens;
  pad: object;
}) {
  const { t } = useT();
  const router = useRouter();
  const navigation = useNavigation();

  const isOlympiad = attempt.kind === "olympiad";
  const homeTab = isOlympiad ? OLYMPIADS_TAB : TESTS_TAB;
  const questions = attempt.questions;
  const total = questions.length;

  // ---- answers / flags (rehydrated from saved rows — TRUE resume) ----
  const [answers, setAnswers] = useState<AnswersMap>(() => initialAnswers(questions));
  const [flags, setFlags] = useState<Set<string>>(() => initialFlags(questions));
  const [idx, setIdx] = useState(0);

  // ---- countdown: anchor from the server snapshot; resynced on every save ----
  const [remaining, setRemaining] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // ---- lifecycle guards / autosave bookkeeping (refs: no re-renders) ----
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const flagsRef = useRef(flags);
  flagsRef.current = flags;
  const dirtyRef = useRef<Set<string>>(new Set());
  const savingRef = useRef(false);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);
  const leavingRef = useRef(false);
  const spentRef = useRef<Map<string, number>>(new Map());
  const lastSwitchRef = useRef<number>(Date.now());
  const idxRef = useRef(idx);
  idxRef.current = idx;
  // Held navigation action from beforeRemove; null = hardware-back origin.
  const pendingActionRef = useRef<unknown>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [timeUp, setTimeUp] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const answeredCount = useMemo(
    () => countAnswered(questions, answers),
    [questions, answers],
  );
  const unanswered = total - answeredCount;

  function noteTimeSpent() {
    const now = Date.now();
    const q = questions[idxRef.current];
    if (q) {
      const cur = spentRef.current.get(q.question_id) ?? 0;
      spentRef.current.set(q.question_id, cur + (now - lastSwitchRef.current));
      dirtyRef.current.add(q.question_id);
    }
    lastSwitchRef.current = now;
  }

  const buildItems = useCallback(
    (qids: string[]) =>
      buildAnswerItems(qids, answersRef.current, flagsRef.current, spentRef.current),
    [],
  );

  // ---- submit (manual confirm + timer-zero / deadline-signal auto path) ----
  const doSubmit = useCallback(async () => {
    if (submittingRef.current || finishedRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitOpen(false);
    try {
      const items = buildItems(questions.map((q) => q.question_id));
      await submitTestAttempt(attemptId, items);
      finishedRef.current = true;
      router.replace({
        pathname: "/(student)/test/result/[attemptId]",
        params: { attemptId },
      });
      return;
    } catch {
      setFatal(t("test.err.generic"));
    }
    submittingRef.current = false;
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, questions, buildItems, router]);
  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // ---- autosave (dirty batch; `resync` forces an empty save purely to pull a
  // fresh remaining_seconds — e.g. returning from background) ----
  const flush = useCallback(
    async (opts?: { resync?: boolean }) => {
      if (savingRef.current || submittingRef.current || finishedRef.current) return;
      const qids = Array.from(dirtyRef.current);
      if (qids.length === 0 && !opts?.resync) return;
      savingRef.current = true;
      if (qids.length > 0) setSaveState("saving");
      try {
        const res = await saveTestAnswers(attemptId, buildItems(qids));
        if (res.ok) {
          for (const q of qids) dirtyRef.current.delete(q);
          if (typeof res.remaining === "number") {
            // Deadline resync: the SERVER remaining is the truth.
            deadlineRef.current = deadlineFromRemaining(Date.now(), res.remaining);
            setRemaining(remainingFrom(deadlineRef.current, Date.now()));
          }
          if (qids.length > 0) setSaveState("saved");
        } else if (res.deadline) {
          // Server says time is over → auto-submit (60s grace server-side).
          setTimeUp(true);
          savingRef.current = false;
          void doSubmitRef.current();
          return;
        }
      } catch {
        setSaveState("error");
      }
      savingRef.current = false;
    },
    [attemptId, buildItems],
  );
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // ---- mount: clock + autosave interval + foreground resync ----
  useEffect(() => {
    deadlineRef.current = deadlineFromRemaining(Date.now(), attempt.remaining_seconds);
    setRemaining(remainingFrom(deadlineRef.current, Date.now()));

    const tick = setInterval(() => {
      setRemaining(remainingFrom(deadlineRef.current, Date.now()));
    }, 500);
    const saver = setInterval(() => void flushRef.current(), AUTOSAVE_MS);

    // Foreground → resync the deadline from the server (JS timers were
    // suspended; the anchor math stays correct but the server may have closed
    // the attempt meanwhile). Background → best-effort save.
    const sub = AppState.addEventListener("change", (state) => {
      if (finishedRef.current) return;
      if (state === "active") void flushRef.current({ resync: true });
      else void flushRef.current();
    });

    return () => {
      clearInterval(tick);
      clearInterval(saver);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 0:00 → auto-submit once ----
  useEffect(() => {
    if (remaining === 0 && !finishedRef.current && !submittingRef.current) {
      setTimeUp(true);
      void doSubmitRef.current();
    }
  }, [remaining]);

  // ---- leave guard: navigation beforeRemove + Android hardware back ----
  useEffect(() => {
    const unsub = (navigation as any).addListener("beforeRemove", (e: any) => {
      if (finishedRef.current || leavingRef.current) return;
      e.preventDefault();
      pendingActionRef.current = e?.data?.action ?? null;
      setLeaveOpen(true);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (finishedRef.current || leavingRef.current) return false;
      pendingActionRef.current = null;
      setLeaveOpen(true);
      return true; // swallow: the confirm dialog decides
    });
    return () => sub.remove();
  }, []);

  const continueTest = () => setLeaveOpen(false);

  const confirmLeave = () => {
    leavingRef.current = true;
    // Best-effort save on the way out; the server autosave is the safety net.
    void flushRef.current();
    setLeaveOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      (navigation as any).dispatch(action);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homeTab);
    }
  };

  // ---- interactions (web parity) ----
  function goTo(i: number) {
    if (i < 0 || i >= total || i === idx) return;
    noteTimeSpent();
    setIdx(i);
    void flushRef.current();
  }

  function select(qid: string, oid: string) {
    setAnswers((p) => ({ ...p, [qid]: p[qid] === oid ? null : oid }));
    dirtyRef.current.add(qid);
    setSaveState("idle");
  }

  function toggleFlag(qid: string) {
    setFlags((p) => {
      const n = new Set(p);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
    dirtyRef.current.add(qid);
    // Persist flags promptly (spec: save on flag change).
    setTimeout(() => void flushRef.current(), 0);
  }

  async function doCancel() {
    if (canceling || finishedRef.current) return;
    setCanceling(true);
    try {
      const res = await cancelTestAttempt(attemptId);
      if (res.ok) {
        finishedRef.current = true;
        router.replace(homeTab);
        return;
      }
      setFatal(t("test.err.generic"));
    } catch {
      setFatal(t("test.err.generic"));
    }
    setCanceling(false);
    setCancelOpen(false);
  }

  const q = questions[idx];
  const level = timerLevel(remaining);
  const timerColor = level === "crit" ? arena.red : level === "warn" ? arena.gold : arena.ink;
  const isLast = idx === total - 1;
  const flagged = q ? flags.has(q.question_id) : false;
  const runTitle = isOlympiad ? t("test.run.olympiad") : t("test.run.title");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={[pad, { gap: spacing.lg }]}
    >
      {/* ---- Top bar: title + counter + save state + timer ---- */}
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <AppText variant="title" color={arena.ink} numberOfLines={1} style={{ flex: 1 }}>
            {runTitle}
          </AppText>
          <View
            accessible
            accessibilityLabel={`${t("test.run.timeLeft")}: ${remaining === null ? "" : fmtClock(remaining)}`}
            style={{
              backgroundColor: tint(timerColor, level === "normal" ? 0.08 : 0.14),
              borderColor: tint(timerColor, level === "normal" ? 0.3 : 0.55),
              borderWidth: 1,
              borderRadius: radius.sm,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
            }}
          >
            <AppText variant="mono" color={timerColor} style={{ fontSize: 18 }}>
              {remaining === null ? "--:--" : fmtClock(remaining)}
            </AppText>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <AppText variant="mono" color={arena.muted} style={{ fontSize: 13 }}>
            {t("arena.quizQuestion")} {String(idx + 1).padStart(2, "0")} {t("arena.quizOf")}{" "}
            {String(total).padStart(2, "0")}
          </AppText>
          <AppText
            color={saveState === "error" ? arena.red : arena.dim}
            style={{ fontSize: 12 }}
            accessibilityLiveRegion="polite"
          >
            {saveState === "saving"
              ? t("test.run.saving")
              : saveState === "saved"
                ? t("test.run.saved")
                : saveState === "error"
                  ? t("test.run.saveError")
                  : ""}
          </AppText>
        </View>

        {/* Subject + topic(s) — or the olympiad label — for this attempt. */}
        {(meta.subjectName || meta.topicNames.length > 0 || isOlympiad) && (
          <AppText color={arena.muted} style={{ fontSize: 12, lineHeight: 17 }}>
            {[
              meta.subjectName
                ? `${t("test.run.subject")}: ${meta.subjectName}`
                : null,
              !isOlympiad && meta.topicNames.length > 0
                ? `${t("test.run.topic")}: ${meta.topicNames.join(", ")}`
                : null,
              isOlympiad
                ? meta.olympiadTitle
                  ? `${t("test.run.olympiad")}: ${meta.olympiadTitle}`
                  : t("test.run.olympiad")
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </AppText>
        )}
      </View>

      {resumed ? <Notice arena={arena}>{t("test.run.resumed")}</Notice> : null}
      {timeUp ? (
        <Notice arena={arena} warn>
          {t("test.run.timeUp")}
        </Notice>
      ) : null}
      {fatal ? (
        <AppText color={arena.red} style={{ fontSize: 13 }}>
          {fatal}
        </AppText>
      ) : null}

      {/* ---- Question card ---- */}
      {q ? (
        <Panel arena={arena} style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <AppText variant="mono" color={arena.dim} style={{ fontSize: 13 }}>
              Q{String(idx + 1).padStart(2, "0")}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: flagged }}
              accessibilityLabel={flagged ? t("test.run.unflag") : t("test.run.flag")}
              onPress={() => toggleFlag(q.question_id)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
                borderWidth: 1,
                borderColor: flagged ? tint(arena.gold, 0.6) : arena.line,
                backgroundColor: flagged ? tint(arena.gold, 0.14) : "transparent",
                borderRadius: 999,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <BookmarkIcon filled={flagged} color={flagged ? arena.gold : arena.muted} />
              <AppText
                variant="label"
                color={flagged ? arena.gold : arena.muted}
                style={{ fontSize: 12 }}
              >
                {flagged ? t("test.run.unflag") : t("test.run.flag")}
              </AppText>
            </Pressable>
          </View>

          <AppText color={arena.ink} style={{ fontSize: 17, lineHeight: 24 }}>
            {q.body ?? ""}
          </AppText>
          {q.prompt ? (
            <AppText color={arena.muted} style={{ fontSize: 14, lineHeight: 20 }}>
              {q.prompt}
            </AppText>
          ) : null}

          <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
            {q.options.map((o, i) => {
              const selected = answers[q.question_id] === o.option_id;
              return (
                <Pressable
                  key={o.option_id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={o.text ?? ""}
                  onPress={() => select(q.question_id, o.option_id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    borderWidth: 1,
                    borderColor: selected ? arena.blue : arena.line,
                    backgroundColor: selected ? tint(arena.blue, 0.12) : arena.panel2,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: selected ? arena.blue : tint(arena.blue, 0.12),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText
                      variant="label"
                      color={selected ? "#ffffff" : arena.blue}
                      style={{ fontSize: 13 }}
                    >
                      {LETTERS[i] ?? String(i + 1)}
                    </AppText>
                  </View>
                  <AppText color={arena.ink} style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>
                    {o.text ?? ""}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Panel>
      ) : null}

      {/* ---- Prev / Next / Submit ---- */}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={t("arena.quizPrev")}
          disabled={idx === 0 || submitting}
          onPress={() => {
            if (idx === 0 || submitting) return;
            goTo(idx - 1);
          }}
          style={{ flex: 1 }}
        />
        {!isLast ? (
          <ArenaButton
            arena={arena}
            title={t("test.run.next")}
            disabled={submitting}
            onPress={() => {
              if (submitting) return;
              goTo(idx + 1);
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <ArenaButton
            arena={arena}
            title={t("test.run.submit")}
            pending={submitting}
            pendingTitle={t("test.run.submitting")}
            onPress={() => setSubmitOpen(true)}
            style={{ flex: 1 }}
          />
        )}
      </View>

      {/* ---- Palette ---- */}
      <Panel arena={arena} style={{ gap: spacing.md }}>
        <AppText variant="label" color={arena.muted}>
          {t("test.run.palette")}
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {questions.map((qq, i) => {
            const isCurrent = i === idx;
            const isAnswered = Boolean(answers[qq.question_id]);
            const isFlagged = flags.has(qq.question_id);
            const border = isCurrent
              ? arena.blue
              : isFlagged
                ? arena.gold
                : isAnswered
                  ? tint(arena.lime, 0.6)
                  : arena.line;
            return (
              <Pressable
                key={qq.question_id}
                accessibilityRole="button"
                accessibilityLabel={`${t("arena.quizQuestion")} ${i + 1}`}
                accessibilityState={{ selected: isCurrent }}
                onPress={() => goTo(i)}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: radius.sm,
                  borderWidth: isCurrent ? 2 : 1,
                  borderColor: border,
                  backgroundColor: isAnswered ? tint(arena.lime, 0.14) : arena.panel2,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AppText
                  variant="mono"
                  color={isAnswered ? arena.lime : arena.muted}
                  style={{ fontSize: 14 }}
                >
                  {i + 1}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {(
            [
              [tint(arena.lime, 0.7), t("test.run.answered")],
              [arena.gold, t("test.run.flagged")],
              [arena.line, t("test.run.unanswered")],
              [arena.blue, t("test.run.current")],
            ] as const
          ).map(([color, label]) => (
            <View
              key={label}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
            >
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}
              />
              <AppText color={arena.dim} style={{ fontSize: 12 }}>
                {label}
              </AppText>
            </View>
          ))}
        </View>
      </Panel>

      {/* ---- Submit / cancel ---- */}
      <View style={{ gap: spacing.md }}>
        <ArenaButton
          arena={arena}
          title={t("test.run.submit")}
          pending={submitting}
          pendingTitle={t("test.run.submitting")}
          onPress={() => setSubmitOpen(true)}
        />
        <ArenaButton
          arena={arena}
          kind="danger"
          title={t("test.run.cancel")}
          disabled={canceling || submitting}
          onPress={() => {
            if (canceling || submitting) return;
            setCancelOpen(true);
          }}
        />
      </View>

      {/* ---- Submit confirm (shows the unanswered count) ---- */}
      <ConfirmModal
        arena={arena}
        visible={submitOpen}
        title={t("test.run.submitTitle")}
        message={t("test.run.submitMsg").replace("{n}", String(unanswered))}
        primaryLabel={t("test.run.submitConfirm")}
        primaryPending={submitting}
        primaryPendingLabel={t("test.run.submitting")}
        onPrimary={() => void doSubmit()}
        secondaryLabel={t("test.run.back")}
        onSecondary={() => setSubmitOpen(false)}
      />

      {/* ---- Cancel confirm (counts for nothing) ---- */}
      <ConfirmModal
        arena={arena}
        visible={cancelOpen}
        title={t("test.run.cancelTitle")}
        message={t("test.run.cancelMsg")}
        primaryLabel={t("test.run.cancelConfirm")}
        primaryKind="danger"
        primaryPending={canceling}
        primaryPendingLabel={t("test.run.canceling")}
        onPrimary={() => void doCancel()}
        secondaryLabel={t("test.run.keepGoing")}
        onSecondary={() => setCancelOpen(false)}
      />

      {/* ---- Leave confirm (hardware back / any navigation away) ---- */}
      <ConfirmModal
        arena={arena}
        visible={leaveOpen}
        title={t("test.run.leaveTitle")}
        message={t("test.run.leaveMsg")}
        primaryLabel={t("test.run.leaveStay")}
        onPrimary={continueTest}
        secondaryLabel={t("test.run.leaveConfirm")}
        onSecondary={confirmLeave}
        onDismiss={continueTest}
      />
    </ScrollView>
  );
}
