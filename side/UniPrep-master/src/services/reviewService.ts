import { supabase } from './supabase';
import { TeacherReview, ReviewWithStudent } from '../types/teacher';

class ReviewService {
  // Submit a review for a teacher
  async submitReview(
    userId: string,
    teacherId: string, // This is teacher record ID from teachers table
    bookingId: string,
    rating: number,
    reviewText: string
  ): Promise<TeacherReview | null> {
    try {
      // First, get the student record ID from the user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        console.error('Student not found:', studentError);
        throw new Error('Student profile not found');
      }

      const studentId = student.id;

      // teacherId is already the teacher record ID from teachers table
      // (it comes from booking.teacher_id which references teachers.id)

      // Check if review already exists for this student-teacher pair
      const { data: existing } = await supabase
        .from('teacher_reviews')
        .select('id')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .single();

      if (existing) {
        // Review exists - update it instead
        return await this.updateReview(existing.id, rating, reviewText);
      }

      // Insert new review (one per student-teacher pair)
      const { data: review, error } = await supabase
        .from('teacher_reviews')
        .insert({
          teacher_id: teacherId, // Teacher record ID from teachers table
          student_id: studentId, // Student record ID from students table
          rating,
          review_text: reviewText,
        })
        .select()
        .single();

      if (error) throw error;

      // Update teacher's average rating
      await this.updateTeacherRating(teacherId);

      return review;
    } catch (error) {
      console.error('Submit review error:', error);
      return null;
    }
  }

  // Update an existing review
  async updateReview(
    reviewId: string,
    rating: number,
    reviewText: string
  ): Promise<TeacherReview | null> {
    try {
      console.log('Updating review ID:', reviewId);
      
      // First check if review exists
      const { data: existingReview, error: checkError } = await supabase
        .from('teacher_reviews')
        .select('*')
        .eq('id', reviewId)
        .single();

      if (checkError) {
        console.error('Review not found:', checkError);
        throw new Error('Review not found');
      }

      console.log('Found review, updating...');

      // Update the review
      const { data: review, error } = await supabase
        .from('teacher_reviews')
        .update({
          rating,
          review_text: reviewText,
        })
        .eq('id', reviewId)
        .select()
        .single();

      if (error) {
        console.error('Update failed:', error);
        throw error;
      }

      console.log('Review updated successfully');
      console.log('Review data:', review);

      // Update teacher's average rating
      if (review) {
        console.log('Calling updateTeacherRating with teacher_id:', review.teacher_id);
        await this.updateTeacherRating(review.teacher_id);
      } else {
        console.error('Review is null, cannot update teacher rating');
      }

      return review;
    } catch (error) {
      console.error('Update review error:', error);
      return null;
    }
  }

  // Update teacher's average rating
  private async updateTeacherRating(teacherId: string): Promise<void> {
    try {
      console.log('Updating teacher rating for teacher ID:', teacherId);
      
      // Get all reviews for this teacher
      const { data: reviews, error: reviewsError } = await supabase
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherId);

      if (reviewsError) {
        console.error('Error fetching reviews:', reviewsError);
        return;
      }

      console.log(`Found ${reviews?.length || 0} reviews for teacher`);

      if (!reviews || reviews.length === 0) {
        // Set rating to 0 if no reviews
        await supabase
          .from('teachers')
          .update({
            rating: 0,
            total_reviews: 0,
          })
          .eq('id', teacherId);
        return;
      }

      // Calculate average
      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = totalRating / reviews.length;
      const roundedRating = Math.round(averageRating * 10) / 10;

      console.log(`Calculated rating: ${roundedRating} from ${reviews.length} reviews`);

      // Update teacher
      const { error: updateError } = await supabase
        .from('teachers')
        .update({
          rating: roundedRating,
          total_reviews: reviews.length,
        })
        .eq('id', teacherId);

      if (updateError) {
        console.error('Error updating teacher rating:', updateError);
      } else {
        console.log('Teacher rating updated successfully');
      }
    } catch (error) {
      console.error('Update teacher rating error:', error);
    }
  }

  // Get reviews for a teacher
  async getTeacherReviews(teacherId: string): Promise<ReviewWithStudent[]> {
    try {
      const { data: reviews, error } = await supabase
        .from('teacher_reviews')
        .select(`
          *,
          students!teacher_reviews_student_id_fkey(
            profiles:user_id(full_name, avatar_url)
          )
        `)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (reviews || []).map((review: any) => ({
        id: review.id,
        teacher_id: review.teacher_id,
        student_id: review.student_id,
        booking_id: review.booking_id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at,
        updated_at: review.updated_at,
        student: {
          id: review.student_id,
          full_name: review.students?.profiles?.full_name || 'Anonymous',
          avatar_url: review.students?.profiles?.avatar_url || null,
        },
      }));
    } catch (error) {
      console.error('Get teacher reviews error:', error);
      return [];
    }
  }

  // Check if student can review a teacher (based on completed bookings)
  async canReviewBooking(
    studentId: string,
    bookingId: string
  ): Promise<boolean> {
    try {
      // Check if booking is completed
      const { data: booking } = await supabase
        .from('bookings')
        .select('status, student_id, teacher_id')
        .eq('id', bookingId)
        .single();

      if (!booking || booking.student_id !== studentId) return false;
      if (booking.status !== 'completed') return false;

      // Student can always leave/update review for a teacher they've had completed bookings with
      // The review system now allows one review per student-teacher pair
      return true;
    } catch (error) {
      console.error('Can review booking error:', error);
      return false;
    }
  }

  // Get review by student-teacher pair (replaces getReviewByBookingId)
  async getReviewForTeacher(userId: string, teacherId: string): Promise<TeacherReview | null> {
    try {
      // Get student record ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        return null;
      }

      // Get existing review for this student-teacher pair
      const { data: review, error } = await supabase
        .from('teacher_reviews')
        .select('*')
        .eq('student_id', student.id)
        .eq('teacher_id', teacherId)
        .maybeSingle();

      if (error) throw error;
      return review; // Will be null if no review exists
    } catch (error) {
      console.error('Get review for teacher error:', error);
      return null;
    }
  }

  // Legacy method for backward compatibility
  async getReviewByBookingId(bookingId: string): Promise<TeacherReview | null> {
    try {
      // Get teacher_id from booking
      const { data: booking } = await supabase
        .from('bookings')
        .select('teacher_id, student_id')
        .eq('id', bookingId)
        .single();

      if (!booking) return null;

      // Get review for this student-teacher pair
      const { data: review, error } = await supabase
        .from('teacher_reviews')
        .select('*')
        .eq('student_id', booking.student_id)
        .eq('teacher_id', booking.teacher_id)
        .maybeSingle();

      if (error) throw error;
      return review;
    } catch (error) {
      console.error('Get review by booking ID error:', error);
      return null;
    }
  }

  // Get rating distribution for a teacher
  async getRatingDistribution(
    teacherId: string
  ): Promise<{ rating: number; count: number }[]> {
    try {
      const { data: reviews } = await supabase
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherId);

      const distribution = [1, 2, 3, 4, 5].map(rating => ({
        rating,
        count: (reviews || []).filter(r => r.rating === rating).length,
      }));

      return distribution;
    } catch (error) {
      console.error('Get rating distribution error:', error);
      return [];
    }
  }
}

export const reviewService = new ReviewService();
