// Offline Sync Service
// Stage 6 - Week 3: Offline Mode Implementation
// Handles background synchronization of offline data when back online

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { offlineService } from './offlineService';
import { networkService } from './networkService';
import { analyticsService } from './analyticsService';

const SYNC_KEYS = {
  LAST_FULL_SYNC: 'offline_last_full_sync',
  SYNC_IN_PROGRESS: 'offline_sync_in_progress',
  SYNC_ERRORS: 'offline_sync_errors',
  PENDING_SESSIONS: 'offline_pending_sessions',
};
const USER_SYNC_PREFIX = 'offline_sync_user';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value?: string | null): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export interface OfflineSession {
  id: string;
  userId: string;
  subjectId: string;
  subjectName: string;
  mode?: 'practice' | 'quiz';
  startedAt: string;
  completedAt: string;
  totalQuestions?: number;
  answeredQuestions?: number;
  questionIds?: string[];
  questionsAnswered: number;
  correctAnswers: number;
  totalTimeSeconds: number;
  answers: OfflineAnswer[];
  synced: boolean;
}

export interface OfflineAnswer {
  questionId: string;
  selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  answeredAt: string;
}

export interface SyncResult {
  success: boolean;
  sessionsSynced: number;
  answersSynced: number;
  errors: string[];
  timestamp: string;
}

class OfflineSyncService {
  private syncInProgress: boolean = false;
  private syncListeners: Set<(result: SyncResult) => void> = new Set();
  private initialized: boolean = false;
  private unsubscribeNetwork?: () => void;

