// ============================================
// Core Types for Elmly Admin Panel
// ============================================

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  user_type: 'student' | 'teacher' | 'admin';
  city: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  student_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  city: string | null;
  elo_rating: number;
  total_exams: number;
  total_questions: number;
  last_active_date: string | null;
  created_at: string;
  is_active: boolean;
  total_count?: number;
}

// Student Detail (Full View)
export interface StudentDetail {
  student_id: string;
  user_id: string;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    city: string | null;
    phone: string | null;
    created_at: string;
  };
  stats: {
    elo_rating: number;
    total_exams: number;
    total_questions: number;
    avg_score: number;
    last_active_date: string | null;
    streak_count: number;
    is_active: boolean;
  };
  subjects: Array<{
    subject_id: string;
    subject_name: string;
    exam_count: number;
    avg_score: number;
  }> | null;
  recent_activity: Array<{
    test_id: string;
    subject_name: string;
    score: number;
    questions_attempted: number;
    created_at: string;
  }> | null;
}

// Teacher (List View)
export interface Teacher {
  teacher_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  city: string | null;
  is_verified: boolean;
  specializations: string[];
  hourly_rate: number | null;
  rating: number | null;
  total_bookings: number;
  student_count: number;
  created_at: string;
  total_count?: number;
}

// Teacher Detail (Full View)
export interface TeacherDetail {
  teacher_id: string;
  user_id: string;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    city: string | null;
    phone: string | null;
    created_at: string;
  };
  info: {
    bio: string | null;
    specializations: string[];
    experience_years: number | null;
    hourly_rate: number | null;
    monthly_rate: number | null;
    rating: number | null;
    is_verified: boolean;
    available_groups: string[];
    certificates: string[];
  };
  stats: {
    student_count: number;
    current_student_count: number;
    total_student_count: number;
    completed_bookings: number;
    pending_bookings: number;
    total_revenue: number;
  };
  students: Array<{
    student_id: string;
    student_name: string;
    student_email: string;
    assigned_at: string;
  }> | null;
  recent_bookings: Array<{
    booking_id: string;
    student_name: string;
    date: string;
    status: string;
    amount: number;
  }> | null;
}

// ============================================
// ADMIN TYPES
// ============================================

// Admin (List View)
export interface Admin {
  admin_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: AdminRole;
  permissions: Record<string, any>;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  created_by_name: string | null;
  total_count?: number;
}

// Admin Detail (Full View)
export interface AdminDetail {
  admin_id: string;
  user_id: string;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    phone: string | null;
  };
  info: {
    role: AdminRole;
    permissions: Record<string, any>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
  };
  created_by: {
    admin_id: string;
    full_name: string;
  } | null;
  stats: {
    total_actions: number;
    recent_actions_count: number;
  };
  recent_activity: Array<{
    log_id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, any> | null;
    created_at: string;
  }> | null;
}

// Audit Log
export interface AuditLog {
  log_id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
  total_count?: number;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

// ============================================
// Dashboard Types
// ============================================

export interface DashboardStats {
  total_students: number;
  active_students_30d: number;
  total_exams: number;
  avg_elo: number;
  total_teachers: number;
  active_bookings: number;
  total_questions_30d?: number;
  avg_accuracy_30d?: number;
  timestamp: string;
}

export interface StudentGrowthData {
  date: string;
  new_students: number;
  cumulative_students: number;
}

export interface ELODistribution {
  elo_bucket: number;
  student_count: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  percentage: number;
}

export interface ActivityEvent {
  event_type: 'registration' | 'score_change' | 'admin_action' | 'exam_completed';
  user_id: string;
  user_name: string;
  event_timestamp: string;
  metadata: Record<string, any>;
}

export interface ActivityHeatmapData {
  date: string;
  active_users: number;
  total_questions: number;
  total_exams: number;
}

// ============================================
// Chart Data Types
// ============================================

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface MultiSeriesChartData {
  date: string;
  [key: string]: string | number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// Form Types
// ============================================

export interface LoginFormData {
  email: string;
  password: string;
}

export interface ResetLeaderboardFormData {
  type: 'soft' | 'hard' | 'seasonal';
  decayPercentage?: number;
  seasonName?: string;
  confirmText: string;
}

export interface ScoreAdjustmentFormData {
  studentId: string;
  adjustment: number;
  reason: string;
}

export interface NotificationFormData {
  title: string;
  body: string;
  targetType: 'all' | 'students' | 'teachers' | 'specific';
  targetIds?: string[];
  scheduleAt?: string;
}

// ============================================
// Utility Types
// ============================================

export type UserType = 'student' | 'teacher' | 'admin';

export type ELOTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export type AdminRole = 'super_admin' | 'admin' | 'moderator';

export type ActionType = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT'
  | 'RESET_LEADERBOARD' 
  | 'ARCHIVE_SEASON'
  | 'ADJUST_SCORE' 
  | 'SEND_NOTIFICATION'
  | 'EXPORT_DATA' 
  | 'SYSTEM_CONFIG';
