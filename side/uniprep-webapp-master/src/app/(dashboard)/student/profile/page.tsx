"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  GraduationCap, 
  Trophy, 
  Flame, 
  Target,
  Edit,
  ArrowLeft,
  Settings
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { profileService } from "@/services/profileService"
import { StudentProfile } from "@/types/settings"
import { ProfileSkeleton } from "@/components/ui/skeleton"

export default function ProfilePage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const profileData = await profileService.getProfile(user.id)
      setProfile(profileData)
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('profile.notFound')}</p>
          <Button onClick={() => router.push('/student/home')} className="mt-4">
            {t('common.back')}
          </Button>
        </Card>
      </div>
    )
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-800 text-white p-8 pb-16 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button
              onClick={() => router.push('/student/home')}
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {t('common.back')}
            </Button>
            <Button
              onClick={() => router.push('/student/settings')}
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <Settings className="w-5 h-5 mr-2" />
              {t('settings.title')}
            </Button>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-6">
            <Avatar className="w-32 h-32 border-4 border-white shadow-xl">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-3xl bg-blue-500 text-white">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold mb-2">{profile.full_name || t('profile.noName')}</h1>
              <p className="text-blue-100 dark:text-blue-200 text-lg mb-4">{profile.email}</p>
              
              <Button
                onClick={() => router.push('/student/profile/edit')}
                className="bg-white text-blue-600 hover:bg-blue-50"
              >
                <Edit className="w-4 h-4 mr-2" />
                {t('profile.editProfile')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-yellow-500 to-orange-500 text-white shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm opacity-90">{t('profile.eloRating')}</p>
                <p className="text-3xl font-bold">{profile.elo_rating}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-red-500 to-pink-500 text-white shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Flame className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm opacity-90">{t('profile.currentStreak')}</p>
                <p className="text-3xl font-bold">{profile.current_streak} {t('profile.days')}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500 to-teal-500 text-white shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Target className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm opacity-90">{t('profile.examsTaken')}</p>
                <p className="text-3xl font-bold">{profile.total_exams_taken}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Profile Information */}
        <Card className="p-8 shadow-xl mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
            {t('profile.personalInfo')}
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.email')}</p>
                <p className="font-medium text-gray-900 dark:text-white">{profile.email || t('profile.notProvided')}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.phone')}</p>
                <p className="font-medium text-gray-900 dark:text-white">{profile.phone || t('profile.notProvided')}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.city')}</p>
                <p className="font-medium text-gray-900 dark:text-white">{profile.city || t('profile.notProvided')}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.targetGroup')}</p>
                <p className="font-medium text-gray-900 dark:text-white">{profile.target_group || t('profile.notProvided')}</p>
              </div>
            </div>

            {profile.target_university && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.targetUniversity')}</p>
                  <p className="font-medium text-gray-900 dark:text-white">{profile.target_university}</p>
                </div>
              </div>
            )}

            {profile.bio && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('profile.bio')}</p>
                <p className="text-gray-900 dark:text-white">{profile.bio}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Monthly Score */}
        <Card className="p-8 shadow-xl">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            {t('profile.monthlyScore')}
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t('profile.thisMonth')}</p>
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{profile.monthly_score}</p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {t('profile.points')}
            </Badge>
          </div>
        </Card>
      </div>
    </div>
  )
}
