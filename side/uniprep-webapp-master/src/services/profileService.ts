// Profile Service
// Stage 8: Profile & Settings
// Handles user profile management

import { createClient } from '@/lib/supabase/client'
import { ProfileData, StudentProfile } from '@/types/settings'

interface StudentData {
  id: string
  user_id: string
  city: string | null
  target_group: string | null
  target_university: string | null
  bio: string | null
  elo_rating: number
  current_streak: number
  monthly_score: number
}

interface ProfileWithStudent {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  user_type: string
  created_at: string
  updated_at: string
  students: StudentData | null
}

class ProfileService {
  /**
   * Get user profile with student data
   */
  async getProfile(userId: string): Promise<StudentProfile | null> {
    try {
      const supabase = createClient()
      
      // Get email from auth.users
      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || null

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          *,
          students(*)
        `)
        .eq('id', userId)
        .single()

      if (error) throw error
      if (!profile) return null

      const profileData = profile as unknown as ProfileWithStudent

      // Get total exams taken (completed only)
      const { count: examsCount } = await supabase
        .from('mock_exam_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')

      const studentData = profileData.students

      return {
        id: profileData.id,
        full_name: profileData.full_name,
        email: userEmail, // Use email from auth.users
        phone: profileData.phone,
        avatar_url: profileData.avatar_url,
        user_type: profileData.user_type as 'student' | 'teacher',
        created_at: profileData.created_at,
        updated_at: profileData.updated_at,
        student_id: studentData?.id || '',
        city: studentData?.city || null,
        target_group: studentData?.target_group || null,
        target_university: studentData?.target_university || null,
        bio: studentData?.bio || null,
        elo_rating: studentData?.elo_rating || 1200,
        current_streak: studentData?.current_streak || 0,
        monthly_score: studentData?.monthly_score || 0,
        total_exams_taken: examsCount || 0,
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Update profile information
   */
  async updateProfile(
    userId: string,
    updates: {
      full_name?: string
      phone?: string
      avatar_url?: string
    }
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', userId)

      if (error) throw error
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Update student-specific information
   */
  async updateStudentInfo(
    userId: string,
    updates: {
      city?: string
      target_group?: string
      target_university?: string
      bio?: string
    }
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('students')
        .update(updates as any)
        .eq('user_id', userId)

      if (error) throw error
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Upload avatar image to Supabase Storage
   */
  async uploadAvatar(
    userId: string,
    file: File
  ): Promise<string | null> {
    try {
      const supabase = createClient()
      
      // Validate file
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image')
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File size must be less than 5MB')
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const avatarUrl = urlData.publicUrl

      // Update profile with new avatar URL
      await this.updateProfile(userId, { avatar_url: avatarUrl })
      return avatarUrl
    } catch (error) {
      return null
    }
  }

  /**
   * Delete avatar image
   */
  async deleteAvatar(userId: string, avatarUrl: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Extract file path from URL
      const urlParts = avatarUrl.split('/avatars/')
      if (urlParts.length < 2) return false

      const filePath = `avatars/${urlParts[1]}`

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([filePath])

      if (deleteError) throw deleteError

      // Update profile to remove avatar URL
      await this.updateProfile(userId, { avatar_url: null })
      return true
    } catch (error) {
      return false
    }
  }
}

export const profileService = new ProfileService()
