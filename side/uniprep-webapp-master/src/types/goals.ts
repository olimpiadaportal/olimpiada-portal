// Phase 1: Goal Setting & Study Plans Types (Web App)

export interface StudentGoal {
  id: string
  student_id: string
  daily_question_target: number
  daily_time_target_minutes: number
  target_exam_date: string | null
  target_score: number | null
  preferred_study_days: number[]
  preferred_study_time: 'morning' | 'afternoon' | 'evening' | 'night'
  created_at: string
  updated_at: string
}

export interface StudyPlan {
  id: string
  student_id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  total_weeks: number
  status: 'active' | 'completed' | 'abandoned'
  progress_percentage: number
  created_at: string
  updated_at: string
  weeks?: StudyPlanWeek[]
}

export interface StudyPlanWeek {
  id: string
  plan_id: string
  week_number: number
  start_date: string
  end_date: string
  focus_subjects: string[]
  focus_subject_names: string[]
  target_questions: number
  target_accuracy: number | null
  completed_questions: number
  actual_accuracy: number
  is_completed: boolean
  created_at: string
}

export interface DailyProgress {
  id: string
  student_id: string
  date: string
  questions_completed: number
  time_spent_minutes: number
  accuracy: number
  question_goal_met: boolean
  time_goal_met: boolean
  consecutive_goal_days: number
  created_at: string
  updated_at: string
}

export interface DailyGoalStatus {
  questionsCompleted: number
  questionsTarget: number
  timeSpentMinutes: number
  timeTarget: number
  accuracy: number
  questionGoalMet: boolean
  timeGoalMet: boolean
  bothGoalsMet: boolean
  progressPercentage: number
}

export interface GoalSettingFormData {
  dailyQuestionTarget: number
  dailyTimeTargetMinutes: number
  targetExamDate: Date | null
  targetScore: number | null
  preferredStudyDays: number[]
  preferredStudyTime: 'morning' | 'afternoon' | 'evening' | 'night'
}

export const QUESTION_TARGET_OPTIONS = [10, 20, 30, 50] as const
export const TIME_TARGET_OPTIONS = [15, 30, 45, 60] as const
export const STUDY_TIME_OPTIONS = ['morning', 'afternoon', 'evening', 'night'] as const
