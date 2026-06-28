// useOfflinePractice Hook
// Stage 6 - Week 3: Offline Mode Implementation
// Manages offline practice sessions with local question storage

import { useState, useCallback, useEffect } from 'react';
import { offlineService } from '../services/offlineService';
import { offlineSyncService, OfflineSession, OfflineAnswer } from '../services/offlineSyncService';
import { practiceService } from '../services/practiceService';
import { useOffline } from '../contexts/OfflineContext';
import { useAuthStore } from '../store/authStore';
import { Question } from '../types/practice';

interface OfflinePracticeState {
  // Questions
  questions: Question[];
  currentIndex: number;
  
  // Session tracking
  sessionId: string | null;
  startTime: Date | null;
  answers: OfflineAnswer[];
  
  // Stats
  correctCount: number;
  totalTimeSeconds: number;
  
  // Status
  isLoading: boolean;
  error: string | null;
}

interface UseOfflinePracticeReturn {
  // State
  state: OfflinePracticeState;
  
  // Actions
  startSession: (subjectId: string, questionCount?: number) => Promise<boolean>;
  submitAnswer: (answer: 'A' | 'B' | 'C' | 'D' | 'E', timeSpentSeconds: number) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  completeSession: () => Promise<string | null>;
  
  // Utilities
  getCurrentQuestion: () => Question | null;
  getProgress: () => { current: number; total: number; percentage: number };
  canPracticeOffline: (subjectId: string) => Promise<boolean>;
  downloadQuestionsForSubject: (subjectId: string, count?: number) => Promise<boolean>;
  
  // Cache info
  getCacheInfo: (subjectId: string) => Promise<{
    hasCached: boolean;
    questionCount: number;
    lastSync: Date | null;
  }>;
}

const initialState: OfflinePracticeState = {
  questions: [],
  currentIndex: 0,
  sessionId: null,
  startTime: null,
  answers: [],
  correctCount: 0,
  totalTimeSeconds: 0,
  isLoading: false,
  error: null,
};

