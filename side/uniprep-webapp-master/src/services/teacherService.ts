import { createClient } from '@/lib/supabase/client';
import {
  Teacher,
  TeacherWithDetails,
  TeacherFilters,
  ReviewWithStudent,
  BookingWithDetails,
  BookingRequest,
  Subject,
  TeacherStats,
  TeacherProfileUpdate,
  ExamGroup,
} from '@/types/teacher';

// Helper to get untyped Supabase client for flexible queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDb = () => createClient() as any;

// Type definitions for Supabase query results
interface StudentData {
  id: string;
  city: string | null;
}

interface FavoriteTeacher {
  teacher_id: string;
}

interface TeacherReview {
  teacher_id: string;
  rating: number;
}

interface TeacherProfile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface TeacherData {
  id: string;
  user_id: string;
  bio: string | null;
  city: string | null;
  specializations: string[];
  experience_years: number | null;
  hourly_rate: number | null;
  monthly_rate: number | null;
  rating: number | null;
  is_verified: boolean | null;
  available_groups: string[];
  education: string | null;
  certificates: string[];
  total_students: number | null;
  total_sessions: number | null;
  created_at: string;
  updated_at: string;
  profiles: TeacherProfile | null;
}

interface StudentIdData {
  id: string;
  city?: string | null;
}

interface TeacherIdData {
  id: string;
  hourly_rate: number | null;
  monthly_rate: number | null;
}

interface BookingIdData {
  id: string;
}

class TeacherService {
  // Get all teachers with filters
  async getTeachers(
    userId: string,
    filters?: TeacherFilters
  ): Promise<TeacherWithDetails[]> {
    try {
      const supabase = createClient();

      let query = supabase
        .from('teachers')
        .select(`
          *,
          profiles:user_id(full_name, phone, avatar_url)
        `);

      // Apply sorting
      switch (filters?.sort_by) {
        case 'rating':
          query = query.order('rating', { ascending: false });
          break;
        case 'price_low':
          query = query.order('hourly_rate', { ascending: true });
          break;
        case 'price_high':
          query = query.order('hourly_rate', { ascending: false });
          break;
        case 'experience':
          query = query.order('experience_years', { ascending: false });
          break;
        case 'reviews':
          query = query.order('total_reviews', { ascending: false });
          break;
        default:
          query = query.order('rating', { ascending: false });
      }

      const { data: teachers, error } = await query;

      if (error) throw error;

      // Get student data for favorite check and city comparison
      const { data: student } = await supabase
        .from('students')
        .select('id, city')
        .eq('user_id', userId)
        .single();

      const studentData = student as StudentData | null;
      const studentId = studentData?.id;
      const studentCity = studentData?.city || undefined;

      // Get favorite teachers for this student
      let favoriteIds = new Set<string>();
      if (studentId) {
        const { data: favorites } = await supabase
          .from('favorite_teachers')
          .select('teacher_id')
          .eq('student_id', studentId);

        favoriteIds = new Set(favorites?.map((f: FavoriteTeacher) => f.teacher_id) || []);
      }

      // Fetch reviews for all teachers to calculate accurate ratings
      const { data: allReviews } = await supabase
        .from('teacher_reviews')
        .select('teacher_id, rating');

      const reviewsByTeacher = new Map<string, number[]>();
      (allReviews || []).forEach((review: TeacherReview) => {
        if (!reviewsByTeacher.has(review.teacher_id)) {
          reviewsByTeacher.set(review.teacher_id, []);
        }
        reviewsByTeacher.get(review.teacher_id)!.push(review.rating);
      });

      // Filter out teachers with null profiles and map to TeacherWithDetails
      const mappedTeachers = (teachers || [])
        .filter((teacher: TeacherData) => teacher.profiles !== null)
        .map((teacher: TeacherData) => {
          const teacherReviews = reviewsByTeacher.get(teacher.id) || [];
          let calculatedRating = 0;
          if (teacherReviews.length > 0) {
            const totalRating = teacherReviews.reduce((sum, r) => sum + r, 0);
            calculatedRating = Math.round((totalRating / teacherReviews.length) * 10) / 10;
          }

          const isSameCity = studentCity ? teacher.city === studentCity : false;

          return {
            id: teacher.id,
            user_id: teacher.user_id,
            full_name: teacher.profiles?.full_name || 'Unknown',
            email: '',
            phone: teacher.profiles?.phone || '',
            avatar_url: teacher.profiles?.avatar_url || null,
            bio: teacher.bio || '',
            city: teacher.city || '',
            specializations: teacher.specializations || [],
            experience_years: teacher.experience_years || 0,
            hourly_rate: teacher.hourly_rate || 0,
            monthly_rate: teacher.monthly_rate || null,
            rating: calculatedRating,
            total_reviews: teacherReviews.length,
            is_verified: teacher.is_verified || false,
            available_groups: (teacher.available_groups || []) as ExamGroup[],
            education: teacher.education || null,
            certificates: teacher.certificates || [],
            total_students: teacher.total_students || 0,
            total_sessions: teacher.total_sessions || 0,
            created_at: teacher.created_at,
            updated_at: teacher.updated_at,
            is_favorite: favoriteIds.has(teacher.id),
            is_same_city: isSameCity,
            can_do_in_person: isSameCity,
            availability_status: 'available' as const,
          };
        });

      // Apply client-side filters
      let filtered = mappedTeachers;

      if (filters?.search) {
        const query = filters.search.toLowerCase();
        filtered = filtered.filter(teacher =>
          teacher.full_name.toLowerCase().includes(query) ||
          teacher.bio.toLowerCase().includes(query)
        );
      }

      if (filters?.subject) {
        filtered = filtered.filter(teacher =>
          teacher.specializations.includes(filters.subject!)
        );
      }

      if (filters?.target_group) {
        filtered = filtered.filter(teacher =>
          teacher.available_groups.includes(filters.target_group!)
        );
      }

      if (filters?.min_rating) {
        filtered = filtered.filter(teacher => teacher.rating >= filters.min_rating!);
      }

      if (filters?.max_hourly_rate) {
        filtered = filtered.filter(teacher => teacher.hourly_rate <= filters.max_hourly_rate!);
      }

      if (filters?.city) {
        filtered = filtered.filter(teacher => teacher.city === filters.city);
      }

      return filtered;
    } catch (error) {
      console.error('Get teachers error:', error);
      return [];
    }
  }

