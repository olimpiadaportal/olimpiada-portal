import { create } from 'zustand';
import { Question, PracticeMode, QuizResult } from '../types/practice';

interface PracticeState {
  // Current session data
  sessionId: string | null;
  mode: PracticeMode | null;
  subjectId: string | null;
  subjectName: string | null;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Map<string, 'A' | 'B' | 'C' | 'D' | 'E' | string>;
  questionStartTime: number | null;
  activeTimedQuestionId: string | null;
  questionTimeSpent: Map<string, number>;
  sessionStartTime: number | null;
  
  // Results
  quizResult: QuizResult | null;
  
  // Bookmarks
  bookmarkedQuestionIds: Set<string>;
  
  // Marked for Review
  markedForReviewIds: Set<string>;
  
  // Loading states
  isLoadingQuestions: boolean;
  isSubmittingAnswer: boolean;
  
  // Actions
  startSession: (
    sessionId: string,
    mode: PracticeMode,
    subjectId: string,
    subjectName: string,
    questions: Question[]
  ) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswer: (questionId: string, answer: 'A' | 'B' | 'C' | 'D' | 'E' | string) => void;
  startQuestionTimer: (questionId?: string) => void;
  commitQuestionTime: (questionId?: string) => number;
  getQuestionTimeSpent: (questionId?: string) => number;
  getQuestionTimes: () => Map<string, number>;
  nextQuestion: () => void;
  previousQuestion: () => void;
  setQuizResult: (result: QuizResult) => void;
  addBookmark: (questionId: string) => void;
  removeBookmark: (questionId: string) => void;
  toggleMarkForReview: (questionId: string) => void;
  isMarkedForReview: (questionId: string) => boolean;
  setLoadingQuestions: (loading: boolean) => void;
  setSubmittingAnswer: (submitting: boolean) => void;
  clearSession: () => void;
  getTotalTimeSpent: () => number;
  hasActiveSession: () => boolean;
  isInResultsScreen: () => boolean;
}

const getActiveQuestionId = (state: PracticeState, fallbackQuestionId?: string): string | null => {
  return fallbackQuestionId
    || state.activeTimedQuestionId
    || state.questions[state.currentQuestionIndex]?.id
    || null;
};

const getElapsedMs = (startTime: number | null): number => {
  if (!startTime) return 0;
  return Math.max(0, Date.now() - startTime);
};

const msToSeconds = (milliseconds: number): number => Math.max(0, Math.round(milliseconds / 1000));

const commitElapsedQuestionTime = (
  state: PracticeState,
  fallbackQuestionId?: string
): { times: Map<string, number>; totalForQuestion: number; questionId: string | null } => {
  const questionId = getActiveQuestionId(state, fallbackQuestionId);
  const times = new Map(state.questionTimeSpent);

  if (!questionId) {
    return { times, totalForQuestion: 0, questionId: null };
  }

  const totalForQuestionMs = (times.get(questionId) || 0) + getElapsedMs(state.questionStartTime);
  const totalForQuestion = msToSeconds(totalForQuestionMs);
  times.set(questionId, totalForQuestionMs);

  return { times, totalForQuestion, questionId };
};

