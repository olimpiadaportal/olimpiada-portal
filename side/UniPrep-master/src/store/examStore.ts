import { create } from 'zustand';
import { Question } from '../types/practice';

interface ExamState {
  // Current exam session data
  sessionId: string | null;
  examId: string | null;
  examTitle: string | null;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Map<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
  markedForReview: Set<string>;
  questionStartTime: number | null;
  sessionStartTime: number | null;
  timeRemaining: number; // in seconds
  
  // Loading states
  isLoadingExam: boolean;
  isSubmittingAnswer: boolean;
  
  // Actions
  startExam: (
    sessionId: string,
    examId: string,
    examTitle: string,
    questions: Question[],
    duration: number
  ) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswer: (questionId: string, answer: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  clearAnswer: (questionId: string) => void;
  toggleMarkForReview: (questionId: string) => void;
  startQuestionTimer: () => void;
  getQuestionTimeSpent: () => number;
  nextQuestion: () => void;
  previousQuestion: () => void;
  setTimeRemaining: (seconds: number) => void;
  decrementTime: () => void;
  setLoadingExam: (loading: boolean) => void;
  setSubmittingAnswer: (submitting: boolean) => void;
  setSessionId: (sessionId: string | null) => void;
  clearSession: () => void;
  getTotalTimeSpent: () => number;
  hasActiveSession: () => boolean;
}

export const useExamStore = create<ExamState>((set, get) => ({
  // Initial state
  sessionId: null,
  examId: null,
  examTitle: null,
  questions: [],
  currentQuestionIndex: 0,
  answers: new Map(),
  markedForReview: new Set(),
  questionStartTime: null,
  sessionStartTime: null,
  timeRemaining: 0,
  isLoadingExam: false,
  isSubmittingAnswer: false,

  // Actions
  startExam: (sessionId, examId, examTitle, questions, duration) =>
    set({
      sessionId,
      examId,
      examTitle,
      questions,
      currentQuestionIndex: 0,
      answers: new Map(),
      markedForReview: new Set(),
      questionStartTime: Date.now(),
      sessionStartTime: Date.now(),
      timeRemaining: duration * 60, // Convert minutes to seconds
    }),

  setCurrentQuestionIndex: (index) =>
    set({
      currentQuestionIndex: index,
      questionStartTime: Date.now(),
    }),

  setAnswer: (questionId, answer) =>
    set((state) => {
      const newAnswers = new Map(state.answers);
      newAnswers.set(questionId, answer);
      return { answers: newAnswers };
    }),

  clearAnswer: (questionId) =>
    set((state) => {
      const newAnswers = new Map(state.answers);
      newAnswers.delete(questionId);
      return { answers: newAnswers };
    }),

  toggleMarkForReview: (questionId) =>
    set((state) => {
      const newMarked = new Set(state.markedForReview);
      if (newMarked.has(questionId)) {
        newMarked.delete(questionId);
      } else {
        newMarked.add(questionId);
      }
      return { markedForReview: newMarked };
    }),

  startQuestionTimer: () =>
    set({
      questionStartTime: Date.now(),
    }),

  getQuestionTimeSpent: () => {
    const { questionStartTime } = get();
    if (!questionStartTime) return 0;
    return Math.floor((Date.now() - questionStartTime) / 1000);
  },

  nextQuestion: () =>
    set((state) => ({
      currentQuestionIndex: Math.min(
        state.currentQuestionIndex + 1,
        state.questions.length - 1
      ),
      questionStartTime: Date.now(),
    })),

  previousQuestion: () =>
    set((state) => ({
      currentQuestionIndex: Math.max(state.currentQuestionIndex - 1, 0),
      questionStartTime: Date.now(),
    })),

  setTimeRemaining: (seconds) =>
    set({
      timeRemaining: seconds,
    }),

  decrementTime: () =>
    set((state) => ({
      timeRemaining: Math.max(state.timeRemaining - 1, 0),
    })),

  setLoadingExam: (loading) =>
    set({
      isLoadingExam: loading,
    }),

  setSubmittingAnswer: (submitting) =>
    set({
      isSubmittingAnswer: submitting,
    }),

  setSessionId: (sessionId) =>
    set({
      sessionId,
    }),

  clearSession: () =>
    set({
      sessionId: null,
      examId: null,
      examTitle: null,
      questions: [],
      currentQuestionIndex: 0,
      answers: new Map(),
      markedForReview: new Set(),
      questionStartTime: null,
      sessionStartTime: null,
      timeRemaining: 0,
    }),

  getTotalTimeSpent: () => {
    const { sessionStartTime } = get();
    if (!sessionStartTime) return 0;
    return Math.floor((Date.now() - sessionStartTime) / 1000);
  },

  hasActiveSession: () => {
    const { sessionId, questions } = get();
    // Has active session if there's a sessionId and questions
    return sessionId !== null && questions.length > 0;
  },
}));
