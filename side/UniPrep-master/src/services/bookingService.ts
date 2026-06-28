import { supabase } from './supabase';
import * as Notifications from 'expo-notifications';
import { systemSettingsService } from './systemSettingsService';
import i18n from '../i18n';
import {
  Booking,
  BookingWithDetails,
  BookingRequest,
  BookingStatus,
  TimeSlot,
  StudentBookingStats,
  Transaction,
} from '../types/teacher';

const canStudentCancelBooking = (booking: { status: string; payment_status?: string | null }) => {
  return booking.status === 'pending';
};

class BookingService {
  // Create a new booking request (request-based system - no price calculation)
  async createBooking(
    userId: string,
    request: BookingRequest
  ): Promise<{ booking: Booking | null; error: string | null }> {
    try {
      // Get student record ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        console.error('Student record not found for user:', userId);
        console.error('Error:', studentError);
        return {
          booking: null,
          error: 'Student record not found. Please contact support or try logging out and back in.',
        };
      }

      // Verify teacher exists
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('id', request.teacher_id)
        .single();

      if (!teacher) {
        return { booking: null, error: 'Teacher not found' };
      }

      // Create booking request without price (request-based system)
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          student_id: student.id,
          teacher_id: request.teacher_id,
          subject_id: request.subject_id,
          scheduled_date: request.scheduled_date,
          scheduled_time: request.scheduled_time,
          duration_hours: request.duration_hours,
          session_method: request.session_method,
          service_type: request.service_type,
          location: request.location || null,
          notes: request.notes || null,
          price: 0, // Price is handled externally (not tracked in app)
          status: 'pending',
        })
        .select(`
          *,
          subjects(name_en)
        `)
        .single();

      if (error) {
        console.error('Create booking error:', error);
        // Parse database error messages and return translation keys
        const dbMessage = (error as any)?.message || '';
        if (dbMessage.includes('already have a booking with this teacher at this date and time')) {
          return { booking: null, error: 'duplicateBooking' };
        }
        if (dbMessage.includes('too many pending requests with this teacher')) {
          return { booking: null, error: 'tooManyPendingWithTeacher' };
        }
        if (dbMessage.includes('too many pending booking requests')) {
          return { booking: null, error: 'tooManyPendingTotal' };
        }
        if (dbMessage.includes('Too many booking requests')) {
          return { booking: null, error: 'rateLimitExceeded' };
        }
        return { booking: null, error: 'bookingFailed' };
      }

      return {
        booking: {
          ...booking,
          subject_name: booking.subjects.name_en,
        },
        error: null,
      };
    } catch (error) {
      console.error('Create booking error:', error);
      return { booking: null, error: 'An unexpected error occurred. Please try again.' };
    }
  }

  // Get student's bookings
  async getStudentBookings(
    userId: string,
    status?: BookingStatus
  ): Promise<BookingWithDetails[]> {
    try {
      // Get student record ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        console.error('Student record not found:', studentError);
        return [];
      }

      let query = supabase
        .from('bookings')
        .select(`
          *,
          subjects(name_en),
          teachers(
            id,
            rating,
            total_reviews,
            profiles(full_name, avatar_url, phone)
          )
        `)
        .eq('student_id', student.id);

      if (status) {
        query = query.eq('status', status);
      }

      query = query.order('scheduled_date', { ascending: false });

      const { data: bookings, error } = await query;
      if (error) throw error;

      // Fetch reviews for all teachers to calculate accurate ratings
      const { data: allReviews } = await supabase
        .from('teacher_reviews')
        .select('teacher_id, rating');

      // Group reviews by teacher_id
      const reviewsByTeacher = new Map<string, number[]>();
      (allReviews || []).forEach((review: any) => {
        if (!reviewsByTeacher.has(review.teacher_id)) {
          reviewsByTeacher.set(review.teacher_id, []);
        }
        reviewsByTeacher.get(review.teacher_id)!.push(review.rating);
      });

      return (bookings || []).map((booking: any) => {
        // Calculate rating from actual reviews
        const teacherReviews = reviewsByTeacher.get(booking.teachers.id) || [];
        let calculatedRating = 0;
        if (teacherReviews.length > 0) {
          const totalRating = teacherReviews.reduce((sum: number, r: number) => sum + r, 0);
          const averageRating = totalRating / teacherReviews.length;
          calculatedRating = Math.round(averageRating * 10) / 10;
        }
        const canCancel = canStudentCancelBooking(booking);
        const canReview = booking.status === 'completed' && !booking.reviewed;

        return {
          id: booking.id,
          student_id: booking.student_id,
          teacher_id: booking.teacher_id,
          subject_id: booking.subject_id,
          subject_name: booking.subjects.name_en,
          status: booking.status,
          payment_status: booking.payment_status || 'free',
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          duration_hours: booking.duration_hours,
          session_method: booking.session_method,
          location: booking.location,
          notes: booking.notes,
          price: booking.price,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          completed_at: booking.completed_at,
          cancelled_at: booking.cancelled_at,
          cancellation_reason: booking.cancellation_reason,
          teacher_notes: booking.teacher_notes ?? null,
          teacher_notes_updated_at: booking.teacher_notes_updated_at ?? null,
          teacher: {
            id: booking.teachers.id,
            full_name: booking.teachers.profiles.full_name,
            avatar_url: booking.teachers.profiles.avatar_url,
            rating: calculatedRating,  // ✅ Use calculated rating from reviews
            phone: booking.teachers.profiles.phone,
          },
          student: {
            id: student.id,
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

  // Get teacher's bookings
  async getTeacherBookings(
    teacherId: string,
    status?: BookingStatus
  ): Promise<BookingWithDetails[]> {
    try {
      // Step 1: fetch bookings (no join on students — alias joins fail without named FKs)
      let query = supabase
        .from('bookings')
        .select(`
          *,
          subjects(name_en)
        `)
        .eq('teacher_id', teacherId);

      if (status) {
        query = query.eq('status', status);
      }

      query = query.order('scheduled_date', { ascending: false });

      const { data: bookings, error } = await query;
      if (error) throw error;

      // Step 2: collect all student_ids and fetch their user_ids from students table
      const studentIds = [...new Set(
        (bookings || []).map((b: any) => b.student_id).filter(Boolean)
      )];

      // Map: student.id → student.user_id
      const studentUserIdMap = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: studentRows } = await supabase
          .from('students')
          .select('id, user_id')
          .in('id', studentIds);
        (studentRows || []).forEach((s: any) => {
          if (s.user_id) studentUserIdMap.set(s.id, s.user_id);
        });
      }

      // Step 3: fetch profiles by user_ids
      const userIds = [...studentUserIdMap.values()];
      const profileMap = new Map<string, { full_name: string; avatar_url: string | null; phone: string }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => {
          profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url, phone: p.phone || '' });
        });
      }

      return (bookings || []).map((booking: any) => {
        const studentUserId = studentUserIdMap.get(booking.student_id);
        const profile = studentUserId ? profileMap.get(studentUserId) : undefined;
        return {
          id: booking.id,
          student_id: booking.student_id,
          teacher_id: booking.teacher_id,
          subject_id: booking.subject_id,
          subject_name: booking.subjects.name_en,
          status: booking.status,
          payment_status: booking.payment_status || 'free',
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          duration_hours: booking.duration_hours,
          session_method: booking.session_method,
          location: booking.location,
          notes: booking.notes,
          price: booking.price,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          completed_at: booking.completed_at,
          cancelled_at: booking.cancelled_at,
          cancellation_reason: booking.cancellation_reason,
          teacher_notes: booking.teacher_notes ?? null,
          teacher_notes_updated_at: booking.teacher_notes_updated_at ?? null,
          teacher: {
            id: teacherId,
            full_name: '',
            avatar_url: null,
            rating: 0,
            phone: '',
          },
          student: {
            id: booking.student_id,
            full_name: profile?.full_name || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            phone: profile?.phone || '',
          },
          can_cancel: false,
          can_review: false,
        };
      });
    } catch (error) {
      console.error('Get teacher bookings error:', error);
      return [];
    }
  }

  // Get booking by ID
  async getBookingById(bookingId: string): Promise<BookingWithDetails | null> {
    try {
      // Step 1: fetch booking (no alias join on students — fails without named FKs)
      const { data: booking, error } = await supabase
        .from('bookings')
        .select(`
          *,
          subjects(name_en),
          teachers(
            id,
            rating,
            profiles(full_name, avatar_url, phone)
          )
        `)
        .eq('id', bookingId)
        .single();

      if (error) throw error;
      if (!booking) return null;

      // Step 2: fetch student.user_id directly from students table
      let studentProfile: { full_name: string; avatar_url: string | null; phone: string } | undefined;
      const { data: studentRow } = await supabase
        .from('students')
        .select('user_id')
        .eq('id', booking.student_id)
        .single();

      if (studentRow?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, phone')
          .eq('id', studentRow.user_id)
          .single();
        if (profile) {
          studentProfile = { full_name: profile.full_name, avatar_url: profile.avatar_url, phone: profile.phone || '' };
        }
      }

      const canCancel = canStudentCancelBooking(booking);
      const canReview = booking.status === 'completed';

      return {
        id: booking.id,
        student_id: booking.student_id,
        teacher_id: booking.teacher_id,
        subject_id: booking.subject_id,
        subject_name: booking.subjects.name_en,
        status: booking.status,
        payment_status: booking.payment_status || 'free',
        scheduled_date: booking.scheduled_date,
        scheduled_time: booking.scheduled_time,
        duration_hours: booking.duration_hours,
        session_method: booking.session_method,
        location: booking.location,
        notes: booking.notes,
        price: booking.price,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
        completed_at: booking.completed_at,
        cancelled_at: booking.cancelled_at,
        cancellation_reason: booking.cancellation_reason,
        teacher: {
          id: booking.teachers.id,
          full_name: booking.teachers.profiles.full_name,
          avatar_url: booking.teachers.profiles.avatar_url,
          rating: booking.teachers.rating,
          phone: booking.teachers.profiles.phone,
        },
        student: {
          id: booking.student_id,
          full_name: studentProfile?.full_name || 'Unknown',
          avatar_url: studentProfile?.avatar_url || null,
          phone: studentProfile?.phone || '',
        },
        can_cancel: canCancel,
        can_review: canReview,
        teacher_notes: booking.teacher_notes ?? null,
        teacher_notes_updated_at: booking.teacher_notes_updated_at ?? null,
      };
    } catch (error) {
      console.error('Get booking by ID error:', error);
      return null;
    }
  }

  // Teacher accepts booking (Pay-After-Acceptance flow)
  // Returns payment info if payment is required, or true if booking is free
  async acceptBooking(bookingId: string): Promise<{
    success: boolean;
    paymentRequired?: boolean;
    clientSecret?: string;
    price?: number;
    currency?: string;
    message?: string;
  }> {
    try {
      // Call capture-booking-payment Edge Function
      // This will create PaymentIntent if payment is required
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

      // If no payment required, booking is already confirmed
      if (!result.paymentRequired) {
        // Schedule local reminder notifications
        try {
          const { data: booking } = await supabase
            .from('bookings')
            .select(`
              scheduled_date, scheduled_time,
              subjects(name_en),
              students(user_id),
              teachers(user_id)
            `)
            .eq('id', bookingId)
            .single();

          if (booking) {
            const subjectName = (booking.subjects as any)?.name_en || 'session';
            await this.scheduleLocalReminders(
              bookingId,
              booking.scheduled_date,
              booking.scheduled_time,
              subjectName,
              'your student',
              'teacher'
            );
          }
        } catch {
          // Non-critical
        }
      }

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
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId);

      if (error) throw error;

      // Schedule local reminder notifications
      try {
        const { data: booking } = await supabase
          .from('bookings')
          .select(`
            scheduled_date, scheduled_time,
            subjects(name_en),
            students(user_id),
            teachers(user_id)
          `)
          .eq('id', bookingId)
          .single();

        if (booking) {
          const subjectName = (booking.subjects as any)?.name_en || 'session';
          await this.scheduleLocalReminders(
            bookingId,
            booking.scheduled_date,
            booking.scheduled_time,
            subjectName,
            'your student',
            'teacher'
          );
        }
      } catch {
        // Non-critical
      }

      return true;
    } catch (error) {
      console.error('Accept booking direct error:', error);
      return false;
    }
  }

  // Teacher rejects booking
  async rejectBooking(bookingId: string, reason?: string): Promise<boolean> {
    try {
      // Get booking details for notification
      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`
          id,
          scheduled_date,
          scheduled_time,
          students(user_id),
          teachers(profiles(full_name)),
          subjects(name_en)
        `)
        .eq('id', bookingId)
        .single();

      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled', // Use 'cancelled' instead of 'rejected' (matches DB constraint)
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Rejected by teacher',
          cancelled_by: 'teacher',
        })
        .eq('id', bookingId);

      if (error) throw error;

      // Send notification to student about rejection
      const studentUserId = (bookingData?.students as any)?.user_id;
      if (studentUserId) {
        const teacherName = (bookingData?.teachers as any)?.profiles?.full_name || 'Teacher';
        const subjectName = (bookingData?.subjects as any)?.name_en || 'session';
        const date = bookingData?.scheduled_date;
        const time = bookingData?.scheduled_time;

        try {
          await supabase.from('notifications').insert({
            user_id: studentUserId,
            title: 'Booking Request Declined',
            body: `Your booking request with ${teacherName} for ${subjectName} on ${date} at ${time} was not accepted.${reason ? ` Reason: ${reason}` : ''}`,
            type: 'booking',
            data: {
              type: 'booking_rejected',
              bookingId: bookingId,
              teacherName,
              subjectName,
              date,
              time,
              reason: reason || null,
            },
          });
        } catch (notifError) {
          // Don't fail the rejection if notification fails
          console.error('Failed to send rejection notification:', notifError);
        }
      }

      return true;
    } catch (error) {
      console.error('Reject booking error:', error);
      return false;
    }
  }

  // Cancel booking (student or teacher)
  async cancelBooking(bookingId: string, reason?: string, cancelledBy: 'student' | 'teacher' = 'student'): Promise<boolean> {
    try {
      const { data: booking, error: fetchError } = await supabase
        .from('bookings')
        .select('status, payment_status')
        .eq('id', bookingId)
        .single();

      if (fetchError) throw fetchError;
      if (!booking) return false;

      const status = booking.status;
      const paymentStatus = booking.payment_status || 'free';
      const canCancelSafely = status === 'pending';

      if (!canCancelSafely || status === 'completed' || paymentStatus === 'paid') {
        console.warn('Blocked unsafe booking cancellation attempt:', {
          bookingId,
          status,
          paymentStatus,
          cancelledBy,
        });
        return false;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Cancelled',
          cancelled_by: cancelledBy,
        })
        .eq('id', bookingId)
        .eq('status', 'pending');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Cancel booking error:', error);
      return false;
    }
  }

  // Mark booking as completed (teacher)
  async completeBooking(bookingId: string): Promise<boolean> {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('bookings')
        .select('status, payment_status')
        .eq('id', bookingId)
        .single();

      if (fetchError) throw fetchError;
      if (!existing) return false;

      if (
        existing.status !== 'confirmed' ||
        !['free', 'paid'].includes(existing.payment_status || 'free')
      ) {
        console.warn('Blocked unsafe booking completion attempt:', {
          bookingId,
          status: existing.status,
          paymentStatus: existing.payment_status,
        });
        return false;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .in('payment_status', ['free', 'paid']);

      if (error) throw error;

      // Update teacher stats
      const { data: booking } = await supabase
        .from('bookings')
        .select('teacher_id')
        .eq('id', bookingId)
        .single();

      if (booking) {
        await supabase.rpc('increment_teacher_sessions', {
          teacher_id_param: booking.teacher_id,
        });
      }

      return true;
    } catch (error) {
      console.error('Complete booking error:', error);
      return false;
    }
  }

  // Get available time slots for a teacher on a specific date
  async getAvailableTimeSlots(
    teacherId: string,
    date: string
  ): Promise<TimeSlot[]> {
    try {
      // Get day of week (0-6)
      const dayOfWeek = new Date(date).getDay();

      // Get teacher's availability for this day
      const { data: availability } = await supabase
        .from('teacher_availability')
        .select('start_time, end_time')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_available', true)
        .single();

      if (!availability) {
        return [];
      }

      // Get existing bookings for this date
      const { data: bookings } = await supabase
        .from('bookings')
        .select('scheduled_time, duration_hours')
        .eq('teacher_id', teacherId)
        .eq('scheduled_date', date)
        .in('status', ['pending', 'awaiting_payment', 'confirmed']);

      const bookedTimes = new Set(
        (bookings || []).map(b => b.scheduled_time)
      );

      // Generate time slots (every hour)
      const slots: TimeSlot[] = [];
      const startHour = parseInt(availability.start_time.split(':')[0]);
      const endHour = parseInt(availability.end_time.split(':')[0]);

      for (let hour = startHour; hour <= endHour; hour++) {
        const time = `${String(hour).padStart(2, '0')}:00`;
        slots.push({
          time,
          is_available: !bookedTimes.has(time),
          is_booked: bookedTimes.has(time),
        });
      }

      return slots;
    } catch (error) {
      console.error('Get available time slots error:', error);
      return [];
    }
  }

  // Get student booking statistics
  async getStudentBookingStats(
    userId: string
  ): Promise<StudentBookingStats> {
    try {
      // Get student record ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        return {
          total_bookings: 0,
          upcoming_bookings: 0,
          completed_bookings: 0,
          cancelled_bookings: 0,
          total_spent: 0,
          favorite_teachers_count: 0,
        };
      }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('status, price, scheduled_date')
        .eq('student_id', student.id);

      const { data: favorites } = await supabase
        .from('favorite_teachers')
        .select('id')
        .eq('student_id', student.id);

      const now = new Date();
      const upcomingBookings = (bookings || []).filter(b => {
        if (b.status !== 'confirmed') return false;
        const bookingDate = new Date(b.scheduled_date);
        return bookingDate >= now;
      }).length;

      return {
        total_bookings: bookings?.length || 0,
        upcoming_bookings: upcomingBookings,
        completed_bookings: (bookings || []).filter(b => b.status === 'completed').length,
        cancelled_bookings: (bookings || []).filter(b => b.status === 'cancelled').length,
        total_spent: (bookings || [])
          .filter(b => b.status === 'completed')
          .reduce((sum, b) => sum + b.price, 0),
        favorite_teachers_count: favorites?.length || 0,
      };
    } catch (error) {
      console.error('Get student booking stats error:', error);
      return {
        total_bookings: 0,
        upcoming_bookings: 0,
        completed_bookings: 0,
        cancelled_bookings: 0,
        total_spent: 0,
        favorite_teachers_count: 0,
      };
    }
  }

  // Update teacher notes on a completed booking
  async updateTeacherNotes(bookingId: string, notes: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          teacher_notes: notes.trim() || null,
          teacher_notes_updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update teacher notes error:', error);
      return false;
    }
  }

  // Schedule local push notification reminders for a confirmed booking.
  // Called client-side after acceptBooking() as a reliable fallback
  // in case the server-side pg_cron job hasn't run yet.
  async scheduleLocalReminders(
    bookingId: string,
    scheduledDate: string,
    scheduledTime: string,
    subjectName: string,
    otherPartyName: string,
    role: 'student' | 'teacher'
  ): Promise<void> {
    try {
      // Check if booking reminders are enabled via feature flag
      const settings = await systemSettingsService.getSettings();
      if (settings?.feature_flags?.booking_reminders === false) return;

      const sessionDt = new Date(`${scheduledDate}T${scheduledTime}:00`);
      const now = new Date();

      // Only schedule if session is in the future
      if (sessionDt <= now) return;

      const label = role === 'student'
        ? i18n.t('notifications.local.sessionLabelStudent', { subject: subjectName, teacher: otherPartyName })
        : i18n.t('notifications.local.sessionLabelTeacher', { teacher: otherPartyName, subject: subjectName });

      const reminders: Array<{ label: string; offsetMs: number }> = [
        { label: '24h',   offsetMs: 24 * 60 * 60 * 1000 },
        { label: '1h',    offsetMs:      60 * 60 * 1000 },
        { label: '15min', offsetMs:      15 * 60 * 1000 },
      ];

      for (const reminder of reminders) {
        const triggerTime = new Date(sessionDt.getTime() - reminder.offsetMs);
        if (triggerTime <= now) continue; // window already passed

        const secondsUntil = Math.floor((triggerTime.getTime() - now.getTime()) / 1000);

        let title: string;
        let body: string;
        if (reminder.label === '24h') {
          title = i18n.t('notifications.local.sessionTomorrowTitle');
          body  = i18n.t('notifications.local.sessionTomorrowBody', { label, time: scheduledTime });
        } else if (reminder.label === '1h') {
          title = i18n.t('notifications.local.sessionInOneHourTitle');
          body  = i18n.t('notifications.local.sessionInOneHourBody', { label });
        } else {
          title = i18n.t('notifications.local.sessionStartingSoonTitle');
          body  = i18n.t('notifications.local.sessionStartingSoonBody', { label });
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: true,
            data: {
              type: 'booking_reminder',
              bookingId,
            },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil },
        });

        console.log(`⏰ Booking reminder scheduled (${reminder.label}): ${title}`);
      }
    } catch (error) {
      console.error('Schedule local reminders error:', error);
    }
  }
}

export const bookingService = new BookingService();
