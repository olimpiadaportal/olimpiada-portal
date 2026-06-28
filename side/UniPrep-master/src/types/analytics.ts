// Analytics Type Definitions

export type TimePeriod = '7D' | '30D' | '90D';

export interface StudentStats {
  // Overall metrics
  overallAccuracy: number;
  totalStudyTimeMinutes: number;
  totalQuestionsAttempted: number;
  totalQuestionsCorrect: number;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null;
  
  // Daily averages
  avgDailyStudyTime: number;
  avgDailyQuestions: number;
  avgDailyAccuracy: number;
  
  // Activity counts
  practiceSessions: number;
  mockExamsCompleted: number;
  activeDays: number;
}

export interface DailyStat {
  id: string;
  student_id: string;
  date: string;
  questions_attempted: number;
  questions_correct: number;
  study_time_minutes: number;
  practice_sessions: number;
  exams_completed: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubjectAnalytics {
  subject_id: string;
  subject_name: string;
  questions_attempted: number;
  questions_correct: number;
  accuracy: number;
  study_time_minutes: number;
  last_practiced: string | null;
}

export interface ActivityLog {
  id: string;
  student_id: string;
  activity_type: ActivityType;
  activity_data: any;
  created_at: string;
}

export type ActivityType =
  | 'practice_session'
  | 'mock_exam'
  | 'achievement_earned'
  | 'goal_completed'
  | 'streak_milestone'
  | 'subject_mastered';

export interface StudyGoal {
  id: string;
  student_id: string;
  goal_type: GoalType;
  target_value: number;
  current_value: number;
  subject_id?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export type GoalType =
  | 'daily_study_time'
  | 'target_score'
  | 'questions_per_day'
  | 'subject_mastery';

export interface Achievement {
  id: string;
  student_id: string;
  achievement_type: AchievementType;
  achievement_name: string;
  achievement_description: string;
  badge_icon: string;
  milestone_value: number;
  earned_at: string;
}

export type AchievementType =
  | 'questions_milestone'
  | 'study_streak'
  | 'high_accuracy'
  | 'exam_score'
  | 'subject_master'
  | 'consistent_learner'
  | 'leaderboard_rank';

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface AnalyticsUpdateData {
  questionsAttempted: number;
  questionsCorrect: number;
  studyTimeMinutes: number;
  sessionType: 'practice' | 'exam';
  subjectId?: string;
  sessionDate?: Date;
}

export interface WeakTopic {
  subject_id: string;
  subject_name: string;
  accuracy: number;
  questions_attempted: number;
  priority: 'high' | 'medium' | 'low';
}

export interface StrongTopic {
  subject_id: string;
  subject_name: string;
  accuracy: number;
  questions_attempted: number;
}

export interface PerformanceInsight {
  type: 'strength' | 'weakness' | 'improvement' | 'recommendation';
  title: string;
  description: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
}