export function useOfflinePractice(): UseOfflinePracticeReturn {
  const [state, setState] = useState<OfflinePracticeState>(initialState);
  const { isOnline, isOfflineModeEnabled } = useOffline();
  const { user } = useAuthStore();

  /**
   * Check if offline practice is available for a subject
   */
  const canPracticeOffline = useCallback(async (subjectId: string): Promise<boolean> => {
    if (!isOfflineModeEnabled) return false;
    return offlineService.hasCachedQuestions(subjectId);
  }, [isOfflineModeEnabled]);

  /**
   * Download questions for offline use
   */
  const downloadQuestionsForSubject = useCallback(async (
    subjectId: string,
    count: number = 100
  ): Promise<boolean> => {
    if (!isOnline) {
      console.warn('Cannot download questions while offline');
      return false;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Fetch questions from server
      const questions = await practiceService.getQuestionsForOffline(subjectId, count);
      
      if (questions && questions.length > 0) {
        // Cache locally
        await offlineService.cacheQuestions(subjectId, questions);
        console.log(`📥 Downloaded ${questions.length} questions for subject ${subjectId}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error('Error downloading questions:', error);
      setState(prev => ({ ...prev, error: error.message }));
      return false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isOnline]);

  /**
   * Get cache info for a subject
   */
  const getCacheInfo = useCallback(async (subjectId: string) => {
    const hasCached = await offlineService.hasCachedQuestions(subjectId);
    const questions = await offlineService.getCachedQuestions(subjectId);
    
    // Get last sync time from AsyncStorage
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const lastSyncStr = await AsyncStorage.getItem(`last_sync_${subjectId}`);
    
    return {
      hasCached,
      questionCount: questions?.length ?? 0,
      lastSync: lastSyncStr ? new Date(lastSyncStr) : null,
    };
  }, []);

  /**
   * Start an offline practice session
   */
  const startSession = useCallback(async (
    subjectId: string,
    questionCount: number = 20
  ): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Get cached questions
      const cachedQuestions = await offlineService.getCachedQuestions(subjectId);
      
      if (!cachedQuestions || cachedQuestions.length === 0) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No cached questions available. Please download questions while online.',
        }));
        return false;
      }

      // Shuffle and select questions
      const shuffled = [...cachedQuestions].sort(() => Math.random() - 0.5);
      const selectedQuestions = shuffled.slice(0, Math.min(questionCount, shuffled.length));

      // Generate session ID
      const sessionId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      setState({
        questions: selectedQuestions,
        currentIndex: 0,
        sessionId,
        startTime: new Date(),
        answers: [],
        correctCount: 0,
        totalTimeSeconds: 0,
        isLoading: false,
        error: null,
      });

      console.log(`📱 Started offline session: ${sessionId} with ${selectedQuestions.length} questions`);
      return true;
    } catch (error: any) {
      console.error('Error starting offline session:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
      return false;
    }
  }, []);

  /**
   * Submit an answer for the current question
   */
  const submitAnswer = useCallback((
    selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E',
    timeSpentSeconds: number
  ) => {
    setState(prev => {
      const currentQuestion = prev.questions[prev.currentIndex];
      if (!currentQuestion) return prev;

      const isCorrect = selectedAnswer === currentQuestion.correct_answer;
      
      const answer: OfflineAnswer = {
        questionId: currentQuestion.id,
        selectedAnswer,
        correctAnswer: currentQuestion.correct_answer as 'A' | 'B' | 'C' | 'D' | 'E',
        isCorrect,
        timeSpentSeconds,
        answeredAt: new Date().toISOString(),
      };

      return {
        ...prev,
        answers: [...prev.answers, answer],
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        totalTimeSeconds: prev.totalTimeSeconds + timeSpentSeconds,
      };
    });
  }, []);

  /**
   * Move to next question
   */
  const nextQuestion = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.questions.length - 1),
    }));
  }, []);

  /**
   * Move to previous question
   */
  const previousQuestion = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }, []);

  /**
   * Complete the session and save for sync
   */
  const completeSession = useCallback(async (): Promise<string | null> => {
    if (!user || !state.sessionId || !state.startTime) {
      return null;
    }

    try {
      const currentQuestion = state.questions[0];
      const subjectId = currentQuestion?.subject_id || 'unknown';
      const subjectName = (currentQuestion as { subject_name?: string })?.subject_name || 'Unknown Subject';

      const session: Omit<OfflineSession, 'id' | 'synced'> = {
        userId: user.id,
        subjectId,
        subjectName,
        startedAt: state.startTime.toISOString(),
        completedAt: new Date().toISOString(),
        questionsAnswered: state.answers.length,
        correctAnswers: state.correctCount,
        totalTimeSeconds: state.totalTimeSeconds,
        answers: state.answers,
      };

      const savedSessionId = await offlineSyncService.saveOfflineSession(session);
      
      console.log(`✅ Offline session completed and saved: ${savedSessionId}`);
      
      // Reset state
      setState(initialState);
      
      return savedSessionId;
    } catch (error: any) {
      console.error('Error completing offline session:', error);
      setState(prev => ({ ...prev, error: error.message }));
      return null;
    }
  }, [user, state]);

  /**
   * Get current question
   */
  const getCurrentQuestion = useCallback((): Question | null => {
    return state.questions[state.currentIndex] || null;
  }, [state.questions, state.currentIndex]);

  /**
   * Get progress info
   */
  const getProgress = useCallback(() => {
    const total = state.questions.length;
    const current = state.currentIndex + 1;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    return { current, total, percentage };
  }, [state.questions.length, state.currentIndex]);

  return {
    state,
    startSession,
    submitAnswer,
    nextQuestion,
    previousQuestion,
    completeSession,
    getCurrentQuestion,
    getProgress,
    canPracticeOffline,
    downloadQuestionsForSubject,
    getCacheInfo,
  };
}

export default useOfflinePractice;