  // Get single teacher by ID
  async getTeacherById(
    teacherId: string,
    userId?: string
  ): Promise<TeacherWithDetails | null> {
    try {
      const supabase = createClient();

      const db = getDb();
      const { data: teacher, error } = await db
        .from('teachers')
        .select(`
          *,
          profiles:user_id(full_name, phone, avatar_url)
        `)
        .eq('id', teacherId)
        .single();

      if (error) throw error;
      if (!teacher || !teacher.profiles) return null;

      // Check if favorited and get student city
      let isFavorite = false;
      let studentCity: string | null = null;

      if (userId) {
        const { data: studentResult } = await supabase
          .from('students')
          .select('id, city')
          .eq('user_id', userId)
          .maybeSingle();

        const studentInfo = studentResult as StudentData | null;
        if (studentInfo) {
          studentCity = studentInfo.city || null;

          const { data: favorite } = await supabase
            .from('favorite_teachers')
            .select('id')
            .eq('student_id', studentInfo.id)
            .eq('teacher_id', teacherId)
            .maybeSingle();

          isFavorite = !!favorite;
        }
      }

      // Get reviews for accurate rating
      const { data: reviews } = await supabase
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherId);

      let calculatedRating = 0;
      const reviewCount = reviews?.length || 0;
      if (reviewCount > 0) {
        const totalRating = (reviews as TeacherReview[]).reduce((sum, r) => sum + r.rating, 0);
        calculatedRating = Math.round((totalRating / reviewCount) * 10) / 10;
      }

      const teacherData = teacher as TeacherData;
      return {
        id: teacherData.id,
        user_id: teacherData.user_id,
        full_name: teacherData.profiles?.full_name || 'Unknown',
        email: '',
        phone: teacherData.profiles?.phone || '',
        avatar_url: teacherData.profiles?.avatar_url || null,
        bio: teacherData.bio || '',
        city: teacherData.city || '',
        specializations: teacherData.specializations || [],
        experience_years: teacherData.experience_years || 0,
        hourly_rate: teacherData.hourly_rate || 0,
        monthly_rate: teacherData.monthly_rate || null,
        rating: calculatedRating,
        total_reviews: reviewCount,
        is_verified: teacherData.is_verified || false,
        available_groups: (teacherData.available_groups || []) as ExamGroup[],
        education: teacherData.education || null,
        certificates: teacherData.certificates || [],
        total_students: teacherData.total_students || 0,
        total_sessions: teacherData.total_sessions || 0,
        created_at: teacherData.created_at,
        updated_at: teacherData.updated_at,
        is_favorite: isFavorite,
        is_same_city: studentCity ? teacherData.city === studentCity : false,
        can_do_in_person: studentCity ? teacherData.city === studentCity : false,
        availability_status: 'available',
      };
    } catch (error) {
      console.error('Get teacher by ID error:', error);
      return null;
    }
  }

  // Get teacher reviews
  async getTeacherReviews(teacherId: string): Promise<ReviewWithStudent[]> {
    try {
      const supabase = createClient();

      const { data: reviews, error } = await supabase
        .from('teacher_reviews')
        .select(`
          *,
          students!teacher_reviews_student_id_fkey(
            id,
            profiles:user_id(full_name, avatar_url)
          )
        `)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      interface ReviewData {
        id: string;
        teacher_id: string;
        student_id: string;
        booking_id: string | null;
        rating: number;
        comment: string | null;
        review_text: string | null;
        created_at: string;
        updated_at: string;
        students: {
          id: string;
          profiles: {
            full_name: string | null;
            avatar_url: string | null;
          } | null;
        } | null;
      }

      return (reviews || []).map((review: ReviewData) => ({
        id: review.id,
        teacher_id: review.teacher_id,
        student_id: review.student_id,
        booking_id: review.booking_id,
        rating: review.rating,
        review_text: review.review_text || '',
        created_at: review.created_at,
        updated_at: review.updated_at,
        student: {
          id: review.students?.id || '',
          full_name: review.students?.profiles?.full_name || 'Anonymous',
          avatar_url: review.students?.profiles?.avatar_url || null,
        },
      }));
    } catch (error) {
      console.error('Get teacher reviews error:', error);
      return [];
    }
  }

  // Toggle favorite teacher
  async toggleFavorite(teacherId: string, userId: string): Promise<boolean> {
    try {
      const supabase = createClient();

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!student) return false;

      const studentData = student as StudentIdData;

      // Check if already favorited
      const db = getDb();
      const { data: existing } = await db
        .from('favorite_teachers')
        .select('id')
        .eq('student_id', studentData.id)
        .eq('teacher_id', teacherId)
        .maybeSingle();

      if (existing) {
        // Remove favorite
        await db
          .from('favorite_teachers')
          .delete()
          .eq('id', existing.id);
        return false;
      } else {
        // Add favorite
        await db
          .from('favorite_teachers')
          .insert({
            student_id: studentData.id,
            teacher_id: teacherId,
          });
        return true;
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
      return false;
    }
  }

  // Get favorite teachers
  async getFavoriteTeachers(userId: string): Promise<TeacherWithDetails[]> {
    try {
      const supabase = createClient();

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id, city')
        .eq('user_id', userId)
        .single();

      if (!student) return [];

      const studentData = student as StudentIdData;

      // Get favorite teacher IDs
      const { data: favorites } = await supabase
        .from('favorite_teachers')
        .select('teacher_id')
        .eq('student_id', studentData.id);

      if (!favorites || favorites.length === 0) return [];

      const teacherIds = (favorites as FavoriteTeacher[]).map(f => f.teacher_id);

      // Get teacher details
      const { data: teachers } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles:user_id(full_name, phone, avatar_url)
        `)
        .in('id', teacherIds);

      return (teachers || [])
        .filter((teacher: any) => teacher.profiles !== null)
        .map((teacher: any) => ({
          id: teacher.id,
          user_id: teacher.user_id,
          full_name: teacher.profiles?.full_name || 'Unknown',
          email: '',
          phone: teacher.profiles?.phone || '',
          avatar_url: teacher.profiles?.avatar_url || null,
          bio: teacher.bio || '',
          city: teacher.city || '',
          specializations: teacher.specializations || [],
          experience_years: teacher.experience_years || 0,
          hourly_rate: teacher.hourly_rate || 0,
          monthly_rate: teacher.monthly_rate || null,
          rating: teacher.rating || 0,
          total_reviews: teacher.total_reviews || 0,
          is_verified: teacher.is_verified || false,
          available_groups: (teacher.available_groups || []) as ExamGroup[],
          education: teacher.education || null,
          certificates: teacher.certificates || [],
          total_students: teacher.total_students || 0,
          total_sessions: teacher.total_sessions || 0,
          created_at: teacher.created_at,
          updated_at: teacher.updated_at,
          is_favorite: true,
          is_same_city: studentData.city ? teacher.city === studentData.city : false,
          can_do_in_person: studentData.city ? teacher.city === studentData.city : false,
          availability_status: 'available' as const,
        }));
    } catch (error) {
      console.error('Get favorite teachers error:', error);
      return [];
    }
  }

  // Get subjects for booking
  async getSubjects(): Promise<Subject[]> {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Get subjects error:', error);
      return [];
    }
  }

  // Create booking
  async createBooking(userId: string, request: BookingRequest): Promise<string | null> {
    try {
      const supabase = createClient();

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!student) return null;

      const studentData = student as StudentIdData;

      // Get teacher's hourly rate
      const { data: teacher } = await supabase
        .from('teachers')
        .select('hourly_rate, monthly_rate')
        .eq('id', request.teacher_id)
        .single();

      if (!teacher) return null;

      const teacherData = teacher as TeacherIdData;

      // Calculate price
      const price = request.service_type === 'monthly'
        ? (teacherData.monthly_rate || teacherData.hourly_rate * 20)
        : teacherData.hourly_rate * request.duration_hours;

      const db = getDb();
      const { data: booking, error } = await db
        .from('bookings')
        .insert({
          student_id: studentData.id,
          teacher_id: request.teacher_id,
          subject_id: request.subject_id,
          status: 'pending',
          scheduled_date: request.scheduled_date,
          scheduled_time: request.scheduled_time,
          duration_hours: request.duration_hours,
          session_method: request.session_method,
          service_type: request.service_type,
          location: request.location || null,
          notes: request.notes || null,
          price: 0,
        })
        .select('id')
        .single();

      if (error) throw error;

      return (booking as BookingIdData | null)?.id || null;
    } catch (error) {
      console.error('Create booking error:', error);
      return null;
    }
  }

  // Get student bookings
  async getStudentBookings(userId: string): Promise<BookingWithDetails[]> {
    try {
      const supabase = createClient();

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!student) return [];

      const studentData = student as StudentIdData;

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          *,
          teachers!bookings_teacher_id_fkey(
            id,
            profiles:user_id(full_name, avatar_url, phone),
            rating
          )
        `)
        .eq('student_id', studentData.id)
        .order('scheduled_date', { ascending: false });

      if (error) throw error;

      const now = new Date();

      return (bookings || []).map((booking: any) => {
        const scheduledDateTime = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
        const canCancel = booking.status === 'pending' || 
          (booking.status === 'confirmed' && scheduledDateTime > now);
        const canReview = booking.status === 'completed';

        return {
          id: booking.id,
          student_id: booking.student_id,
          teacher_id: booking.teacher_id,
          subject_id: booking.subject_id,
          subject_name: booking.subject_name,
          status: booking.status,
          payment_status: booking.payment_status || 'free',
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          duration_hours: booking.duration_hours,
          session_method: booking.session_method,
          service_type: booking.service_type,
          location: booking.location,
          notes: booking.notes,
          price: booking.price,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          completed_at: booking.completed_at,
          cancelled_at: booking.cancelled_at,
          cancellation_reason: booking.cancellation_reason,
          teacher: {
            id: booking.teachers?.id || '',
            full_name: booking.teachers?.profiles?.full_name || 'Unknown',
            avatar_url: booking.teachers?.profiles?.avatar_url || null,
            rating: booking.teachers?.rating || 0,
            phone: booking.teachers?.profiles?.phone || '',
          },
          student: {
            id: studentData.id,
            full_name: '',
            avatar_url: null,
            phone: '',
          },
          can_cancel: canCancel,
          can_review: canReview,
        };
      });
    } catch (error) {
      console.error('Get student bookings error:', error);
      return [];
    }
  }

  // Cancel booking
  async cancelBooking(bookingId: string, reason?: string): Promise<boolean> {
    try {
      const supabase = createClient();

      const db = getDb();
      const { error } = await db
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || null,
          cancelled_by: 'student',
        })
        .eq('id', bookingId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Cancel booking error:', error);
      return false;
    }
  }

  // Submit review
  async submitReview(
    userId: string,
    bookingId: string,
    teacherId: string,
    rating: number,
    reviewText: string
  ): Promise<boolean> {
    try {
      const supabase = createClient();

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!student) return false;

      const studentData = student as StudentIdData;

      const db = getDb();
      const { error } = await db
        .from('teacher_reviews')
        .insert({
          teacher_id: teacherId,
          student_id: studentData.id,
          booking_id: bookingId,
          rating,
          review_text: reviewText,
        });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Submit review error:', error);
      return false;
    }
  }

  // Get teacher bookings
  async getTeacherBookings(userId: string): Promise<BookingWithDetails[]> {
    try {
      const supabase = createClient();

      // Get teacher ID from user ID
      const db = getDb();
      const { data: teacher, error: teacherError } = await db
        .from('teachers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (teacherError || !teacher) {
        console.error('Teacher not found for user:', userId, teacherError);
        return [];
      }

      // Fetch bookings with a simpler query
      const { data: bookings, error: bookingsError } = await db
        .from('bookings')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('scheduled_date', { ascending: false });

      if (bookingsError) {
        console.error('Bookings fetch error:', bookingsError);
        return [];
      }

      if (!bookings || bookings.length === 0) return [];

      // Get unique student IDs and subject IDs (filter out null/undefined)
      const studentIds = [...new Set((bookings as any[]).map(b => b.student_id).filter(Boolean))];
      const subjectIds = [...new Set((bookings as any[]).map(b => b.subject_id).filter(Boolean))];

      // Fetch students with their profiles
      let students: any[] = [];
      if (studentIds.length > 0) {
        const { data } = await supabase
          .from('students')
          .select('id, user_id')
          .in('id', studentIds);
        students = data || [];
      }

      // Get profile data for students
      const studentUserIds = students.map(s => s.user_id).filter(Boolean);
      let profiles: any[] = [];
      if (studentUserIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .in('id', studentUserIds);
        profiles = data || [];
      }

      // Fetch subjects
      let subjects: any[] = [];
      if (subjectIds.length > 0) {
        const { data } = await supabase
          .from('subjects')
          .select('id, name_en, name_az')
          .in('id', subjectIds);
        subjects = data || [];
      }

      // Create lookup maps
      const studentMap = new Map(students?.map(s => [s.id, s]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const subjectMap = new Map(subjects?.map(s => [s.id, s]) || []);

      return bookings.map((booking: any) => {
        const student = studentMap.get(booking.student_id);
        const profile = student ? profileMap.get(student.user_id) : null;
        const subject = booking.subject_id ? subjectMap.get(booking.subject_id) : null;

        return {
          id: booking.id,
          teacher_id: booking.teacher_id,
          student_id: booking.student_id,
          subject_id: booking.subject_id,
          subject_name: subject ? (subject.name_en || subject.name_az || 'Unknown') : 'Unknown',
          subject: subject ? {
            name_en: subject.name_en,
            name_az: subject.name_az,
            name_ru: subject.name_ru
          } : undefined,
          status: booking.status,
          payment_status: booking.payment_status || 'free',
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          duration_hours: booking.duration_hours,
          session_method: booking.session_method,
          service_type: booking.service_type,
          location: booking.location,
          notes: booking.notes,
          price: booking.price,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          completed_at: booking.completed_at,
          cancelled_at: booking.cancelled_at,
          cancellation_reason: booking.cancellation_reason,
          can_cancel: booking.status === 'pending',
          can_review: booking.status === 'completed',
          student: {
            id: student?.id || '',
            full_name: profile?.full_name || 'Unknown Student',
            avatar_url: profile?.avatar_url || null,
            phone: profile?.phone || '',
          },
          teacher: {
            id: (teacher as any).id,
            full_name: '',
            avatar_url: null,
            rating: 0,
            phone: '',
          },
        };
      });
    } catch (error) {
      console.error('Get teacher bookings error:', error);
      return [];
    }
  }

  // Accept booking (Pay-After-Acceptance flow)
  // Returns payment info if payment is required, or success if booking is free
  async acceptBooking(bookingId: string): Promise<{
    success: boolean;
    paymentRequired?: boolean;
    clientSecret?: string;
    price?: number;
    currency?: string;
    message?: string;
  }> {
    try {
      const supabase = createClient();

      // Call capture-booking-payment Edge Function
      const { data, error } = await supabase.functions.invoke('capture-booking-payment', {
        body: { bookingId },
      });

      if (error) {
        console.error('Accept booking error:', error);
        return { success: false, message: error.message };
      }

      const result = data as {
        bookingId: string;
        clientSecret?: string;
        price?: number;
        currency?: string;
        paymentRequired: boolean;
        message: string;
      };

      return {
        success: true,
        paymentRequired: result.paymentRequired,
        clientSecret: result.clientSecret,
        price: result.price,
        currency: result.currency,
        message: result.message,
      };
    } catch (error) {
      console.error('Accept booking error:', error);
      return { success: false, message: 'Failed to accept booking' };
    }
  }

  // Legacy accept booking (direct DB update, for free bookings fallback)
  async acceptBookingDirect(bookingId: string): Promise<boolean> {
    try {
      const db = getDb();

      const { error } = await db
        .from('bookings')
        .update({
          status: 'confirmed',
        })
        .eq('id', bookingId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Accept booking direct error:', error);
      return false;
    }
  }

  // Reject booking
  async rejectBooking(bookingId: string): Promise<boolean> {
    try {
      const db = getDb();

      const { error } = await db
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'teacher',
        })
        .eq('id', bookingId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Reject booking error:', error);
      return false;
    }
  }

  // Complete booking
  async completeBooking(bookingId: string): Promise<boolean> {
    try {
      const db = getDb();

      const { error } = await db
        .from('bookings')
        .update({
          status: 'completed',
        })
        .eq('id', bookingId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Complete booking error:', error);
      return false;
    }
  }

  // Get teacher by user ID (for teacher's own profile)
  async getTeacherByUserId(userId: string): Promise<Teacher | null> {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles:user_id(full_name, phone, avatar_url)
        `)
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Get teacher by user ID error:', error);
        return null;
      }

      if (!data) return null;

      // Get email from auth user
      const { data: { user } } = await supabase.auth.getUser();

      const teacherData = data as TeacherData;
      return {
        id: teacherData.id,
        user_id: teacherData.user_id,
        full_name: teacherData.profiles?.full_name || '',
        email: user?.email || '',
        phone: teacherData.profiles?.phone || '',
        avatar_url: teacherData.profiles?.avatar_url || null,
        bio: teacherData.bio || '',
        city: teacherData.city || '',
        specializations: teacherData.specializations || [],
        experience_years: teacherData.experience_years || 0,
        hourly_rate: teacherData.hourly_rate || 0,
        monthly_rate: teacherData.monthly_rate || null,
        rating: teacherData.rating || 0,
        total_reviews: 0,
        is_verified: teacherData.is_verified || false,
        available_groups: (teacherData.available_groups || []) as any,
        education: teacherData.education || null,
        certificates: teacherData.certificates || [],
        total_students: teacherData.total_students || 0,
        total_sessions: teacherData.total_sessions || 0,
        created_at: teacherData.created_at,
        updated_at: teacherData.updated_at,
      };
    } catch (error) {
      console.error('Get teacher by user ID error:', error);
      return null;
    }
  }

  // Get teacher statistics (for teacher dashboard)
  async getTeacherStats(userId: string): Promise<TeacherStats | null> {
    try {
      const db = getDb();

      // Get teacher ID from user ID
      const { data: teacher, error: teacherError } = await db
        .from('teachers')
        .select('id, total_students, total_sessions, rating, total_reviews')
        .eq('user_id', userId)
        .single();

      if (teacherError || !teacher) {
        console.error('Teacher not found:', teacherError);
        return null;
      }

      const teacherData = teacher as { id: string; total_students: number | null };

      // Get reviews to calculate accurate rating
      const { data: reviews } = await db
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherData.id);

      // Calculate rating from actual reviews
      let calculatedRating = 0;
      if (reviews && reviews.length > 0) {
        const totalRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0);
        calculatedRating = Math.round((totalRating / reviews.length) * 10) / 10;
      }

      // Get booking stats
      const { data: bookings } = await db
        .from('bookings')
        .select('status')
        .eq('teacher_id', teacherData.id);

      const activeBookings = (bookings || []).filter(
        (b: any) => b.status === 'confirmed'
      ).length;

      const pendingRequests = (bookings || []).filter(
        (b: any) => b.status === 'pending'
      ).length;

      const completedSessions = (bookings || []).filter(
        (b: any) => b.status === 'completed'
      ).length;

      return {
        total_students: teacherData.total_students || 0,
        active_bookings: activeBookings,
        completed_sessions: completedSessions,
        pending_requests: pendingRequests,
        average_rating: calculatedRating,
        total_reviews: reviews?.length || 0,
      };
    } catch (error) {
      console.error('Get teacher stats error:', error);
      return null;
    }
  }

  // Update teacher profile
  async updateTeacherProfile(userId: string, updates: TeacherProfileUpdate): Promise<boolean> {
    try {
      const db = getDb();

      const { error } = await db
        .from('teachers')
        .update(updates)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update teacher profile error:', error);
      return false;
    }
  }
}

export const teacherService = new TeacherService();
