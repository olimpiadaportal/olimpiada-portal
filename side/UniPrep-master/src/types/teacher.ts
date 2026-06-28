// Teacher Marketplace Types

import { AzerbaijanCity } from '../constants/cities';

export type ExamGroup = 'I' | 'II' | 'III' | 'IV' | 'V';

// Student Profile
export interface Student {
  id: string;
  user_id: string;
  target_group: ExamGroup | null;
  target_university: string | null;
  graduation_year: number | null;
  first_stage_score: number | null;
  city: string; // Student's city
  created_at: string;
  updated_at: string;
}

export type BookingStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'completed' | 'cancelled';

export type SessionMethod = 'in-person' | 'online';
export type TeacherVerificationStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';

// Teacher Profile
export interface Teacher {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  bio: string;
  city: string; // Teacher's city
  specializations: string[]; // Subject names
  experience_years: number;
  hourly_rate: number;
  monthly_rate: number | null;
  rating: number; // 0-5
  total_reviews: number;
  is_verified: boolean;
  verification_status?: TeacherVerificationStatus;
  verification_rejection_reason?: string | null;
  available_groups: ExamGroup[];
  education: string | null;
  certificates: string[]; // URLs to certificate images
  current_students: number;
  total_students: number;
  total_sessions: number;
  created_at: string;
  updated_at: string;
}

// Teacher with additional computed fields
export interface TeacherWithDetails extends Teacher {
  is_favorite: boolean;
  is_same_city?: boolean; // Same city as student
  can_do_in_person?: boolean; // Can do in-person sessions
  distance?: number; // km from student (future feature)
  availability_status: 'available' | 'busy' | 'offline';
}

// Teacher search filters
export interface TeacherFilters {
  search?: string;
  subject?: string;
  target_group?: ExamGroup;
  min_rating?: number;
  max_hourly_rate?: number;
  min_experience?: number;
  is_verified?: boolean;
  available_groups?: ExamGroup[];
  sort_by?: 'rating' | 'price_low' | 'price_high' | 'experience' | 'reviews';
}

// Booking
export interface Booking {
  id: string;
  student_id: string;
  teacher_id: string;
  subject_id: string;
  subject_name: string;
  status: BookingStatus;
  payment_status: 'free' | 'awaiting_acceptance' | 'awaiting_payment' | 'pending_payment' | 'paid' | 'payment_failed' | 'refunded';
  payment_intent_id?: string | null;
  scheduled_date: string; // ISO date
  scheduled_time: string; // HH:mm format
  duration_hours: number;
  session_method: SessionMethod;
  service_type?: ServiceType; // hourly or monthly service
  location: string | null;
  notes: string | null;
  price: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  teacher_notes: string | null;
  teacher_notes_updated_at: string | null;
}

// Booking with related data
export interface BookingWithDetails extends Booking {
  teacher: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating: number;
    phone: string;
  };
  student: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    phone: string;
  };
  can_cancel: boolean;
  can_review: boolean;
}

// Service type for booking
export type ServiceType = 'hourly' | 'monthly';

// Booking request data
export interface BookingRequest {
  teacher_id: string;
  subject_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_hours: number;
  session_method: SessionMethod;
  service_type: ServiceType;
  location?: string;
  notes?: string;
}

// Teacher Review
export interface TeacherReview {
  id: string;
  teacher_id: string;
  student_id: string;
  booking_id: string;
  rating: number; // 1-5
  review_text: string;
  created_at: string;
  updated_at: string;
}

// Review with student details
export interface ReviewWithStudent extends TeacherReview {
  student: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

// Favorite Teacher
export interface FavoriteTeacher {
  id: string;
  student_id: string;
  teacher_id: string;
  created_at: string;
}

// Teacher Availability
export interface TeacherAvailability {
  id: string;
  teacher_id: string;
  day_of_week: number; // 0-6 (Sunday-Saturday)
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  is_available: boolean;
}

// Time slot for booking
export interface TimeSlot {
  time: string; // HH:mm
  is_available: boolean;
  is_booked: boolean;
}

// Teacher Statistics (for dashboard)
export interface TeacherStats {
  current_students: number;
  total_students: number;
  active_bookings: number;
  completed_sessions: number;
  pending_requests: number;
  total_earnings: number;
  monthly_earnings: number;
  average_rating: number;
  total_reviews: number;
  earnings_trend: EarningsTrend[];
}

export interface EarningsTrend {
  month: string; // YYYY-MM
  earnings: number;
  sessions: number;
}

// Transaction (for earnings tracking)
export interface Transaction {
  id: string;
  teacher_id: string;
  booking_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  transaction_date: string;
  description: string;
}

// Recommendation reason types
export interface RecommendationReason {
  type: 'weak_subjects' | 'group_match' | 'group_subjects' | 'same_city' | 'high_rating' | 'verified';
  params?: Record<string, string>;
}

// Recommendation
export interface TeacherRecommendation {
  teacher: TeacherWithDetails;
  match_score: number; // 0-100
  reasons: RecommendationReason[]; // Why recommended
}

// Teacher profile update data
export interface TeacherProfileUpdate {
  bio?: string;
  specializations?: string[];
  experience_years?: number;
  hourly_rate?: number;
  monthly_rate?: number;
  available_groups?: ExamGroup[];
  education?: string;
  city?: string;
  certificates?: string[];
  verification_status?: TeacherVerificationStatus;
  verification_rejection_reason?: string | null;
}

// Booking statistics for student
export interface StudentBookingStats {
  total_bookings: number;
  upcoming_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_spent: number;
  favorite_teachers_count: number;
}
