// Profile Service
// Stage 9: Profile & Settings
// Handles user profile management and statistics

import { supabase } from './supabase';
import { ProfileData } from '../types/settings';

class ProfileService {
  /**
   * Get user profile by user ID
   * Fetches from both profiles and students tables to get complete data
   */
  async getProfile(userId: string): Promise<ProfileData | null> {
    try {
      console.log('👤 Fetching profile for user:', userId);

      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          console.log('⚠️ Profile not found');
          return null;
        }
        throw profileError;
      }

      // Fetch student data if user is a student
      let studentData = null;
      let teacherData = null;
      
      if (profileData?.user_type === 'student') {
        console.log('📚 Fetching student data for user_id:', userId);
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('id, city, target_group, target_university, graduation_year, user_id')
          .eq('user_id', userId)
          .maybeSingle(); // Use maybeSingle() to handle case where student record doesn't exist yet

        console.log('📚 Student query result:', { student, studentError });
        
        if (studentError) {
          console.warn('⚠️ Error fetching student data:', studentError);
          console.warn('⚠️ Error code:', studentError.code);
          console.warn('⚠️ Error message:', studentError.message);
        } else if (student) {
          studentData = student;
          console.log('📚 Student data loaded:', JSON.stringify(studentData, null, 2));
        } else {
          console.log('⚠️ No student record found for user:', userId);
        }
      } else if (profileData?.user_type === 'teacher') {
        // Fetch teacher data if user is a teacher
        const { data: teacher, error: teacherError } = await supabase
          .from('teachers')
          .select('city, bio, specializations, experience_years, hourly_rate, monthly_rate, available_groups')
          .eq('user_id', userId)
          .maybeSingle(); // Use maybeSingle() to handle case where teacher record doesn't exist yet

        if (teacherError) {
          console.warn('⚠️ Error fetching teacher data:', teacherError);
        } else if (teacher) {
          teacherData = teacher;
          console.log('👨‍🏫 Teacher data loaded:', teacherData);
        } else {
          console.log('⚠️ No teacher record found for user:', userId);
        }
      }

      // Get email from auth user (profiles table doesn't store email)
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Merge profile and role-specific data
      const mergedData = {
        ...profileData,
        email: authUser?.email || '',
        // Override with student data if available
        city: studentData?.city || teacherData?.city || profileData?.city || '',
        phone: profileData?.phone || '',
        target_group: studentData?.target_group || profileData?.target_group || '',
        target_university: studentData?.target_university || profileData?.target_university || '',
        graduation_year: studentData?.graduation_year || profileData?.graduation_year,
        // Teacher-specific fields
        bio: teacherData?.bio || profileData?.bio || '',
        specializations: teacherData?.specializations || [],
        experience_years: teacherData?.experience_years,
        hourly_rate: teacherData?.hourly_rate,
        monthly_rate: teacherData?.monthly_rate,
        available_groups: teacherData?.available_groups || [],
      };

