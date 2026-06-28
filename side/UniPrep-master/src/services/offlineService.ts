import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question, Answer, TopicWithSubtopics } from '../types/practice';
import { supabase } from './supabase';

const KEYS = {
  CACHED_QUESTIONS: 'cached_questions_',
  CACHED_SUBJECTS: 'cached_subjects',
  CACHED_USER_PROFILE: 'cached_user_profile',
  OFFLINE_ANSWERS: 'offline_answers',
  OFFLINE_SESSIONS: 'offline_sessions',
  OFFLINE_SESSION_RESULTS: 'offline_session_results',
  LAST_SYNC: 'last_sync_',
  SUBJECTS_LAST_SYNC: 'subjects_last_sync',
  BACKGROUND_DOWNLOAD_STATUS: 'background_download_status',
};

// Cache TTL constants
const QUESTION_CACHE_DAYS = 7; // Questions valid for 7 days
const SUBJECTS_CACHE_HOURS = 24; // Subjects valid for 24 hours
const USER_CACHE_PREFIX = 'offline_user_cache';

class OfflineService {
  private async getCurrentUserId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  private scopedKey(baseKey: string, userId: string | null | undefined): string {
    return userId ? `${USER_CACHE_PREFIX}:${userId}:${baseKey}` : baseKey;
  }

  private async getScopedItem(baseKey: string, userId?: string | null): Promise<string | null> {
    const scopedKey = this.scopedKey(baseKey, userId ?? await this.getCurrentUserId());
    const scopedValue = await AsyncStorage.getItem(scopedKey);
    if (scopedValue !== null) return scopedValue;

    const legacyValue = await AsyncStorage.getItem(baseKey);
    if (legacyValue !== null && scopedKey !== baseKey) {
      await AsyncStorage.setItem(scopedKey, legacyValue);
    }
    return legacyValue;
  }

  private async setScopedItem(baseKey: string, value: string, userId?: string | null): Promise<void> {
    await AsyncStorage.setItem(this.scopedKey(baseKey, userId ?? await this.getCurrentUserId()), value);
  }

  private async removeScopedItem(baseKey: string, userId?: string | null): Promise<void> {
    const scopedKey = this.scopedKey(baseKey, userId ?? await this.getCurrentUserId());
    await AsyncStorage.multiRemove(scopedKey === baseKey ? [baseKey] : [scopedKey, baseKey]);
  }

  // Cache questions for a subject
  async cacheQuestions(subjectId: string, questions: Question[]): Promise<void> {
    try {
      const key = `${KEYS.CACHED_QUESTIONS}${subjectId}`;
      // NOTE: correct_answer is kept because offline practice needs it for instant feedback.
      // This is an accepted tradeoff — the data is in AsyncStorage (unencrypted on Android).
      // Mitigation: questions are public-facing content, not PII. The main risk is answer
      // extraction, which is also possible by simply using the app and noting the answers.
      await this.setScopedItem(key, JSON.stringify(questions));
      await this.setScopedItem(`${KEYS.LAST_SYNC}${subjectId}`, new Date().toISOString());
    } catch (error) {
      console.error('Cache questions error:', error);
    }
  }

  // Get cached questions for a subject
  async getCachedQuestions(subjectId: string): Promise<Question[] | null> {
    try {
      const key = `${KEYS.CACHED_QUESTIONS}${subjectId}`;
      const data = await this.getScopedItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Get cached questions error:', error);
      return null;
    }
  }

  // Check if cached questions exist. Freshness is tracked separately in
  // getQuestionCacheInfo; offline practice should not hide an existing cache
  // just because older cache metadata is missing during migration.
  async hasCachedQuestions(subjectId: string): Promise<boolean> {
    try {
      const questions = await this.getCachedQuestions(subjectId);
      return !!questions && questions.length > 0;
    } catch (error) {
      console.error('Check cached questions error:', error);
      return false;
    }
  }

  // Save answer offline (to be synced later)
  async saveOfflineAnswer(answer: {
    userId: string;
    questionId: string;
    selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
    correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
    timeSpent: number;
    sessionId?: string;
  }): Promise<void> {
    try {
      const existingData = await this.getScopedItem(KEYS.OFFLINE_ANSWERS, answer.userId);
      const offlineAnswers = existingData ? JSON.parse(existingData) : [];
      
      offlineAnswers.push({
        ...answer,
        timestamp: new Date().toISOString(),
        synced: false,
      });

      await this.setScopedItem(KEYS.OFFLINE_ANSWERS, JSON.stringify(offlineAnswers), answer.userId);
    } catch (error) {
      console.error('Save offline answer error:', error);
    }
  }

