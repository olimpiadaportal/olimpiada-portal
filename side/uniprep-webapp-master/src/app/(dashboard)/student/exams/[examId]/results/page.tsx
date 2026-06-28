"use client"

import { useEffect, useState, use, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Award, Clock, Target, TrendingUp, CheckCircle, XCircle, AlertCircle, ArrowLeft, Star } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { streakService } from "@/services/streakService"
import { teacherExamService } from "@/services/teacherExamService"

interface SubjectPerformance {
  subject_id: string
  subject_name: string
  coefficient: number
  total_questions: number
  correct_answers: number
  raw_score: number
  weighted_score: number
  max_possible: number
  percentage: number
}

interface ExamResult {
  attempt_id: string
  mock_exam_id: string
  exam_title: string
  exam_type: string
  target_group: string
  started_at: string
  completed_at: string
  duration_minutes: number
  time_taken_minutes: number
  total_questions: number
  answered_questions: number
  correct_answers: number
  incorrect_answers: number
  unanswered_questions: number
  total_score: number
  max_possible_score: number
  percentage: number
  subject_performances: SubjectPerformance[]
  strengths: string[]
  weaknesses: string[]
  uses_teacher_questions?: boolean
  is_official?: boolean
}

export default function ExamResultsPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const resolvedParams = use(params)
  const examId = resolvedParams.examId
  
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [existingRating, setExistingRating] = useState<number | null>(null)
  const [pendingRating, setPendingRating] = useState(0)
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const streakUpdatedRef = useRef(false)
  const leaderboardUpdatedRef = useRef(false)

  useEffect(() => {
    loadResults()

    // Prevent browser back button - replace history state
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
      // Redirect to exams page instead of going back
      router.replace('/student/exams')
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [examId])

  const loadResults = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get the most recent completed attempt for this exam
      const { data: attempt, error: attemptError } = await supabase
        .from("mock_exam_attempts")
        .select("*, mock_exams(*)")
        .eq("mock_exam_id", examId)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single()

      if (!attempt) {
        router.push(`/student/exams/${examId}`)
        return
      }

      // Update streak (only once per results view)
      if (!streakUpdatedRef.current) {
        streakUpdatedRef.current = true
        streakService.updateStreakRealtime('exam').catch(() => {})
      }

      // Get subject scores
      const { data: subjectScores, error: scoresError } = await supabase
        .from("exam_subject_scores")
        .select("*, subjects(name_en, name_az)")
        .eq("attempt_id", attempt.id)

      // Get answers
      const { data: answers, error: answersError } = await supabase
        .from("exam_answers")
        .select("*")
        .eq("attempt_id", attempt.id)

      // Get actual question count from the exam (not the configured total)
      const { data: examQuestions } = await supabase
        .from("mock_exam_questions")
        .select("question_id")
        .eq("mock_exam_id", attempt.mock_exam_id)
      
      const actualTotalQuestions = attempt.mock_exams.uses_teacher_questions
        ? (attempt.mock_exams.total_questions || 0)
        : (examQuestions?.length || attempt.mock_exams.total_questions || 0)
      
      // Count answered questions - include both MCQ (selected_answer) and text (text_answer) answers
      const answeredQuestions = (answers || []).filter((a: any) => 
        a.selected_answer || a.text_answer
      ).length
      
      // Calculate correct answers from subject scores
      const correctAnswers = (subjectScores || []).reduce(
        (sum: number, s: any) => sum + (s.correct_answers || 0),
        0
      )
      
      // Calculate incorrect as answered minus correct (ensure non-negative)
      const incorrectAnswers = Math.max(0, answeredQuestions - correctAnswers)
      
      // Calculate unanswered/skipped
      const unansweredQuestions = Math.max(0, actualTotalQuestions - answeredQuestions)

      const subjectPerformances: SubjectPerformance[] = (subjectScores || []).map((s: any) => ({
        subject_id: s.subject_id,
        subject_name: locale === 'en' ? s.subjects.name_en : (s.subjects.name_az || s.subjects.name_en),
        coefficient: s.coefficient,
        total_questions: s.total_questions,
        correct_answers: s.correct_answers,
        raw_score: s.raw_score,
        weighted_score: s.weighted_score,
        max_possible: s.max_possible,
        percentage: s.percentage,
      }))

      const strengths = subjectPerformances
        .filter(s => s.percentage >= 70)
        .map(s => s.subject_name)
      const weaknesses = subjectPerformances
        .filter(s => s.percentage < 50)
        .map(s => s.subject_name)

      const timeTaken = Math.floor(
        (new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 1000 / 60
      )

      const maxPossibleScore =
        attempt.mock_exams.exam_type === 'first_stage'
          ? 300
          : attempt.mock_exams.exam_type === 'second_stage'
            ? 400
            : attempt.mock_exams.exam_type === 'full_exam'
              ? 700
              : actualTotalQuestions

      const resultData = {
        attempt_id: attempt.id,
        mock_exam_id: attempt.mock_exam_id,
        exam_title: attempt.mock_exams.title,
        exam_type: attempt.mock_exams.exam_type,
        target_group: attempt.mock_exams.target_group,
        started_at: attempt.started_at,
        completed_at: attempt.completed_at,
        duration_minutes: attempt.mock_exams.duration_minutes,
        time_taken_minutes: timeTaken,
        total_questions: actualTotalQuestions,
        answered_questions: answeredQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
        unanswered_questions: unansweredQuestions,
        total_score: attempt.total_score || 0,
        max_possible_score: maxPossibleScore,
        percentage: attempt.percentage || 0,
        subject_performances: subjectPerformances,
        strengths,
        weaknesses,
        uses_teacher_questions: attempt.mock_exams.uses_teacher_questions ?? false,
        is_official: attempt.mock_exams.is_official ?? true,
      }

      setResult(resultData)

      if (!leaderboardUpdatedRef.current && !resultData.uses_teacher_questions && resultData.is_official !== false) {
        leaderboardUpdatedRef.current = true

        const { data: student } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .single()

        if (student?.id) {
          const { error: leaderboardError } = await supabase.rpc("update_leaderboard_score_after_exam", {
            p_student_id: student.id,
            p_attempt_id: attempt.id,
          })

          if (leaderboardError) {
            console.error("Leaderboard score update failed from results fallback:", leaderboardError)
          }
        }
      }

      // Load existing rating if this is a teacher exam
      if (resultData.uses_teacher_questions) {
        const rating = await teacherExamService.getExamRating(attempt.id)
        setExistingRating(rating)
      }
    } catch (error) {
      // Error handled silently
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!result || pendingRating === 0 || submittingRating) return
    setSubmittingRating(true)
    try {
      await teacherExamService.submitExamRating(result.mock_exam_id, result.attempt_id, pendingRating)
      setExistingRating(pendingRating)
      setRatingSubmitted(true)
    } catch (error) {
      console.error('submitExamRating error:', error)
    } finally {
      setSubmittingRating(false)
    }
  }

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  }

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400"
    if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return t('exams.results.score90')
    if (percentage >= 80) return t('exams.results.score80')
    if (percentage >= 70) return t('exams.results.score70')
    if (percentage >= 60) return t('exams.results.score60')
    return t('exams.results.score0')
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('exams.results.notFound')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('exams.results.notFoundDesc')}
          </p>
          <Button onClick={() => router.push('/student/exams')}>
            {t('exams.results.backToExams')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push('/student/exams')}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('exams.results.backToExams')}
        </Button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4">
            <Award className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('exams.results.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {result.exam_title}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            {t('exams.results.group')} {result.target_group} • {t(`exams.types.${result.exam_type}`)}
          </p>
        </div>

        {/* Score Card */}
        <Card className="p-8 mb-8 bg-white dark:bg-gray-800 text-center">
          <div className={`text-6xl font-bold mb-2 ${getScoreColor(result.percentage)}`}>
            {Math.round(result.total_score)} / {result.max_possible_score}
          </div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
            {Math.round(result.percentage)}%
          </p>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            {getScoreMessage(result.percentage)}
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div>
              <div className="flex items-center justify-center mb-2">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {result.correct_answers}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('exams.results.correct')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <XCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {result.incorrect_answers}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('exams.results.incorrect')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <AlertCircle className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {result.unanswered_questions}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('exams.results.unanswered')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-blue-500 mr-2" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTime(result.time_taken_minutes)}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('exams.results.timeTaken')}</p>
            </div>
          </div>
        </Card>

        {/* Teacher exam rating */}
        {result.uses_teacher_questions && (
          <Card className="p-6 mb-8 bg-white dark:bg-gray-800 text-center">
            {existingRating !== null ? (
              <>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                  {t('exams.results.alreadyRated')}
                </p>
                <div className="flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-7 w-7 ${star <= existingRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
                    />
                  ))}
                </div>
              </>
            ) : ratingSubmitted ? (
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {t('exams.results.ratingSubmitted')}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('exams.results.rateThisExam')}
                </p>
                <div className="flex items-center justify-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setPendingRating(star)}
                      className="focus:outline-none"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${star <= pendingRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600 hover:text-amber-300'}`}
                      />
                    </button>
                  ))}
                </div>
                {pendingRating > 0 && (
                  <Button
                    onClick={handleSubmitRating}
                    disabled={submittingRating}
                    className="bg-blue-900 hover:bg-blue-800 text-white"
                  >
                    {submittingRating ? '...' : t('common.submit')}
                  </Button>
                )}
              </>
            )}
          </Card>
        )}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('exams.results.subjectPerformance')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {result.subject_performances.map((subject) => (
              <Card key={subject.subject_id} className="p-6 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {subject.subject_name}
                  </h3>
                  {subject.coefficient > 1 && (
                    <span className="px-2 py-1 text-xs font-semibold bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded">
                      {subject.coefficient}x
                    </span>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('exams.results.questionsAnswered')}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {subject.correct_answers} / {subject.total_questions}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {result.exam_type === 'individual'
                        ? t('exams.results.correctAnswers')
                        : t('exams.results.score')}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {Math.round(subject.weighted_score * 100) / 100} / {subject.max_possible}
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        subject.percentage >= 70 ? 'bg-green-500' :
                        subject.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(subject.percentage, 100)}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('exams.results.accuracy')}
                    </span>
                    <span className={`font-semibold ${getScoreColor(subject.percentage)}`}>
                      {Math.round(subject.percentage)}%
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Strengths and Weaknesses */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {result.strengths.length > 0 && (
            <Card className="p-6 bg-white dark:bg-gray-800">
              <div className="flex items-center mb-4">
                <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('exams.results.strengths')}
                </h3>
              </div>
              <ul className="space-y-2">
                {result.strengths.map((subject, index) => (
                  <li key={index} className="flex items-center text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    {subject}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          
          {result.weaknesses.length > 0 && (
            <Card className="p-6 bg-white dark:bg-gray-800">
              <div className="flex items-center mb-4">
                <Target className="h-5 w-5 text-red-500 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('exams.results.weaknesses')}
                </h3>
              </div>
              <ul className="space-y-2">
                {result.weaknesses.map((subject, index) => (
                  <li key={index} className="flex items-center text-gray-700 dark:text-gray-300">
                    <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                    {subject}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.push('/student/exams')}
          >
            {t('exams.results.backToExams')}
          </Button>
          <Button
            onClick={() => router.push(`/student/exams/${examId}/review?attemptId=${result.attempt_id}`)}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('exams.results.reviewAnswers')}
          </Button>
        </div>
      </div>
    </div>
  )
}
