// TEST ENGINE (M3) — the timed player (web TestRunner.tsx ported natively).
// ONE shared engine for kind='test' AND kind='olympiad' (migration 047): the
// wording, exit tab and header label derive from the attempt's kind, never
// from the route. Server-authoritative countdown (local anchor recomputed from
// every save/get response; ticks never decrement state), 30s autosave +
// save-on-navigate/flag, palette, bookmark, confirmed submit/cancel, deadline
// auto-submit (server keeps a 60s grace), TRUE resume, and the leave guard
// (Android hardware back + navigation beforeRemove → confirm dialog; never for
// the runner's own controls).
// M3.2 restyle: presentation-only chrome (TimerPill pulse, AnsweredBar, lucide
// glyphs, option/palette skins) — every engine flow above is byte-identical.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  CloudUpload,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { subjectLabel } from "@/lib/subjectLabel";
import { publicStorageUrl } from "@/lib/data";
import {
  cancelTestAttempt,
  saveTestAnswers,
  submitQuestionReport,
  submitTestAttempt,
} from "./api";
import { ReportQuestionSheet } from "./ReportQuestionSheet";
import { TQK, useAttemptRow, useTestAttempt } from "./queries";
import { clearDraft, ensureDraft, type AttemptDraft } from "./draft";
import {
  AUTOSAVE_MS,
  LETTERS,
  MAX_ANSWERS,
  buildAnswerItems,
  chunkAnswerItems,
  countAnswered,
  deadlineFromRemaining,
  fmtClock,
  hydrateAnswers,
  hydrateFlags,
  initialAnswers,
  initialFlags,
  remainingFrom,
  settledQids,
  submitPlan,
  timerLevel,
  type AnswersMap,
} from "./logic";
import type { AttemptMeta, AttemptRowMeta, TestAttemptData } from "./types";
import { ConfirmModal } from "./ConfirmModal";
import { QuestionImage } from "./QuestionImage";
import { OptionImage } from "@/features/tests/OptionImage";
import { ArenaButton, Notice, Panel, tint, useArena } from "./ui";

const TESTS_TAB = "/(student)/(tabs)/tests" as const;
const OLYMPIADS_TAB = "/(student)/(tabs)/olympiads" as const;

// ---------------------------------------------------------------------------
// Presentation-only chrome (M3.2 restyle). These components RECEIVE engine
// state (remaining/level/answered) and never compute or mutate any of it.
// ---------------------------------------------------------------------------

/**
 * Timer chip — pulses red under 60s (native driver; display only). UNTIMED
 * attempts (Round-20 practice: null deadline) render the ∞ no-limit state
 * instead of a countdown (web .tst-timer.inf parity).
 */
