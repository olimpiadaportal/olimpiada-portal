"use client"

import { use, useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { ContextFlipCard } from "@/components/shared/ContextFlipCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Grid3x3,
  Bookmark,
  BookmarkCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Timer,
  CheckSquare,
  Bell
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { Question } from "@/types/practice"

type Answer = string | null

interface ExamQuestion extends Omit<Question, 'topic'> {
  subject_name?: string
  question_order: number
  context_text?: string
  context_image_url?: string
  group_order?: number
}

interface MockExam {
  id: string
  title: string
  exam_type: string
  target_group: string
  duration_minutes: number
  total_questions: number
}

interface ExamAttempt {
  id: string
  user_id: string
  mock_exam_id: string
  status: string
  time_remaining_seconds: number
  started_at: string
}


export default function ExamInterfacePage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const resolvedParams = use(params)
  const examId = resolvedParams.examId
  
  const [loading, setLoading] = useState(true)
  const [showInstructions, setShowInstructions] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [startingExam, setStartingExam] = useState(false)
  const [exam, setExam] = useState<MockExam | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Map<string, Answer>>(new Map())
  const [textAnswer, setTextAnswer] = useState<string>('')
  const [markedQuestions, setMarkedQuestions] = useState<Set<string>>(new Set())
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showPalette, setShowPalette] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const [submittingExam, setSubmittingExam] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [timerReady, setTimerReady] = useState(false) // Flag to trigger timer start
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const timersStartedRef = useRef(false)
  const submitInFlightRef = useRef(false)

  useEffect(() => {
    loadExamMetadata()
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [])

  // Start timers only once when timerReady flag is set
  useEffect(() => {
    if (timerReady && !timersStartedRef.current) {
      timersStartedRef.current = true

      // Start countdown timer
      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Clear timers before auto-submit
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
            if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
            handleAutoSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Start auto-save timer (every 30 seconds)
      autoSaveTimerRef.current = setInterval(() => {
        handleAutoSave()
      }, 30000)

      // Prevent browser back button
      window.history.pushState(null, '', window.location.href)
      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault()
        window.history.pushState(null, '', window.location.href)
        setShowExitModal(true)
      }
      window.addEventListener('popstate', handlePopState)

      // Prevent page refresh/close without confirmation
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
        window.removeEventListener('popstate', handlePopState)
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [timerReady])

  // Phase 1: Load exam metadata and check for existing attempt
  const loadExamMetadata = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get exam details
      const { data: examData, error: examError } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("id", examId)
        .single()

      if (examError || !examData) throw new Error("Exam not found")
      setExam(examData as MockExam)

      // No resume feature - always start fresh (matches mobile app behavior)
      // Delete any existing in-progress attempts for this exam
      await supabase
        .from("mock_exam_attempts")
        .delete()
        .eq("user_id", user.id)
        .eq("mock_exam_id", examId)
        .eq("status", "in_progress")

      // Always show instructions for a new exam
      setShowInstructions(true)
      setLoading(false)
    } catch (error) {
      console.error("Error loading exam:", error)
      setLoading(false)
    }
  }

  // Called when user clicks "Begin Exam" from instructions
  const handleBeginExam = async () => {
    if (!exam) return
    setStartingExam(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await loadExamData(supabase, user.id, exam)
      setShowInstructions(false)
    } catch (error) {
      console.error("Error starting exam:", error)
    } finally {
      setStartingExam(false)
    }
  }

  // Phase 2: Create new attempt and load questions
  const loadExamData = async (supabase: any, userId: string, examData: any) => {
    try {
      // Always create a new attempt (no resume feature)
      const { data: newAttempt, error: attemptError } = await supabase
        .from("mock_exam_attempts")
        .insert([{
          user_id: userId,
          mock_exam_id: examId,
          status: "in_progress",
          time_remaining_seconds: examData.duration_minutes * 60,
          started_at: new Date().toISOString(),
        }])
        .select()
        .single()

      if (attemptError) throw attemptError
      const currentAttemptId = (newAttempt as ExamAttempt).id
      setTimeRemaining(examData.duration_minutes * 60)

      setAttemptId(currentAttemptId)
      
      // Signal that timer is ready to start (after attemptId and timeRemaining are set)
      setTimerReady(true)

      // Get exam questions — branch on teacher vs official exam
      let formattedQuestions: ExamQuestion[]

      if (examData.uses_teacher_questions) {
        // Teacher exam: use get_teacher_exam_questions RPC
        const { data: teacherQs, error: rpcError } = await supabase
          .rpc('get_teacher_exam_questions', { p_exam_id: examId })

        if (rpcError) throw rpcError

        formattedQuestions = (teacherQs || []).map((item: any) => ({
          id: item.question_id,
          question_text: item.question_text,
          question_type: item.question_type || 'mcq',
          question_image_url: null,
          group_id: null,
          group_order: null,
          option_a: item.option_a,
          option_b: item.option_b,
          option_c: item.option_c,
          option_d: item.option_d,
          option_e: item.option_e,
          correct_answer: item.correct_answer,
          explanation: item.explanation,
          difficulty: item.difficulty,
          subject_id: item.subject_id,
          subject_name: item.subject_name,
          question_order: item.question_order,
          context_text: undefined,
          context_image_url: undefined,
        }))
      } else {
        // Official exam: query mock_exam_questions
        const { data: questionsData, error: questionsError } = await supabase
          .from("mock_exam_questions")
          .select(`
            question_order,
            questions (
              id,
              subject_id,
              question_text,
              question_type,
              question_image_url,
              group_id,
              group_order,
              option_a,
              option_b,
              option_c,
              option_d,
              option_e,
              correct_answer,
              difficulty,
              subjects (name_en, name_az),
              question_groups (
                context_text,
                context_image_url
              )
            )
          `)
          .eq("mock_exam_id", examId)
          .order("question_order")

        if (questionsError) throw questionsError

        formattedQuestions = (questionsData || []).map((item) => ({
          ...item.questions,
          subject_name: locale === 'az' ? (item.questions.subjects?.name_az || item.questions.subjects?.name_en) : item.questions.subjects?.name_en,
          question_order: item.question_order,
          context_text: item.questions.question_groups?.context_text,
          context_image_url: item.questions.question_groups?.context_image_url,
          group_order: item.questions.group_order,
        }))
      }

      setQuestions(formattedQuestions)
    } catch (error) {
      console.error("Error loading exam:", error)
    } finally {
      setLoading(false)
    }
  }

  // Load answer when question changes
  useEffect(() => {
    if (!questions[currentIndex]) return
    
    const currentQuestion = questions[currentIndex]
    const questionType = currentQuestion.question_type || 'mcq'
    const previousAnswer = selectedAnswers.get(currentQuestion.id)
    
    // Restore text answer for both codable_open and written_open questions
    if (questionType === 'codable_open' || questionType === 'written_open') {
      setTextAnswer(previousAnswer || '')
    } else {
      setTextAnswer('')
    }
  }, [currentIndex, questions, selectedAnswers])

  const handleAnswerSelect = (answer: Answer) => {
    const currentQuestion = questions[currentIndex]
    const newAnswers = new Map(selectedAnswers)
    newAnswers.set(currentQuestion.id, answer)
    setSelectedAnswers(newAnswers)
  }
  
  const handleTextAnswerChange = (text: string) => {
    setTextAnswer(text)
    // Auto-save to selectedAnswers Map
    if (text.trim()) {
      const currentQuestion = questions[currentIndex]
      const newAnswers = new Map(selectedAnswers)
      newAnswers.set(currentQuestion.id, text.trim())
      setSelectedAnswers(newAnswers)
    }
  }

  const handleMarkQuestion = () => {
    const currentQuestion = questions[currentIndex]
    const newMarked = new Set(markedQuestions)
    
    if (newMarked.has(currentQuestion.id)) {
      newMarked.delete(currentQuestion.id)
    } else {
      newMarked.add(currentQuestion.id)
    }
    
    setMarkedQuestions(newMarked)
  }

  const handleAutoSave = async () => {
    if (!attemptId) return

    const supabase = createClient()
    
    // Build batch of answers to upsert
    const answersToUpsert: any[] = []
    for (const [questionId, answer] of selectedAnswers.entries()) {
      if (!answer) continue
      
      const isMCQ = ['A', 'B', 'C', 'D', 'E'].includes(answer)
      
      answersToUpsert.push({
        attempt_id: attemptId,
        question_id: questionId,
        ...(isMCQ ? { selected_answer: answer } : { text_answer: answer }),
        is_marked: markedQuestions.has(questionId),
        answered_at: new Date().toISOString(),
      })
    }

    // Batch upsert all answers at once (much faster than sequential)
    if (answersToUpsert.length > 0) {
      await supabase
        .from("exam_answers")
        .upsert(answersToUpsert as any, {
          onConflict: 'attempt_id,question_id'
        })
    }

    // Update time remaining
    const updateData: Record<string, number> = { time_remaining_seconds: timeRemaining }
    await supabase
      .from("mock_exam_attempts")
      .update(updateData as never)
      .eq("id", attemptId)
  }

  const handleAutoSubmit = async () => {
    if (!attemptId) return
    if (submitInFlightRef.current) return
    submitInFlightRef.current = true
    setSubmittingExam(true)
    
    // Clear all timers immediately
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    
    try {
      await handleAutoSave()
    } catch (error) {
      console.warn('Auto-save error during auto-submit:', error)
    }
    
    // Navigate to results - use replace to prevent back button issues
    router.replace(`/student/exams/${examId}/results?attemptId=${attemptId}`)
  }

  const handleSubmit = async () => {
    if (!attemptId) return
    if (submitInFlightRef.current) return
    submitInFlightRef.current = true
    setSubmittingExam(true)

    setShowSubmitDialog(false)
    
    // Clear all timers immediately to prevent any interference
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    
    // Count question types for grading screen BEFORE any async operations
    const mcqCount = questions.filter(q => q.question_type === 'mcq' || !q.question_type).length
    const codableCount = questions.filter(q => q.question_type === 'codable_open').length
    const writtenCount = questions.filter(q => q.question_type === 'written_open').length
    const gradingUrl = `/student/exams/${examId}/grading?attemptId=${attemptId}&mcq=${mcqCount}&codable=${codableCount}&written=${writtenCount}`
    
    try {
      // Save any pending answers first (with timeout to prevent hanging)
      const savePromise = handleAutoSave()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
      
      await Promise.race([savePromise, timeoutPromise]).catch(err => {
        console.warn('Auto-save warning:', err)
        // Continue anyway - grading page will handle any missing data
      })
      
      // Navigate to grading screen - use replace to prevent back button issues
      router.replace(gradingUrl)
    } catch (error) {
      console.error('Error submitting exam:', error)
      // Still navigate to grading even on error - better than getting stuck
      router.replace(gradingUrl)
    }
  }

  const handleExitExam = async () => {
    // Delete the incomplete attempt so it doesn't count
    if (attemptId) {
      const supabase = createClient()
      // Delete exam answers first
      await supabase
        .from("exam_answers")
        .delete()
        .eq("attempt_id", attemptId)
      // Then delete the attempt
      await supabase
        .from("mock_exam_attempts")
        .delete()
        .eq("id", attemptId)
    }
    
    // Navigate back to exams list
    router.push('/student/exams')
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getTimeWarningColor = () => {
    if (timeRemaining <= 300) return 'text-red-600 dark:text-red-400' // 5 minutes
    if (timeRemaining <= 600) return 'text-orange-600 dark:text-orange-400' // 10 minutes
    return 'text-gray-600 dark:text-gray-400'
  }

  const getQuestionStatus = (questionId: string) => {
    if (selectedAnswers.has(questionId)) return 'answered'
    if (markedQuestions.has(questionId)) return 'marked'
    return 'unanswered'
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Instructions screen — shown before starting a new exam
  if (showInstructions && exam) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <Card className="p-8 bg-white dark:bg-gray-800">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {t('exams.instructions.title') || 'Exam Instructions'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">{exam.title}</p>
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="h-4 w-4 mr-1" />
                  {exam.duration_minutes} {t('exams.duration') || 'minutes'}
                </div>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <FileText className="h-4 w-4 mr-1" />
                  {exam.total_questions} {t('exams.questions') || 'questions'}
                </div>
              </div>
            </div>

            {/* Timed Notice */}
            <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg mb-6">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-orange-700 dark:text-orange-300">
                {t('exams.instructions.timedNotice') || 'This is a timed exam. Once you begin, the timer will start and cannot be paused.'}
              </p>
            </div>

            {/* Rules */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('exams.instructions.examRules') || 'Exam Rules'}
              </h2>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((num) => (
                  <div key={num} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white">{num}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t(`exams.instructions.rule${num}Title`)}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {(t(`exams.instructions.rule${num}Description`, { duration: String(exam.duration_minutes), totalQuestions: String(exam.total_questions) }) || '')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timer Warnings */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {t('exams.instructions.timerWarnings') || 'Timer Warnings'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('exams.instructions.timerWarningsDescription')}
              </p>
              <div className="space-y-2">
                {['warning10min', 'warning5min', 'warning1min'].map((key) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Bell className="h-4 w-4 text-orange-500" />
                    <span className="text-gray-700 dark:text-gray-300">{t(`exams.instructions.${key}`)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring */}
            <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {t('exams.instructions.scoring') || 'Scoring'}
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <ChevronRight className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300">{t('exams.instructions.correctAnswer')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <X className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300">{t('exams.instructions.wrongAnswer')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center">
                    <span className="text-[10px] text-white font-bold">?</span>
                  </div>
                  <span className="text-gray-700 dark:text-gray-300">{t('exams.instructions.unanswered')}</span>
                </div>
              </div>
            </div>

            {/* Confirmation Checkbox */}
            <button
              onClick={() => setUnderstood(!understood)}
              className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all mb-6 ${
                understood
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
              }`}
            >
              <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                understood
                  ? 'bg-blue-900 border-blue-900'
                  : 'border-gray-400 dark:border-gray-500'
              }`}>
                {understood && <CheckSquare className="h-4 w-4 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white text-left">
                {t('exams.instructions.confirmationText') || 'I have read and understood all the instructions'}
              </span>
            </button>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/student/exams')}
                className="flex-1"
              >
                {t('common.back') || 'Back'}
              </Button>
              <Button
                onClick={handleBeginExam}
                disabled={!understood || startingExam}
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-50"
              >
                {startingExam ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading') || 'Loading...'}
                  </span>
                ) : (
                  t('exams.instructions.beginExam') || 'Begin Exam'
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('exams.notFound') || 'Exam not found'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('exams.notFoundDesc') || 'This exam could not be loaded.'}
          </p>
          <Button 
            onClick={() => router.push('/student/exams')}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('exams.backToExams') || 'Back to Exams'}
          </Button>
        </Card>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('exams.noQuestions') || 'No questions available'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('exams.noQuestionsDesc') || 'This exam does not have any questions yet. Please try again later.'}
          </p>
          <Button 
            onClick={() => router.push('/student/exams')}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('exams.backToExams') || 'Back to Exams'}
          </Button>
        </Card>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const selectedAnswer = selectedAnswers.get(currentQuestion.id)
  const isMarked = markedQuestions.has(currentQuestion.id)
  const progress = ((currentIndex + 1) / questions.length) * 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {exam.title}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('exams.interface.question')} {currentIndex + 1} {t('exams.interface.of')} {questions.length}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center font-mono text-lg font-bold ${getTimeWarningColor()}`}>
                <Clock className="h-5 w-5 mr-2" />
                <span>{formatTime(timeRemaining)}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExitModal(true)}
                className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
              >
                <X className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPalette(!showPalette)}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-900 transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {/* Time Warning */}
          {timeRemaining <= 600 && (
            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mr-2" />
              <span className="text-sm text-orange-700 dark:text-orange-300">
                {timeRemaining <= 300 ? 'Less than 5 minutes remaining!' : 'Less than 10 minutes remaining!'}
              </span>
            </div>
          )}
        </div>

        {/* Question Palette */}
        {showPalette && (
          <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Question Navigator</h3>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-100 dark:bg-green-900/20 border-2 border-green-500 rounded mr-2"></div>
                  <span className="text-gray-600 dark:text-gray-400">Answered</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-orange-100 dark:bg-orange-900/20 border-2 border-orange-500 rounded mr-2"></div>
                  <span className="text-gray-600 dark:text-gray-400">Marked</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded mr-2"></div>
                  <span className="text-gray-600 dark:text-gray-400">Unanswered</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-10 gap-2">
              {questions.map((q, idx) => {
                const status = getQuestionStatus(q.id)
                
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx)
                      setShowPalette(false)
                    }}
                    className={`
                      h-10 rounded-lg font-semibold text-sm transition-colors
                      ${idx === currentIndex 
                        ? 'bg-blue-900 text-white' 
                        : status === 'answered'
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-2 border-green-500' 
                          : status === 'marked'
                            ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-2 border-orange-500'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-gray-300 dark:border-gray-600'
                      }
                    `}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          </Card>
        )}

        {/* Question Card */}
        <Card className="p-6 mb-6 bg-white dark:bg-gray-800">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <Badge className="mb-2" variant="outline">
                {currentQuestion.subject_name || 'Subject'}
              </Badge>
              
              {/* Context Text for Written Open Questions (Situasiya) */}
              {currentQuestion.question_type === 'written_open' && currentQuestion.context_text && (
                <ContextFlipCard
                  contextText={currentQuestion.context_text}
                  contextImageUrl={currentQuestion.context_image_url}
                  labelText={`📝 ${t('exams.interface.situation') || 'Situation'}:`}
                  tapToSeeImageText={t('exams.review.tapToSeeImage') || 'Click to see figure'}
                  tapToSeeTextText={t('exams.review.tapToSeeText') || 'Click to see text'}
                />
              )}
              
              <p className="text-lg text-gray-900 dark:text-white leading-relaxed">
                {currentQuestion.question_text}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMarkQuestion}
              className={isMarked ? "text-orange-500" : "text-gray-400"}
            >
              {isMarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
            </Button>
          </div>

          {/* Conditional Rendering: Text Input for Codable/Written Open, MCQ Options for MCQ */}
          {currentQuestion.question_type === 'codable_open' ? (
            /* Text Input for Codable Open */
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('exams.interface.yourAnswer') || 'Your Answer'}
              </label>
              <input
                type="text"
                value={textAnswer}
                onChange={(e) => handleTextAnswerChange(e.target.value)}
                placeholder={t('exams.interface.typeAnswer') || 'Type your answer'}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          ) : currentQuestion.question_type === 'written_open' ? (
            /* Textarea for Written Open (Situasiya) */
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ✍️ {t('exams.interface.yourAnswer') || 'Your Answer'}
              </label>
              <textarea
                value={textAnswer}
                onChange={(e) => handleTextAnswerChange(e.target.value)}
                placeholder={t('exams.interface.writeDetailedAnswer') || 'Write your detailed answer here...'}
                rows={8}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  text-gray-900 dark:text-white bg-white dark:bg-gray-800
                  resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                💡 {t('exams.interface.writtenOpenHint') || 'This question will be graded by AI. Write a clear and detailed answer.'}
              </p>
            </div>
          ) : (
            /* MCQ Options */
            <div className="space-y-3">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => handleAnswerSelect(option)}
                  className={`
                    w-full p-4 rounded-lg border-2 text-left transition-all
                    ${selectedAnswer === option
                      ? 'border-blue-900 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
                    }
                    cursor-pointer
                  `}
                >
                  <div className="flex items-center">
                    <span className="font-bold text-gray-900 dark:text-white mr-3">
                      {option}.
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {currentQuestion[`option_${option.toLowerCase()}` as keyof ExamQuestion]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('exams.interface.previous') || 'Previous'}
          </Button>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedAnswers.size} / {questions.length} {t('exams.interface.answered') || 'answered'}
          </div>

          {currentIndex === questions.length - 1 ? (
            <Button
              onClick={() => {
                if (!submittingExam) setShowSubmitDialog(true)
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={submittingExam}
            >
              {submittingExam ? t('common.loading') : (t('exams.interface.submit') || 'Submit Exam')}
            </Button>
          ) : (
            <Button onClick={handleNext} className="bg-blue-900 hover:bg-blue-800 text-white">
              {t('exams.interface.next') || 'Next'}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Submit Confirmation Dialog */}
        {showSubmitDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="p-6 bg-white dark:bg-gray-800 max-w-md mx-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {t('exams.interface.confirmSubmit') || 'Submit Exam?'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('exams.interface.confirmSubmitDesc', { answered: String(selectedAnswers.size), total: String(questions.length) }) || 
                  `You have answered ${selectedAnswers.size} out of ${questions.length} questions. Are you sure you want to submit?`}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowSubmitDialog(false)}
                  className="flex-1"
                  disabled={submittingExam}
                >
                  {t('exams.interface.cancel') || 'Cancel'}
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={submittingExam}
                >
                  {submittingExam ? t('common.loading') : (t('exams.interface.submit') || 'Submit')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Exit Confirmation Modal */}
        <AlertDialog open={showExitModal} onOpenChange={setShowExitModal}>
          <AlertDialogContent className="bg-white dark:bg-gray-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-gray-900 dark:text-white">
                {t('exams.exit.title') || 'Exit Exam?'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
                {t('exams.exit.description') || 'Your progress will not be saved and this attempt will be cancelled. Are you sure you want to exit?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600">
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleExitExam}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {t('exams.exit.confirm') || 'Exit'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
