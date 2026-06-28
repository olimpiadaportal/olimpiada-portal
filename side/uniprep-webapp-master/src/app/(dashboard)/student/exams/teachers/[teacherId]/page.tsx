"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  Clock,
  Target,
  Award,
  RotateCcw,
  Play,
  Star,
  BookOpen,
} from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherExamService } from "@/services/teacherExamService"
import { TeacherExam } from "@/types/teacherExam"

interface TeacherProfile {
  full_name: string
  avatar_url: string | null
  specializations: string[]
}

interface SubjectRow {
  id: string
  name_az: string
  name_en: string
  name_ru?: string
}

interface ExamWithAttempts extends TeacherExam {
  attempt_count: number
  best_score?: number
}

export default function TeacherExamListPage({
  params,
}: {
  params: Promise<{ teacherId: string }>
}) {
  const { teacherId } = use(params)
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null)
  const [exams, setExams] = useState<ExamWithAttempts[]>([])
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [subjectMap, setSubjectMap] = useState<Map<string, SubjectRow>>(new Map())

  useEffect(() => {
    loadData()
  }, [teacherId])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const [profile, examsData, reviewsData, subjectsData] = await Promise.all([
        teacherExamService.getTeacherPublicProfile(teacherId),
        teacherExamService.getTeacherApprovedExams(teacherId),
        (supabase as any)
          .from("teacher_reviews")
          .select("rating")
          .eq("teacher_id", teacherId),
        (supabase as any)
          .from("subjects")
          .select("id, name_az, name_en"),
      ])

      setTeacher(profile)

      // Build subject lookup map: name_az → full row (for specialization translation)
      const map = new Map<string, SubjectRow>()
      for (const s of (subjectsData.data || [])) {
        map.set(s.name_az, s)
        map.set(s.name_en, s)
      }
      setSubjectMap(map)

      // Compute avg rating
      const ratings = (reviewsData.data || []).map((r: any) => r.rating)
      if (ratings.length > 0) {
        setAvgRating(ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length)
      }

      // Enrich exams with attempt data
      if (examsData.length > 0) {
        const examIds = examsData.map((e: TeacherExam) => e.id)
        const { data: attempts } = await (supabase as any)
          .from("mock_exam_attempts")
          .select("id, mock_exam_id, status, total_score")
          .eq("user_id", user.id)
          .in("mock_exam_id", examIds)

        const enriched: ExamWithAttempts[] = examsData.map((exam: TeacherExam) => {
          const examAttempts = (attempts || []).filter((a: any) => a.mock_exam_id === exam.id)
          const completed = examAttempts.filter((a: any) => a.status === 'completed')
          const bestScore = completed.length > 0
            ? Math.max(...completed.map((a: any) => a.total_score || 0))
            : undefined
          return { ...exam, attempt_count: completed.length, best_score: bestScore }
        })
        setExams(enriched)
      }
    } catch (err) {
      console.error("Error loading teacher exams:", err)
    } finally {
      setLoading(false)
    }
  }

  // Translate a specialization string (stored as Azerbaijani subject name) to current locale
  const translateSpecialization = (spec: string): string => {
    const row = subjectMap.get(spec)
    if (!row) return spec
    if (locale === 'en') return row.name_en
    if (locale === 'ru') return (row as any).name_ru || row.name_en
    return row.name_az
  }

  const getExamTypeLabel = (type: string): string => {
    const key = `exams.types.${type}` as any
    const translated = t(key)
    // If translation returns the raw key (missing translation), fall back to a readable form
    if (!translated || translated === key) {
      return type.replace(/_/g, ' ')
    }
    return translated
  }

  const getExamTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'first_stage': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      case 'second_stage': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      case 'full_exam': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-6 animate-pulse" />
          <div className="h-28 bg-gray-200 dark:bg-gray-800 rounded-xl mb-8 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back */}
        <Button
          variant="ghost"
          onClick={() => router.push('/student/exams')}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>

        {/* Teacher profile card */}
        {teacher && (
          <Card className="p-6 bg-white dark:bg-gray-800 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center overflow-hidden shrink-0">
                {teacher.avatar_url ? (
                  <img
                    src={teacher.avatar_url}
                    alt={teacher.full_name}
                    className="w-16 h-16 object-cover rounded-full"
                  />
                ) : (
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-2xl">
                    {teacher.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{teacher.full_name}</h1>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <BookOpen className="h-4 w-4" />
                    {exams.length} {t('teacherExams.hub.exams')}
                  </span>
                  {avgRating && (
                    <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {avgRating.toFixed(1)}
                    </span>
                  )}
                  {teacher.specializations.slice(0, 3).map((s, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {translateSpecialization(s)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Exams grid */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          {t('teacherExams.hub.teacherSection')}
        </h2>

        {exams.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              {t('exams.noExams')}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <Card key={exam.id} className="p-6 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow">
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white line-clamp-2">
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

                <div className="space-y-3 mb-6 min-h-[100px]">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <Clock className="h-4 w-4 mr-2" />
                    <span>{exam.duration_minutes} {t('exams.duration') || 'min'}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <Target className="h-4 w-4 mr-2" />
                    <span>{exam.total_questions} {t('exams.questions')}</span>
                  </div>
                  {exam.attempt_count > 0 && (
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
                  onClick={() => router.push(`/student/exams/${exam.id}`)}
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
  )
}
