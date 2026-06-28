// User Types
export type UserType = 'student' | 'teacher';

export type ExamGroup = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  user_type: UserType;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  user_id: string;
  target_group: ExamGroup;
  target_university?: string;
  graduation_year?: number;
  first_stage_score?: number;
  onboarding_completed?: boolean;
  strongest_subjects?: string[];
  weakest_subjects?: string[];
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  user_id: string;
  bio?: string;
  specializations: string[];
  experience_years: number;
  hourly_rate?: number;
  monthly_rate?: number;
  rating: number;
  current_students: number;
  total_students: number;
  is_verified: boolean;
  verification_status?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  verification_rejection_reason?: string | null;
  available_groups: ExamGroup[];
  created_at: string;
  updated_at: string;
}

// Subject Types
export interface Subject {
  id: string;
  name_en: string;
  name_az: string;
  category: 'first_stage' | 'second_stage';
  coefficient: number;
  max_points: number;
  created_at: string;
}

// Question Types
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type ExamStage = 'first' | 'second';

export interface Question {
  id: string;
  subject_id: string;
  question_text: string;
  question_image_url?: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  correct_answer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation?: string;
  difficulty: DifficultyLevel;
  // Note: exam_stage removed - questions don't have stages, only Exams do
  created_at: string;
}

// Mock Exam Types
export type ExamType = 'first_stage' | 'second_stage' | 'full_exam';

export interface MockExam {
  id: string;
  title: string;
  exam_type: ExamType;
  target_group?: ExamGroup;
  duration_minutes: number;
  total_questions: number;
  created_at: string;
}

export interface StudentExamAttempt {
  id: string;
  student_id: string;
  mock_exam_id: string;
  score: number;
  started_at: string;
  completed_at?: string;
}

export interface StudentAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answer?: 'A' | 'B' | 'C' | 'D' | 'E';
  is_correct: boolean;
  created_at: string;
}

// Progress Types
export interface StudyProgress {
  id: string;
  student_id: string;
  subject_id: string;
  questions_attempted: number;
  questions_correct: number;
  study_time: number; // in minutes
  updated_at: string;
}

// Booking Types
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentStatus = 'free' | 'awaiting_acceptance' | 'awaiting_payment' | 'pending_payment' | 'paid' | 'payment_failed' | 'refunded';

export interface Booking {
  id: string;
  student_id: string;
  teacher_id: string;
  subject_id: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_intent_id?: string | null;
  scheduled_date: string;
  scheduled_time: string;
  price: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Review Types
export interface TeacherReview {
  id: string;
  teacher_id: string;
  student_id: string;
  rating: number;
  review_text?: string;
  created_at: string;
}

// Notification Types
export type NotificationType = 'exam' | 'booking' | 'achievement' | 'reminder' | 'general';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  PersonalizationQuiz: undefined;
  TeacherOnboardingQuiz: undefined;
  Main: {
    screen?: string;
    params?: {
      screen?: string;
      params?: any;
    };
  } | undefined;
  Profile: undefined;
  
  // Stage 9: Profile & Settings
  StudentProfile: undefined;
  EditProfile: undefined;
  TeacherOwnProfile: undefined;
  AvailabilityManagement: undefined;
  Settings: undefined;
  NotificationPreferences: undefined;
  ChangePassword: undefined;
  AccountManagement: undefined;
  HelpSupport: undefined;
  About: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  
  // Stage 10: Messaging
  ConversationsList: undefined;
  Chat: {
    conversationId: string;
    otherUser: any;
  };
  
  // Stage 10.2: Teacher Management
  MyTeachers: {
    studentId: string;
  };
  MyBookings: undefined;
  MySubscriptions: undefined;
  SubscriptionTeacherProfile: { teacherId: string };

  // Notification Center
  NotificationCenter: undefined;

  // Teacher Exam Features
  TeacherMyExams: undefined;
  TeacherAddQuestion: { onSuccess?: () => void; questionId?: string; allowedSubjectIds?: string[] } | undefined;
  TeacherBuildExam: { examId?: string } | undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  StudentSignup: undefined;
  TeacherSignup: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ResendVerification: undefined;
};

export type MainTabParamList = {
  Home: {
    screen?: string;
    params?: any;
  } | undefined;
  Practice: {
    screen?: string;
    params?: any;
  } | undefined;
  MockExams: {
    screen?: string;
    params?: any;
  } | undefined;
  Teachers: {
    screen?: string;
    params?: any;
  } | undefined;
  Analytics: {
    screen?: 'AnalyticsMain' | 'Leaderboard';
    params?: any;
  } | undefined;
  TeacherDashboard: undefined;
  TeacherBookings: {
    initialTab?: string;
  } | undefined;
  TeacherExams: {
    screen?: string;
    params?: any;
  } | undefined;
  TeacherActivity: undefined;
  Profile: undefined;
};