  private async getCurrentUserId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  private scopedKey(baseKey: string, userId: string | null | undefined): string {
    return userId ? `${USER_SYNC_PREFIX}:${userId}:${baseKey}` : baseKey;
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

  /**
   * Initialize sync service and set up auto-sync on network recovery
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for network changes and auto-sync when back online
    this.unsubscribeNetwork = networkService.subscribe(async (state) => {
      if (state.status === 'online' && !this.syncInProgress) {
        const pendingCount = await this.getPendingSessionCount();
        const legacyAnswerCount = await offlineService.getUnsyncedCount();
        if (pendingCount > 0 || legacyAnswerCount > 0) {
          console.log(`🔄 Network restored, syncing ${pendingCount} offline sessions and ${legacyAnswerCount} legacy answers...`);
          this.syncAll();
        }
      }
    });
  }

  cleanup(): void {
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = undefined;
    this.initialized = false;
  }

  /**
   * Save a complete offline practice session
   */
  async saveOfflineSession(session: Omit<OfflineSession, 'id' | 'synced'>): Promise<string> {
    try {
      const sessionId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const fullSession: OfflineSession = {
        ...session,
        id: sessionId,
        synced: false,
      };

      // Get existing sessions
      const existingData = await this.getScopedItem(SYNC_KEYS.PENDING_SESSIONS, session.userId);
      const sessions: OfflineSession[] = existingData ? JSON.parse(existingData) : [];

      // Add new session
      sessions.push(fullSession);

      // Save back
      await this.setScopedItem(SYNC_KEYS.PENDING_SESSIONS, JSON.stringify(sessions), session.userId);

      console.log(`📱 Saved offline session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Error saving offline session:', error);
      throw error;
    }
  }

  /**
   * Queue a completed offline session using the session id that the UI already
   * knows about. This preserves idempotency against the database RPC and avoids
   * creating a second synthetic offline id at completion time.
   */
  async queueCompletedSession(session: OfflineSession): Promise<void> {
    try {
      const existingData = await this.getScopedItem(SYNC_KEYS.PENDING_SESSIONS, session.userId);
      const sessions: OfflineSession[] = existingData ? JSON.parse(existingData) : [];
      const normalizedSession: OfflineSession = { ...session, synced: false };
      const existingIndex = sessions.findIndex(s => s.id === normalizedSession.id);

      if (existingIndex >= 0) {
        sessions[existingIndex] = {
          ...sessions[existingIndex],
          ...normalizedSession,
          synced: sessions[existingIndex].synced ? sessions[existingIndex].synced : false,
        };
      } else {
        sessions.push(normalizedSession);
      }

      await this.setScopedItem(SYNC_KEYS.PENDING_SESSIONS, JSON.stringify(sessions), session.userId);
      console.log(`📱 Queued completed offline session: ${session.id}`);
    } catch (error) {
      console.error('Error queueing completed offline session:', error);
      throw error;
    }
  }

  /**
   * Get all pending (unsynced) sessions
   */
  async getPendingSessions(): Promise<OfflineSession[]> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const scopedData = await AsyncStorage.getItem(this.scopedKey(SYNC_KEYS.PENDING_SESSIONS, currentUserId));
      const legacyData = await AsyncStorage.getItem(SYNC_KEYS.PENDING_SESSIONS);
      const scopedSessions: OfflineSession[] = scopedData ? JSON.parse(scopedData) : [];
      const legacySessions: OfflineSession[] = legacyData
        ? JSON.parse(legacyData).filter((s: OfflineSession) => !currentUserId || s.userId === currentUserId)
        : [];
      return [...scopedSessions, ...legacySessions].filter(s => !s.synced);
    } catch (error) {
      console.error('Error getting pending sessions:', error);
      return [];
    }
  }

  /**
   * Get count of pending sessions
   */
  async getPendingSessionCount(): Promise<number> {
    const sessions = await this.getPendingSessions();
    return sessions.length;
  }

  /**
   * Sync all pending offline data to server
   */
  async syncAll(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        sessionsSynced: 0,
        answersSynced: 0,
        errors: ['Sync already in progress'],
        timestamp: new Date().toISOString(),
      };
    }

    // Check if online
    if (!networkService.isOnline()) {
      return {
        success: false,
        sessionsSynced: 0,
        answersSynced: 0,
        errors: ['No network connection'],
        timestamp: new Date().toISOString(),
      };
    }

    this.syncInProgress = true;
    await AsyncStorage.setItem(SYNC_KEYS.SYNC_IN_PROGRESS, 'true');

    const result: SyncResult = {
      success: true,
      sessionsSynced: 0,
      answersSynced: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    };

    try {
      // Get all pending sessions
      const pendingSessions = await this.getPendingSessions();

      const syncedSessionIds: string[] = [];

      for (const session of pendingSessions) {
        try {
          await this.syncSession(session);
          result.sessionsSynced++;
          result.answersSynced += session.answers.length;
          syncedSessionIds.push(session.id);

          // Mark session as synced
          await this.markSessionSynced(session.id);
          await offlineService.markSessionsSynced([session.id]);
        } catch (error: any) {
          console.error(`Error syncing session ${session.id}:`, error);
          result.errors.push(`Session ${session.id}: ${error.message}`);
          result.success = false;
        }
      }

      if (syncedSessionIds.length > 0) {
        await offlineService.markAnswersSyncedBySessionIds(syncedSessionIds);
      }

      // Also sync any legacy offline answers
      const legacyAnswers = await offlineService.getOfflineAnswers();
      if (legacyAnswers.length > 0) {
        try {
          await this.syncLegacyAnswers(legacyAnswers);
          result.answersSynced += legacyAnswers.length;
        } catch (error: any) {
          result.errors.push(`Legacy answers: ${error.message}`);
        }
      }

      // Update last sync time
      await this.setScopedItem(SYNC_KEYS.LAST_FULL_SYNC, new Date().toISOString());

      // Clean up old synced data
      await this.cleanupSyncedData();

      if (result.sessionsSynced > 0 || result.answersSynced > 0) {
        analyticsService.markAnalyticsDataChanged();
      }

      console.log(`✅ Sync complete: ${result.sessionsSynced} sessions, ${result.answersSynced} answers`);
    } catch (error: any) {
      console.error('Sync error:', error);
      result.success = false;
      result.errors.push(error.message);
    } finally {
      this.syncInProgress = false;
      await AsyncStorage.setItem(SYNC_KEYS.SYNC_IN_PROGRESS, 'false');

      // Notify listeners
      this.notifySyncListeners(result);
    }

    return result;
  }

  /**
   * Sync a single session to the server
   */
  private async syncSession(session: OfflineSession): Promise<void> {
    const mode = (session as OfflineSession & { mode?: string }).mode === 'quiz' ? 'quiz' : 'practice';
    const questionIds = session.questionIds?.length
      ? session.questionIds
      : session.answers.map(answer => answer.questionId);
    const totalQuestions = Math.max(
      session.totalQuestions ?? session.questionsAnswered ?? questionIds.length,
      questionIds.length
    );
    const answers = session.answers.map(answer => ({
      question_id: answer.questionId,
      selected_answer: answer.selectedAnswer,
      is_correct: answer.isCorrect,
      time_spent_seconds: answer.timeSpentSeconds,
      answered_at: answer.answeredAt,
    }));

    const { error } = await supabase.rpc('sync_offline_practice_session', {
      p_offline_session_id: session.id,
      p_subject_id: session.subjectId,
      p_mode: mode,
      p_total_questions: totalQuestions,
      p_correct_answers: session.correctAnswers,
      p_total_time_seconds: session.totalTimeSeconds,
      p_started_at: session.startedAt,
      p_completed_at: session.completedAt,
      p_question_ids: questionIds,
      p_answers: answers,
    });

    if (error) {
      throw new Error(`Failed to sync offline session ${session.id}: ${error.message}`);
    }
  }

  /**
   * Sync legacy offline answers (from old offlineService)
   */
  private async syncLegacyAnswers(answers: any[]): Promise<void> {
    const timestamps: string[] = [];

    for (const answer of answers) {
      try {
        const insertData: Record<string, any> = {
          user_id: answer.userId,
          question_id: answer.questionId,
          selected_answer: answer.selectedAnswer,
          is_correct: answer.selectedAnswer === answer.correctAnswer,
          time_spent_seconds: answer.timeSpent,
          answered_at: answer.timestamp,
        };

        if (isUuid(answer.sessionId)) {
          insertData.practice_session_id = answer.sessionId;
        }

        const { error } = await supabase
          .from('student_answers')
          .insert(insertData);

        if (error) {
          throw error;
        }

        timestamps.push(answer.timestamp);
      } catch (error) {
        console.warn('Error syncing legacy answer:', error);
      }
    }

    // Mark as synced
    if (timestamps.length > 0) {
      await offlineService.markAnswersSynced(timestamps);
    }
  }

  /**
   * Mark a session as synced
   */
  private async markSessionSynced(sessionId: string): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(SYNC_KEYS.PENDING_SESSIONS, currentUserId), SYNC_KEYS.PENDING_SESSIONS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const sessions: OfflineSession[] = JSON.parse(data);
        const updated = sessions.map(s =>
          s.id === sessionId ? { ...s, synced: true } : s
        );

        await AsyncStorage.setItem(key, JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Error marking session synced:', error);
    }
  }

  /**
   * Clean up old synced data (keep last 50 synced sessions for reference)
   */
  private async cleanupSyncedData(): Promise<void> {
    try {
      const currentUserId = await this.getCurrentUserId();
      const keys = [this.scopedKey(SYNC_KEYS.PENDING_SESSIONS, currentUserId), SYNC_KEYS.PENDING_SESSIONS];

      for (const key of [...new Set(keys)]) {
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;

        const sessions: OfflineSession[] = JSON.parse(data);
        const unsynced = sessions.filter(s => !s.synced);
        const synced = sessions.filter(s => s.synced).slice(-50);

        await AsyncStorage.setItem(
          key,
          JSON.stringify([...unsynced, ...synced])
        );
      }

      // Also clean up legacy answers
      await offlineService.clearOldSyncedAnswers();
    } catch (error) {
      console.error('Error cleaning up synced data:', error);
    }
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTime(): Promise<Date | null> {
    try {
      const timestamp = await this.getScopedItem(SYNC_KEYS.LAST_FULL_SYNC);
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }

  /**
   * Subscribe to sync completion events
   */
  onSyncComplete(listener: (result: SyncResult) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  /**
   * Notify sync listeners
   */
  private notifySyncListeners(result: SyncResult): void {
    this.syncListeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('Error in sync listener:', error);
      }
    });
  }

  /**
   * Get sync status summary
   */
  async getSyncStatus(): Promise<{
    pendingSessions: number;
    lastSync: Date | null;
    isSyncing: boolean;
  }> {
    return {
      pendingSessions: await this.getPendingSessionCount(),
      lastSync: await this.getLastSyncTime(),
      isSyncing: this.syncInProgress,
    };
  }
}

export const offlineSyncService = new OfflineSyncService();