  // Get all unsynced offline answers
  async getOfflineAnswers(): Promise<any[]> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const scopedData = await AsyncStorage.getItem(this.scopedKey(KEYS.OFFLINE_ANSWERS, currentUserId));
      const legacyData = await AsyncStorage.getItem(KEYS.OFFLINE_ANSWERS);
      const scopedAnswers = scopedData ? JSON.parse(scopedData) : [];
      const legacyAnswers = legacyData ? JSON.parse(legacyData).filter((a: any) => !currentUserId || a.userId === currentUserId) : [];
      return [...scopedAnswers, ...legacyAnswers].filter((a: any) => !a.synced);
    } catch (error) {
      console.error('Get offline answers error:', error);
      return [];
    }
  }

  // Mark answers as synced
  async markAnswersSynced(timestamps: string[]): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(KEYS.OFFLINE_ANSWERS, currentUserId), KEYS.OFFLINE_ANSWERS];
      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const allAnswers = JSON.parse(data);
        const updated = allAnswers.map((answer: any) => {
          if (timestamps.includes(answer.timestamp)) {
            return { ...answer, synced: true };
          }
          return answer;
        });

        await AsyncStorage.setItem(key, JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Mark answers synced error:', error);
    }
  }

  // Mark all legacy answer rows that belong to synced full offline sessions.
  // This prevents replaying the same answers twice after the authoritative
  // full-session RPC has already inserted them.
  async markAnswersSyncedBySessionIds(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;

    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(KEYS.OFFLINE_ANSWERS, currentUserId), KEYS.OFFLINE_ANSWERS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const allAnswers = JSON.parse(data);
        const updated = allAnswers.map((answer: any) => {
          if (answer.sessionId && sessionIds.includes(answer.sessionId)) {
            return { ...answer, synced: true };
          }
          return answer;
        });

        await AsyncStorage.setItem(key, JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Mark session answers synced error:', error);
    }
  }

  // Clear old synced answers (keep last 100)
  async clearOldSyncedAnswers(): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(KEYS.OFFLINE_ANSWERS, currentUserId), KEYS.OFFLINE_ANSWERS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const allAnswers = JSON.parse(data);
        const unsynced = allAnswers.filter((a: any) => !a.synced);
        const synced = allAnswers.filter((a: any) => a.synced).slice(-100); // Keep last 100

        await AsyncStorage.setItem(key, JSON.stringify([...unsynced, ...synced]));
      }
    } catch (error) {
      console.error('Clear old synced answers error:', error);
    }
  }

  // Get count of unsynced answers
  async getUnsyncedCount(): Promise<number> {
    try {
      const offlineAnswers = await this.getOfflineAnswers();
      return offlineAnswers.length;
    } catch (error) {
      console.error('Get unsynced count error:', error);
      return 0;
    }
  }

  // Clear all cached data for a subject
  async clearSubjectCache(subjectId: string): Promise<void> {
    try {
      await this.removeScopedItem(`${KEYS.CACHED_QUESTIONS}${subjectId}`);
      await this.removeScopedItem(`${KEYS.LAST_SYNC}${subjectId}`);
    } catch (error) {
      console.error('Clear subject cache error:', error);
    }
  }

  // Clear all offline data
  async clearAllOfflineData(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const offlineKeys = keys.filter(
        key =>
          key.startsWith(KEYS.CACHED_QUESTIONS) ||
          key.startsWith(`${USER_CACHE_PREFIX}:`) ||
          key.startsWith(KEYS.LAST_SYNC) ||
          key === KEYS.OFFLINE_ANSWERS ||
          key === KEYS.CACHED_SUBJECTS ||
          key === KEYS.SUBJECTS_LAST_SYNC
      );
      await AsyncStorage.multiRemove(offlineKeys);
    } catch (error) {
      console.error('Clear all offline data error:', error);
    }
  }

  // Cache subjects list
  async cacheSubjects(subjects: any[]): Promise<void> {
    try {
      await this.setScopedItem(KEYS.CACHED_SUBJECTS, JSON.stringify(subjects));
      await this.setScopedItem(KEYS.SUBJECTS_LAST_SYNC, new Date().toISOString());
      console.log('📦 Cached', subjects.length, 'subjects for offline use');
    } catch (error) {
      console.error('Cache subjects error:', error);
    }
  }

  // Get cached subjects
  async getCachedSubjects(): Promise<any[] | null> {
    try {
      const data = await this.getScopedItem(KEYS.CACHED_SUBJECTS);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Get cached subjects error:', error);
      return null;
    }
  }

  // Check if subjects cache is valid (within 24 hours)
  async hasValidSubjectsCache(): Promise<boolean> {
    try {
      const subjects = await this.getCachedSubjects();
      if (!subjects || subjects.length === 0) return false;

      const lastSyncStr = await this.getScopedItem(KEYS.SUBJECTS_LAST_SYNC);
      if (!lastSyncStr) return false;

      const lastSync = new Date(lastSyncStr);
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      
      return hoursSinceSync < SUBJECTS_CACHE_HOURS;
    } catch (error) {
      console.error('Check subjects cache error:', error);
      return false;
    }
  }

  // Get all subjects that have cached questions
  async getSubjectsWithCachedQuestions(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const currentUserId = await this.getCurrentUserId();
      const scopedPrefix = this.scopedKey(KEYS.CACHED_QUESTIONS, currentUserId);
      const questionKeys = keys.filter(
        key => key.startsWith(KEYS.CACHED_QUESTIONS) || key.startsWith(scopedPrefix)
      );
      return questionKeys.map(key => key.includes(KEYS.CACHED_QUESTIONS)
        ? key.slice(key.indexOf(KEYS.CACHED_QUESTIONS) + KEYS.CACHED_QUESTIONS.length)
        : key
      );
    } catch (error) {
      console.error('Get subjects with cached questions error:', error);
      return [];
    }
  }

  // Get cached question count for a subject
  async getCachedQuestionCount(subjectId: string): Promise<number> {
    try {
      const questions = await this.getCachedQuestions(subjectId);
      return questions ? questions.length : 0;
    } catch (error) {
      return 0;
    }
  }

  async getQuestionCacheInfo(subjectId: string): Promise<{
    hasCached: boolean;
    cachedCount: number;
    lastSync: string | null;
    isFresh: boolean;
  }> {
    try {
      const questions = await this.getCachedQuestions(subjectId);
      const lastSync = await this.getScopedItem(`${KEYS.LAST_SYNC}${subjectId}`);
      const cachedCount = questions?.length || 0;
      let isFresh = false;

      if (lastSync) {
        const daysSinceSync = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60 * 24);
        isFresh = daysSinceSync < QUESTION_CACHE_DAYS;
      }

      return {
        hasCached: cachedCount > 0,
        cachedCount,
        lastSync,
        isFresh,
      };
    } catch (error) {
      console.error('Get question cache info error:', error);
      return { hasCached: false, cachedCount: 0, lastSync: null, isFresh: false };
    }
  }

  async getCachedTopicsWithSubtopics(subjectId: string): Promise<TopicWithSubtopics[]> {
    try {
      if (!(await this.hasCachedQuestions(subjectId))) return [];

      const questions = await this.getCachedQuestions(subjectId);
      if (!questions || questions.length === 0) return [];

      const topics = new Map<string, TopicWithSubtopics>();

      questions.forEach((question: Question & { subject_subtopics?: any }) => {
        const rawTopicName = typeof question.topic === 'string' && question.topic.trim().length > 0
          ? question.topic.trim()
          : 'General';
        const topicId = `offline_topic_${rawTopicName.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}`;
        const existingTopic = topics.get(rawTopicName) || {
          id: topicId,
          topic_name: rawTopicName,
          question_count: 0,
          is_active: true,
          subtopics: [],
        };

        existingTopic.question_count += 1;

        const subtopic = question.subject_subtopics;
        if (question.subtopic_id && subtopic?.subtopic_name) {
          const exists = existingTopic.subtopics.some(item => item.id === question.subtopic_id);
          if (!exists) {
            existingTopic.subtopics.push({
              id: question.subtopic_id,
              topic_id: subtopic.topic_id || existingTopic.id,
              subtopic_name: subtopic.subtopic_name,
              description: subtopic.description ?? undefined,
              difficulty_level: subtopic.difficulty_level ?? undefined,
              display_order: subtopic.display_order ?? existingTopic.subtopics.length,
              is_active: subtopic.is_active ?? true,
            });
          }
        }

        topics.set(rawTopicName, existingTopic);
      });

      return Array.from(topics.values())
        .map(topic => ({
          ...topic,
          subtopics: topic.subtopics.sort((a, b) => a.display_order - b.display_order),
        }))
        .sort((a, b) => a.topic_name.localeCompare(b.topic_name));
    } catch (error) {
      console.error('Get cached topics error:', error);
      return [];
    }
  }

  // Cache user profile for offline access
  async cacheUserProfile(profile: any): Promise<void> {
    try {
      await this.setScopedItem(KEYS.CACHED_USER_PROFILE, JSON.stringify(profile), profile?.id ?? profile?.user_id);
      console.log('📦 Cached user profile for offline use');
    } catch (error) {
      console.error('Cache user profile error:', error);
    }
  }

  // Get cached user profile
  async getCachedUserProfile(): Promise<any | null> {
    try {
      const currentUserId = await this.getCurrentUserId();
      if (!currentUserId) return null;

      const scopedKey = this.scopedKey(KEYS.CACHED_USER_PROFILE, currentUserId);
      const data = await AsyncStorage.getItem(scopedKey) ?? await AsyncStorage.getItem(KEYS.CACHED_USER_PROFILE);
      if (!data) return null;

      const profile = JSON.parse(data);
      const profileUserId = profile?.id ?? profile?.user_id;
      if (currentUserId && profileUserId && profileUserId !== currentUserId) {
        return null;
      }
      if (profileUserId === currentUserId) {
        await AsyncStorage.setItem(scopedKey, data);
      }
      return profile;
    } catch (error) {
      console.error('Get cached user profile error:', error);
      return null;
    }
  }

  // Clear cached user profile (on logout)
  async clearCachedUserProfile(): Promise<void> {
    try {
      await this.removeScopedItem(KEYS.CACHED_USER_PROFILE);
    } catch (error) {
      console.error('Clear cached user profile error:', error);
    }
  }

  // Clear ALL user data (on account deletion)
  // This ensures no stale data remains after account is deleted
  async clearAllUserData(): Promise<void> {
    try {
      console.log('🗑️ Clearing all user data from local storage...');
      
      // Get all keys
      const keys = await AsyncStorage.getAllKeys();
      
      // Filter keys that contain user data
      const userDataKeys = keys.filter(
        key =>
          key.startsWith(KEYS.CACHED_QUESTIONS) ||
          key.startsWith(`${USER_CACHE_PREFIX}:`) ||
          key.startsWith(KEYS.LAST_SYNC) ||
          key === KEYS.OFFLINE_ANSWERS ||
          key === KEYS.CACHED_SUBJECTS ||
          key === KEYS.SUBJECTS_LAST_SYNC ||
          key === KEYS.CACHED_USER_PROFILE ||
          key === KEYS.OFFLINE_SESSIONS ||
          key === KEYS.OFFLINE_SESSION_RESULTS ||
          key === KEYS.BACKGROUND_DOWNLOAD_STATUS ||
          key.startsWith('competitive_') || // Competitive mode caches
          key.startsWith('streak_') || // Streak data
          key.startsWith('user_') // Any user-prefixed data
      );
      
      if (userDataKeys.length > 0) {
        await AsyncStorage.multiRemove(userDataKeys);
        console.log(`✅ Cleared ${userDataKeys.length} cached items`);
      }
    } catch (error) {
      console.error('Clear all user data error:', error);
    }
  }

  // Save offline practice session for later sync
  async saveOfflineSession(session: {
    id: string;
    userId: string;
    subjectId: string;
    mode: string;
    totalQuestions: number;
    questionIds: string[];
    startedAt: string;
  }): Promise<void> {
    try {
      const existingData = await this.getScopedItem(KEYS.OFFLINE_SESSIONS, session.userId);
      const offlineSessions = existingData ? JSON.parse(existingData) : [];
      
      offlineSessions.push({
        ...session,
        synced: false,
      });

      await this.setScopedItem(KEYS.OFFLINE_SESSIONS, JSON.stringify(offlineSessions), session.userId);
      console.log('📦 Saved offline session:', session.id);
    } catch (error) {
      console.error('Save offline session error:', error);
    }
  }

  // Get all unsynced offline sessions
  async getOfflineSessions(): Promise<any[]> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const scopedData = await AsyncStorage.getItem(this.scopedKey(KEYS.OFFLINE_SESSIONS, currentUserId));
      const legacyData = await AsyncStorage.getItem(KEYS.OFFLINE_SESSIONS);
      const scopedSessions = scopedData ? JSON.parse(scopedData) : [];
      const legacySessions = legacyData ? JSON.parse(legacyData).filter((s: any) => !currentUserId || s.userId === currentUserId) : [];
      return [...scopedSessions, ...legacySessions].filter((s: any) => !s.synced);
    } catch (error) {
      console.error('Get offline sessions error:', error);
      return [];
    }
  }

  // Mark sessions as synced
  async markSessionsSynced(sessionIds: string[]): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(KEYS.OFFLINE_SESSIONS, currentUserId), KEYS.OFFLINE_SESSIONS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const allSessions = JSON.parse(data);
        const updated = allSessions.map((session: any) => {
          if (sessionIds.includes(session.id)) {
            return { ...session, synced: true };
          }
          return session;
        });

        await AsyncStorage.setItem(key, JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Mark sessions synced error:', error);
    }
  }

  // Save offline session result for later retrieval
  async saveOfflineSessionResult(sessionId: string, result: any): Promise<void> {
    try {
      const userId = result?.userId ?? result?.user_id ?? await this.getCurrentUserId();
      const existingData = await this.getScopedItem(KEYS.OFFLINE_SESSION_RESULTS, userId);
      const results = existingData ? JSON.parse(existingData) : {};
      
      results[sessionId] = {
        ...result,
        savedAt: new Date().toISOString(),
      };

      await this.setScopedItem(KEYS.OFFLINE_SESSION_RESULTS, JSON.stringify(results), userId);
      console.log('📦 Saved offline session result:', sessionId);
    } catch (error) {
      console.error('Save offline session result error:', error);
    }
  }

  // Get offline session result
  async getOfflineSessionResult(sessionId: string): Promise<any | null> {
    try {
      const data = await this.getScopedItem(KEYS.OFFLINE_SESSION_RESULTS);
      if (!data) return null;
      
      const results = JSON.parse(data);
      return results[sessionId] || null;
    } catch (error) {
      console.error('Get offline session result error:', error);
      return null;
    }
  }

  // Clear old offline session results (keep last 20)
  async clearOldSessionResults(): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(KEYS.OFFLINE_SESSION_RESULTS, currentUserId), KEYS.OFFLINE_SESSION_RESULTS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const results = JSON.parse(data);
        const entries = Object.entries(results);

        // Sort by savedAt and keep last 20
        entries.sort((a: any, b: any) =>
          new Date(b[1].savedAt).getTime() - new Date(a[1].savedAt).getTime()
        );

        const kept = entries.slice(0, 20);
        const newResults = Object.fromEntries(kept);

        await AsyncStorage.setItem(key, JSON.stringify(newResults));
      }
    } catch (error) {
      console.error('Clear old session results error:', error);
    }
  }

  // Get background download status
  async getBackgroundDownloadStatus(): Promise<{
    lastDownload: string | null;
    subjectsDownloaded: string[];
    totalQuestionsDownloaded: number;
  }> {
    try {
      const data = await this.getScopedItem(KEYS.BACKGROUND_DOWNLOAD_STATUS);
      if (!data) {
        return {
          lastDownload: null,
          subjectsDownloaded: [],
          totalQuestionsDownloaded: 0,
        };
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Get background download status error:', error);
      return {
        lastDownload: null,
        subjectsDownloaded: [],
        totalQuestionsDownloaded: 0,
      };
    }
  }

  // Update background download status
  async updateBackgroundDownloadStatus(
    subjectId: string,
    questionsDownloaded: number
  ): Promise<void> {
    try {
      const current = await this.getBackgroundDownloadStatus();
      
      if (!current.subjectsDownloaded.includes(subjectId)) {
        current.subjectsDownloaded.push(subjectId);
      }
      
      current.lastDownload = new Date().toISOString();
      current.totalQuestionsDownloaded += questionsDownloaded;
      
      await this.setScopedItem(KEYS.BACKGROUND_DOWNLOAD_STATUS, JSON.stringify(current));
    } catch (error) {
      console.error('Update background download status error:', error);
    }
  }
}

export const offlineService = new OfflineService();
