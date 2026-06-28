import { supabase } from './supabase';
import { offlineService } from './offlineService';
import { offlineSyncService } from './offlineSyncService';
import { analyticsService } from './analyticsService';
import NetInfo from '@react-native-community/netinfo';
import i18n from '../i18n';
import {
  Question,
  Answer,
  PracticeSession,
  BookmarkedQuestion,
  SubjectWithProgress,
  QuizResult,
  ExamStage,
  PracticeMode,
  SubtopicItem,
  TopicWithSubtopics,
} from '../types/practice';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BACKGROUND_DOWNLOAD_COOLDOWN_HOURS = 6;
const OFFLINE_BASE_QUESTIONS_PER_SUBJECT = 45;
const OFFLINE_WEAK_SUBJECT_QUESTIONS = 90;
const OFFLINE_SECONDARY_SUBJECT_QUESTIONS = 15;

const isUuid = (value?: string | null): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

type OfflineDownloadSubject = {
  id: string;
  name_en: string;
  name_az: string;
  isTargetGroupSubject?: boolean;
};

class PracticeService {
  // Get all subjects for student's target group with progress
  async getSubjectsByGroup(examGroup: string, examStage?: ExamStage, userId?: string): Promise<SubjectWithProgress[]> {
    try {
      // Check network status
      const networkState = await NetInfo.fetch();
      const isOnline = networkState.isConnected && networkState.isInternetReachable;

      // If offline, try to get cached subjects
      if (!isOnline) {
        console.log('📴 Offline - loading cached subjects');
        const cachedSubjects = await offlineService.getCachedSubjects();
        if (cachedSubjects && cachedSubjects.length > 0) {
          // Filter by stage if needed
          let filteredSubjects = cachedSubjects;
          if (examStage) {
            filteredSubjects = cachedSubjects.filter(
              (s: any) => s.exam_stage === examStage
            );
          }

          // Add cached question counts
          const subjectsWithCache = await Promise.all(
            filteredSubjects.map(async (subject: any) => {
              const cachedCount = await offlineService.getCachedQuestionCount(subject.id);
              return {
                ...subject,
                cached_questions: cachedCount,
                is_available_offline: cachedCount > 0,
              };
            })
          );

          return subjectsWithCache;
        }
        return [];
      }

      let query = supabase
        .from('subjects')
        .select('*');

      // Filter by category if examStage is provided
      if (examStage) {
        const category = examStage === 'first' ? 'first_stage' : 'second_stage';
        query = query.eq('category', category);
      }

      const { data: subjects, error } = await query.order('name_en');

      if (error) throw error;

      // Get progress data for each subject
      const subjectsWithProgress = await Promise.all(
        (subjects || []).map(async (subject: any) => {
          // Get total questions count (exclude written_open from practice)
          const { count: totalQuestions } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subject.id)
            .eq('is_active', true)
            .eq('exclude_from_practice', false)
            .neq('question_type', 'written_open');
          const cacheInfo = await offlineService.getQuestionCacheInfo(subject.id);

          if (!userId) {
            return {
              id: subject.id,
              name_en: subject.name_en,
              name_az: subject.name_az,
              exam_stage: (subject.category === 'first_stage' ? 'first' : 'second') as ExamStage,
              exam_group: examGroup,
              total_questions: totalQuestions || 0,
              practiced_questions: 0,
              accuracy: 0,
              progress_percentage: 0,
              last_practiced: undefined,
              cached_questions: cacheInfo.cachedCount,
              is_available_offline: cacheInfo.hasCached,
              offline_last_sync: cacheInfo.lastSync,
            };
          }

          // Get user's practice/quiz answers for this subject
          const { data: answers } = await supabase
            .from('student_answers')
            .select('question_id, is_correct, answered_at, questions!inner(subject_id)')
            .eq('user_id', userId)
            .eq('questions.subject_id', subject.id);

          // Calculate unique questions practiced
          const uniqueQuestions = new Set((answers || []).map((a: any) => a.question_id));
          const practicedQuestions = uniqueQuestions.size;

          // Calculate correct answers from unique questions only (take best attempt)
          const questionCorrectMap = new Map<string, boolean>();
          (answers || []).forEach((a: any) => {
            const currentStatus = questionCorrectMap.get(a.question_id);
            // If already correct, keep it. Otherwise, update with latest attempt
            if (currentStatus !== true) {
              questionCorrectMap.set(a.question_id, a.is_correct);
            }
          });
          const uniqueCorrectAnswers = Array.from(questionCorrectMap.values()).filter(Boolean).length;

          // Calculate accuracy (from all attempts)
          const correctAnswers = (answers || []).filter((a: any) => a.is_correct).length;
          const totalAnswers = (answers || []).length;
          const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

          // Calculate progress (percentage of correct answers out of total questions)
          const progressPercentage = totalQuestions && totalQuestions > 0
            ? Math.round((uniqueCorrectAnswers / totalQuestions) * 100)
            : 0;

          // Get last practiced date
          const lastPracticed = answers && answers.length > 0
            ? answers.sort((a: any, b: any) =>
                new Date(b.answered_at).getTime() - new Date(a.answered_at).getTime()
              )[0].answered_at
            : undefined;

          return {
            id: subject.id,
            name_en: subject.name_en,
            name_az: subject.name_az,
            exam_stage: (subject.category === 'first_stage' ? 'first' : 'second') as ExamStage,
            exam_group: examGroup,
            total_questions: totalQuestions || 0,
            practiced_questions: practicedQuestions,
            accuracy,
            progress_percentage: progressPercentage,
            last_practiced: lastPracticed,
            cached_questions: cacheInfo.cachedCount,
            is_available_offline: cacheInfo.hasCached,
            offline_last_sync: cacheInfo.lastSync,
          };
        })
      );

      // Cache subjects for offline use
      await offlineService.cacheSubjects(subjectsWithProgress);

      return subjectsWithProgress;
    } catch (error) {
      console.error('Get subjects by group error:', error);

      // On error, try to return cached subjects
      const cachedSubjects = await offlineService.getCachedSubjects();
      if (cachedSubjects && cachedSubjects.length > 0) {
        console.log('📦 Returning cached subjects due to error');
        return cachedSubjects;
      }

      return [];
    }
  }

  // Get random questions for practice mode (with offline support)
  // Uses smart selection algorithm: prioritizes unanswered > incorrect > old correct
  async getRandomQuestions(
    subjectId: string,
    count: number = 10,
    excludeQuestionIds: string[] = [],
    userId?: string
  ): Promise<Question[]> {
    try {
      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;

      // Try to get from cache first if offline
      if (!isOnline) {
        const cached = await offlineService.getCachedQuestions(subjectId);
        if (cached && cached.length > 0) {
          let questions = cached.filter((q: any) => !excludeQuestionIds.includes(q.id));
          questions = questions.sort(() => Math.random() - 0.5);
          return questions.slice(0, count);
        }
        throw new Error('No cached questions available offline');
      }

      // Online: Use smart question selection algorithm
      // Priority: 1) Never answered, 2) Incorrectly answered (oldest first), 3) Correctly answered (oldest first for spaced repetition)

      // First, get all available questions for this subject
      const { data: allQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*, subjects(name_en)')
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .eq('exclude_from_practice', false)
        .neq('question_type', 'written_open');

      if (questionsError) throw questionsError;

      let questions = (allQuestions || [])
        .filter((q: any) => !excludeQuestionIds.includes(q.id))
        .map((q: any) => ({
          ...q,
          subject_name: q.subjects?.name_en,
        }));

      // If no userId provided, just shuffle and return
      if (!userId || questions.length === 0) {
        questions = questions.sort(() => Math.random() - 0.5);
        return questions.slice(0, count);
      }

      // Get user's answer history for this subject
      // Limit question IDs to avoid Supabase query limits (max ~100 items in IN clause)
      const questionIds = questions.map(q => q.id);
      const MAX_IN_CLAUSE_SIZE = 100;

      let answerHistory: any[] = [];
      let historyError: any = null;

      if (questionIds.length <= MAX_IN_CLAUSE_SIZE) {
        const { data, error } = await supabase
          .from('student_answers')
          .select('question_id, is_correct, was_skipped, answered_at')
          .eq('user_id', userId)
          .in('question_id', questionIds)
          .order('answered_at', { ascending: false });
        answerHistory = data || [];
        historyError = error;
      } else {
        // For large question sets, fetch in batches
        for (let i = 0; i < questionIds.length; i += MAX_IN_CLAUSE_SIZE) {
          const batch = questionIds.slice(i, i + MAX_IN_CLAUSE_SIZE);
          const { data, error } = await supabase
            .from('student_answers')
            .select('question_id, is_correct, was_skipped, answered_at')
            .eq('user_id', userId)
            .in('question_id', batch)
            .order('answered_at', { ascending: false });
          if (error) {
            historyError = error;
            break;
          }
          answerHistory = [...answerHistory, ...(data || [])];
        }
      }

      if (historyError) {
        console.warn('Could not fetch answer history, using random selection:', historyError);
        questions = questions.sort(() => Math.random() - 0.5);
        return questions.slice(0, count);
      }

      // Delegate to shared adaptive selection (90% weak / 10% correct)
      // Fetch recent session question IDs for cross-session deduplication
      const recentQuestionIds = await this.getRecentSessionQuestionIds(userId, subjectId);
      const result = this.applyAdaptiveSelection(questions, answerHistory, count, recentQuestionIds);

      // Cache questions for offline use
      if (result.length > 0) {
        await offlineService.cacheQuestions(subjectId, result);
      }

      return result;
    } catch (error) {
      console.error('Get random questions error:', error);
      return [];
    }
  }

  // Get quiz questions (30 questions for timed quiz)
  async getQuizQuestions(subjectId: string, userId?: string): Promise<Question[]> {
    return this.getRandomQuestions(subjectId, 30, [], userId);
  }

  // Create practice session (with offline support)
  async createPracticeSession(
    userId: string,
    subjectId: string,
    mode: PracticeMode,
    totalQuestions: number,
    questionIds: string[] = []
  ): Promise<string | null> {
    try {
      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;

      // If offline, create a local session ID
      if (!isOnline) {
        // Generate a temporary offline session ID
        const offlineSessionId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('📴 Created offline practice session:', offlineSessionId);

        // Store offline session for later sync
        await offlineService.saveOfflineSession({
          id: offlineSessionId,
          userId,
          subjectId,
          mode,
          totalQuestions,
          questionIds,
          startedAt: new Date().toISOString(),
        });

        return offlineSessionId;
      }

      // Online: Create session in database
      const { data, error } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: userId,
          subject_id: subjectId,
          mode,
          total_questions: totalQuestions,
          correct_answers: 0,
          total_time_seconds: 0,
          completed: false,
          started_at: new Date().toISOString(),
          question_ids: questionIds,
        })
        .select()
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Create practice session error:', error);

      // Fallback to offline session on error
      const offlineSessionId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('📴 Fallback to offline session due to error:', offlineSessionId);

      await offlineService.saveOfflineSession({
        id: offlineSessionId,
        userId,
        subjectId,
        mode,
        totalQuestions,
        questionIds,
        startedAt: new Date().toISOString(),
      });

      return offlineSessionId;
    }
  }

  // Submit answer (with offline support)
  async submitAnswer(
    userId: string,
    questionId: string,
    selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string,
    correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string,
    timeSpentSeconds: number,
    sessionId?: string
  ): Promise<boolean> {
    try {
      // Determine if this is MCQ or codable_open based on answer format
      const isMCQ = ['A', 'B', 'C', 'D', 'E'].includes(selectedAnswer as string);

      // For codable_open, compare case-insensitive
      const isCorrect = isMCQ
        ? selectedAnswer === correctAnswer
        : selectedAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();

      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        // Save offline for later sync
        await offlineService.saveOfflineAnswer({
          userId,
          questionId,
          selectedAnswer,
          correctAnswer,
          timeSpent: timeSpentSeconds,
          sessionId,
        });
        return isCorrect;
      }

      // Online: Submit to database
      const answeredAt = new Date().toISOString();
      if (isUuid(sessionId)) {
        const { error } = await supabase.rpc('upsert_practice_answer_with_timing', {
          p_practice_session_id: sessionId,
          p_question_id: questionId,
          p_selected_answer: isMCQ ? selectedAnswer : null,
          p_text_answer: isMCQ ? null : selectedAnswer,
          p_is_correct: isCorrect,
          p_time_spent_seconds: Math.max(0, Math.round(timeSpentSeconds || 0)),
          p_was_skipped: false,
          p_answered_at: answeredAt,
        });

        if (error) throw error;
        return isCorrect;
      }

      // Fallback for old/no-session calls. Normal practice/quiz flows use the RPC above.
      const insertData: any = {
        user_id: userId,
        question_id: questionId,
        is_correct: isCorrect,
        time_spent_seconds: Math.max(0, Math.round(timeSpentSeconds || 0)),
        answered_at: answeredAt,
      };

      if (isMCQ) {
        insertData.selected_answer = selectedAnswer;
      } else {
        insertData.text_answer = selectedAnswer;
      }

      const { error } = await supabase.from('student_answers').insert(insertData);
      if (error) throw error;
      return isCorrect;
    } catch (error) {
      console.error('Submit answer error:', error);
      // If online submit fails, save offline as fallback
      await offlineService.saveOfflineAnswer({
        userId,
        questionId,
        selectedAnswer,
        correctAnswer,
        timeSpent: timeSpentSeconds,
        sessionId,
      });
      return selectedAnswer === correctAnswer;
    }
  }

  /**
   * Record a skipped question so the adaptive algorithm can prioritize it next session.
   * Inserts a student_answers row with is_correct=false, was_skipped=true.
   */
  async recordSkippedQuestion(
    userId: string,
    questionId: string,
    sessionId?: string,
    timeSpentSeconds: number = 0
  ): Promise<void> {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;
      if (!isOnline) return; // Skip recording when offline — not critical

      if (isUuid(sessionId)) {
        const { error } = await supabase.rpc('upsert_practice_answer_with_timing', {
          p_practice_session_id: sessionId,
          p_question_id: questionId,
          p_selected_answer: null,
          p_text_answer: null,
          p_is_correct: false,
          p_time_spent_seconds: Math.max(0, Math.round(timeSpentSeconds || 0)),
          p_was_skipped: true,
          p_answered_at: new Date().toISOString(),
        });

        if (error) throw error;
        return;
      }

      await supabase.from('student_answers').insert({
        user_id: userId,
        question_id: questionId,
        is_correct: false,
        was_skipped: true,
        time_spent_seconds: Math.max(0, Math.round(timeSpentSeconds || 0)),
        answered_at: new Date().toISOString(),
      });
    } catch (error) {
      // Non-blocking — don't break the quiz flow
      console.warn('Record skipped question error:', error);
    }
  }

  // Complete practice session (with offline support)
  async completePracticeSession(
    sessionId: string,
    correctAnswers: number,
    totalTimeSeconds: number
  ): Promise<void> {
    try {
      // Check if this is an offline session - skip database update
      const isOfflineSession = sessionId.startsWith('offline_');
      if (isOfflineSession) {
        console.log('📴 Offline session - skipping database update for completePracticeSession');
        return;
      }

      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        console.log('📴 Offline - skipping database update for completePracticeSession');
        return;
      }

      const { error } = await supabase
        .from('practice_sessions')
        .update({
          correct_answers: correctAnswers,
          total_time_seconds: totalTimeSeconds,
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Complete practice session error:', error);
    }
  }

  // Get quiz result (with offline support)
  async getQuizResult(sessionId: string): Promise<QuizResult | null> {
    try {
      // Check if this is an offline session
      const isOfflineSession = sessionId.startsWith('offline_');

      // Check network status
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      // For offline sessions or when offline, try to get from local storage
      if (isOfflineSession || !isOnline) {
        const offlineResult = await offlineService.getOfflineSessionResult(sessionId);
        if (offlineResult) {
          return offlineResult;
        }

        // If no cached result and offline, return null
        if (!isOnline) {
          console.log('📴 Offline and no cached result for session:', sessionId);
          return null;
        }
      }

      // Online: Get session data from database
      const { data: session, error: sessionError } = await supabase
        .from('practice_sessions')
        .select('*, subjects(name_en, name_az)')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Get all answers for this session with question order
      const { data: answers, error: answersError } = await supabase
        .from('student_answers')
        .select('*, questions(*)')
        .eq('practice_session_id', sessionId)
        .order('answered_at', { ascending: true });

      if (answersError) throw answersError;

      // Separate real answers from skipped-question markers
      const allRows = answers || [];
      const realAnswers = allRows.filter((a: any) => !a.was_skipped);
      const totalQuestions = session.total_questions;
      const answeredQuestions = realAnswers.length;
      const correctAnswers = realAnswers.filter((a: any) => a.is_correct).length;
      const incorrectAnswers = answeredQuestions - correctAnswers;
      const skippedQuestions = totalQuestions - answeredQuestions;
      const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

      // Calculate average time only for answered questions
      const totalAnsweredTime = realAnswers.reduce((sum: number, answer: any) => sum + (answer.time_spent_seconds || 0), 0);
      const averageTime = answeredQuestions > 0 ? Math.round(totalAnsweredTime / answeredQuestions) : 0;

      const questionsWithAnswers = realAnswers.map((answer: any, index: number) => ({
        question: answer.questions,
        user_answer: answer.selected_answer,
        is_correct: answer.is_correct,
        time_spent: answer.time_spent_seconds,
        question_number: index + 1, // Original order in the quiz
      }));

      // Get current language from i18n
      const currentLanguage = i18n.language || 'az';
      const subjectName = currentLanguage === 'en'
        ? (session.subjects?.name_en || session.subjects?.name_az || 'Unknown')
        : (session.subjects?.name_az || session.subjects?.name_en || 'Unknown');

      return {
        session_id: sessionId,
        subject_id: session.subject_id,
        subject_name: subjectName,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
        skipped_questions: skippedQuestions,
        score_percentage: scorePercentage,
        total_time_seconds: session.total_time_seconds,
        average_time_per_question: averageTime,
        questions_with_answers: questionsWithAnswers,
      };
    } catch (error) {
      console.error('Get quiz result error:', error);
      return null;
    }
  }

  /**
   * Save offline session result for later retrieval
   * Call this when completing a practice session offline
   */
  async saveOfflineSessionResult(
    sessionId: string,
    subjectId: string,
    subjectName: string,
    questions: any[],
    answers: Map<string, string>,
    totalTimeSeconds: number,
    questionTimes?: Map<string, number> | Record<string, number>
  ): Promise<void> {
    try {
      const totalQuestions = questions.length;
      let correctAnswers = 0;
      const answersByQuestionId = Object.fromEntries(answers.entries());
      const getQuestionTime = (questionId: string): number => {
        if (!questionTimes) return 0;
        const rawTime = questionTimes instanceof Map
          ? questionTimes.get(questionId)
          : questionTimes[questionId];
        return Math.max(0, Math.round(Number(rawTime) || 0));
      };
      const questionTimesById = questions.reduce<Record<string, number>>((acc, question) => {
        if (question?.id) {
          acc[question.id] = getQuestionTime(question.id);
        }
        return acc;
      }, {});

      const questionsWithAnswers = questions.map((question, index) => {
        const userAnswer = answers.get(question.id) || null;
        const isCorrect = !!userAnswer && userAnswer === question.correct_answer;
        if (isCorrect) correctAnswers++;

        return {
          question: question,
          user_answer: userAnswer as 'A' | 'B' | 'C' | 'D' | 'E' | string | null,
          is_correct: isCorrect,
          time_spent: getQuestionTime(question.id),
          question_number: index + 1,
        };
      });

      const answeredQuestions = Array.from(answers.keys()).length;
      const incorrectAnswers = answeredQuestions - correctAnswers;
      const skippedQuestions = totalQuestions - answeredQuestions;
      const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
      const averageTime = answeredQuestions > 0 ? Math.round(totalTimeSeconds / answeredQuestions) : 0;

      const result: QuizResult & {
        questions: any[];
        answers: Record<string, string>;
        question_times: Record<string, number>;
      } = {
        session_id: sessionId,
        subject_id: subjectId,
        subject_name: subjectName,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
        skipped_questions: skippedQuestions,
        score_percentage: scorePercentage,
        total_time_seconds: totalTimeSeconds,
        average_time_per_question: averageTime,
        questions_with_answers: questionsWithAnswers,
        // Backward-compatible shape for review screens and any older readers.
        questions,
        answers: answersByQuestionId,
        question_times: questionTimesById,
      };

      await offlineService.saveOfflineSessionResult(sessionId, result);

      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user?.id;

      if (userId) {
        const offlineSessions = await offlineService.getOfflineSessions();
        const offlineSession = offlineSessions.find((session: any) => session.id === sessionId);
        const completedAt = new Date().toISOString();
        const averageAnswerTime = answeredQuestions > 0
          ? Math.max(0, Math.round(totalTimeSeconds / answeredQuestions))
          : 0;

        await offlineSyncService.queueCompletedSession({
          id: sessionId,
          userId,
          subjectId,
          subjectName,
          mode: offlineSession?.mode === 'quiz' ? 'quiz' : 'practice',
          startedAt: offlineSession?.startedAt || completedAt,
          completedAt,
          totalQuestions,
          answeredQuestions,
          questionIds: questions.map(question => question.id).filter(Boolean),
          questionsAnswered: totalQuestions,
          correctAnswers,
          totalTimeSeconds,
          answers: Array.from(answers.entries())
            .map(([questionId, selectedAnswer]) => {
              const question = questions.find(q => q.id === questionId);
              if (!question || !selectedAnswer) return null;

              return {
                questionId,
                selectedAnswer,
                correctAnswer: question.correct_answer,
                isCorrect: selectedAnswer === question.correct_answer,
                timeSpentSeconds: getQuestionTime(questionId) || averageAnswerTime,
                answeredAt: completedAt,
              };
            })
            .filter((answer): answer is NonNullable<typeof answer> => answer !== null),
          synced: false,
        });
      }
      console.log('📦 Saved offline session result:', sessionId);
    } catch (error) {
      console.error('Save offline session result error:', error);
    }
  }

  // Bookmark question
  async bookmarkQuestion(userId: string, questionId: string, notes?: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('bookmarked_questions').insert({
        user_id: userId,
        question_id: questionId,
        notes,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Bookmark question error:', error);
      return false;
    }
  }

  // Remove bookmark
  async removeBookmark(userId: string, questionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bookmarked_questions')
        .delete()
        .eq('user_id', userId)
        .eq('question_id', questionId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Remove bookmark error:', error);
      return false;
    }
  }

  // Get bookmarked questions
  async getBookmarkedQuestions(userId: string): Promise<BookmarkedQuestion[]> {
    try {
      const { data, error } = await supabase
        .from('bookmarked_questions')
        .select('*, questions(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        question_id: item.question_id,
        question: item.questions,
        notes: item.notes,
        created_at: item.created_at,
      }));
    } catch (error) {
      console.error('Get bookmarked questions error:', error);
      return [];
    }
  }

  // Check if question is bookmarked
  async isQuestionBookmarked(userId: string, questionId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('bookmarked_questions')
        .select('id')
        .eq('user_id', userId)
        .eq('question_id', questionId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Check bookmark error:', error);
      return false;
    }
  }

  // Get wrong answers for review
  async getWrongAnswers(userId: string, subjectId?: string): Promise<Question[]> {
    try {
      let query = supabase
        .from('student_answers')
        .select('*, questions(*, subjects(name_en))')
        .eq('user_id', userId)
        .eq('is_correct', false);

      if (subjectId) {
        query = query.eq('questions.subject_id', subjectId);
      }

      const { data, error } = await query
        .order('answered_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Remove duplicate questions (keep only the most recent wrong answer for each question)
      const uniqueQuestions = new Map<string, any>();
      (data || []).forEach((item: any) => {
        if (item.questions && !uniqueQuestions.has(item.questions.id)) {
          uniqueQuestions.set(item.questions.id, {
            ...item.questions,
            subject_name: item.questions?.subjects?.name_en,
          });
        }
      });

      return Array.from(uniqueQuestions.values());
    } catch (error) {
      console.error('Get wrong answers error:', error);
      return [];
    }
  }

  // Update study progress
  async updateStudyProgress(
    userId: string,
    subjectId: string,
    questionsPracticed: number,
    correctAnswers: number,
    timeSpentMinutes: number
  ): Promise<void> {
    try {
      // Get student_id from user_id
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        // Student record doesn't exist yet - skip progress tracking
        // This is normal for new users who haven't completed profile setup
        console.log('Skipping progress update - student profile not complete');
        return;
      }

      // Check if progress record exists
      const { data: existing } = await supabase
        .from('study_progress')
        .select('*')
        .eq('student_id', student.id)
        .eq('subject_id', subjectId)
        .single();

      if (existing) {
        // Update existing record
        const newQuestionsAttempted = existing.questions_attempted + questionsPracticed;
        const newQuestionsCorrect = existing.questions_correct + correctAnswers;
        const newStudyTime = existing.study_time + timeSpentMinutes;

        await supabase
          .from('study_progress')
          .update({
            questions_attempted: newQuestionsAttempted,
            questions_correct: newQuestionsCorrect,
            study_time: newStudyTime,
          })
          .eq('id', existing.id);
      } else {
        // Create new record
        await supabase.from('study_progress').insert({
          student_id: student.id,
          subject_id: subjectId,
          questions_attempted: questionsPracticed,
          questions_correct: correctAnswers,
          study_time: timeSpentMinutes,
        });
      }
    } catch (error) {
      console.error('Update study progress error:', error);
    }
  }

  // Sync offline answers to database
  async syncOfflineAnswers(): Promise<{ success: number; failed: number }> {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        return { success: 0, failed: 0 };
      }

      const offlineAnswers = await offlineService.getOfflineAnswers();
      if (offlineAnswers.length === 0) {
        return { success: 0, failed: 0 };
      }

      let successCount = 0;
      let failedCount = 0;
      const syncedTimestamps: string[] = [];

      for (const answer of offlineAnswers) {
        try {
          const isCorrect = answer.selectedAnswer === answer.correctAnswer;
          const isMCQ = ['A', 'B', 'C', 'D', 'E'].includes(answer.selectedAnswer as string);
          const { error } = isUuid(answer.sessionId)
            ? await supabase.rpc('upsert_practice_answer_with_timing', {
                p_practice_session_id: answer.sessionId,
                p_question_id: answer.questionId,
                p_selected_answer: isMCQ ? answer.selectedAnswer : null,
                p_text_answer: isMCQ ? null : answer.selectedAnswer,
                p_is_correct: isCorrect,
                p_time_spent_seconds: Math.max(0, Math.round(answer.timeSpent || 0)),
                p_was_skipped: false,
                p_answered_at: answer.timestamp,
              })
            : await supabase.from('student_answers').insert({
                user_id: answer.userId,
                question_id: answer.questionId,
                selected_answer: isMCQ ? answer.selectedAnswer : null,
                text_answer: isMCQ ? null : answer.selectedAnswer,
                is_correct: isCorrect,
                time_spent_seconds: Math.max(0, Math.round(answer.timeSpent || 0)),
                answered_at: answer.timestamp,
              });

          if (error) {
            failedCount++;
          } else {
            successCount++;
            syncedTimestamps.push(answer.timestamp);
          }
        } catch (error) {
          console.error('Sync answer error:', error);
          failedCount++;
        }
      }

      // Mark synced answers
      if (syncedTimestamps.length > 0) {
        await offlineService.markAnswersSynced(syncedTimestamps);
        await offlineService.clearOldSyncedAnswers();
      }

      return { success: successCount, failed: failedCount };
    } catch (error) {
      console.error('Sync offline answers error:', error);
      return { success: 0, failed: 0 };
    }
  }

  // Get question reviews for a practice session
  async getQuestionReviews(sessionId: string, filter: 'all' | 'correct' | 'incorrect' = 'all') {
    try {
      // Check if this is an offline session
      const isOfflineSession = sessionId?.startsWith('offline_');

      if (isOfflineSession) {
        // Get offline session result
        const offlineResult = await offlineService.getOfflineSessionResult(sessionId);
        if (!offlineResult) {
          console.error('Offline session result not found:', sessionId);
          return [];
        }

        // Build reviews from offline data
        const subjectName = offlineResult.subject_name || 'Unknown';
        const questionRows = Array.isArray(offlineResult.questions_with_answers)
          ? offlineResult.questions_with_answers
          : (offlineResult.questions || []).map((question: any, index: number) => ({
              question,
              user_answer: offlineResult.answers?.[question.id] || null,
              is_correct: !!offlineResult.answers?.[question.id] && offlineResult.answers[question.id] === question.correct_answer,
              time_spent: Math.max(0, Math.round(Number(offlineResult.question_times?.[question.id]) || 0)),
              question_number: index + 1,
            }));

        const reviews = questionRows.map((row: any, index: number) => {
          const question = row.question || row;
          const userAnswer = row.user_answer || null;
          const isCorrect = !!row.is_correct;

          return {
            id: `offline_review_${question.id}`,
            session_id: sessionId,
            question_id: question.id,
            selected_answer: userAnswer,
            is_correct: isCorrect,
            time_spent: row.time_spent || 0,
            question: {
              id: question.id,
              question_text: question.question_text,
              question_type: question.question_type || 'mcq',
              option_a: question.option_a,
              option_b: question.option_b,
              option_c: question.option_c,
              option_d: question.option_d,
              option_e: question.option_e,
              correct_answer: question.correct_answer,
              explanation: question.explanation || '',
              difficulty: question.difficulty || question.difficulty_level || 'medium',
              subject_name: subjectName,
            },
            correct_answer: question.correct_answer,
            question_number: row.question_number || index + 1,
            is_skipped: !userAnswer,
          };
        });

        // Apply filter
        if (filter === 'correct') {
          return reviews.filter((r: any) => r.is_correct);
        } else if (filter === 'incorrect') {
          return reviews.filter((r: any) => !r.is_correct && r.selected_answer);
        }
        // 'all' filter returns everything
        return reviews;
      }

      // Online session - get from database
      // Get session to find all questions
      const { data: session, error: sessionError } = await supabase
        .from('practice_sessions')
        .select('*, subjects(name_az, name_en)')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Get all answers with question order
      const { data: answers, error: answersError } = await supabase
        .from('student_answers')
        .select(`
          *,
          question:questions(*)
        `)
        .eq('practice_session_id', sessionId)
        .order('answered_at');

      if (answersError) throw answersError;

      // Get current language from i18n
      const currentLanguage = i18n.language || 'az';
      const subjectName = currentLanguage === 'en'
        ? (session.subjects?.name_en || session.subjects?.name_az || 'Unknown')
        : (session.subjects?.name_az || session.subjects?.name_en || 'Unknown');

      // For "all" filter, fetch all questions including skipped
      if (filter === 'all' && session.question_ids && session.question_ids.length > 0) {
        // Fetch all questions from session
        const { data: allQuestions, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .in('id', session.question_ids);

        if (questionsError) throw questionsError;

        // Create a map of answered questions
        const answersMap = new Map();
        (answers || []).forEach((answer: any) => {
          answersMap.set(answer.question_id, answer);
        });

        // Build result with all questions in order
        return (session.question_ids || []).map((questionId: string, index: number) => {
          const question = (allQuestions || []).find((q: any) => q.id === questionId);
          const answer = answersMap.get(questionId);

          if (answer) {
            // Answered question (or skipped with a DB row)
            return {
              ...answer,
              question: {
                ...answer.question,
                subject_name: subjectName,
              },
              correct_answer: answer.question.correct_answer,
              time_spent: answer.time_spent_seconds,
              question_number: index + 1,
              is_skipped: answer.was_skipped || false,
            };
          } else {
            // Skipped question
            return {
              id: `skipped_${questionId}`,
              question_id: questionId,
              selected_answer: null,
              is_correct: false,
              question: {
                ...question,
                subject_name: subjectName,
              },
              correct_answer: question?.correct_answer,
              time_spent: 0,
              question_number: index + 1,
              is_skipped: true,
            };
          }
        });
      }

      // For correct/incorrect filters — exclude skipped (was_skipped=true) from both
      const filtered = (answers || []).filter((answer: any) => {
        if (filter === 'correct') return answer.is_correct && !answer.was_skipped;
        if (filter === 'incorrect') return !answer.is_correct && !answer.was_skipped;
        return true;
      });

      return filtered.map((answer: any) => {
        const originalIndex = (answers || []).findIndex((a: any) => a.id === answer.id);
        return {
          ...answer,
          question: {
            ...answer.question,
            subject_name: subjectName,
          },
          correct_answer: answer.question.correct_answer,
          time_spent: answer.time_spent_seconds,
          question_number: originalIndex + 1,
        };
      });
    } catch (error) {
      console.error('Get question reviews error:', error);
      throw error;
    }
  }

  /**
   * Get questions for offline caching
   * Downloads a batch of questions for a subject to be used offline
   */
  async getQuestionsForOffline(subjectId: string, count: number = 100): Promise<Question[]> {
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select(`
          id,
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          option_e,
          correct_answer,
          explanation,
          difficulty,
          question_type,
          topic,
          subtopic_id,
          subject_id,
          subjects!inner (
            id,
            name_en,
            name_az
          ),
          subject_subtopics (
            id,
            topic_id,
            subtopic_name,
            description,
            difficulty_level,
            display_order,
            is_active
          )
        `)
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .eq('exclude_from_practice', false)
        .neq('question_type', 'written_open')
        .limit(Math.max(count * 4, count));

      if (error) throw error;

      // Transform to match Question type (partial for offline use)
      return (questions || []).map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        option_e: q.option_e,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        question_type: q.question_type || 'mcq',
        difficulty_level: q.difficulty || 'medium',
        topic: q.topic,
        subtopic_id: q.subtopic_id,
        subject_id: q.subject_id,
        subject_subtopics: q.subject_subtopics,
        subject_name: q.subjects?.name_en || '',
        subject_name_az: q.subjects?.name_az || '',
        exam_stage: 'first' as const,
        exam_group: 'general',
        created_at: new Date().toISOString(),
      })) as Question[];
    } catch (error) {
      console.error('Get questions for offline error:', error);
      throw error;
    }
  }

  /**
   * Get all subjects with their offline cache status
   */
  async getSubjectsWithOfflineStatus(userId: string): Promise<Array<{
    id: string;
    name: string;
    hasCached: boolean;
    cachedCount: number;
    totalQuestions: number;
  }>> {
    try {
      // Get all subjects
      const { data: subjects, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (error) throw error;

      // Check cache status for each subject
      const results = await Promise.all(
        (subjects || []).map(async (subject: any) => {
          const cachedQuestions = await offlineService.getCachedQuestions(subject.id);
          const hasCached = await offlineService.hasCachedQuestions(subject.id);

          // Get total questions count
          const { count: totalQuestions } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subject.id)
            .eq('is_active', true);

          return {
            id: subject.id,
            name: i18n.language === 'az' ? subject.name_az : subject.name_en,
            hasCached,
            cachedCount: cachedQuestions?.length || 0,
            totalQuestions: totalQuestions || 0,
          };
        })
      );

      return results;
    } catch (error) {
      console.error('Get subjects with offline status error:', error);
      throw error;
    }
  }

  /**
   * Download questions for offline use (like Lichess puzzle download)
   * Downloads a pool of random questions that can be used for multiple practice sessions
   * @param subjectId - Subject to download questions for
   * @param count - Number of questions to download (default 50 for variety)
   */
  async downloadQuestionsForOffline(subjectId: string, count: number = 50): Promise<{
    success: boolean;
    downloadedCount: number;
    error?: string;
  }> {
    try {
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        return { success: false, downloadedCount: 0, error: 'No internet connection' };
      }

      // Fetch random questions from the question bank
      const { data: questions, error } = await supabase
        .from('questions')
        .select(`
          *,
          subjects(name_en, name_az),
          subject_subtopics (
            id,
            topic_id,
            subtopic_name,
            description,
            difficulty_level,
            display_order,
            is_active
          )
        `)
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .eq('exclude_from_practice', false)
        .neq('question_type', 'written_open')
        .limit(Math.max(count * 3, count));

      if (error) throw error;

      if (!questions || questions.length === 0) {
        return { success: false, downloadedCount: 0, error: 'No questions available' };
      }

      // Build a topic/subtopic-balanced cache so offline topic selection has
      // meaningful coverage instead of one large random slice from the subject.
      const mappedQuestions = questions.map((q: any) => ({
        ...q,
        subject_name: q.subjects?.name_en,
      }));
      const byTopic = new Map<string, any[]>();

      mappedQuestions.forEach((question: any) => {
        const topic = question.subtopic_id || question.topic || 'General';
        const list = byTopic.get(topic) || [];
        list.push(question);
        byTopic.set(topic, list);
      });

      byTopic.forEach((list, topic) => {
        byTopic.set(topic, list.sort(() => Math.random() - 0.5));
      });

      const balancedQuestions: any[] = [];
      const topicLists = Array.from(byTopic.values());
      let cursor = 0;

      while (balancedQuestions.length < count && topicLists.some(list => list.length > 0)) {
        const list = topicLists[cursor % topicLists.length];
        const next = list.shift();
        if (next) balancedQuestions.push(next);
        cursor++;
      }

      // Cache the questions
      await offlineService.cacheQuestions(subjectId, balancedQuestions);

      console.log(`📥 Downloaded ${balancedQuestions.length} questions for offline use`);
      return { success: true, downloadedCount: balancedQuestions.length };
    } catch (error) {
      console.error('Download questions for offline error:', error);
      return { success: false, downloadedCount: 0, error: 'Failed to download questions' };
    }
  }

  /**
   * Sync offline sessions and answers when back online
   */
  async syncOfflineData(): Promise<{
    sessionsSynced: number;
    answersSynced: number;
    errors: string[];
  }> {
    const result = { sessionsSynced: 0, answersSynced: 0, errors: [] as string[] };

    try {
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        return result;
      }

      // Sync offline answers
      const offlineAnswers = await offlineService.getOfflineAnswers();
      if (offlineAnswers.length > 0) {
        const syncedTimestamps: string[] = [];

        for (const answer of offlineAnswers) {
          try {
            const isCorrect = answer.selectedAnswer === answer.correctAnswer;
            const isMCQ = ['A', 'B', 'C', 'D', 'E'].includes(answer.selectedAnswer as string);
            const { error } = isUuid(answer.sessionId)
              ? await supabase.rpc('upsert_practice_answer_with_timing', {
                  p_practice_session_id: answer.sessionId,
                  p_question_id: answer.questionId,
                  p_selected_answer: isMCQ ? answer.selectedAnswer : null,
                  p_text_answer: isMCQ ? null : answer.selectedAnswer,
                  p_is_correct: isCorrect,
                  p_time_spent_seconds: Math.max(0, Math.round(answer.timeSpent || 0)),
                  p_was_skipped: false,
                  p_answered_at: answer.timestamp,
                })
              : await supabase.from('student_answers').insert({
                  user_id: answer.userId,
                  question_id: answer.questionId,
                  selected_answer: isMCQ ? answer.selectedAnswer : null,
                  text_answer: isMCQ ? null : answer.selectedAnswer,
                  is_correct: isCorrect,
                  time_spent_seconds: Math.max(0, Math.round(answer.timeSpent || 0)),
                  answered_at: answer.timestamp,
                });

            if (!error) {
              syncedTimestamps.push(answer.timestamp);
              result.answersSynced++;
            }
          } catch (err) {
            result.errors.push(`Failed to sync answer: ${answer.questionId}`);
          }
        }

        if (syncedTimestamps.length > 0) {
          await offlineService.markAnswersSynced(syncedTimestamps);
        }
      }

      console.log(`✅ Synced ${result.answersSynced} answers`);
      return result;
    } catch (error) {
      console.error('Sync offline data error:', error);
      result.errors.push('Sync failed');
      return result;
    }
  }

  private async shouldSkipBackgroundDownload(): Promise<boolean> {
    const status = await offlineService.getBackgroundDownloadStatus();
    if (!status.lastDownload) return false;

    const hoursSinceDownload = (Date.now() - new Date(status.lastDownload).getTime()) / (1000 * 60 * 60);
    return hoursSinceDownload < BACKGROUND_DOWNLOAD_COOLDOWN_HOURS;
  }

  private async getSubjectsForOfflineDownload(targetGroup?: string | null): Promise<OfflineDownloadSubject[]> {
    const fetchAllSubjects = async (): Promise<OfflineDownloadSubject[]> => {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (subjectsError) throw subjectsError;

      return (subjects || []).map((subject: any) => ({
        id: subject.id,
        name_en: subject.name_en,
        name_az: subject.name_az,
        isTargetGroupSubject: false,
      }));
    };

    if (targetGroup) {
      try {
        const { data: examGroup, error: groupError } = await supabase
          .from('exam_groups')
          .select('id')
          .eq('code', targetGroup)
          .eq('is_active', true)
          .maybeSingle();

        if (groupError) throw groupError;

        if (examGroup?.id) {
          const { data: groupSubjects, error: groupSubjectsError } = await supabase
            .from('exam_group_subjects')
            .select('display_order, subject:subjects(id, name_en, name_az)')
            .eq('exam_group_id', examGroup.id)
            .eq('is_active', true)
            .order('display_order');

          if (groupSubjectsError) throw groupSubjectsError;

          const deduped = new Map<string, OfflineDownloadSubject>();
          (groupSubjects || []).forEach((row: any) => {
            const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
            if (subject?.id && !deduped.has(subject.id)) {
              deduped.set(subject.id, {
                id: subject.id,
                name_en: subject.name_en,
                name_az: subject.name_az,
                isTargetGroupSubject: true,
              });
            }
          });

          if (deduped.size > 0) {
            const allSubjects = await fetchAllSubjects();
            const secondarySubjects = allSubjects.filter(subject => !deduped.has(subject.id));
            return [...Array.from(deduped.values()), ...secondarySubjects];
          }
        }
      } catch (error) {
        console.warn('Offline subject group lookup failed, falling back to all subjects:', error);
      }
    }

    return fetchAllSubjects();
  }

  /**
   * Background download questions for all subjects
   * This should be called when the app is online to prepare for offline use
   * Downloads a pool of questions for each subject (like Lichess puzzle download)
   */
  async backgroundDownloadAllSubjects(
    questionsPerSubject: number = OFFLINE_BASE_QUESTIONS_PER_SUBJECT,
    onProgress?: (current: number, total: number, subjectName: string) => void,
    targetGroup?: string | null
  ): Promise<{
    success: boolean;
    subjectsDownloaded: number;
    totalQuestions: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      subjectsDownloaded: 0,
      totalQuestions: 0,
      errors: [] as string[],
    };

    try {
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        return { ...result, success: false, errors: ['No internet connection'] };
      }

      if (await this.shouldSkipBackgroundDownload()) {
        return result;
      }

      const subjects = await this.getSubjectsForOfflineDownload(targetGroup);
      if (!subjects || subjects.length === 0) {
        return { ...result, success: false, errors: ['No subjects found'] };
      }

      console.log(`📥 Starting background download for ${subjects.length} subjects...`);

      // Download questions for each subject
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[i];

        try {
          // Report progress
          if (onProgress) {
            onProgress(i + 1, subjects.length, subject.name_az || subject.name_en);
          }

          const targetCount = subject.isTargetGroupSubject === false
            ? Math.min(OFFLINE_SECONDARY_SUBJECT_QUESTIONS, questionsPerSubject)
            : questionsPerSubject;

          // Check if we already have enough cached questions
          const cachedCount = await offlineService.getCachedQuestionCount(subject.id);
          if (cachedCount >= targetCount) {
            console.log(`⏭️ Skipping ${subject.name_en} - already has ${cachedCount} cached questions`);
            result.subjectsDownloaded++;
            continue;
          }

          // Download questions for this subject
          const downloadResult = await this.downloadQuestionsForOffline(subject.id, targetCount);

          if (downloadResult.success) {
            result.subjectsDownloaded++;
            result.totalQuestions += downloadResult.downloadedCount;
            await offlineService.updateBackgroundDownloadStatus(subject.id, downloadResult.downloadedCount);
          } else {
            result.errors.push(`${subject.name_en}: ${downloadResult.error}`);
          }

          // Small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error downloading questions for ${subject.name_en}:`, err);
          result.errors.push(`${subject.name_en}: Download failed`);
        }
      }

      console.log(`✅ Background download complete: ${result.subjectsDownloaded} subjects, ${result.totalQuestions} questions`);
      return result;
    } catch (error) {
      console.error('Background download error:', error);
      return { ...result, success: false, errors: ['Background download failed'] };
    }
  }

  /**
   * Smart background download that prioritizes weak topics based on user analytics
   * Downloads more questions for subjects where the user has lower accuracy
   * Industry-standard adaptive learning approach
   */
  async smartBackgroundDownload(
    studentId: string,
    baseQuestionsPerSubject: number = OFFLINE_BASE_QUESTIONS_PER_SUBJECT,
    maxQuestionsForWeakSubjects: number = OFFLINE_WEAK_SUBJECT_QUESTIONS,
    onProgress?: (current: number, total: number, subjectName: string) => void,
    targetGroup?: string | null
  ): Promise<{
    success: boolean;
    subjectsDownloaded: number;
    totalQuestions: number;
    weakSubjectsPrioritized: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      subjectsDownloaded: 0,
      totalQuestions: 0,
      weakSubjectsPrioritized: 0,
      errors: [] as string[],
    };

    try {
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        return { ...result, success: false, errors: ['No internet connection'] };
      }

      if (await this.shouldSkipBackgroundDownload()) {
        return result;
      }

      // Get user's subject analytics (sorted by accuracy - lowest first)
      let subjectAnalytics: any[] = [];
      try {
        subjectAnalytics = await analyticsService.fetchSubjectAnalytics(studentId, '30D');
        console.log(`📊 Fetched analytics for ${subjectAnalytics.length} subjects`);
      } catch (analyticsError) {
        console.warn('⚠️ Could not fetch analytics, using default download:', analyticsError);
      }

      const subjects = await this.getSubjectsForOfflineDownload(targetGroup);
      if (!subjects || subjects.length === 0) {
        return { ...result, success: false, errors: ['No subjects found'] };
      }

      // Create a map of subject accuracy for quick lookup
      const accuracyMap = new Map<string, number>();
      subjectAnalytics.forEach(sa => {
        accuracyMap.set(sa.subject_id, sa.accuracy);
      });

      // Sort subjects: weak subjects first (lower accuracy = higher priority)
      const sortedSubjects = [...subjects].sort((a, b) => {
        if (!!a.isTargetGroupSubject !== !!b.isTargetGroupSubject) {
          return a.isTargetGroupSubject ? -1 : 1;
        }
        const accA = accuracyMap.get(a.id) ?? 100; // Default to 100% if no data
        const accB = accuracyMap.get(b.id) ?? 100;
        return accA - accB; // Lower accuracy first
      });

      console.log(`📥 Starting smart download for ${sortedSubjects.length} subjects (weak topics first)...`);

      // Download questions for each subject with adaptive count
      for (let i = 0; i < sortedSubjects.length; i++) {
        const subject = sortedSubjects[i];
        const accuracy = accuracyMap.get(subject.id);

        // Calculate questions to download based on accuracy
        // Weak subjects (accuracy < 60%): download max questions
        // Medium subjects (60-80%): download base + 50% extra
        // Strong subjects (>80%): download base questions
        let questionsToDownload = subject.isTargetGroupSubject === false
          ? OFFLINE_SECONDARY_SUBJECT_QUESTIONS
          : baseQuestionsPerSubject;
        let isWeakSubject = false;

        if (subject.isTargetGroupSubject !== false && accuracy !== undefined) {
          if (accuracy < 60) {
            questionsToDownload = maxQuestionsForWeakSubjects;
            isWeakSubject = true;
            result.weakSubjectsPrioritized++;
          } else if (accuracy < 80) {
            questionsToDownload = Math.round(baseQuestionsPerSubject * 1.5);
          }
        }

        try {
          // Report progress
          if (onProgress) {
            onProgress(i + 1, sortedSubjects.length, subject.name_az || subject.name_en);
          }

          // Check if we already have enough cached questions
          const cachedCount = await offlineService.getCachedQuestionCount(subject.id);
          if (cachedCount >= questionsToDownload) {
            console.log(`⏭️ Skipping ${subject.name_en} - already has ${cachedCount} cached questions`);
            result.subjectsDownloaded++;
            continue;
          }

          // Download questions for this subject
          const downloadResult = await this.downloadQuestionsForOffline(subject.id, questionsToDownload);

          if (downloadResult.success) {
            result.subjectsDownloaded++;
            result.totalQuestions += downloadResult.downloadedCount;
            await offlineService.updateBackgroundDownloadStatus(subject.id, downloadResult.downloadedCount);

            const priorityLabel = isWeakSubject ? '🎯 WEAK' : (accuracy !== undefined && accuracy < 80 ? '📈 MEDIUM' : '✅ STRONG');
            console.log(`${priorityLabel} ${subject.name_en}: Downloaded ${downloadResult.downloadedCount} questions (accuracy: ${accuracy?.toFixed(1) ?? 'N/A'}%)`);
          } else {
            result.errors.push(`${subject.name_en}: ${downloadResult.error}`);
          }

          // Small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error downloading questions for ${subject.name_en}:`, err);
          result.errors.push(`${subject.name_en}: Download failed`);
        }
      }

      console.log(`✅ Smart download complete: ${result.subjectsDownloaded} subjects, ${result.totalQuestions} questions, ${result.weakSubjectsPrioritized} weak subjects prioritized`);
      return result;
    } catch (error) {
      console.error('Smart background download error:', error);
      return { ...result, success: false, errors: ['Smart download failed'] };
    }
  }

  /**
   * Refresh cached questions for a subject with new random questions
   * Call this when coming back online to get fresh questions
   */
  async refreshCachedQuestions(subjectId: string, count: number = 30): Promise<boolean> {
    try {
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        return false;
      }

      // Get previously cached question IDs to exclude them (for variety)
      const cachedQuestions = await offlineService.getCachedQuestions(subjectId);
      const excludeIds = cachedQuestions?.map(q => q.id) || [];

      // Fetch new random questions, excluding previously cached ones
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, subjects(name_en, name_az)')
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .not('id', 'in', `(${excludeIds.slice(0, 100).join(',')})`) // Exclude up to 100 previous questions
        .limit(count);

      if (error) throw error;

      if (!questions || questions.length === 0) {
        // If no new questions, just shuffle existing cache
        if (cachedQuestions && cachedQuestions.length > 0) {
          const shuffled = cachedQuestions.sort(() => Math.random() - 0.5);
          await offlineService.cacheQuestions(subjectId, shuffled);
          console.log(`🔄 Shuffled ${shuffled.length} existing cached questions for ${subjectId}`);
          return true;
        }
        return false;
      }

      // Shuffle and cache new questions
      const shuffledQuestions = questions
        .sort(() => Math.random() - 0.5)
        .map((q: any) => ({
          ...q,
          subject_name: q.subjects?.name_en,
        }));

      await offlineService.cacheQuestions(subjectId, shuffledQuestions);
      console.log(`🔄 Refreshed cache with ${shuffledQuestions.length} new questions for ${subjectId}`);
      return true;
    } catch (error) {
      console.error('Refresh cached questions error:', error);
      return false;
    }
  }
  /**
   * Get topics for a subject from subject_topics table
   */
  async getTopicsBySubject(subjectId: string): Promise<Array<{
    id: string;
    topic_name: string;
    question_count: number;
    is_active: boolean;
  }>> {
    try {
      // First get topics from subject_topics table
      const { data: topics, error: topicsError } = await supabase
        .from('subject_topics')
        .select('id, topic_name, is_active')
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .order('display_order');

      if (topicsError) throw topicsError;

      // Get question counts for each topic (exclude written_open from practice)
      const topicsWithCounts = await Promise.all(
        (topics || []).map(async (topic: any) => {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId)
            .eq('topic', topic.topic_name)
            .eq('is_active', true)
            .eq('exclude_from_practice', false)
            .neq('question_type', 'written_open');

          return {
            id: topic.id,
            topic_name: topic.topic_name,
            question_count: count || 0,
            is_active: topic.is_active,
          };
        })
      );

      // Filter out topics with no questions
      return topicsWithCounts.filter(t => t.question_count > 0);
    } catch (error) {
      console.error('Get topics by subject error:', error);
      return [];
    }
  }

  /**
   * Get topics for a subject, each populated with its active subtopics.
   * Used by TopicSelectionModal (Stage 5) to render the collapsible topic/subtopic UI.
   * Topics with no questions AND no subtopics are excluded.
   */
  async getTopicsWithSubtopics(subjectId: string): Promise<TopicWithSubtopics[]> {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        return offlineService.getCachedTopicsWithSubtopics(subjectId);
      }

      // Fetch topics joined with their subtopics in one round-trip
      const { data: topics, error: topicsError } = await supabase
        .from('subject_topics')
        .select(`
          id,
          topic_name,
          is_active,
          subject_subtopics (
            id,
            topic_id,
            subtopic_name,
            description,
            difficulty_level,
            display_order,
            is_active
          )
        `)
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .order('display_order');

      if (topicsError) throw topicsError;

      // Attach question counts (exclude written_open from practice)
      const topicsWithData = await Promise.all(
        (topics || []).map(async (topic: any) => {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId)
            .eq('topic', topic.topic_name)
            .eq('is_active', true)
            .eq('exclude_from_practice', false)
            .neq('question_type', 'written_open');

          const activeSubtopics: SubtopicItem[] = (topic.subject_subtopics || [])
            .filter((s: any) => s.is_active)
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((s: any) => ({
              id: s.id,
              topic_id: s.topic_id,
              subtopic_name: s.subtopic_name,
              description: s.description ?? undefined,
              difficulty_level: s.difficulty_level ?? undefined,
              display_order: s.display_order,
              is_active: s.is_active,
            }));

          return {
            id: topic.id,
            topic_name: topic.topic_name,
            question_count: count || 0,
            is_active: topic.is_active,
            subtopics: activeSubtopics,
          };
        })
      );

      // Include topics that have questions OR have subtopics configured
      return topicsWithData.filter(t => t.question_count > 0 || t.subtopics.length > 0);
    } catch (error) {
      console.error('Get topics with subtopics error:', error);
      return offlineService.getCachedTopicsWithSubtopics(subjectId);
    }
  }

  /**
   * Get questions by selected topics with equal distribution
   * @param subjectId - Subject ID
   * @param topicNames - Array of topic names to include
   * @param totalCount - Total number of questions to return
   * @param userId - Optional user ID for smart question selection
   * @returns Questions distributed equally across topics
   */
  async getQuestionsByTopics(
    subjectId: string,
    topicNames: string[],
    totalCount: number,
    userId?: string,
    subtopicIds?: string[]   // NEW: when provided, filters by subtopic_id instead of topic name
  ): Promise<Question[]> {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        const cached = await offlineService.getCachedQuestions(subjectId);
        if (!cached || cached.length === 0) return [];

        const hasSubtopicSelection = !!subtopicIds && subtopicIds.length > 0;
        const hasTopicSelection = topicNames.length > 0;
        let selectedPool = cached;

        if (hasSubtopicSelection) {
          const selectedSubtopics = new Set(subtopicIds);
          selectedPool = cached.filter(question => question.subtopic_id && selectedSubtopics.has(question.subtopic_id));
        } else if (hasTopicSelection) {
          const selectedTopics = new Set(topicNames);
          selectedPool = cached.filter(question => question.topic && selectedTopics.has(question.topic));
        }

        const selectedIds = new Set(selectedPool.map(question => question.id));
        const fallbackPool = cached.filter(question => !selectedIds.has(question.id));
        const offlinePool = [...selectedPool, ...fallbackPool].sort(() => Math.random() - 0.5);
        return offlinePool.slice(0, totalCount);
      }

      // If subtopic IDs provided, delegate to subtopic-specific fetcher
      if (subtopicIds && subtopicIds.length > 0) {
        return this.getQuestionsBySubtopics(subjectId, subtopicIds, totalCount, userId);
      }

      if (topicNames.length === 0) {
        // If no topics selected, fall back to random questions
        return this.getRandomQuestions(subjectId, totalCount, [], userId);
      }

      // Calculate questions per topic (proportional distribution)
      const basePerTopic = Math.floor(totalCount / topicNames.length);
      let remainder = totalCount % topicNames.length;

      // Fetch questions for each topic and store separately
      const questionsByTopic: Map<string, Question[]> = new Map();

      for (const topicName of topicNames) {
        const { data: questions, error } = await supabase
          .from('questions')
          .select('*, subjects(name_en, name_az)')
          .eq('subject_id', subjectId)
          .eq('topic', topicName)
          .eq('is_active', true)
          .eq('exclude_from_practice', false)
          .neq('question_type', 'written_open');

        if (error) {
          console.error(`Error fetching questions for topic ${topicName}:`, error);
          continue;
        }

        if (questions && questions.length > 0) {
          const mapped = questions.map((q: any) => ({
            ...q,
            subject_name: q.subjects?.name_en,
            subject_name_az: q.subjects?.name_az,
          }));
          questionsByTopic.set(topicName, mapped);
        }
      }

      // If no questions found, return empty
      if (questionsByTopic.size === 0) {
        return [];
      }

      // Get all question IDs for answer history lookup
      const allQuestions: Question[] = [];
      questionsByTopic.forEach(qs => allQuestions.push(...qs));

      // If no userId, just distribute proportionally without smart selection
      if (!userId) {
        return this.distributeQuestionsProportionally(questionsByTopic, totalCount);
      }

      // Fetch answer history for smart selection (with was_skipped)
      const questionIds = allQuestions.map(q => q.id);
      const MAX_IN_CLAUSE_SIZE = 100;
      let answerHistory: any[] = [];

      for (let i = 0; i < questionIds.length; i += MAX_IN_CLAUSE_SIZE) {
        const batch = questionIds.slice(i, i + MAX_IN_CLAUSE_SIZE);
        const { data, error } = await supabase
          .from('student_answers')
          .select('question_id, is_correct, was_skipped, answered_at')
          .eq('user_id', userId)
          .in('question_id', batch)
          .order('answered_at', { ascending: false });
        if (error) {
          console.warn('Could not fetch answer history batch:', error);
          continue;
        }
        answerHistory.push(...(data || []));
      }

      // Apply adaptive selection PER TOPIC to ensure proportional distribution
      const recentQuestionIds = await this.getRecentSessionQuestionIds(userId, subjectId);
      const result: Question[] = [];
      const topicsList = Array.from(questionsByTopic.keys());

      for (let i = 0; i < topicsList.length; i++) {
        const topicName = topicsList[i];
        const topicQuestions = questionsByTopic.get(topicName) || [];

        // Calculate how many questions to take from this topic
        let targetForTopic = basePerTopic;
        if (remainder > 0) {
          targetForTopic++;
          remainder--;
        }

        if (topicQuestions.length === 0) continue;

        // Filter answer history to this topic's questions
        const topicQIds = new Set(topicQuestions.map(q => q.id));
        const topicHistory = answerHistory.filter(a => topicQIds.has(a.question_id));

        // Use shared adaptive helper per topic
        const topicResult = this.applyAdaptiveSelection(topicQuestions, topicHistory, targetForTopic, recentQuestionIds);
        result.push(...topicResult);
      }

      // Final shuffle to mix topics together
      return result.sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('Get questions by topics error:', error);
      // Fallback to random questions
      return this.getRandomQuestions(subjectId, totalCount);
    }
  }

  /**
   * Fetch questions filtered by subtopic IDs with smart spaced-repetition selection.
   * Called when the user selects specific subtopics in TopicSelectionModal.
   */
  private async getQuestionsBySubtopics(
    subjectId: string,
    subtopicIds: string[],
    totalCount: number,
    userId?: string
  ): Promise<Question[]> {
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, subjects(name_en, name_az)')
        .eq('subject_id', subjectId)
        .in('subtopic_id', subtopicIds)
        .eq('is_active', true)
        .eq('exclude_from_practice', false)
        .neq('question_type', 'written_open');

      if (error) throw error;

      let mapped: Question[] = (questions || []).map((q: any) => ({
        ...q,
        subject_name: q.subjects?.name_en,
        subject_name_az: q.subjects?.name_az,
      }));

      if (!userId || mapped.length === 0) {
        return mapped.sort(() => Math.random() - 0.5).slice(0, totalCount);
      }

      // Adaptive selection with was_skipped support
      const questionIds = mapped.map(q => q.id);
      const MAX_IN = 100;
      let answerHistory: any[] = [];

      for (let i = 0; i < questionIds.length; i += MAX_IN) {
        const batch = questionIds.slice(i, i + MAX_IN);
        const { data } = await supabase
          .from('student_answers')
          .select('question_id, is_correct, was_skipped, answered_at')
          .eq('user_id', userId)
          .in('question_id', batch)
          .order('answered_at', { ascending: false });
        if (data) answerHistory.push(...data);
      }

      const recentQuestionIds = await this.getRecentSessionQuestionIds(userId, subjectId);
      return this.applyAdaptiveSelection(mapped, answerHistory, totalCount, recentQuestionIds);
    } catch (error) {
      console.error('Get questions by subtopics error:', error);
      return [];
    }
  }

  /**
   * Fetch question IDs from the user's last 2 completed practice sessions for this subject.
   * Used for cross-session deduplication — avoids showing the same questions back-to-back.
   */
  private async getRecentSessionQuestionIds(
    userId: string,
    subjectId: string
  ): Promise<Set<string>> {
    try {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('question_ids')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(2);

      const ids = new Set<string>();
      (sessions || []).forEach((s: any) => {
        (s.question_ids || []).forEach((id: string) => ids.add(id));
      });
      return ids;
    } catch {
      return new Set();
    }
  }

  /**
   * Score-based adaptive selection algorithm.
   * Assigns a numerical priority to each candidate question, then picks the top N.
   *
   * Scoring (higher = more likely to be selected):
   *   Never seen .................. 1000 + small random jitter
   *   Skipped (most recent answer) . 800 + age bonus
   *   Incorrect (most recent) ...... 600 + age bonus
   *   Correct (most recent) ........ 200 + age bonus   (lowest priority)
   *
   * Bonuses / penalties:
   *   Age bonus .................. +1 per hour since last answer (max +200)
   *   Recent-session penalty ...... −400 if question was in the last 2 completed sessions
   *
   * The age bonus ensures spaced repetition: questions answered long ago float up,
   * while recently-answered ones stay low.  The recent-session penalty prevents the
   * exact same set from appearing in consecutive sessions.
   *
   * Falls back to random shuffle for first-session (no history).
   */
  private applyAdaptiveSelection(
    questions: Question[],
    answerHistory: { question_id: string; is_correct: boolean; was_skipped?: boolean; answered_at: string }[],
    count: number,
    recentSessionQuestionIds: Set<string> = new Set()
  ): Question[] {
    // If no history at all → first session → random shuffle
    if (answerHistory.length === 0) {
      // Still apply recent-session penalty if switching modes (quiz→practice, etc.)
      if (recentSessionQuestionIds.size === 0) {
        return questions.sort(() => Math.random() - 0.5).slice(0, count);
      }
      // Prefer questions NOT in recent sessions
      const fresh = questions.filter(q => !recentSessionQuestionIds.has(q.id));
      const recent = questions.filter(q => recentSessionQuestionIds.has(q.id));
      const pool = [...fresh.sort(() => Math.random() - 0.5), ...recent.sort(() => Math.random() - 0.5)];
      return pool.slice(0, count);
    }

    const now = Date.now();

    // Build stats map per question (most recent answer wins)
    const questionStats = new Map<string, { lastAnswered: number; wasCorrect: boolean; wasSkipped: boolean }>();
    answerHistory.forEach((a) => {
      if (!questionStats.has(a.question_id)) {
        questionStats.set(a.question_id, {
          lastAnswered: new Date(a.answered_at).getTime(),
          wasCorrect: a.is_correct,
          wasSkipped: a.was_skipped ?? false,
        });
      }
    });

    // Score each candidate question
    const scored: { question: Question; score: number }[] = questions.map(q => {
      const stats = questionStats.get(q.id);
      let score: number;

      if (!stats) {
        // Never seen — highest base
        score = 1000 + Math.random() * 50;
      } else {
        // Calculate hours since last answer (capped age bonus of 200)
        const hoursSinceAnswer = (now - stats.lastAnswered) / (1000 * 60 * 60);
        const ageBonus = Math.min(hoursSinceAnswer, 200);

        if (stats.wasSkipped) {
          score = 800 + ageBonus;
        } else if (!stats.wasCorrect) {
          score = 600 + ageBonus;
        } else {
          // Correctly answered — lowest base
          score = 200 + ageBonus;
        }

        // Small jitter to break ties deterministically-ish
        score += Math.random() * 10;
      }

      // Penalty for being in recent completed sessions
      if (recentSessionQuestionIds.has(q.id)) {
        score -= 400;
      }

      return { question: q, score };
    });

    // Sort by score descending — highest-priority first
    scored.sort((a, b) => b.score - a.score);

    // Take top `count` questions
    const selected = scored.slice(0, count).map(s => s.question);

    // Shuffle the final selection so the user doesn't see a predictable order
    return selected.sort(() => Math.random() - 0.5);
  }

  /**
   * Helper: Distribute questions proportionally across topics without smart selection
   */
  private distributeQuestionsProportionally(
    questionsByTopic: Map<string, Question[]>,
    totalCount: number
  ): Question[] {
    const topicsList = Array.from(questionsByTopic.keys());
    const basePerTopic = Math.floor(totalCount / topicsList.length);
    let remainder = totalCount % topicsList.length;

    const result: Question[] = [];

    for (const topicName of topicsList) {
      const topicQuestions = questionsByTopic.get(topicName) || [];
      let targetForTopic = basePerTopic;
      if (remainder > 0) {
        targetForTopic++;
        remainder--;
      }

      // Shuffle and take the target amount
      const shuffled = topicQuestions.sort(() => Math.random() - 0.5);
      result.push(...shuffled.slice(0, targetForTopic));
    }

    return result.sort(() => Math.random() - 0.5);
  }
}

export const practiceService = new PracticeService();