      console.log('✅ Profile loaded successfully with role-specific data');
      console.log('📊 Merged profile data:', JSON.stringify({
        city: mergedData.city,
        target_group: mergedData.target_group,
        target_university: mergedData.target_university,
        phone: mergedData.phone,
      }, null, 2));
      return mergedData;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }

  /**
   * Update user profile
   * Updates both profiles and students/teachers tables as needed
   */
  async updateProfile(
    userId: string,
    updates: Partial<ProfileData>,
    userType?: string
  ): Promise<boolean> {
    try {
      console.log('📝 Updating profile for user:', userId);
      console.log('📝 Update data:', JSON.stringify(updates, null, 2));
      console.log('📝 User type:', userType);

      // Separate role-specific fields from profile fields
      const { 
        city, target_group, target_university, graduation_year,
        bio, specializations, experience_years, hourly_rate, monthly_rate, available_groups,
        ...profileUpdates 
      } = updates as Record<string, unknown>;

      // Update profiles table (only profile-level fields)
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...profileUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select();

      if (error) {
        console.error('❌ Profile update error:', error);
        throw error;
      }

      console.log('✅ Profile updated successfully');

      // Update students table if student-specific fields are provided.
      // Use the ownership-checked RPC instead of direct client UPDATE because
      // the students table intentionally protects scoring/leaderboard columns.
      if (userType === 'student' && (city !== undefined || target_group !== undefined || target_university !== undefined || graduation_year !== undefined)) {
        const { error: studentError } = await supabase.rpc('update_own_student_profile_fields', {
          p_city: typeof city === 'string' ? city : null,
          p_target_group: typeof target_group === 'string' ? target_group : null,
          p_target_university: typeof target_university === 'string' ? target_university : null,
          p_graduation_year: typeof graduation_year === 'number' ? graduation_year : null,
        });

        if (studentError) {
          console.error('Student profile field update error:', studentError);
          throw studentError;
        }

        console.log('✅ Student data updated successfully');
      }

      // Update teachers table if teacher-specific fields are provided
      if (userType === 'teacher' && (city !== undefined || bio !== undefined || specializations !== undefined || experience_years !== undefined || hourly_rate !== undefined || monthly_rate !== undefined || available_groups !== undefined)) {
        const teacherUpdates: any = {};
        if (city !== undefined) teacherUpdates.city = city;
        if (bio !== undefined) teacherUpdates.bio = bio;
        if (specializations !== undefined) teacherUpdates.specializations = specializations;
        if (experience_years !== undefined) teacherUpdates.experience_years = experience_years;
        if (hourly_rate !== undefined) teacherUpdates.hourly_rate = hourly_rate;
        if (monthly_rate !== undefined) teacherUpdates.monthly_rate = monthly_rate;
        if (available_groups !== undefined) teacherUpdates.available_groups = available_groups;

        const { error: teacherError } = await supabase
          .from('teachers')
          .update(teacherUpdates)
          .eq('user_id', userId);

        if (teacherError) {
          console.error('⚠️ Teacher update error (non-fatal):', teacherError);
          // Don't fail the whole operation if teacher update fails
        } else {
          console.log('✅ Teacher data updated successfully');
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  }

  /**
   * Update authenticated student's role-specific profile fields.
   * Uses an ownership-checked SECURITY DEFINER RPC because students RLS protects
   * scoring and leaderboard columns from direct client writes.
   */
  async updateStudentProfileFields(
    updates: {
      city?: string | null;
      target_group?: string | null;
      target_university?: string | null;
      graduation_year?: number | null;
    }
  ): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('update_own_student_profile_fields', {
        p_city: updates.city ?? null,
        p_target_group: updates.target_group ?? null,
        p_target_university: updates.target_university ?? null,
        p_graduation_year: updates.graduation_year ?? null,
      });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error updating student profile fields:', error);
      return false;
    }
  }

  /**
   * Update profile picture URL
   */
  async updateProfilePicture(
    userId: string,
    avatarUrl: string
  ): Promise<boolean> {
    try {
      console.log('🖼️ Updating profile picture for user:', userId);

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      console.log('✅ Profile picture updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating profile picture:', error);
      return false;
    }
  }

  /**
   * Delete profile picture
   */
  async deleteProfilePicture(userId: string): Promise<boolean> {
    try {
      console.log('🗑️ Deleting profile picture for user:', userId);

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      console.log('✅ Profile picture deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting profile picture:', error);
      return false;
    }
  }

  /**
   * Get user statistics
   * Fetches analytics data for profile display
   */
  async getProfileStats(userId: string): Promise<{
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    studyTime: number;
    currentStreak: number;
    bestStreak: number;
    examsCompleted: number;
    practiceSessions: number;
  } | null> {
    try {
      console.log('📊 Fetching profile stats for user:', userId);

      // Get student ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, current_streak, best_streak')
        .eq('user_id', userId)
        .single();

      if (studentError || !student) {
        console.log('⚠️ Student not found');
        return null;
      }

      // Get analytics data
      const { data: analytics, error: analyticsError } = await supabase
        .from('daily_stats')
        .select('questions_attempted, questions_correct, study_time_minutes, exams_completed, practice_sessions')
        .eq('student_id', student.id);

      if (analyticsError) throw analyticsError;

      // Calculate totals
      const totalQuestions = analytics?.reduce((sum, day) => sum + (day.questions_attempted || 0), 0) || 0;
      const correctAnswers = analytics?.reduce((sum, day) => sum + (day.questions_correct || 0), 0) || 0;
      const studyTime = analytics?.reduce((sum, day) => sum + (day.study_time_minutes || 0), 0) || 0;
      const examsCompleted = analytics?.reduce((sum, day) => sum + (day.exams_completed || 0), 0) || 0;
      const practiceSessions = analytics?.reduce((sum, day) => sum + (day.practice_sessions || 0), 0) || 0;
      const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

      console.log('✅ Profile stats loaded successfully');

      return {
        totalQuestions,
        correctAnswers,
        accuracy: Math.round(accuracy * 10) / 10, // Round to 1 decimal
        studyTime,
        currentStreak: Math.max(student.current_streak || 0, 0),
        bestStreak: Math.max(student.best_streak || 0, 0),
        examsCompleted,
        practiceSessions,
      };
    } catch (error) {
      console.error('Error fetching profile stats:', error);
      return null;
    }
  }

  /**
   * Check if profile is complete
   * Used to prompt user to complete profile
   */
  async isProfileComplete(userId: string): Promise<boolean> {
    try {
      const profile = await this.getProfile(userId);
      if (!profile) return false;

      // Check required fields
      const requiredFields = [
        profile.first_name,
        profile.last_name,
        profile.email,
        profile.city,
      ];

      return requiredFields.every(field => field && field.trim().length > 0);
    } catch (error) {
      console.error('Error checking profile completion:', error);
      return false;
    }
  }

  /**
   * Get profile completion percentage
   */
  async getProfileCompletionPercentage(userId: string, userType?: string): Promise<number> {
    try {
      const profile = await this.getProfile(userId);
      if (!profile) return 0;

      // Helper to check if field is filled
      const isFilled = (field: any): boolean => {
        if (field === null || field === undefined) return false;
        if (typeof field === 'string') return field.trim().length > 0;
        return true;
      };

      // Base required fields for all users (avatar and email are optional)
      const baseFields = [
        profile.first_name,
        profile.last_name,
        profile.phone,
        profile.city,
        profile.bio,
      ];

      // Add academic fields only for students
      const fields = userType === 'student'
        ? [...baseFields, profile.target_group, profile.target_university]
        : baseFields;

      const completedFields = fields.filter(isFilled).length;
      const percentage = Math.round((completedFields / fields.length) * 100);
      
      console.log(`Profile completion (${userType || 'unknown'}): ${completedFields}/${fields.length} = ${percentage}%`);
      console.log('Fields status:', fields.map((f, i) => `Field ${i}: ${isFilled(f) ? '✓' : '✗'}`));
      return percentage;
    } catch (error) {
      console.error('Error calculating profile completion:', error);
      return 0;
    }
  }
  /**
   * Phase 2: Complete onboarding personalization
   * Saves subject preferences and marks onboarding as completed
   */
  async completeOnboarding(
    studentId: string,
    strongestSubjects: string[],
    weakestSubjects: string[]
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('students')
        .update({
          onboarding_completed: true,
          strongest_subjects: strongestSubjects,
          weakest_subjects: weakestSubjects,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId);

      if (error) throw error;

      console.log('✅ Onboarding completed for student:', studentId);
      return true;
    } catch (error) {
      console.error('Error completing onboarding:', error);
      return false;
    }
  }
}

export const profileService = new ProfileService();
