// Settings Types
// Stage 9: Profile & Settings

export type Language = 'az' | 'en' | 'ru';
export type Theme = 'light' | 'dark' | 'system';
export type ProfileVisibility = 'public' | 'private';
export type FontSize = 'small' | 'medium' | 'large';

export interface UserSettings {
  // General Settings
  language: Language;
  theme: Theme;
  defaultScreen?: string;
  
  // Notification Settings
  notificationsEnabled: boolean;
  studyReminders: boolean;
  examReminders: boolean;
  achievementNotifications: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm format
  quietHoursEnd: string; // HH:mm format
  reminderTime: string; // HH:mm format - daily study reminder time
  
  // Study Settings
  timerEnabled: boolean;
  autoAdvance: boolean;
  showExplanations: boolean;
  
  // Privacy Settings
  profileVisibility: ProfileVisibility;
  showInLeaderboard: boolean;
  
  // Accessibility Settings
  fontSize: FontSize;
  highContrast: boolean;
  
  // Data & Storage Settings
  offlineMode: boolean;
  cacheSize: number;
}

export interface NotificationToken {
  id: string;
  user_id: string;
  token: string;
  device_type: 'ios' | 'android' | 'web';
  created_at: string;
  last_used_at: string;
}

export interface ScheduledNotification {
  id: string;
  user_id: string;
  notification_type: string;
  scheduled_time: string; // HH:mm format
  days_of_week: number[]; // 1-7 (Monday-Sunday)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileData {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  city?: string;
  target_group?: string;
  target_university?: string;
  bio?: string;
  created_at: string;
  updated_at: string;
}

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  // General
  language: 'az',
  theme: 'system',
  defaultScreen: 'Home',
  
  // Notifications
  notificationsEnabled: true,
  studyReminders: true,
  examReminders: true,
  achievementNotifications: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  reminderTime: '18:00',
  
  // Study
  timerEnabled: true,
  autoAdvance: false,
  showExplanations: true,
  
  // Privacy
  profileVisibility: 'public',
  showInLeaderboard: true,
  
  // Accessibility
  fontSize: 'medium',
  highContrast: false,
  
  // Data
  offlineMode: false,
  cacheSize: 0,
};
