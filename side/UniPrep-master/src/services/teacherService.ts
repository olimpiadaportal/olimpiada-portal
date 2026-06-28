import { supabase } from './supabase';
import {
  Teacher,
  TeacherWithDetails,
  TeacherFilters,
  ExamGroup,
  TeacherRecommendation,
  RecommendationReason,
  TeacherProfileUpdate,
  ReviewWithStudent,
  TeacherStats,
  EarningsTrend,
} from '../types/teacher';
import { availabilityService } from './availabilityService';

class TeacherService {
  // Get all teachers with filters
  async getTeachers(
    studentId: string,
    filters?: TeacherFilters
  ): Promise<TeacherWithDetails[]> {
    try {
      let query = supabase
        .from('teachers')
        .select(`
          *,
          profiles(full_name, phone, avatar_url)
        `);

      // Apply filters
      if (filters?.search) {
        query = query.or(
          `profiles.full_name.ilike.%${filters.search}%,bio.ilike.%${filters.search}%`
        );
      }

      if (filters?.target_group) {
        query = query.contains('available_groups', [filters.target_group]);
      }

      if (filters?.min_rating) {
        query = query.gte('rating', filters.min_rating);
      }

      if (filters?.max_hourly_rate) {
        query = query.lte('hourly_rate', filters.max_hourly_rate);
      }

      if (filters?.min_experience) {
        query = query.gte('experience_years', filters.min_experience);
      }

      if (filters?.is_verified !== undefined) {
        query = query.eq('is_verified', filters.is_verified);
      }

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
      
      if (error) {
        console.error('Query error:', error);
        throw error;
      }

      // Get favorite teachers for this student
      const { data: favorites } = await supabase
        .from('favorite_teachers')
        .select('teacher_id')
        .eq('student_id', studentId);

      const favoriteIds = new Set(favorites?.map(f => f.teacher_id) || []);

      // Get student's city for same-city check
      const { data: student } = await supabase
        .from('students')
        .select('city')
        .eq('user_id', studentId)
        .single();

      const studentCity = student?.city;
      // Map to TeacherWithDetails
      // Filter out teachers with null profiles (data integrity issue)
      const filteredTeachers = (teachers || [])
        .filter((teacher: any) => {
          if (teacher.profiles === null) {
            console.warn('Filtering out teacher with null profile:', teacher.id);
            return false;
          }
          return true;
        });

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

      const mappedTeachers = filteredTeachers.map((teacher: any) => {
        // Calculate rating from actual reviews
        const teacherReviews = reviewsByTeacher.get(teacher.id) || [];
        let calculatedRating = 0;
        if (teacherReviews.length > 0) {
          const totalRating = teacherReviews.reduce((sum, r) => sum + r, 0);
          const averageRating = totalRating / teacherReviews.length;
          calculatedRating = Math.round(averageRating * 10) / 10;
        }

        const isSameCity = studentCity ? teacher.city === studentCity : false;
        return {
          id: teacher.id,
          user_id: teacher.user_id,
          full_name: teacher.profiles?.full_name || 'Unknown',
          email: '', // Email not needed for teacher listings
          phone: teacher.profiles?.phone || '',
          avatar_url: teacher.profiles?.avatar_url || null,
          bio: teacher.bio || '',
          city: teacher.city || '',
          specializations: teacher.specializations || [],
          experience_years: teacher.experience_years || 0,
          hourly_rate: teacher.hourly_rate || 0,
          monthly_rate: teacher.monthly_rate || null,
          rating: calculatedRating,  // ✅ Use calculated rating from reviews
          total_reviews: teacherReviews.length,  // ✅ Use actual review count
          is_verified: teacher.is_verified || false,
          verification_status: teacher.verification_status || (teacher.is_verified ? 'verified' : 'not_submitted'),
          verification_rejection_reason: teacher.verification_rejection_reason || null,
          available_groups: teacher.available_groups || [],
          education: teacher.education || null,
          certificates: teacher.certificates || [],
          current_students: teacher.current_students ?? teacher.total_students ?? 0,
          total_students: teacher.total_students || 0,
          total_sessions: teacher.total_sessions || 0,
          created_at: teacher.created_at,
          updated_at: teacher.updated_at,
          is_favorite: favoriteIds.has(teacher.id),
          is_same_city: isSameCity,
          can_do_in_person: isSameCity,
          availability_status: 'available' as const, // Resolved per-teacher below via RPC
        };
      });

      // Resolve real availability_status for each teacher via RPC (parallel)
      const statusResults = await Promise.allSettled(
        mappedTeachers.map(t => availabilityService.getAvailabilityStatus(t.id))
      );
      const resolvedTeachers = mappedTeachers.map((t, i) => ({
        ...t,
        availability_status: statusResults[i].status === 'fulfilled'
          ? (statusResults[i] as PromiseFulfilledResult<'available' | 'busy' | 'offline'>).value
          : 'busy' as const,
      }));

      return resolvedTeachers;
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
      // Force fresh data by adding a timestamp to bypass cache
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles(full_name, phone, avatar_url)
        `)
        .eq('id', teacherId)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!teacher) return null;
      
      // Check if profile exists (data integrity)
      if (!teacher.profiles) {
        console.error('Teacher has no profile:', teacherId);
        return null;
      }

      // Check if favorited
      let isFavorite = false;
      let studentCity: string | null = null;
      
      if (userId) {
        // First, get the student record ID from the user ID
        const { data: student } = await supabase
          .from('students')
          .select('id, city')
          .eq('user_id', userId)
          .single();

        if (student) {
          const studentId = student.id;
          studentCity = student.city || null;

          // Check if favorited using correct student ID
          const { data: favorite } = await supabase
            .from('favorite_teachers')
            .select('id')
            .eq('student_id', studentId)
            .eq('teacher_id', teacherId)
            .single();
          isFavorite = !!favorite;
        }
      }

      const availabilityStatus = await availabilityService.getAvailabilityStatus(teacher.id);

      return {
        id: teacher.id,
        user_id: teacher.user_id,
        full_name: teacher.profiles?.full_name || 'Unknown',
        email: '', // Email not needed
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
        verification_status: teacher.verification_status || (teacher.is_verified ? 'verified' : 'not_submitted'),
        verification_rejection_reason: teacher.verification_rejection_reason || null,
        available_groups: teacher.available_groups || [],
        education: teacher.education || null,
        certificates: teacher.certificates || [],
        current_students: teacher.current_students ?? teacher.total_students ?? 0,
        total_students: teacher.total_students || 0,
        total_sessions: teacher.total_sessions || 0,
        created_at: teacher.created_at,
        updated_at: teacher.updated_at,
        is_favorite: isFavorite,
        is_same_city: studentCity ? teacher.city === studentCity : false,
        can_do_in_person: studentCity ? teacher.city === studentCity : false,
        availability_status: availabilityStatus,
      };
    } catch (error) {
      console.error('Get teacher by ID error:', error);
      return null;
    }
  }

  // Get teacher reviews
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

  // Hardcoded fallback: group code → subject names (English)
  // Used when exam_group_subjects has no seed data
  private static GROUP_SUBJECTS: Record<string, string[]> = {
    'I': ['Mathematics', 'Physics', 'Chemistry'],
    'II': ['Mathematics', 'Geography', 'History'],
    'III': ['Azerbaijani', 'History', 'Literature'],
    'IV': ['Biology', 'Chemistry', 'Physics'],
    'V': ['Mathematics', 'Geography', 'Foreign Language'],
  };

  /**
   * Get recommended teachers based on multi-factor scoring.
   * Factors: weak subject match (35), group match (20), same city (15),
   * rating (15), verified (5), experience (5), review volume (5).
   *
   * @param studentId - The students.id (not auth user id)
   * @param allTeachers - Already-loaded teachers list (avoids double fetch)
   */
  async getRecommendedTeachers(
    studentId: string,
    allTeachers: TeacherWithDetails[]
  ): Promise<TeacherRecommendation[]> {
    try {
      // 1. Fetch student data
      const { data: student } = await supabase
        .from('students')
        .select('target_group, city, weakest_subjects')
        .eq('id', studentId)
        .single();

      if (!student) return [];

      // 2. Fetch study_progress for accuracy-based weak subjects
      const { data: progress } = await supabase
        .from('study_progress')
        .select('subject_id, questions_attempted, questions_correct')
        .eq('student_id', studentId);

      // 3. Fetch all subjects for UUID → name mapping
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name_en');

      const subjectMap = new Map<string, string>();
      (subjects || []).forEach((s: any) => subjectMap.set(s.id, s.name_en));

      // 4. Determine weak subjects (union of onboarding + low-accuracy)
      const weakSubjectNames = new Set<string>();

      // From onboarding weakest_subjects (UUID[])
      (student.weakest_subjects || []).forEach((uuid: string) => {
        const name = subjectMap.get(uuid);
        if (name) weakSubjectNames.add(name);
      });

      // From study_progress where accuracy < 50% and attempts > 10
      (progress || []).forEach((p: any) => {
        if (p.questions_attempted > 10) {
          const accuracy = (p.questions_correct / p.questions_attempted) * 100;
          if (accuracy < 50) {
            const name = subjectMap.get(p.subject_id);
            if (name) weakSubjectNames.add(name);
          }
        }
      });

      // 5. Determine group subjects
      let groupSubjectNames: string[] = [];
      if (student.target_group) {
        // Try exam_group_subjects first
        const { data: groupData } = await supabase
          .from('exam_groups')
          .select('id')
          .eq('code', student.target_group)
          .single();

        if (groupData) {
          const { data: groupSubjects } = await supabase
            .from('exam_group_subjects')
            .select('subject_id')
            .eq('exam_group_id', groupData.id);

          if (groupSubjects && groupSubjects.length > 0) {
            groupSubjectNames = groupSubjects
              .map((gs: any) => subjectMap.get(gs.subject_id))
              .filter(Boolean) as string[];
          }
        }

        // Fallback to hardcoded map if no DB data
        if (groupSubjectNames.length === 0) {
          groupSubjectNames = TeacherService.GROUP_SUBJECTS[student.target_group] || [];
        }
      }

      const weakSubjects = Array.from(weakSubjectNames);

      // 6. Score each teacher
      const recommendations: TeacherRecommendation[] = [];

      for (const teacher of allTeachers) {
        const { score, reasons } = this.scoreTeacher(
          teacher,
          weakSubjects,
          groupSubjectNames,
          student.target_group,
          student.city
        );

        // Minimum 25 points to appear in recommendations
        if (score >= 25) {
          recommendations.push({
            teacher,
            match_score: Math.round(score),
            reasons,
          });
        }
      }

      // Sort by score DESC, return top 8
      return recommendations
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 8);
    } catch (error) {
      console.error('Get recommended teachers error:', error);
      return [];
    }
  }

  /**
   * Score a single teacher (100 points max).
   * Weak subject match: 35 | Group match: 20 | Same city: 15
   * Rating: 15 | Verified: 5 | Experience: 5 | Reviews: 5
   */
  private scoreTeacher(
    teacher: TeacherWithDetails,
    weakSubjects: string[],
    groupSubjects: string[],
    targetGroup: ExamGroup | null,
    studentCity: string | null
  ): { score: number; reasons: RecommendationReason[] } {
    let score = 0;
    const reasons: RecommendationReason[] = [];
    const specs = teacher.specializations || [];

    // 1. Weak subject match (35 pts)
    if (weakSubjects.length > 0) {
      const matchingWeak = specs.filter(s => weakSubjects.includes(s));
      if (matchingWeak.length > 0) {
        score += (matchingWeak.length / weakSubjects.length) * 35;
        reasons.push({ type: 'weak_subjects', params: { subjects: matchingWeak.join(', ') } });
      }
    }

    // 2. Group match (20 pts)
    if (targetGroup && groupSubjects.length > 0) {
      const groupsMatch = (teacher.available_groups || []).includes(targetGroup);
      const specsOverlap = specs.filter(s => groupSubjects.includes(s));
      if (groupsMatch && specsOverlap.length > 0) {
        score += 20;
        reasons.push({ type: 'group_match', params: { group: targetGroup } });
      } else if (specsOverlap.length > 0) {
        score += 10;
        reasons.push({ type: 'group_subjects', params: { group: targetGroup, subjects: specsOverlap.join(', ') } });
      }
    }

    // 3. Same city (15 pts)
    if (studentCity && teacher.city && teacher.city === studentCity) {
      score += 15;
      reasons.push({ type: 'same_city' });
    }

    // 4. Rating (15 pts)
    if (teacher.rating > 0) {
      score += (teacher.rating / 5) * 15;
      if (teacher.rating >= 4.0) {
        reasons.push({ type: 'high_rating', params: { rating: teacher.rating.toFixed(1) } });
      }
    }

    // 5. Verified (10 pts — encourages teachers to get verified)
    if (teacher.is_verified) {
      score += 10;
      reasons.push({ type: 'verified' });
    }

    // 6. Experience (5 pts)
    if (teacher.experience_years > 0) {
      score += Math.min(teacher.experience_years / 10, 1) * 5;
    }

    // 7. Review volume / social proof (5 pts)
    if (teacher.total_reviews > 0) {
      score += Math.min(teacher.total_reviews / 20, 1) * 5;
    }

    return { score, reasons };
  }

  // Update teacher profile (for teachers)
  async updateTeacherProfile(
    teacherId: string,
    updates: TeacherProfileUpdate
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teachers')
        .update(updates)
        .eq('id', teacherId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update teacher profile error:', error);
      return false;
    }
  }

  // Get teacher statistics (for teacher dashboard)
  async getTeacherStats(teacherId: string): Promise<TeacherStats | null> {
    try {
      // Get basic stats
      const { data: teacher } = await supabase
        .from('teachers')
        .select('current_students, total_students, total_sessions, rating, total_reviews')
        .eq('id', teacherId)
        .single();

      // Get reviews to calculate accurate rating
      const { data: reviews } = await supabase
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherId);

      // Calculate rating from actual reviews
      let calculatedRating = 0;
      if (reviews && reviews.length > 0) {
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalRating / reviews.length;
        calculatedRating = Math.round(averageRating * 10) / 10;
      }

      // Get booking stats
      const { data: bookings } = await supabase
        .from('bookings')
        .select('status, price, scheduled_date')
        .eq('teacher_id', teacherId);

      const activeBookings = (bookings || []).filter(
        b => b.status === 'confirmed'
      ).length;

      const pendingRequests = (bookings || []).filter(
        b => b.status === 'pending'
      ).length;

      const completedSessions = (bookings || []).filter(
        b => b.status === 'completed'
      ).length;

      const totalEarnings = (bookings || [])
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + b.price, 0);

      // Calculate monthly earnings
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const monthlyEarnings = (bookings || [])
        .filter(b => {
          if (b.status !== 'completed') return false;
          const bookingMonth = b.scheduled_date.substring(0, 7);
          return bookingMonth === currentMonth;
        })
        .reduce((sum, b) => sum + b.price, 0);

      // Calculate earnings trend (last 6 months)
      const earningsTrend: EarningsTrend[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const monthBookings = (bookings || []).filter(b => {
          if (b.status !== 'completed') return false;
          return b.scheduled_date.startsWith(month);
        });

        earningsTrend.push({
          month,
          earnings: monthBookings.reduce((sum, b) => sum + b.price, 0),
          sessions: monthBookings.length,
        });
      }

      return {
        current_students: teacher?.current_students ?? teacher?.total_students ?? 0,
        total_students: teacher?.total_students || 0,
        active_bookings: activeBookings,
        completed_sessions: completedSessions,
        pending_requests: pendingRequests,
        total_earnings: totalEarnings,
        monthly_earnings: monthlyEarnings,
        average_rating: calculatedRating,  // ✅ Use calculated rating from reviews
        total_reviews: reviews?.length || 0,  // ✅ Use actual review count
        earnings_trend: earningsTrend,
      };
    } catch (error) {
      console.error('Get teacher stats error:', error);
      return null;
    }
  }

  // Toggle favorite teacher
  async toggleFavorite(userId: string, teacherId: string): Promise<boolean> {
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

      // Check if already favorited
      const { data: existing } = await supabase
        .from('favorite_teachers')
        .select('id')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .single();

      if (existing) {
        // Remove favorite
        const { error } = await supabase
          .from('favorite_teachers')
          .delete()
          .eq('id', existing.id);
        
        if (error) throw error;
        return false; // Unfavorited
      } else {
        // Add favorite
        const { error } = await supabase
          .from('favorite_teachers')
          .insert({
            student_id: studentId,
            teacher_id: teacherId,
          });
        
        if (error) throw error;
        return true; // Favorited
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
      throw error;
    }
  }

  // Get favorite teachers
  async getFavoriteTeachers(userId: string): Promise<TeacherWithDetails[]> {
    try {
      // First, get the student record ID from the user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, city')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        console.error('Student not found:', studentError);
        return [];
      }

      const studentId = student.id;

      const { data: favorites, error } = await supabase
        .from('favorite_teachers')
        .select(`
          teacher_id,
          teachers(
            *,
            profiles(full_name, phone, avatar_url)
          )
        `)
        .eq('student_id', studentId);

      if (error) throw error;

      const studentCity = student?.city;

      const mappedFavorites = (favorites || [])
        .filter((fav: any) => fav.teachers?.profiles)
        .map((fav: any) => {
          const teacher = fav.teachers;
          return {
            id: teacher.id,
            user_id: teacher.user_id,
            full_name: teacher.profiles.full_name,
            email: '', // Email not needed
            phone: teacher.profiles.phone,
            avatar_url: teacher.profiles.avatar_url,
            bio: teacher.bio,
            city: teacher.city,
            specializations: teacher.specializations,
            experience_years: teacher.experience_years,
            hourly_rate: teacher.hourly_rate,
            monthly_rate: teacher.monthly_rate,
            rating: teacher.rating,
            total_reviews: teacher.total_reviews,
            is_verified: teacher.is_verified,
            available_groups: teacher.available_groups,
            education: teacher.education,
            certificates: teacher.certificates || [],
            current_students: teacher.current_students ?? teacher.total_students ?? 0,
            total_students: teacher.total_students,
            total_sessions: teacher.total_sessions,
            created_at: teacher.created_at,
            updated_at: teacher.updated_at,
            is_favorite: true,
            is_same_city: studentCity ? teacher.city === studentCity : false,
            can_do_in_person: studentCity ? teacher.city === studentCity : false,
            availability_status: 'busy' as const,
          };
        });

      const statusResults = await Promise.allSettled(
        mappedFavorites.map((teacher) => availabilityService.getAvailabilityStatus(teacher.id))
      );

      return mappedFavorites.map((teacher, index) => ({
        ...teacher,
        availability_status: statusResults[index].status === 'fulfilled'
          ? (statusResults[index] as PromiseFulfilledResult<'available' | 'busy' | 'offline'>).value
          : 'busy' as const,
      }));
    } catch (error) {
      console.error('Get favorite teachers error:', error);
      return [];
    }
  }

  // Get teacher profile by user ID (for teacher's own profile)
  async getTeacherByUserId(userId: string): Promise<Teacher | null> {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles(full_name, phone, avatar_url)
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

      return {
        ...data,
        full_name: data.profiles?.full_name || '',
        email: user?.email || '',
        phone: data.profiles?.phone || '',
        avatar_url: data.profiles?.avatar_url || null,
        current_students: data.current_students ?? data.total_students ?? 0,
        total_students: data.total_students ?? 0,
      };
    } catch (error) {
      console.error('Get teacher by user ID error:', error);
      return null;
    }
  }

  // Update teacher profile by user ID (for teacher's own profile)
  async updateTeacherProfileByUserId(
    userId: string,
    updates: TeacherProfileUpdate
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teachers')
        .update(updates)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update teacher profile by user ID error:', error);
      return false;
    }
  }
  // Get all subjects from database for teacher specializations
  // This is the future-proof approach - subjects are managed in admin panel
  // Note: subjects table only has name_en and name_az columns (no name_ru)
  async getSubjectsForSpecialization(): Promise<Array<{ id: string; name_en: string; name_az: string }>> {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching subjects for specialization:', error);
      return [];
    }
  }
}

export const teacherService = new TeacherService();
