"use client"

import { useEffect, useState, use } from "react"
import { useRouter, useParams } from "next/navigation"
import { ProfileSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  Heart,
  CheckCircle,
  Users,
  BookOpen,
  GraduationCap,
  Calendar,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherService } from "@/services/teacherService"
import { TeacherWithDetails, ReviewWithStudent } from "@/types/teacher"

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function TeacherProfilePage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const resolvedParams = use(params)
  const teacherId = resolvedParams.teacherId

  const [loading, setLoading] = useState(true)
  const [teacher, setTeacher] = useState<TeacherWithDetails | null>(null)
  const [reviews, setReviews] = useState<ReviewWithStudent[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    // Validate teacherId is a valid UUID before making API calls
    if (!UUID_REGEX.test(teacherId)) {
      router.push('/student/teachers')
      return
    }
    loadTeacherProfile()
  }, [teacherId])

  const loadTeacherProfile = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      const [teacherData, reviewsData] = await Promise.all([
        teacherService.getTeacherById(teacherId, user.id),
        teacherService.getTeacherReviews(teacherId),
      ])

      setTeacher(teacherData)
      setReviews(reviewsData)
    } catch (error) {
      console.error("Error loading teacher profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!userId || !teacher) return

    const newStatus = await teacherService.toggleFavorite(teacherId, userId)
    setTeacher({ ...teacher, is_favorite: newStatus })
  }

  const translateSubject = (subject: string) => {
    return t(`subjects.${subject.toLowerCase()}`) || subject
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('teachers.noTeachers')}
          </h3>
          <Button onClick={() => router.push('/student/teachers')}>
            {t('common.back')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push('/student/teachers')}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>

        {/* Profile Header */}
        <Card className="p-6 mb-6 bg-white dark:bg-gray-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              {teacher.avatar_url ? (
                <img
                  src={teacher.avatar_url}
                  alt={teacher.full_name}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-900 dark:text-blue-400">
                    {teacher.full_name.charAt(0)}
                  </span>
                </div>
              )}
              {teacher.is_verified && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {teacher.full_name}
                    </h1>
                    {teacher.is_verified && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                        {t('teachers.profile.verified')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center text-gray-600 dark:text-gray-400 mt-1">
                    <MapPin className="h-4 w-4 mr-1" />
                    {teacher.city || t('teachers.noCity')}
                    {teacher.is_same_city && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {t('teachers.sameCity')}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleFavorite}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Heart 
                    className={`h-6 w-6 ${teacher.is_favorite ? 'fill-red-500 text-red-500' : ''}`} 
                  />
                </Button>
              </div>

              {/* Rating */}
              <div className="flex items-center mt-3">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 mr-1" />
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {teacher.rating.toFixed(1)}
                </span>
                <span className="text-gray-600 dark:text-gray-400 ml-2">
                  ({teacher.total_reviews} {t('teachers.reviews')})
                </span>
              </div>

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-4 mt-4">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4 mr-1" />
                  {teacher.experience_years} {t('teachers.yearsExp')}
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Users className="h-4 w-4 mr-1" />
                  {teacher.total_students} {t('teachers.students')}
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <BookOpen className="h-4 w-4 mr-1" />
                  {teacher.total_sessions} {t('teachers.profile.totalSessions')}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              className="w-full bg-blue-900 hover:bg-blue-800 text-white"
              onClick={() => router.push(`/student/teachers/book/${teacherId}`)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {t('teachers.profile.bookNow')}
            </Button>
          </div>
        </Card>

        {/* Pricing Card */}
        <Card className="p-6 mb-6 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teachers.profile.pricing')}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('teachers.profile.hourlyRate')}
              </div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-400">
                ₼{teacher.hourly_rate}
              </div>
            </div>
            {teacher.monthly_rate && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {t('teachers.profile.monthlyRate')}
                </div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  ₼{teacher.monthly_rate}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="about" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="about">{t('teachers.profile.about')}</TabsTrigger>
            <TabsTrigger value="specializations">{t('teachers.profile.specializations')}</TabsTrigger>
            <TabsTrigger value="reviews">{t('teachers.profile.reviews')}</TabsTrigger>
          </TabsList>

          {/* About Tab */}
          <TabsContent value="about">
            <Card className="p-6 bg-white dark:bg-gray-800">
              <div className="space-y-6">
                {/* Bio */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t('teachers.profile.about')}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-line">
                    {teacher.bio || 'No bio available.'}
                  </p>
                </div>

                {/* Education */}
                {teacher.education && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                      <GraduationCap className="h-5 w-5 mr-2" />
                      {t('teachers.profile.education')}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {teacher.education}
                    </p>
                  </div>
                )}

                {/* Available Groups */}
                {teacher.available_groups.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t('teachers.profile.availableGroups')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {teacher.available_groups.map((group) => (
                        <Badge key={group} variant="outline">
                          {t('teachers.group')} {group}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </Card>
          </TabsContent>

          {/* Specializations Tab */}
          <TabsContent value="specializations">
            <Card className="p-6 bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('teachers.profile.specializations')}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {teacher.specializations.map((subject) => (
                  <div
                    key={subject}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center"
                  >
                    <BookOpen className="h-6 w-6 mx-auto mb-2 text-blue-900 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {translateSubject(subject)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews">
            <Card className="p-6 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('teachers.profile.reviews')} ({reviews.length})
                </h3>
              </div>

              {reviews.length === 0 ? (
                <div className="text-center py-8">
                  <Star className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('teachers.profile.noReviews')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          {review.student.avatar_url ? (
                            <img
                              src={review.student.avatar_url}
                              alt={review.student.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                                {review.student.full_name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {review.student.full_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(review.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400">
                        {review.review_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