function TimerPill({
  arena,
  remaining,
  level,
  untimed,
  noLimitLabel,
  a11yLabel,
}: {
  arena: ArenaTokens;
  remaining: number | null;
  level: "normal" | "warn" | "crit";
  untimed: boolean;
  noLimitLabel: string;
  a11yLabel: string;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (untimed || level !== "crit") {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [level, untimed, pulse]);

  if (untimed) {
    return (
      <View
        accessible
        accessibilityLabel={noLimitLabel}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          backgroundColor: arena.panel2,
          borderColor: arena.line,
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
        }}
      >
        <AppText variant="mono" color={arena.muted} style={{ fontSize: 16 }}>
          ∞
        </AppText>
        <AppText variant="label" color={arena.muted} style={{ fontSize: 12 }}>
          {noLimitLabel}
        </AppText>
      </View>
    );
  }

  const color = level === "crit" ? arena.red : level === "warn" ? arena.gold : arena.ink;
  return (
    <Animated.View
      accessible
      accessibilityLabel={a11yLabel}
      style={{
        opacity: pulse,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: tint(color, level === "normal" ? 0.08 : 0.14),
        borderColor: tint(color, level === "normal" ? 0.3 : 0.55),
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      <Clock size={15} color={color} strokeWidth={2.5} />
      <AppText variant="mono" color={color} style={{ fontSize: 18 }}>
        {remaining === null ? "--:--" : fmtClock(remaining)}
      </AppText>
    </Animated.View>
  );
}

/** Rated / practice mode badge (web .tst-mode-badge parity; display only). */
function ModeBadge({
  arena,
  rated,
  label,
}: {
  arena: ArenaTokens;
  rated: boolean;
  label: string;
}) {
  const color = rated ? arena.lime : arena.muted;
  return (
    <View
      style={{
        backgroundColor: tint(color, 0.14),
        borderColor: tint(color, 0.5),
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        alignSelf: "center",
      }}
    >
      <AppText variant="label" color={color} style={{ fontSize: 11 }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Thin answered/total progress bar under the top bar (derived, display only). */
function AnsweredBar({
  arena,
  answered,
  total,
}: {
  arena: ArenaTokens;
  answered: number;
  total: number;
}) {
  const pct = total > 0 ? answered / total : 0;
  const fill = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    // Width is not native-transformable; a 250ms JS-driven tween on answer
    // changes is imperceptible work-wise.
    Animated.timing(fill, { toValue: pct, duration: 250, useNativeDriver: false }).start();
  }, [pct, fill]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: answered }}
      style={{
        height: 4,
        borderRadius: 999,
        backgroundColor: arena.panel2,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          height: "100%",
          borderRadius: 999,
          backgroundColor: arena.lime,
        }}
      />
    </View>
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
  // is_rated lives on the attempt ROW (own row under RLS), not in the RPC
  // payload — web run-page parity. Badge only; null (still loading) hides it.
  // Round 51 audit: olympiad attempts are practice-only (Round 48) but legacy
  // rows still carry is_rated=true — gate the rated badge on kind so an
  // olympiad run always shows the practice badge, never "Reytinqə təsir edir".
  const rowQ = useAttemptRow(attemptId);
  const rated = rowQ.data
    ? rowQ.data.is_rated === true && rowQ.data.kind !== "olympiad"
    : null;

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

  // A FAILED background refetch must not tear the player down while a usable
  // payload is still in hand (the child would lose the screen mid-attempt); the
  // error state is only reachable when there is nothing to play.
  if (!attempt) {
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
      rated={rated}
      arena={arena}
      pad={pad}
    />
  );
}

// ---------------------------------------------------------------------------
// The live player — mounted only for an in_progress attempt with data present
// (state initializers can trust props, mirroring the web server→client split).
// The child's working answers live in the module-level DRAFT (draft.ts), not in
// this component's state alone: a remount then RESUMES them instead of
// re-seeding from the pre-answer payload the runner was opened with.
// ---------------------------------------------------------------------------
function RunnerActive({
  attemptId,
  attempt,
  meta,
  resumed,
  rated,
  arena,
  pad,
}: {
  attemptId: string;
  attempt: TestAttemptData;
  meta: AttemptMeta;
  resumed: boolean;
  /** is_rated from the own attempt row — null while loading (badge hidden). */
  rated: boolean | null;
  arena: ArenaTokens;
  pad: object;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const profileId = useAuthStore((s) => s.profileId);

  const isOlympiad = attempt.kind === "olympiad";
  const homeTab = isOlympiad ? OLYMPIADS_TAB : TESTS_TAB;
  const questions = attempt.questions;
  const total = questions.length;
  // Round-20 contract (migration 057): null deadline = UNTIMED practice. The
  // countdown anchor stays null (deadlineFromRemaining), so remaining stays
  // null → no ticking clock, no 0:00 auto-submit, no deadline resync.
  const untimed = attempt.deadline_at === null;

  // ---- answers / flags (rehydrated from saved rows — TRUE resume) ----
  // The working copy lives in a module-level DRAFT (draft.ts) that OUTLIVES
  // this component, so a remount resumes the child's selections instead of
  // resetting them to the pre-answer payload the runner was opened with.
  // Resolved in a state initializer, never in the render body: `ensureDraft`
  // mutates the module map, and a render React discards must not be able to
  // evict/replace another attempt's draft as a side effect.
  const [draft] = useState<AttemptDraft>(() =>
    ensureDraft(attemptId, () => ({
      answers: initialAnswers(questions),
      flags: initialFlags(questions),
      dirty: new Set<string>(),
      spentMs: new Map<string, number>(),
    })),
  );

  const [answers, setAnswers] = useState<AnswersMap>(() =>
    hydrateAnswers(questions, draft.answers, draft.dirty),
  );
  const [flags, setFlags] = useState<Set<string>>(() =>
    hydrateFlags(questions, draft.flags, draft.dirty),
  );
  const [idx, setIdx] = useState(0);
  // Keep the draft pointing at the rendered values so every read path —
  // autosave, submit, a later remount — sees exactly what the child sees.
  // select()/toggleFlag() already write the draft synchronously (an autosave
  // starting in the same tick must carry the new selection); this EFFECT only
  // has to catch the hydration result. It is deliberately not a render-body
  // assignment: a render carrying a stale `answers` would then write that stale
  // value back into the draft and silently revert a selection.
  useEffect(() => {
    draft.answers = answers;
    draft.flags = flags;
  }, [draft, answers, flags]);

  // ---- countdown: anchor from the server snapshot; resynced on every save ----
  const [remaining, setRemaining] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // ---- lifecycle guards / autosave bookkeeping (refs: no re-renders) ----
  const savingRef = useRef(false);
  /** The save currently in flight — awaited by doSubmit, never raced. */
  const savePromiseRef = useRef<Promise<void> | null>(null);
  /** A save requested while another was in flight; run as soon as it ends. */
  const pendingFlushRef = useRef<{ resync: boolean } | null>(null);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);
  const leavingRef = useRef(false);
  const lastSwitchRef = useRef<number>(Date.now());
  const idxRef = useRef(idx);
  idxRef.current = idx;
  // Held navigation action from beforeRemove; null = hardware-back origin.
  const pendingActionRef = useRef<unknown>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [timeUp, setTimeUp] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
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
      const cur = draft.spentMs.get(q.question_id) ?? 0;
      draft.spentMs.set(q.question_id, cur + (now - lastSwitchRef.current));
      draft.dirty.add(q.question_id);
    }
    lastSwitchRef.current = now;
  }

  const buildItems = useCallback(
    (qids: string[]) => buildAnswerItems(qids, draft.answers, draft.flags, draft.spentMs),
    [draft],
  );

  /**
   * Publish the attempt's SETTLED status before navigating away.
   *
   * The result screen guards itself with "an in_progress attempt belongs back
   * in the player" and reads it from this very cache entry — which the runner
   * itself warmed with `in_progress` at mount. Leaving the pre-submit copy in
   * place bounced the child straight back into a freshly mounted (and therefore
   * blank-looking) player with the attempt already graded server-side: the
   * reported "answers cleared, nothing submitted, tap Finish again".
   */
  const publishStatus = useCallback(
    (status: "graded" | "canceled") => {
      queryClient.setQueryData(
        TQK.attemptRow(attemptId, profileId ?? "-"),
        (prev: AttemptRowMeta | null | undefined) =>
          prev
            ? {
                ...prev,
                status,
                submitted_at:
                  status === "graded"
                    ? (prev.submitted_at ?? new Date().toISOString())
                    : prev.submitted_at,
              }
            : prev,
      );
    },
    [attemptId, profileId, queryClient],
  );

  // ---- submit (manual confirm + timer-zero / deadline-signal auto path) ----
  const doSubmit = useCallback(async () => {
    if (submittingRef.current || finishedRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFatal(null);
    try {
      // Never race an autosave that is already in flight. `save_test_answers`
      // re-reads the status at the top of its OWN transaction, so a save that
      // started before this submit can pass the in_progress check, block on the
      // row lock the submit holds, and then write its older snapshot over the
      // just-graded selections — the score would be right while the stored
      // answer sheet (the only thing get_test_review reads) shows an answer the
      // child did not finish with. submittingRef is already set, so no NEW save
      // can start behind this await.
      if (savePromiseRef.current) {
        try {
          await savePromiseRef.current;
        } catch {
          // A failed save changes nothing: the submit below carries every
          // answer of the attempt anyway.
        }
      }
      // EVERY question of the attempt goes out in ONE submit call — the server
      // applies its own bound to the array (100 before migration 093, 1000
      // after) and always merges from the FRONT, so the payload must never be
      // a tail slice. Anything beyond that bound is persisted first with
      // save_test_answers (submit grades from the STORED rows, so pre-saved
      // batches count in full); for a normal ≤100-question attempt this loop
      // is empty and the submit is a single round-trip.
      const { preSave, submit } = submitPlan(
        buildItems(questions.map((qq) => qq.question_id)),
        MAX_ANSWERS,
      );
      for (const batch of preSave) {
        const res = await saveTestAnswers(attemptId, batch);
        // ok:false = the server closed the save window (deadline passed / the
        // attempt is no longer in progress). Every further save would be
        // refused identically, so stop spending round-trips inside the
        // submit's 60s grace and go straight to it. A REAL failure (network,
        // server error) throws instead and is caught below with the whole
        // draft intact, so the same tap retries everything.
        if (!res.ok) break;
      }
      await submitTestAttempt(attemptId, submit, locale);
      // Server confirmed. Only now is it safe to drop the draft and stop
      // guarding the route.
      finishedRef.current = true;
      draft.dirty.clear();
      clearDraft(attemptId);
      publishStatus("graded");
      router.replace({
        pathname: "/(student)/test/result/[attemptId]",
        params: { attemptId },
      });
      return;
    } catch {
      // Nothing is reset: answers, flags and the dirty set are untouched, so
      // the same tap retries with the full payload.
      setFatal(t("test.err.generic"));
    }
    submittingRef.current = false;
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, questions, buildItems, draft, publishStatus, router, locale]);
  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // ---- autosave (dirty batch; `resync` forces an empty save purely to pull a
  // fresh remaining_seconds — e.g. returning from background) ----
  const flush = useCallback(
    async (opts?: { resync?: boolean }) => {
      if (submittingRef.current || finishedRef.current) return;
      if (savingRef.current) {
        // QUEUE, never drop. The app-backgrounding handler calls this exactly
        // when a save is most likely to be outstanding; returning silently
        // there left everything dirtied since that save started in memory
        // only — and Android may kill a backgrounded process at any moment.
        // The in-flight save re-runs it the moment it finishes.
        pendingFlushRef.current = {
          resync: (pendingFlushRef.current?.resync ?? false) || opts?.resync === true,
        };
        return;
      }
      const qids = Array.from(draft.dirty);
      if (qids.length === 0 && !opts?.resync) return;
      savingRef.current = true;
      if (qids.length > 0) setSaveState("saving");
      try {
        // Chunked, never truncated: a batch that does not fit one call is sent
        // in the next one instead of being dropped. An empty payload still
        // pings the server when this is a resync (fresh remaining_seconds).
        const batches = chunkAnswerItems(buildItems(qids), MAX_ANSWERS);
        if (batches.length === 0) batches.push([]);
        let remaining: number | null = null;
        let failed = false;
        for (const batch of batches) {
          const res = await saveTestAnswers(attemptId, batch);
          if (!res.ok) {
            if (res.deadline) {
              // Server says time is over → auto-submit (60s grace server-side).
              setTimeUp(true);
              savingRef.current = false;
              void doSubmitRef.current();
              return;
            }
            failed = true;
            break;
          }
          // ONLY what this accepted batch actually carried, and only where the
          // child has not changed it since — everything else stays dirty and
          // is retried on the next autosave.
          for (const id of settledQids(batch, draft.answers, draft.flags)) {
            draft.dirty.delete(id);
          }
          if (typeof res.remaining === "number") remaining = res.remaining;
        }
        if (remaining !== null) {
          // Deadline resync: the SERVER remaining is the truth.
          deadlineRef.current = deadlineFromRemaining(Date.now(), remaining);
          setRemaining(remainingFrom(deadlineRef.current, Date.now()));
        }
        if (qids.length > 0) setSaveState(failed ? "error" : "saved");
      } catch {
        setSaveState("error");
      }
      savingRef.current = false;
      // Someone asked for a save while this one was in flight (a navigation, a
      // flag toggle, the app going to background): run it now, so no request
      // to persist is ever silently dropped.
      const queued = pendingFlushRef.current;
      if (queued) {
        pendingFlushRef.current = null;
        await flushRef.current(queued);
      }
    },
    [attemptId, buildItems, draft],
  );

  /**
   * The autosave entry point everything else calls. It publishes the in-flight
   * promise so doSubmit can WAIT for a save instead of racing it (a late save
   * would otherwise overwrite the graded answer rows).
   */
  const runFlush = useCallback(
    (opts?: { resync?: boolean }) => {
      const p = flush(opts).finally(() => {
        if (savePromiseRef.current === p) savePromiseRef.current = null;
      });
      savePromiseRef.current = p;
      return p;
    },
    [flush],
  );
  const flushRef = useRef(runFlush);
  flushRef.current = runFlush;

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

  // ---- 0:00 → auto-submit once (TIMED only: with a null anchor `remaining`
  // stays null forever, so untimed practice can never trip this) ----
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

  // The draft is written BEFORE the state update so an autosave/submit that
  // starts in the same tick already carries the new selection.
  function select(qid: string, oid: string) {
    const next: AnswersMap = {
      ...draft.answers,
      [qid]: draft.answers[qid] === oid ? null : oid,
    };
    draft.answers = next;
    draft.dirty.add(qid);
    setAnswers(next);
    setSaveState("idle");
  }

  function toggleFlag(qid: string) {
    const next = new Set(draft.flags);
    if (next.has(qid)) next.delete(qid);
    else next.add(qid);
    draft.flags = next;
    draft.dirty.add(qid);
    setFlags(next);
    // Persist flags promptly (spec: save on flag change).
    setTimeout(() => void flushRef.current(), 0);
  }

  async function doCancel() {
    if (canceling || submittingRef.current || finishedRef.current) return;
    setCanceling(true);
    setFatal(null);
    try {
      const res = await cancelTestAttempt(attemptId);
      if (res.ok) {
        finishedRef.current = true;
        clearDraft(attemptId);
        publishStatus("canceled");
        router.replace(homeTab);
        return;
      }
      setFatal(t("test.err.generic"));
    } catch {
      setFatal(t("test.err.generic"));
    }
    // The dialog STAYS OPEN on failure, exactly like the submit one: closing it
    // would hide the reason behind an inline message far up the scroll and read
    // as "nothing happened".
    setCanceling(false);
  }

  const q = questions[idx];
  const level = timerLevel(remaining);
  const isLast = idx === total - 1;
  const flagged = q ? flags.has(q.question_id) : false;
  // Daily rounds title the top bar "Günün raundu — <subject>" (web run-page
  // parity); olympiads keep the olympiad label, practice the generic title.
  const isDaily = attempt.kind === "daily";
  const dailySubject = meta.subjectName
    ? subjectLabel(t, meta.subjectCode, meta.subjectName)
    : "";
  const runTitle = isOlympiad
    ? t("test.run.olympiad")
    : isDaily
      ? dailySubject
        ? `${t("test.run.daily")} — ${dailySubject}`
        : t("test.run.daily")
      : t("test.run.title");

  return (
    // No pull-to-refresh here on purpose: a running attempt is a timed,
    // autosaved session behind a leave guard — re-reading it mid-answer would
    // fight the local draft and the deadline.
    <ScrollView
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={[pad, { gap: spacing.lg }]}
    >
      {/* ---- Top bar: title + timer, answered progress, counter + save state ---- */}
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <AppText
              variant="title"
              color={arena.ink}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {runTitle}
            </AppText>
            {rated !== null ? (
              <ModeBadge
                arena={arena}
                rated={rated}
                label={rated ? t("test.run.ratedBadge") : t("test.run.practiceBadge")}
              />
            ) : null}
          </View>
          <TimerPill
            arena={arena}
            remaining={remaining}
            level={level}
            untimed={untimed}
            noLimitLabel={t("test.run.noLimit")}
            a11yLabel={`${t("test.run.timeLeft")}: ${remaining === null ? "" : fmtClock(remaining)}`}
          />
        </View>

        <AnsweredBar arena={arena} answered={answeredCount} total={total} />

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
          <View
            accessibilityLiveRegion="polite"
            // The save-state label shrinks/wraps; the question counter (numbers)
            // keeps its full width on narrow phones.
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 }}
          >
            {saveState === "saving" ? (
              <CloudUpload size={13} color={arena.dim} strokeWidth={2} />
            ) : saveState === "saved" ? (
              <Check size={13} color={arena.lime} strokeWidth={2.5} />
            ) : saveState === "error" ? (
              <CircleAlert size={13} color={arena.red} strokeWidth={2} />
            ) : null}
            <AppText
              color={
                saveState === "error"
                  ? arena.red
                  : saveState === "saved"
                    ? arena.lime
                    : arena.dim
              }
              style={{ fontSize: 12, flexShrink: 1 }}
              numberOfLines={1}
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
        </View>

        {/* Subject + topic(s) — or the olympiad label — for this attempt. */}
        {(meta.subjectName || meta.topicNames.length > 0 || isOlympiad) && (
          <AppText color={arena.muted} style={{ fontSize: 12, lineHeight: 17 }}>
            {[
              meta.subjectName
                ? `${t("test.run.subject")}: ${subjectLabel(t, meta.subjectCode, meta.subjectName)}`
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
      {/* Only when no dialog is carrying the same message (a failure is
          reported inside the dialog the child is looking at). */}
      {fatal && !submitOpen && !cancelOpen ? (
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: flagged }}
                accessibilityLabel={flagged ? t("test.run.unflag") : t("test.run.flag")}
                onPress={() => toggleFlag(q.question_id)}
                hitSlop={10}
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
                  minHeight: 32,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {flagged ? (
                  <BookmarkCheck size={14} color={arena.gold} strokeWidth={2.5} />
                ) : (
                  <Bookmark size={14} color={arena.muted} strokeWidth={2} />
                )}
                <AppText
                  variant="label"
                  color={flagged ? arena.gold : arena.muted}
                  style={{ fontSize: 12 }}
                >
                  {flagged ? t("test.run.unflag") : t("test.run.flag")}
                </AppText>
              </Pressable>
              {/* Report a problem — same pill language as the bookmark, sitting
                  where a child is already looking when a question looks wrong. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("test.report.action")}
                onPress={() => setReportOpen(true)}
                hitSlop={10}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  borderWidth: 1,
                  borderColor: arena.line,
                  borderRadius: 999,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  // Same 32 as the bookmark beside it — two chips in one row
                  // must share a height or the row reads as misaligned.
                  minHeight: 32,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <CircleAlert size={14} color={arena.muted} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <AppText color={arena.ink} style={{ fontSize: 17, lineHeight: 24 }}>
            {q.body ?? ""}
          </AppText>
          {/* Question figure between body and options (web TestRunner parity;
              close label mirrors the web runner's modal: test.run.back). */}
          {q.image?.bucket && q.image.path ? (
            <QuestionImage
              arena={arena}
              url={publicStorageUrl(q.image.bucket, q.image.path)}
              alt={t("test.img.alt")}
              hint={t("test.img.hint")}
              closeLabel={t("test.run.back")}
            />
          ) : null}
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
                  // An image-only option has no text; falling back to "" left
                // the radio unlabelled. The letter is what the student hears
                // and what they are choosing between.
                accessibilityLabel={o.text?.trim() ? o.text : (LETTERS[i] ?? String(i + 1))}
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
                    minHeight: 52,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.sm,
                      backgroundColor: selected ? arena.blue : tint(arena.blue, 0.12),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText
                      variant="label"
                      color={selected ? "#ffffff" : arena.blue}
                      style={{ fontSize: 14 }}
                    >
                      {LETTERS[i] ?? String(i + 1)}
                    </AppText>
                  </View>
                  {/* An option carries text, a figure, or both. flex:1 +
                      minWidth:0 so a long az/ru label wraps instead of pushing
                      the check icon off a 320pt screen. */}
                  <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                    {o.image ? (
                      <OptionImage
                        url={publicStorageUrl(o.image.bucket, o.image.path)}
                      />
                    ) : null}
                    {o.text?.trim() ? (
                      <AppText color={arena.ink} style={{ fontSize: 15, lineHeight: 21 }}>
                        {o.text}
                      </AppText>
                    ) : null}
                  </View>
                  {selected ? (
                    <Check size={18} color={arena.blue} strokeWidth={2.5} />
                  ) : null}
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
          icon={<ChevronLeft size={16} color={arena.ink} strokeWidth={2.5} />}
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
            icon={<ChevronRight size={16} color="#ffffff" strokeWidth={2.5} />}
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
            onPress={() => {
              setFatal(null);
              setSubmitOpen(true);
            }}
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
                  width: 44,
                  height: 44,
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
                {isFlagged ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: arena.gold,
                    }}
                  />
                ) : null}
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
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
                backgroundColor: arena.panel2,
                borderColor: arena.line,
                borderWidth: 1,
                borderRadius: 999,
                paddingVertical: 3,
                paddingHorizontal: spacing.sm,
              }}
            >
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
              />
              <AppText color={arena.dim} style={{ fontSize: 11 }}>
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
          kind="gradient"
          title={t("test.run.submit")}
          icon={<Check size={16} color="#ffffff" strokeWidth={2.5} />}
          pending={submitting}
          pendingTitle={t("test.run.submitting")}
          onPress={() => {
            setFatal(null);
            setSubmitOpen(true);
          }}
        />
        <ArenaButton
          arena={arena}
          kind="danger"
          title={t("test.run.cancel")}
          disabled={canceling || submitting}
          onPress={() => {
            if (canceling || submitting) return;
            setFatal(null);
            setCancelOpen(true);
          }}
        />
      </View>

      {/* ---- Submit confirm (shows the unanswered count) ----
           The dialog STAYS OPEN for the whole request: its primary is the
           pending/inert button while the RPC is in flight (so a second tap can
           never start a second submit), and a failure is reported right where
           the child tapped instead of in a message scrolled far off-screen —
           tapping again simply retries with every answer still in hand. */}
      <ConfirmModal
        arena={arena}
        visible={submitOpen}
        title={t("test.run.submitTitle")}
        message={t("test.run.submitMsg").replace("{n}", String(unanswered))}
        errorText={submitting ? null : fatal}
        primaryLabel={t("test.run.submitConfirm")}
        primaryPending={submitting}
        primaryPendingLabel={t("test.run.submitting")}
        onPrimary={() => void doSubmit()}
        secondaryLabel={t("test.run.back")}
        onSecondary={() => {
          if (submitting) return;
          setFatal(null);
          setSubmitOpen(false);
        }}
      />

      {/* ---- Cancel confirm (counts for nothing) ----
           Same contract as the submit dialog: it stays open for the whole
           request and reports a failure in place. `fatal` is cleared whenever
           either dialog opens, so one action's error can never surface inside
           the other's dialog. */}
      <ConfirmModal
        arena={arena}
        visible={cancelOpen}
        title={t("test.run.cancelTitle")}
        message={t("test.run.cancelMsg")}
        errorText={canceling ? null : fatal}
        primaryLabel={t("test.run.cancelConfirm")}
        primaryKind="danger"
        primaryPending={canceling}
        primaryPendingLabel={t("test.run.canceling")}
        onPrimary={() => void doCancel()}
        secondaryLabel={t("test.run.keepGoing")}
        onSecondary={() => {
          if (canceling) return;
          setFatal(null);
          setCancelOpen(false);
        }}
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

      {/* ---- Report a problem (migration 115) ----
           The attempt id is passed as context; the database verifies it is the
           reporter's own attempt AND that it drew this question, and silently
           drops it otherwise rather than losing the report.

           Mounted only WITH a question: the trigger lives inside the question
           card, so there is no way to open this without one, and gating here
           means the id can never be an empty-string placeholder that the
           database would reject as malformed uuid. */}
      {q ? (
        <ReportQuestionSheet
          arena={arena}
          visible={reportOpen}
          t={t}
          onClose={() => setReportOpen(false)}
          onSubmit={(message) =>
            submitQuestionReport({
              questionId: q.question_id,
              attemptId,
              message,
              locale,
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}
