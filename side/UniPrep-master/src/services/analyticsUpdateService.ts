import { supabase } from './supabase';
import { AnalyticsUpdateData, ActivityType } from '../types/analytics';
import { scoringService } from './scoringService';
import { streakService } from './streakService';
import { goalService } from './goalService';
import { studyPlanService } from './studyPlanService';
import { analyticsService } from './analyticsService';

class AnalyticsUpdateService {
  private normalizeUpdateData(updateData: AnalyticsUpdateData): AnalyticsUpdateData {
    const questionsAttempted = Math.max(0, Math.trunc(updateData.questionsAttempted || 0));
    const questionsCorrect = Math.min(
      Math.max(0, Math.trunc(updateData.questionsCorrect || 0)),
      questionsAttempted
    );
    const studyTimeMinutes = Math.max(0, Math.ceil(updateData.studyTimeMinutes || 0));

    return {
      ...updateData,
      questionsAttempted,
      questionsCorrect,
      studyTimeMinutes,
    };
  }

  /**
   * Update analytics after a practice session or exam
   */
  async updateAfterActivity(
    studentId: string,
    updateData: AnalyticsUpdateData
  ): Promise<void> {
    try {
      const normalizedData = this.normalizeUpdateData(updateData);

      // Get today's date in local timezone (not UTC)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Update or create daily stats
      await this.updateDailyStats(studentId, today, normalizedData);

      // Update study progress for the subject
      if (normalizedData.subjectId) {
        await this.updateStudyProgress(studentId, normalizedData.subjectId, normalizedData);
      }

      // Log the activity
      await this.logActivity(studentId, normalizedData);

      // Update student streak (will be handled by database trigger)
      // The trigger_update_streak will automatically update current_streak

      console.log('✅ Analytics updated successfully');
    } catch (error) {
      console.error('Error updating analytics:', error);
      throw error;
    }
  }

