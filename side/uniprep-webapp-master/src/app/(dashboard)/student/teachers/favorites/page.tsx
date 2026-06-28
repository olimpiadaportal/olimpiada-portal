"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  ArrowLeft,
  Search,
  Star, 
  MapPin, 
  Heart,
  CheckCircle,
  Users,
} from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherService } from "@/services/teacherService"
import { TeacherWithDetails } from "@/types/teacher"

export default function FavoriteTeachersPage() {
  const { t } = useTranslation()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState<TeacherWithDetails[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadFavoriteTeachers()
  }, [])

  const loadFavoriteTeachers = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      // Get all teachers and filter to favorites only
      const allTeachers = await teacherService.getTeachers(user.id)
      const favoriteTeachers = allTeachers.filter(t => t.is_favorite)
      setTeachers(favoriteTeachers)
    } catch (error) {
      console.error("Error loading favorite teachers:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFavorite = async (e: React.MouseEvent, teacherId: string) => {
    e.stopPropagation()
    if (!userId) return

    const newStatus = await teacherService.toggleFavorite(teacherId, userId)
    
    if (!newStatus) {
      // Remove from list if unfavorited
      setTeachers(prev => prev.filter(t => t.id !== teacherId))
    }
  }

  const translateSubject = (subject: string) => {
    return t(`subjects.${subject.toLowerCase()}`) || subject
  }

  // Filter teachers based on search
  const filteredTeachers = teachers.filter(teacher => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      teacher.full_name.toLowerCase().includes(query) ||
      teacher.bio.toLowerCase().includes(query) ||
      teacher.specializations.some(s => s.toLowerCase().includes(query))
    )
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/student/teachers')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Heart className="h-8 w-8 text-red-500 fill-red-500" />
                {t('teachers.favoriteTeachers')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {t('teachers.favoriteTeachersSubtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('teachers.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {filteredTeachers.length} {t('teachers.favoriteTeachersCount')}
        </div>

        {/* Teachers Grid */}
        {filteredTeachers.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teachers.noFavorites')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('teachers.noFavoritesDescription')}
            </p>
            <Button onClick={() => router.push('/student/teachers')}>
              {t('teachers.browseTeachers')}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeachers.map((teacher) => (
              <Card 
                key={teacher.id} 
                className="p-6 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push(`/student/teachers/${teacher.id}`)}
              >
                {/* Teacher Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      {teacher.avatar_url ? (
                        <img
                          src={teacher.avatar_url}
                          alt={teacher.full_name}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                          <span className="text-xl font-bold text-blue-900 dark:text-blue-400">
                            {teacher.full_name.charAt(0)}
                          </span>
                        </div>
                      )}
                      {teacher.is_verified && (
                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5">
                          <CheckCircle className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {teacher.full_name}
                      </h3>
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <MapPin className="h-3 w-3 mr-1" />
                        {teacher.city}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleToggleFavorite(e, teacher.id)}
                    className="text-red-500"
                  >
                    <Heart className="h-5 w-5 fill-current" />
                  </Button>
                </div>

                {/* Rating */}
                <div className="flex items-center mb-3">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-1" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {teacher.rating.toFixed(1)}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">
                    ({teacher.total_reviews} {t('teachers.reviews')})
                  </span>
                </div>

                {/* Specializations */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {teacher.specializations.slice(0, 3).map((subject) => (
                    <Badge key={subject} variant="secondary" className="text-xs">
                      {translateSubject(subject)}
                    </Badge>
                  ))}
                  {teacher.specializations.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{teacher.specializations.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {teacher.total_students} {t('teachers.students')}
                  </div>
                  <div className="font-semibold text-blue-900 dark:text-blue-400">
                    ₼{teacher.hourly_rate}/{t('teachers.hour')}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
