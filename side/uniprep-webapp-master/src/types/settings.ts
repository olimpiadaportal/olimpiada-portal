// Settings Types
// Stage 8: Profile & Settings

export type Language = 'az' | 'en' | 'ru'
export type Theme = 'light' | 'dark' | 'system'
export type ProfileVisibility = 'public' | 'private'
export type FontSize = 'small' | 'medium' | 'large'

export interface UserSettings {
  // General Settings
  language: Language
  theme: Theme
  
  // Notification Settings (Web notifications)
  notificationsEnabled: boolean
  studyReminders: boolean
  examReminders: boolean
  achievementNotifications: boolean
  
  // Privacy Settings
  profileVisibility: ProfileVisibility
  showInLeaderboard: boolean
}

export interface UserSettingsDB {
  id: string
  user_id: string
  language: string
  theme: string
  notifications_enabled: boolean
  study_reminders: boolean
  exam_reminders: boolean
  achievement_notifications: boolean
  profile_visibility: string
  show_in_leaderboard: boolean
  created_at: string
  updated_at: string
}

export interface ProfileData {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  user_type: 'student' | 'teacher'
  created_at: string
  updated_at: string
}

export interface StudentProfile extends ProfileData {
  student_id: string
  city: string | null
  target_group: string | null
  target_university: string | null
  bio: string | null
  elo_rating: number
  current_streak: number
  monthly_score: number
  total_exams_taken: number
}

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  // General
  language: 'az',
  theme: 'system',
  
  // Notifications
  notificationsEnabled: true,
  studyReminders: true,
  examReminders: true,
  achievementNotifications: true,
  
  // Privacy
  profileVisibility: 'public',
  showInLeaderboard: true,
}