  /**
   * Update or create daily stats record
   */
  private async updateDailyStats(
    studentId: string,
    date: string,
    updateData: AnalyticsUpdateData
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('update_daily_stats', {
        p_student_id: studentId,
        p_date: date,
        p_questions_attempted: updateData.questionsAttempted,
        p_questions_correct: updateData.questionsCorrect,
        p_study_time_minutes: updateData.studyTimeMinutes,
        p_exams_taken: updateData.sessionType === 'exam' ? 1 : 0,
        p_exams_completed: updateData.sessionType === 'exam' ? 1 : 0,
        p_practice_sessions: updateData.sessionType === 'practice' ? 1 : 0,
      });

      if (error) throw error;
      console.log('Daily stats upserted');
    } catch (error) {
      console.error('Error updating daily stats:', error);
      throw error;
    }
  }

  /**
   * Update study progress for a subject
   */
  private async updateStudyProgress(
    studentId: string,
    subjectId: string,
    updateData: AnalyticsUpdateData
  ): Promise<void> {
    try {
      // Check if progress record exists
      const { data: existing, error: fetchError } = await supabase
        .from('study_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject_id', subjectId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existing) {
        // Update existing record
        const newQuestionsAttempted = existing.questions_attempted + updateData.questionsAttempted;
        const newQuestionsCorrect = existing.questions_correct + updateData.questionsCorrect;
        // Note: study_time is in seconds in the database, not minutes
        const newStudyTime = (existing.study_time || 0) + (updateData.studyTimeMinutes * 60);

        const { error: updateError } = await supabase
          .from('study_progress')
          .update({
            questions_attempted: newQuestionsAttempted,
            questions_correct: newQuestionsCorrect,
            study_time: newStudyTime,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        console.log('📈 Study progress updated');
      } else {
        // Create new record
        // Note: study_time is in seconds in the database
        const studyTimeSeconds = updateData.studyTimeMinutes * 60;

        const { error: insertError } = await supabase
          .from('study_progress')
          .insert({
            student_id: studentId,
            subject_id: subjectId,
            questions_attempted: updateData.questionsAttempted,
            questions_correct: updateData.questionsCorrect,
            study_time: studyTimeSeconds,
          });

        if (insertError) throw insertError;
        console.log('📈 Study progress created');
      }
    } catch (error) {
      console.error('Error updating study progress:', error);
      throw error;
    }
  }

  /**
   * Log activity to activity_log table
   */
  private async logActivity(
    studentId: string,
    updateData: AnalyticsUpdateData
  ): Promise<void> {
    try {
      const activityType: ActivityType =
        updateData.sessionType === 'practice' ? 'practice_session' : 'mock_exam';

      const accuracy = updateData.questionsAttempted > 0
        ? (updateData.questionsCorrect / updateData.questionsAttempted) * 100
        : 0;
      
      // Generate activity title
      const activityTitle = updateData.sessionType === 'practice' 
        ? `Practice Session - ${updateData.questionsAttempted} questions`
        : `Mock Exam - ${updateData.questionsAttempted} questions`;
      
      // Generate activity description
      const activityDescription = `Completed with ${accuracy.toFixed(1)}% accuracy (${updateData.questionsCorrect}/${updateData.questionsAttempted} correct)`;

      const activityData = {
        questions_attempted: updateData.questionsAttempted,
        questions_correct: updateData.questionsCorrect,
        accuracy: accuracy,
        study_time_minutes: updateData.studyTimeMinutes,
        subject_id: updateData.subjectId,
        session_date: updateData.sessionDate || new Date(),
      };

      const { error } = await supabase
        .from('activity_log')
        .insert({
          student_id: studentId,
          activity_type: activityType,
          activity_title: activityTitle,
          activity_description: activityDescription,
          activity_data: activityData,
        });

      if (error) throw error;
      console.log('📝 Activity logged');
    } catch (error) {
      console.error('Error logging activity:', error);
      // Don't throw - activity logging is not critical
    }
  }

  /**
   * Manually update student streak (if needed)
   * Note: This is usually handled by the database trigger
   */
  async updateStudentStreak(studentId: string): Promise<number> {
    try {
      // Call the database function to calculate and update streak
      const { data, error } = await supabase.rpc('update_student_streak_cache', {
        p_student_id: studentId,
      });

      if (error) throw error;

      // Fetch the updated streak value
      const { data: studentData, error: fetchError } = await supabase
        .from('students')
        .select('current_streak')
        .eq('id', studentId)
        .single();

      if (fetchError) throw fetchError;

      const streak = studentData?.current_streak || 0;
      console.log(`🔥 Student streak updated: ${streak}`);
      return streak;
    } catch (error) {
      console.error('Error updating student streak:', error);
      return 0;
    }
  }

  /**
   * Update after practice session (convenience method)
   * @param mode - 'practice' or 'quiz'. Only 'quiz' mode updates ELO/leaderboard to prevent gaming.
   */
  async updateAfterPractice(
    studentId: string,
    subjectId: string,
    questionsAttempted: number,
    questionsCorrect: number,
    studyTimeMinutes: number,
    mode?: 'practice' | 'quiz'
  ): Promise<void> {
    const safeQuestionsAttempted = Math.max(0, Math.trunc(questionsAttempted || 0));
    const safeQuestionsCorrect = Math.min(
      Math.max(0, Math.trunc(questionsCorrect || 0)),
      safeQuestionsAttempted
    );
    const safeStudyTimeMinutes = Math.max(0, Math.ceil(studyTimeMinutes || 0));

    await this.updateAfterActivity(studentId, {
      questionsAttempted: safeQuestionsAttempted,
      questionsCorrect: safeQuestionsCorrect,
      studyTimeMinutes: safeStudyTimeMinutes,
      sessionType: 'practice',
      subjectId,
      sessionDate: new Date(),
    });

    // ============================================
    // STAGE 10.2: Update ELO Score & Streak
    // Only update ELO for Quiz mode to prevent gaming the system
    // Practice mode is for learning without leaderboard pressure
    // ============================================
    try {
      // Always update streak (encourages daily practice)
      await streakService.updateStreakRealtime('practice');
      
      // Only update ELO score for Quiz mode (not Practice mode)
      if (mode === 'quiz' && safeQuestionsAttempted === 0) {
        console.log('âœ… Streak updated after quiz (ELO skipped: no answered questions)');
      } else if (mode === 'quiz') {
        // Calculate percentage
        const percentage = (safeQuestionsCorrect / safeQuestionsAttempted) * 100;
        
        // Determine difficulty
        const difficulty = scoringService.getDifficultyFromPercentage(percentage);
        
        // Update ELO score
        await scoringService.updateScore(percentage, difficulty, 'quiz_completion');
        
        console.log('✅ Score and streak updated after quiz');
      } else {
        console.log('✅ Streak updated after practice (ELO skipped for practice mode)');
      }
    } catch (error) {
      console.error('Error updating score/streak after practice:', error);
    }
    // ============================================

    // ============================================
    // PHASE 1: Update daily goal progress
    // ============================================
    try {
      await goalService.recordProgress(studentId, safeQuestionsAttempted, safeQuestionsCorrect, safeStudyTimeMinutes);
      console.log('✅ Daily goal progress updated after practice');
      // Sync to study plan weekly progress
      await studyPlanService.syncDailyToWeeklyProgress(studentId);
      console.log('✅ Study plan weekly progress synced after practice');
    } catch (error) {
      console.error('Error updating daily goal progress:', error);
    }
    // ============================================
    analyticsService.markAnalyticsDataChanged();
  }

  /**
   * Update after mock exam (convenience method)
   */
  async updateAfterExam(
    studentId: string,
    questionsAttempted: number,
    questionsCorrect: number,
    studyTimeMinutes: number
  ): Promise<void> {
    const safeQuestionsAttempted = Math.max(0, Math.trunc(questionsAttempted || 0));
    const safeQuestionsCorrect = Math.min(
      Math.max(0, Math.trunc(questionsCorrect || 0)),
      safeQuestionsAttempted
    );
    const safeStudyTimeMinutes = Math.max(0, Math.ceil(studyTimeMinutes || 0));

    await this.updateAfterActivity(studentId, {
      questionsAttempted: safeQuestionsAttempted,
      questionsCorrect: safeQuestionsCorrect,
      studyTimeMinutes: safeStudyTimeMinutes,
      sessionType: 'exam',
      sessionDate: new Date(),
    });

    // ============================================
    // PHASE 1: Update daily goal progress
    // ============================================
    try {
      await goalService.recordProgress(studentId, safeQuestionsAttempted, safeQuestionsCorrect, safeStudyTimeMinutes);
      console.log('✅ Daily goal progress updated after exam');
      // Sync to study plan weekly progress
      await studyPlanService.syncDailyToWeeklyProgress(studentId);
      console.log('✅ Study plan weekly progress synced after exam');
    } catch (error) {
      console.error('Error updating daily goal progress:', error);
    }
    // ============================================
    analyticsService.markAnalyticsDataChanged();
  }

  /**
   * Award achievement (called when achievement is earned)
   */
  async awardAchievement(
    studentId: string,
    achievementType: string,
    achievementName: string,
    achievementDescription: string,
    badgeIcon: string,
    milestoneValue: number
  ): Promise<void> {
    try {
      // Check if achievement already exists
      const { data: existing, error: fetchError } = await supabase
        .from('achievements')
        .select('*')
        .eq('student_id', studentId)
        .eq('achievement_type', achievementType)
        .eq('milestone_value', milestoneValue)
        .single();

      if (existing) {
        console.log('🏆 Achievement already earned');
        return;
      }

      // Insert new achievement
      const { error } = await supabase
        .from('achievements')
        .insert({
          student_id: studentId,
          achievement_type: achievementType,
          achievement_name: achievementName,
          achievement_description: achievementDescription,
          badge_icon: badgeIcon,
          milestone_value: milestoneValue,
        });

      if (error && error.code !== '23505') {
        // 23505 = unique constraint violation (already exists)
        throw error;
      }

      console.log(`🏆 Achievement earned: ${achievementName}`);

      // Log achievement activity
      await supabase
        .from('activity_log')
        .insert({
          student_id: studentId,
          activity_type: 'achievement_earned',
          activity_data: {
            achievement_name: achievementName,
            achievement_type: achievementType,
            milestone_value: milestoneValue,
          },
        });
    } catch (error) {
      console.error('Error awarding achievement:', error);
      // Don't throw - achievement awarding is not critical
    }
  }
}

export const analyticsUpdateService = new AnalyticsUpdateService();
export default analyticsUpdateService;
