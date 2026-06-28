// Teacher Marketplace Types

export type ExamGroup = 'I' | 'II' | 'III' | 'IV' | 'V';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'awaiting_payment';

export type SessionMethod = 'in-person' | 'online';

export type ServiceType = 'hourly' | 'monthly';

// Teacher Profile
export interface Teacher {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  bio: string;
  city: string;
  specializations: string[];
  experience_years: number;
  hourly_rate: number;
  monthly_rate: number | null;
  rating: number;
  total_reviews: number;
  is_verified: boolean;
  available_groups: ExamGroup[];
  education: string | null;
  certificates: string[];
  total_students: number;
  total_sessions: number;
  created_at: string;
  updated_at: string;
}

// Teacher with additional computed fields
export interface TeacherWithDetails extends Teacher {
  is_favorite: boolean;
  is_same_city?: boolean;
  can_do_in_person?: boolean;
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
  city?: string;
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
  payment_status: 'free' | 'awaiting_acceptance' | 'awaiting_payment' | 'pending_payment' | 'processing' | 'paid' | 'payment_failed' | 'refunded';
  payment_intent_id?: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_hours: number;
  session_method: SessionMethod;
  service_type?: ServiceType;
  location: string | null;
  notes: string | null;
  price: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
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
  subject?: {
    name_en?: string;
    name_az?: string;
    name_ru?: string;
  };
  can_cancel: boolean;
  can_review: boolean;
}

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
  rating: number;
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

// Time slot for booking
export interface TimeSlot {
  time: string;
  is_available: boolean;
  is_booked: boolean;
}

// Subject for booking
export interface Subject {
  id: string;
  name_en: string;
  name_az: string;
}

// Teacher Statistics (for dashboard)
export interface TeacherStats {
  total_students: number;
  active_bookings: number;
  completed_sessions: number;
  pending_requests: number;
  average_rating: number;
  total_reviews: number;
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
}
