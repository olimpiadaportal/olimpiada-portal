"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Search, 
  Star, 
  MapPin, 
  Clock, 
  Heart,
  Filter,
  ArrowLeft,
  CheckCircle,
  Users,
  BookOpen,
  X,
  Calendar,
} from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherService } from "@/services/teacherService"
import { TeacherWithDetails, TeacherFilters, ExamGroup } from "@/types/teacher"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'Literature', 'English',
  'Azerbaijani', 'Russian',
]

const GROUPS: ExamGroup[] = ['I', 'II', 'III', 'IV', 'V']

const SORT_OPTIONS = [
  { value: 'rating', labelKey: 'teachers.sortOptions.rating' },
  { value: 'price_low', labelKey: 'teachers.sortOptions.priceLow' },
  { value: 'price_high', labelKey: 'teachers.sortOptions.priceHigh' },
  { value: 'experience', labelKey: 'teachers.sortOptions.experience' },
  { value: 'reviews', labelKey: 'teachers.sortOptions.reviews' },
]

export default function TeachersListPage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const { isTeacherMarketplaceEnabled, loading: flagsLoading } = useFeatureFlagContext()
  
  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState<TeacherWithDetails[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubject, setSelectedSubject] = useState<string>('all')
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [sortBy, setSortBy] = useState<TeacherFilters['sort_by']>('rating')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    // Redirect if teacher marketplace is disabled
    if (!flagsLoading && !isTeacherMarketplaceEnabled) {
      router.push('/student/home')
      return
    }
    loadTeachers()
  }, [sortBy, flagsLoading, isTeacherMarketplaceEnabled])

  const loadTeachers = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      const data = await teacherService.getTeachers(user.id, {
        sort_by: sortBy,
      })
      
      setTeachers(data)
    } catch (error) {
      console.error("Error loading teachers:", error)
    } finally {
      setLoading(false)
    }
  }

  // Apply client-side filters
  const filteredTeachers = useMemo(() => {
    let filtered = [...teachers]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(teacher =>
        teacher.full_name.toLowerCase().includes(query) ||
        teacher.bio.toLowerCase().includes(query)
      )
    }

    if (selectedSubject && selectedSubject !== 'all') {
      filtered = filtered.filter(teacher =>
        teacher.specializations.includes(selectedSubject)
      )
    }

    if (selectedGroup && selectedGroup !== 'all') {
      filtered = filtered.filter(teacher =>
        teacher.available_groups.includes(selectedGroup as ExamGroup)
      )
    }

    return filtered
  }, [teachers, searchQuery, selectedSubject, selectedGroup])

  const handleToggleFavorite = async (teacherId: string) => {
    if (!userId) return

    const newStatus = await teacherService.toggleFavorite(teacherId, userId)
    
    setTeachers(prev => prev.map(teacher => 
      teacher.id === teacherId 
        ? { ...teacher, is_favorite: newStatus }
        : teacher
    ))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedSubject('all')
    setSelectedGroup('all')
    setSortBy('rating')
  }

  const hasActiveFilters = searchQuery || (selectedSubject !== 'all') || (selectedGroup !== 'all')

  const translateSubject = (subject: string) => {
    return t(`subjects.${subject.toLowerCase()}`) || subject
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/student/home')}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {t('teachers.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {t('teachers.subtitle')}
              </p>
            </div>
            <div className="hidden sm:flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push('/student/teachers/favorites')}
              >
                <Heart className="h-4 w-4 mr-2" />
                {t('teachers.favorites')}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/student/bookings')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                {t('teachers.myBookings')}
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('teachers.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter Toggle (Mobile) */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden"
            >
              <Filter className="h-4 w-4 mr-2" />
              {t('teachers.filters')}
            </Button>

            {/* Desktop Filters */}
            <div className="hidden sm:flex gap-2">
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t('teachers.allSubjects')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('teachers.allSubjects')}</SelectItem>
                  {SUBJECTS.map(subject => (
                    <SelectItem key={subject} value={subject}>
                      {translateSubject(subject)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('teachers.allGroups')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('teachers.allGroups')}</SelectItem>
                  {GROUPS.map(group => (
                    <SelectItem key={group} value={group}>
                      {t('teachers.group')} {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as TeacherFilters['sort_by'])}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mobile Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 sm:hidden">
              <div className="grid grid-cols-2 gap-2">
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('teachers.allSubjects')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allSubjects')}</SelectItem>
                    {SUBJECTS.map(subject => (
                      <SelectItem key={subject} value={subject}>
                        {translateSubject(subject)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('teachers.allGroups')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('teachers.allGroups')}</SelectItem>
                    {GROUPS.map(group => (
                      <SelectItem key={group} value={group}>
                        {t('teachers.group')} {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as TeacherFilters['sort_by'])}>
                  <SelectTrigger className="col-span-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {filteredTeachers.length} {t('teachers.teachersFound')}
        </div>

        {/* Teachers Grid */}
        {filteredTeachers.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teachers.noTeachers')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {hasActiveFilters 
                ? t('teachers.adjustFilters')
                : t('teachers.noTeachersAvailable')
              }
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                {t('teachers.clearFilters')}
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeachers.map((teacher) => (
              <Card 
                key={teacher.id} 
                className="p-6 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow"
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
                        {teacher.city || t('teachers.noCity')}
                        {teacher.is_same_city && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {t('teachers.sameCity')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleFavorite(teacher.id)
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Heart 
                      className={`h-5 w-5 ${teacher.is_favorite ? 'fill-red-500 text-red-500' : ''}`} 
                    />
                  </Button>
                </div>

                {/* Rating */}
                <div className="flex items-center mb-3">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-1" />
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {teacher.rating.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">
                    ({teacher.total_reviews} {t('teachers.reviews')})
                  </span>
                </div>

                {/* Specializations */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {teacher.specializations.slice(0, 3).map((subject) => (
                    <Badge key={subject} variant="outline" className="text-xs">
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
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {teacher.experience_years} {t('teachers.yearsExp')}
                  </div>
                  <div className="flex items-center">
                    <BookOpen className="h-4 w-4 mr-1" />
                    {teacher.total_students} {t('teachers.students')}
                  </div>
                </div>

                {/* View Profile Button */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <Button 
                    size="sm" 
                    className="w-full bg-blue-900 hover:bg-blue-800 text-white"
                    onClick={() => router.push(`/student/teachers/${teacher.id}`)}
                  >
                    {t('teachers.viewProfile')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