export const usePracticeStore = create<PracticeState>((set, get) => ({
  // Initial state
  sessionId: null,
  mode: null,
  subjectId: null,
  subjectName: null,
  questions: [],
  currentQuestionIndex: 0,
  answers: new Map(),
  questionStartTime: null,
  activeTimedQuestionId: null,
  questionTimeSpent: new Map(),
  sessionStartTime: null,
  quizResult: null,
  bookmarkedQuestionIds: new Set(),
  markedForReviewIds: new Set(),
  isLoadingQuestions: false,
  isSubmittingAnswer: false,

  // Actions
  startSession: (sessionId, mode, subjectId, subjectName, questions) =>
    set({
      sessionId,
      mode,
      subjectId,
      subjectName,
      questions,
      currentQuestionIndex: 0,
      answers: new Map(),
      questionStartTime: Date.now(),
      activeTimedQuestionId: questions[0]?.id || null,
      questionTimeSpent: new Map(),
      sessionStartTime: Date.now(),
      quizResult: null,
    }),

  setCurrentQuestionIndex: (index) => {
    const state = get();
    const boundedIndex = Math.max(0, Math.min(index, state.questions.length - 1));
    const committed = commitElapsedQuestionTime(state);
    const nextQuestionId = state.questions[boundedIndex]?.id || null;

    set({
      currentQuestionIndex: boundedIndex,
      questionTimeSpent: committed.times,
      questionStartTime: Date.now(),
      activeTimedQuestionId: nextQuestionId,
    });
  },

  setAnswer: (questionId, answer) => {
    const { answers } = get();
    const newAnswers = new Map(answers);
    newAnswers.set(questionId, answer);
    set({ answers: newAnswers });
  },

  startQuestionTimer: (questionId) => {
    const state = get();
    const nextQuestionId = questionId || state.questions[state.currentQuestionIndex]?.id || null;
    if (state.activeTimedQuestionId === nextQuestionId && state.questionStartTime !== null) {
      return;
    }

    set({
      questionStartTime: Date.now(),
      activeTimedQuestionId: nextQuestionId,
    });
  },

  commitQuestionTime: (questionId) => {
    const state = get();
    const committed = commitElapsedQuestionTime(state, questionId);
    set({
      questionTimeSpent: committed.times,
      questionStartTime: null,
    });
    return committed.totalForQuestion;
  },

  getQuestionTimeSpent: (questionId) => {
    const state = get();
    const targetQuestionId = getActiveQuestionId(state, questionId);
    if (!targetQuestionId) return 0;

    const storedTimeMs = state.questionTimeSpent.get(targetQuestionId) || 0;
    const activeQuestionId = getActiveQuestionId(state);
    const activeElapsedMs = targetQuestionId === activeQuestionId
      ? getElapsedMs(state.questionStartTime)
      : 0;

    return msToSeconds(storedTimeMs + activeElapsedMs);
  },

  getQuestionTimes: () => {
    const state = get();
    const times = new Map(state.questionTimeSpent);
    const activeQuestionId = getActiveQuestionId(state);

    if (activeQuestionId) {
      times.set(
        activeQuestionId,
        (times.get(activeQuestionId) || 0) + getElapsedMs(state.questionStartTime)
      );
    }

    return new Map(Array.from(times.entries()).map(([questionId, milliseconds]) => [
      questionId,
      msToSeconds(milliseconds),
    ]));
  },

  nextQuestion: () => {
    const state = get();
    const { currentQuestionIndex, questions } = state;
    if (currentQuestionIndex < questions.length - 1) {
      const committed = commitElapsedQuestionTime(state);
      const nextIndex = currentQuestionIndex + 1;
      set({
        currentQuestionIndex: nextIndex,
        questionTimeSpent: committed.times,
        questionStartTime: Date.now(),
        activeTimedQuestionId: questions[nextIndex]?.id || null,
      });
    }
  },

  previousQuestion: () => {
    const state = get();
    const { currentQuestionIndex, questions } = state;
    if (currentQuestionIndex > 0) {
      const committed = commitElapsedQuestionTime(state);
      const previousIndex = currentQuestionIndex - 1;
      set({
        currentQuestionIndex: previousIndex,
        questionTimeSpent: committed.times,
        questionStartTime: Date.now(),
        activeTimedQuestionId: questions[previousIndex]?.id || null,
      });
    }
  },

  setQuizResult: (result) =>
    set({
      quizResult: result,
    }),

  addBookmark: (questionId) => {
    const { bookmarkedQuestionIds } = get();
    const newBookmarks = new Set(bookmarkedQuestionIds);
    newBookmarks.add(questionId);
    set({ bookmarkedQuestionIds: newBookmarks });
  },

  removeBookmark: (questionId) => {
    const { bookmarkedQuestionIds } = get();
    const newBookmarks = new Set(bookmarkedQuestionIds);
    newBookmarks.delete(questionId);
    set({ bookmarkedQuestionIds: newBookmarks });
  },

  toggleMarkForReview: (questionId) => {
    const { markedForReviewIds } = get();
    const newMarked = new Set(markedForReviewIds);
    if (newMarked.has(questionId)) {
      newMarked.delete(questionId);
    } else {
      newMarked.add(questionId);
    }
    set({ markedForReviewIds: newMarked });
  },

  isMarkedForReview: (questionId) => {
    const { markedForReviewIds } = get();
    return markedForReviewIds.has(questionId);
  },

  setLoadingQuestions: (loading) =>
    set({
      isLoadingQuestions: loading,
    }),

  setSubmittingAnswer: (submitting) =>
    set({
      isSubmittingAnswer: submitting,
    }),

  clearSession: () =>
    set({
      sessionId: null,
      mode: null,
      subjectId: null,
      subjectName: null,
      questions: [],
      currentQuestionIndex: 0,
      answers: new Map(),
      questionStartTime: null,
      activeTimedQuestionId: null,
      questionTimeSpent: new Map(),
      sessionStartTime: null,
      quizResult: null,
      markedForReviewIds: new Set(),
    }),

  getTotalTimeSpent: () => {
    const { sessionStartTime } = get();
    if (!sessionStartTime) return 0;
    return Math.floor((Date.now() - sessionStartTime) / 1000);
  },

  hasActiveSession: () => {
    const { sessionId, questions, quizResult } = get();
    // Has active session if there's a sessionId and questions but no result yet
    return sessionId !== null && questions.length > 0 && quizResult === null;
  },

  isInResultsScreen: () => {
    const { quizResult } = get();
    // In results screen if we have a quiz result
    return quizResult !== null;
  },
}));
