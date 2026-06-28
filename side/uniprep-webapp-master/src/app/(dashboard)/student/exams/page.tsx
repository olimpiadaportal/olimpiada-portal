"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Target,
  Clock,
  Award,
  Filter,
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Star,
  Users,
  BookOpen,
} from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherExamService } from "@/services/teacherExamService"
import { RecommendedTeacher } from "@/types/teacherExam"

interface MockExam {
  id: string
  title: string
  exam_type: 'first_stage' | 'second_stage' | 'full_exam'
  target_group: 'I' | 'II' | 'III' | 'IV' | 'V'
  duration_minutes: number
  total_questions: number
  created_at: string
  attempt_count?: number
  best_score?: number
}

export default function ExamsPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<MockExam[]>([])
  const [filterType, setFilterType] = useState<'all' | 'first_stage' | 'second_stage'>('all')
  const [filterGroup, setFilterGroup] = useState<'all' | 'I' | 'II' | 'III' | 'IV' | 'V'>('all')
  const [teachers, setTeachers] = useState<RecommendedTeacher[]>([])
  const [teachersLoading, setTeachersLoading] = useState(true)

  useEffect(() => {
    loadExams()
  }, [filterType, filterGroup])

  useEffect(() => {
    loadTeachers()
  }, [])

  const loadExams = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      let query = (supabase as any)
        .from("mock_exams")
        .select("*")
        .is("created_by_teacher", null) // official exams only
        .order("created_at", { ascending: false })

      if (filterType !== 'all') {
        query = query.eq("exam_type", filterType)
      }

      if (filterGroup !== 'all') {
        query = query.eq("target_group", filterGroup)
      }

      const { data: examsData, error } = await query

      if (error) throw error

      const examIds = (examsData || []).map((e: any) => e.id)
      const { data: attempts } = await (supabase as any)
        .from("mock_exam_attempts")
        .select("id, mock_exam_id, status, total_score, completed_at, submitted_at")
        .eq("user_id", user.id)
        .in("mock_exam_id", examIds)

      // Clean up in-progress attempts in background
      const inProgressAttemptIds = (attempts || [])
        .filter((a: any) => a.status === 'in_progress' && !a.completed_at && !a.submitted_at)
        .map((a: any) => a.id)

      if (inProgressAttemptIds.length > 0) {
        Promise.all([
          (supabase as any).from("exam_answers").delete().in("attempt_id", inProgressAttemptIds),
          (supabase as any).from("mock_exam_attempts").delete().in("id", inProgressAttemptIds)
        ]).catch(err => console.warn("Background cleanup error:", err))
      }

      const examsWithStatus = (examsData || []).map((exam: any) => {
        const examAttempts = (attempts || []).filter((a: any) => a.mock_exam_id === exam.id)
        const completedAttempts = examAttempts.filter((a: any) => a.status === 'completed')
        const bestScore = completedAttempts.length > 0
          ? Math.max(...completedAttempts.map((a: any) => a.total_score || 0))
          : undefined

        return {
          ...exam,
          attempt_count: completedAttempts.length,
          best_score: bestScore,
        }
      })

      setExams(examsWithStatus)
    } catch (error) {
      console.error("Error loading exams:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeachers = async () => {
    setTeachersLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const data = await teacherExamService.getRecommendedTeachers(user.id)
      setTeachers(data)
    } catch (err) {
      console.error("Error loading teachers:", err)
    } finally {
      setTeachersLoading(false)
    }
  }

  const handleStartExam = (examId: string) => {
    router.push(`/student/exams/${examId}`)
  }

  const getExamTypeLabel = (type: string) => {
    return t(`exams.types.${type}` as any) || type
  }

  const getExamTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'first_stage': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      case 'second_stage': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      case 'full_exam': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/student/home')}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('exams.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('exams.description')}
          </p>
        </div>

        {/* ──────── Teacher Exams Section ──────── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('teacherExams.hub.teacherSection')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {t('teacherExams.hub.teacherSectionDesc')}
              </p>
            </div>
          </div>

          {teachersLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-56 h-36 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse shrink-0" />
              ))}
            </div>
          ) : teachers.length === 0 ? (
            <Card className="p-6 text-center bg-white dark:bg-gray-800">
              <Users className="h-10 w-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t('teacherExams.hub.noTeachers')}
              </p>
            </Card>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {teachers.map((teacher) => {
                const subjectLabels = teacher.subjects.slice(0, 2).map(s =>
                  locale === 'az' ? s.name_az : s.name_en
                )
                return (
                  <Card
                    key={teacher.teacher_id}
                    className="w-56 shrink-0 p-4 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => router.push(`/student/exams/teachers/${teacher.teacher_id}`)}
                  >
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center overflow-hidden shrink-0">
                        {teacher.avatar_url ? (
                          <img
                            src={teacher.avatar_url}
                            alt={teacher.full_name}
                            className="w-10 h-10 object-cover rounded-full"
                          />
                        ) : (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">
                            {teacher.full_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 leading-tight">
                        {teacher.full_name}
                      </p>
                    </div>

                    {/* Subjects */}
                    {subjectLabels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {subjectLabels.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs py-0">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        {teacher.exam_count} {t('teacherExams.hub.exams')}
                      </span>
                      {teacher.avg_rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          {Number(teacher.avg_rating).toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center text-blue-600 dark:text-blue-400 text-xs font-medium">
                      {t('common.viewAll')}
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* ──────── Official Elmly Exams Section ──────── */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            {t('teacherExams.hub.officialSection')}
          </h2>

          {/* Filters */}
          <Card className="p-6 mb-6 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('common.filters') || 'Filters'}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('exams.filters.examType') || 'Exam Type'}
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('all')}
                    className={filterType === 'all' ? 'bg-blue-900 hover:bg-blue-800 text-white' : 'dark:border-gray-600'}
                  >
                    {t('common.all') || 'All'}
                  </Button>
                  <Button
                    variant={filterType === 'first_stage' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('first_stage')}
                    className={filterType === 'first_stage' ? 'bg-blue-900 hover:bg-blue-800 text-white' : 'dark:border-gray-600'}
                  >
                    {t('exams.types.first_stage')}
                  </Button>
                  <Button
                    variant={filterType === 'second_stage' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('second_stage')}
                    className={filterType === 'second_stage' ? 'bg-blue-900 hover:bg-blue-800 text-white' : 'dark:border-gray-600'}
                  >
                    {t('exams.types.second_stage')}
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('exams.filters.targetGroup') || 'Target Group'}
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={filterGroup === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterGroup('all')}
                    className={filterGroup === 'all' ? 'bg-blue-900 hover:bg-blue-800 text-white' : 'dark:border-gray-600'}
                  >
                    {t('common.all') || 'All'}
                  </Button>
                  {['I', 'II', 'III', 'IV', 'V'].map((group) => (
                    <Button
                      key={group}
                      variant={filterGroup === group ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterGroup(group as any)}
                      className={filterGroup === group ? 'bg-blue-900 hover:bg-blue-800 text-white' : 'dark:border-gray-600'}
                    >
                      {group}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Official Exams Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : exams.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-gray-800">
              <Target className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {t('exams.noExams')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('exams.noExamsDesc') || 'Check back later for new mock exams'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map((exam) => (
                <Card key={exam.id} className="p-6 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow">
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {exam.title}
                      </h3>
                      <Badge className={getExamTypeBadgeColor(exam.exam_type)}>
                        {getExamTypeLabel(exam.exam_type)}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {t('exams.results.group')} {exam.target_group}
                    </Badge>
                  </div>

                  <div className="space-y-3 mb-6 min-h-[120px]">
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>{exam.duration_minutes} {t('exams.duration') || 'minutes'}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Target className="h-4 w-4 mr-2" />
                      <span>{exam.total_questions} {t('exams.questions')}</span>
                    </div>
                    {exam.attempt_count !== undefined && exam.attempt_count > 0 && (
                      <>
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <RotateCcw className="h-4 w-4 mr-2" />
                          <span>{exam.attempt_count} {t('exams.attempts')}</span>
                        </div>
                        {exam.best_score !== undefined && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Award className="h-4 w-4 mr-2" />
                            <span>{t('exams.bestScore')}: {Math.round(exam.best_score)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <Button
                    onClick={() => handleStartExam(exam.id)}
                    className="w-full bg-blue-900 hover:bg-blue-800 text-white"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {t('exams.startExam')}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
