"use client"

import { useEffect, useState, Suspense, useRef } from "react"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Award, Clock, Target, TrendingUp } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { streakService } from "@/services/streakService"

interface SessionResult {
  id: string
  subject_id: string
  mode: string
  total_questions: number
  correct_answers: number
  started_at: string
  completed_at: string
  created_at: string
  subjects?: {
    name_en: string
    name_az: string
  }
}

interface QuestionAnswer {
  question_id: string
  selected_answer: string | null
  text_answer: string | null
  is_correct: boolean
  was_skipped: boolean
  time_spent: number
  questions: {
    question_text: string
    option_a: string
    option_b: string
    option_c: string
    option_d: string
    option_e: string
    correct_answer: string
    explanation: string | null
  }
}

function PracticeResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, locale } = useTranslation()
  const sessionId = searchParams.get('sessionId')
  
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionResult | null>(null)
  const [answers, setAnswers] = useState<QuestionAnswer[]>([])
  const streakUpdatedRef = useRef(false)

  useEffect(() => {
    if (sessionId) {
      loadResults()
    }

    // Prevent browser back button - replace history state
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
      // Redirect to practice page instead of going back
      router.replace('/student/practice')
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [sessionId])

  const loadResults = async () => {
    try {
      const supabase = createClient()

      // Get session details - handle potential 406 errors gracefully
      const { data: sessionData, error: sessionError } = await supabase
        .from("practice_sessions")
        .select(`
          *,
          subjects(name_en, name_az)
        `)
        .eq("id", sessionId)
        .single()

      if (sessionError) {
        console.error("Error loading session:", sessionError)
        // If session not found or relation error, redirect to practice
        router.replace('/student/practice')
        return
      }

      if (sessionData) {
        setSession(sessionData)

        // Update streak (only once per session view)
        if (!streakUpdatedRef.current) {
          streakUpdatedRef.current = true
          streakService.updateStreakRealtime('practice').catch(() => {})
        }

        // Get all answers for this session
        const { data: answersData } = await supabase
          .from("student_answers")
          .select(`
            *,
            questions(
              question_text,
              option_a,
              option_b,
              option_c,
              option_d,
              option_e,
              correct_answer,
              explanation
            )
          `)
          .eq("practice_session_id", sessionId)
          .order("answered_at")

        if (answersData) {
          setAnswers(answersData)
        }
      }
    } catch (error) {
      console.error("Error loading results:", error)
    } finally {
      setLoading(false)
    }
  }

  const calculateTimeSpent = () => {
    if (!session?.started_at || !session?.completed_at) return 0
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.completed_at).getTime()
    return Math.floor((end - start) / 1000)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400"
    if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return "Outstanding! 🎉"
    if (percentage >= 80) return "Excellent work! 👏"
    if (percentage >= 70) return "Good job! 👍"
    if (percentage >= 60) return "Keep practicing! 💪"
    return "Don't give up! 📚"
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('practice.results.sessionNotFound')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('practice.results.sessionNotFoundDesc')}
          </p>
          <Button onClick={() => router.push('/student/practice')}>{t('practice.results.backToPractice')}</Button>
        </Card>
      </div>
    )
  }

  const actualAnswers = answers.filter(a => !a.was_skipped)
  const skippedQuestions = answers.filter(a => a.was_skipped).length
  const incorrectAnswers = actualAnswers.length - session.correct_answers
  const accuracy = session.total_questions > 0
    ? Math.round((session.correct_answers / session.total_questions) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4">
            <Award className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('practice.results.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {locale === 'az' ? session.subjects?.name_az : session.subjects?.name_en || 'Subject'}
          </p>
        </div>

        {/* Score Card */}
        <Card className="p-8 mb-8 bg-white dark:bg-gray-800 text-center">
          <div className={`text-6xl font-bold mb-2 ${getScoreColor(accuracy)}`}>
            {accuracy}%
          </div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            {t(`practice.results.score${Math.floor(accuracy / 10) * 10}`)}
          </p>
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div>
              <div className="flex items-center justify-center mb-2">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {session.correct_answers}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('practice.results.correct')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {incorrectAnswers}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('practice.results.incorrect')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <Target className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {skippedQuestions}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('practice.results.skipped') || 'Skipped'}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-blue-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTime(calculateTimeSpent())}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('practice.results.time')}</p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex flex-col items-center space-y-4">
          <Button
            onClick={() => router.push(`/student/practice/session/${sessionId}/review`)}
            className="bg-blue-900 hover:bg-blue-800 text-white w-full max-w-md"
          >
            {t('practice.results.reviewAnswers')}
          </Button>
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              onClick={() => router.push('/student/practice')}
            >
              {t('practice.results.backToSubjects')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const subjectName = locale === 'az' ? session.subjects?.name_az : session.subjects?.name_en || 'Subject'
                router.push(`/student/practice/${session.subject_id}?name=${encodeURIComponent(subjectName)}`)
              }}
            >
              {t('practice.results.practiceAgain')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PracticeResultsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PracticeResultsContent />
    </Suspense>
  )
}
