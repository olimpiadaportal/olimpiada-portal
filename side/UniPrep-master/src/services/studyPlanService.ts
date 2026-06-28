import { supabase } from './supabase';
import { recommendationService } from './recommendationService';
import { StudyPlan, StudyPlanWeek, StudentGoal } from '../types/goals';
import i18n from 'i18next';

class StudyPlanService {
  // ============================================
  // PLAN CRUD
  // ============================================

  /**
   * Get the active study plan for a student.
   * Optionally syncs weekly progress from daily_progress before returning.
   * @param studentId - The student's ID
   * @param syncProgress - If true, syncs daily progress to weekly before returning (default: true)
   */
  async getActivePlan(studentId: string, syncProgress: boolean = true): Promise<StudyPlan | null> {
    try {
      const { data, error } = await supabase
        .from('study_plans')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active plan:', error);
        throw error;
      }

      if (!data) return null;

      // Sync weekly progress from daily_progress before fetching weeks
      // This ensures the displayed data is always up-to-date, even on a new day
      if (syncProgress) {
        await this.syncDailyToWeeklyProgressInternal(studentId, data.id);
      }

      // Fetch weeks for this plan (now with synced data)
      const { data: weeks, error: weeksError } = await supabase
        .from('study_plan_weeks')
        .select('*')
        .eq('plan_id', data.id)
        .order('week_number', { ascending: true });

      if (weeksError) {
        console.error('Error fetching plan weeks:', weeksError);
      }

      return {
        ...data,
        weeks: (weeks || []) as StudyPlanWeek[],
      } as StudyPlan;
    } catch (error) {
      console.error('Error in getActivePlan:', error);
      return null;
    }
  }

  /**
   * Internal sync method that takes planId to avoid re-fetching the plan
   */
  private async syncDailyToWeeklyProgressInternal(studentId: string, planId: string): Promise<void> {
    try {
      // Get weeks for this plan with focus_subjects
      const { data: weeks, error: weeksError } = await supabase
        .from('study_plan_weeks')
        .select('id, start_date, end_date, target_questions, focus_subjects')
        .eq('plan_id', planId);

      if (weeksError || !weeks || weeks.length === 0) return;

      const today = this.dateToString(new Date());
      const currentWeek = weeks.find(w => today >= w.start_date && today <= w.end_date);
      if (!currentWeek) return;

      // Get focus subjects for this week
      const focusSubjects: string[] = currentWeek.focus_subjects || [];
      
      // Get the auth user_id from the students table
      // practice_sessions.user_id references auth.users.id, NOT students.id
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('user_id')
        .eq('id', studentId)
        .single();

      if (studentError || !studentData) {
        console.error('📊 [Internal] Could not get user_id for student:', studentError);
        return;
      }

      const authUserId = studentData.user_id;
      
      console.log('📊 [Internal] Syncing weekly progress:', {
        studentId,
        authUserId,
        weekId: currentWeek.id,
        focusSubjects,
        dateRange: `${currentWeek.start_date} to ${currentWeek.end_date}`,
      });
      
      // Query practice_sessions directly to filter by focus subjects
      // This ensures we only count questions from the selected subjects
      // Use proper ISO timestamp format for date comparison
      const startTimestamp = `${currentWeek.start_date}T00:00:00`;
      const endTimestamp = `${currentWeek.end_date}T23:59:59`;
      
      let query = supabase
        .from('practice_sessions')
        .select('total_questions, correct_answers, subject_id, completed_at')
        .eq('user_id', authUserId)
        .not('completed_at', 'is', null)
        .gte('completed_at', startTimestamp)
        .lte('completed_at', endTimestamp);

      // Filter by focus subjects if any are selected
      if (focusSubjects.length > 0) {
        query = query.in('subject_id', focusSubjects);
      }

      const { data: sessions, error } = await query;

      console.log('📊 [Internal] Practice sessions found:', {
        count: sessions?.length || 0,
        dateFilter: { start: startTimestamp, end: endTimestamp },
        focusSubjectsFilter: focusSubjects,
        sessions: sessions?.map(s => ({ subject_id: s.subject_id, questions: s.total_questions, completed_at: s.completed_at })),
        error: error?.message,
      });

      if (error || !sessions) return;

      // Calculate totals from practice sessions (excluding exam questions)
      const weekQuestions = sessions.reduce((sum, s) => sum + (s.total_questions || 0), 0);
      const totalCorrect = sessions.reduce((sum, s) => sum + (s.correct_answers || 0), 0);
      const avgAccuracy = weekQuestions > 0
        ? Math.round((totalCorrect / weekQuestions) * 100)
        : 0;

      const isCompleted = weekQuestions >= currentWeek.target_questions;

      await supabase
        .from('study_plan_weeks')
        .update({
          completed_questions: weekQuestions,
          actual_accuracy: avgAccuracy,
          is_completed: isCompleted,
        })
        .eq('id', currentWeek.id);

      // Recalculate overall plan progress
      await this.recalculatePlanProgress(planId);
    } catch (error) {
      // Silently fail — this is a background sync, don't block the UI
      console.warn('Error syncing daily to weekly progress:', error);
    }
  }

  /**
   * Get all study plans for a student
   */
  async getAllPlans(studentId: string): Promise<StudyPlan[]> {
    try {
      const { data, error } = await supabase
        .from('study_plans')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all plans:', error);
        throw error;
      }

      return (data || []) as StudyPlan[];
    } catch (error) {
      console.error('Error in getAllPlans:', error);
      return [];
    }
  }

  // ============================================
  // PLAN GENERATION
  // ============================================

  /**
   * Generate a new study plan based on student goals and performance data.
   *
   * Algorithm:
   * 1. Get weak subjects from recommendationService
   * 2. Calculate weeks remaining until exam date
   * 3. Prioritize subjects by gap between current and target accuracy
   * 4. Distribute focus: weak subjects get 2x attention early, tapering to equal
   * 5. Set weekly targets based on daily goals × preferred study days
   */
  async generatePlan(
    studentId: string,
    goals: StudentGoal,
    selectedSubjectIds?: string[]
  ): Promise<StudyPlan | null> {
    try {
      // Abandon any existing active plan
      await this.abandonActivePlan(studentId);

      // Get recommendations (weak subjects)
      const recommendations = await recommendationService.getRecommendations(studentId, 10);

      // Get all subjects for the student's exam group
      const { data: studentData } = await supabase
        .from('students')
        .select('target_group')
        .eq('id', studentId)
        .single();

      let subjectQuery = supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      // If student selected specific subjects, filter to those
      if (selectedSubjectIds && selectedSubjectIds.length > 0) {
        subjectQuery = subjectQuery.in('id', selectedSubjectIds);
      }

      const { data: allSubjects } = await subjectQuery;

      if (!allSubjects || allSubjects.length === 0) {
        console.error('No subjects found');
        return null;
      }

      // Calculate plan duration
      const startDate = new Date();
      let endDate: Date;
      let totalWeeks: number;

      if (goals.target_exam_date) {
        endDate = new Date(goals.target_exam_date);
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        totalWeeks = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / msPerWeek));
        // Cap at 52 weeks
        totalWeeks = Math.min(totalWeeks, 52);
      } else {
        // Default: 8-week plan
        totalWeeks = 8;
        endDate = new Date();
        endDate.setDate(endDate.getDate() + totalWeeks * 7);
      }

      // Build subject priority list
      const weakSubjectIds = new Set(recommendations.map(r => r.subjectId));
      const subjectPriorities = allSubjects.map(subject => {
        const rec = recommendations.find(r => r.subjectId === subject.id);
        // Use locale-aware subject name
        const lang = i18n.language;
        const localeName = (lang === 'az' || lang === 'ru') && subject.name_az
          ? subject.name_az
          : subject.name_en;
        return {
          id: subject.id,
          name: localeName,
          nameAz: subject.name_az,
          accuracy: rec?.accuracy ?? 75,
          isWeak: weakSubjectIds.has(subject.id),
          priority: rec?.priority ?? 'low',
        };
      });

      // Sort: weak subjects first, then by accuracy ascending
      subjectPriorities.sort((a, b) => {
        if (a.isWeak && !b.isWeak) return -1;
        if (!a.isWeak && b.isWeak) return 1;
        return a.accuracy - b.accuracy;
      });

      // Generate weekly breakdown
      const questionsPerDay = goals.daily_question_target;
      const studyDaysPerWeek = goals.preferred_study_days.length || 5;
      const questionsPerWeek = questionsPerDay * studyDaysPerWeek;

      const weeks: Omit<StudyPlanWeek, 'id' | 'created_at'>[] = [];
      const weakSubjects = subjectPriorities.filter(s => s.isWeak);
      const strongSubjects = subjectPriorities.filter(s => !s.isWeak);

      for (let w = 0; w < totalWeeks; w++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        // Determine focus subjects for this week
        // Early weeks: 2/3 weak subjects, 1/3 strong
        // Later weeks: more balanced
        const progressRatio = w / totalWeeks; // 0 to 1
        const weakFocusRatio = Math.max(0.33, 1 - progressRatio * 0.67);

        const numFocusSubjects = Math.min(3, subjectPriorities.length);
        const numWeakFocus = Math.min(
          Math.ceil(numFocusSubjects * weakFocusRatio),
          weakSubjects.length
        );
        const numStrongFocus = numFocusSubjects - numWeakFocus;

        // Rotate through subjects across weeks
        const focusWeak = weakSubjects.length > 0
          ? this.rotateSubjects(weakSubjects, w, numWeakFocus)
          : [];
        const focusStrong = strongSubjects.length > 0
          ? this.rotateSubjects(strongSubjects, w, numStrongFocus)
          : [];

        const focusAll = [...focusWeak, ...focusStrong];

        // Target accuracy increases gradually
        const baseAccuracy = 60;
        const targetAccuracyGoal = goals.target_score
          ? Math.min(95, (goals.target_score / 300) * 100) // rough conversion
          : 80;
        const weekTargetAccuracy = Math.round(
          baseAccuracy + (targetAccuracyGoal - baseAccuracy) * progressRatio
        );

        weeks.push({
          plan_id: '', // Will be set after plan creation
          week_number: w + 1,
          start_date: this.dateToString(weekStart),
          end_date: this.dateToString(weekEnd),
          focus_subjects: focusAll.map(s => s.id),
          focus_subject_names: focusAll.map(s => s.name),
          target_questions: questionsPerWeek,
          target_accuracy: weekTargetAccuracy,
          completed_questions: 0,
          actual_accuracy: 0,
          is_completed: false,
        });
      }

      // Create the plan with translated title/description
      const planTitle = goals.target_exam_date
        ? i18n.t('studyPlan.examPrepTitle', 'Exam Prep Plan ({{weeks}} weeks)', { weeks: totalWeeks })
        : i18n.t('studyPlan.planTitle', 'Study Plan ({{weeks}} weeks)', { weeks: totalWeeks });

      const planDescription = goals.target_score
        ? i18n.t('studyPlan.targetScoreDesc', 'Target score: {{score}} points', { score: goals.target_score })
        : i18n.t('studyPlan.personalizedDesc', 'Personalized study plan based on your performance');

      const { data: plan, error: planError } = await supabase
        .from('study_plans')
        .insert({
          student_id: studentId,
          title: planTitle,
          description: planDescription,
          start_date: this.dateToString(startDate),
          end_date: this.dateToString(endDate),
          total_weeks: totalWeeks,
          status: 'active',
          progress_percentage: 0,
        })
        .select()
        .single();

      if (planError) {
        console.error('Error creating plan:', planError);
        throw planError;
      }

      // Create weeks with the plan ID
      const weeksWithPlanId = weeks.map(w => ({
        ...w,
        plan_id: plan.id,
      }));

      const { data: createdWeeks, error: weeksError } = await supabase
        .from('study_plan_weeks')
        .insert(weeksWithPlanId)
        .select();

      if (weeksError) {
        console.error('Error creating plan weeks:', weeksError);
        throw weeksError;
      }

      return {
        ...plan,
        weeks: (createdWeeks || []) as StudyPlanWeek[],
      } as StudyPlan;
    } catch (error) {
      console.error('Error in generatePlan:', error);
      return null;
    }
  }

  // ============================================
  // PLAN MANAGEMENT
  // ============================================

  /**
   * Abandon the current active plan
   */
  async abandonActivePlan(studentId: string): Promise<void> {
    try {
      await supabase
        .from('study_plans')
        .update({ status: 'abandoned' })
        .eq('student_id', studentId)
        .eq('status', 'active');
    } catch (error) {
      console.error('Error abandoning plan:', error);
    }
  }

  /**
   * Get the current week of the active plan
   */
  getCurrentWeek(plan: StudyPlan): StudyPlanWeek | null {
    if (!plan.weeks || plan.weeks.length === 0) return null;

    const today = new Date();
    const todayStr = this.dateToString(today);

    return plan.weeks.find(
      w => todayStr >= w.start_date && todayStr <= w.end_date
    ) || null;
  }

  /**
   * Returns true when today is past the last week's end_date.
   */
  isPlanComplete(plan: StudyPlan): boolean {
    if (!plan.weeks || plan.weeks.length === 0) return false;
    const lastWeek = plan.weeks[plan.weeks.length - 1];
    const today = this.dateToString(new Date());
    return today > lastWeek.end_date;
  }

  /**
   * Update weekly progress based on daily progress data
   */
  async updateWeeklyProgress(
    planId: string,
    weekId: string,
    questionsCompleted: number,
    accuracy: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('study_plan_weeks')
        .update({
          completed_questions: questionsCompleted,
          actual_accuracy: accuracy,
          is_completed: true,
        })
        .eq('id', weekId);

      if (error) throw error;

      // Recalculate plan progress
      await this.recalculatePlanProgress(planId);
    } catch (error) {
      console.error('Error updating weekly progress:', error);
    }
  }

  /**
   * Recalculate overall plan progress percentage
   */
  private async recalculatePlanProgress(planId: string): Promise<void> {
    try {
      const { data: weeks, error } = await supabase
        .from('study_plan_weeks')
        .select('is_completed, completed_questions, target_questions')
        .eq('plan_id', planId);

      if (error || !weeks) return;

      const totalTarget = weeks.reduce((sum, w) => sum + w.target_questions, 0);
      const totalCompleted = weeks.reduce((sum, w) => sum + w.completed_questions, 0);
      const progress = totalTarget > 0
        ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100))
        : 0;

      const allCompleted = weeks.every(w => w.is_completed);

      await supabase
        .from('study_plans')
        .update({
          progress_percentage: progress,
          status: allCompleted ? 'completed' : 'active',
        })
        .eq('id', planId);
    } catch (error) {
      console.error('Error recalculating plan progress:', error);
    }
  }

  /**
   * Sync daily progress into the current week of the active study plan.
   * Called after each practice/exam session to keep weekly progress up to date.
   * Only counts questions from focus subjects (excludes exam questions).
   */
  async syncDailyToWeeklyProgress(studentId: string): Promise<void> {
    try {
      // Use syncProgress: false to avoid recursive sync loop
      const plan = await this.getActivePlan(studentId, false);
      if (!plan || !plan.weeks || plan.weeks.length === 0) return;

      const currentWeek = this.getCurrentWeek(plan);
      if (!currentWeek) return;

      // Get focus subjects for this week
      const focusSubjects: string[] = currentWeek.focus_subjects || [];
      
      // Get the auth user_id from the students table
      // practice_sessions.user_id references auth.users.id, NOT students.id
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('user_id')
        .eq('id', studentId)
        .single();

      if (studentError || !studentData) {
        console.error('📊 Could not get user_id for student:', studentError);
        return;
      }

      const authUserId = studentData.user_id;
      
      console.log('📊 Syncing weekly progress:', {
        studentId,
        authUserId,
        weekId: currentWeek.id,
        focusSubjects,
        dateRange: `${currentWeek.start_date} to ${currentWeek.end_date}`,
      });
      
      // Query practice_sessions directly to filter by focus subjects
      // This ensures we only count questions from the selected subjects (excludes exams)
      const startTimestamp = `${currentWeek.start_date}T00:00:00`;
      const endTimestamp = `${currentWeek.end_date}T23:59:59`;
      
      let query = supabase
        .from('practice_sessions')
        .select('total_questions, correct_answers, subject_id')
        .eq('user_id', authUserId)
        .not('completed_at', 'is', null)
        .gte('completed_at', startTimestamp)
        .lte('completed_at', endTimestamp);

      // Filter by focus subjects if any are selected
      if (focusSubjects.length > 0) {
        query = query.in('subject_id', focusSubjects);
      }

      const { data: sessions, error } = await query;

      console.log('📊 Practice sessions found:', {
        count: sessions?.length || 0,
        sessions: sessions?.map(s => ({ subject_id: s.subject_id, questions: s.total_questions })),
        error: error?.message,
      });

      if (error || !sessions) return;

      // Calculate totals from practice sessions
      const weekQuestions = sessions.reduce((sum, s) => sum + (s.total_questions || 0), 0);
      const totalCorrect = sessions.reduce((sum, s) => sum + (s.correct_answers || 0), 0);
      const avgAccuracy = weekQuestions > 0
        ? Math.round((totalCorrect / weekQuestions) * 100)
        : 0;

      const isCompleted = weekQuestions >= currentWeek.target_questions;

      await supabase
        .from('study_plan_weeks')
        .update({
          completed_questions: weekQuestions,
          actual_accuracy: avgAccuracy,
          is_completed: isCompleted,
        })
        .eq('id', currentWeek.id);

      // Recalculate overall plan progress
      await this.recalculatePlanProgress(plan.id);
    } catch (error) {
      console.error('Error syncing daily to weekly progress:', error);
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private rotateSubjects(
    subjects: { id: string; name: string }[],
    weekIndex: number,
    count: number
  ): { id: string; name: string }[] {
    if (subjects.length === 0 || count === 0) return [];
    const result: { id: string; name: string }[] = [];
    for (let i = 0; i < count; i++) {
      const idx = (weekIndex + i) % subjects.length;
      result.push(subjects[idx]);
    }
    return result;
  }

  private dateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export const studyPlanService = new StudyPlanService();
