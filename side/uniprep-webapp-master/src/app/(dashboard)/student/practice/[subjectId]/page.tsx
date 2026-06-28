"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { Question } from "@/types/practice"
import { TopicSelectionModal, TopicSelection } from "@/components/practice/TopicSelectionModal"
import { QuestionFeedbackModal } from "@/components/practice/QuestionFeedbackModal"
import { getQuestionsByTopics, getRandomQuestions, recordSkippedQuestion, upsertPracticeAnswerWithTiming } from "@/services/practiceService"
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  Clock,
  CheckCircle,
  XCircle,
  Grid3x3,
  BookOpen,
  Target,
  X,
  Flag
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

type Answer = string | null

// Utility function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function PracticeInterfacePage({ params, searchParams }: { params: Promise<{ subjectId: string }>, searchParams: Promise<{ name?: string, mode?: string, competitive?: string, sessionId?: string }> }) {
  const router = useRouter()
  const { t } = useTranslation()
  const resolvedParams = use(params)
  const resolvedSearchParams = use(searchParams)
  const subjectId = resolvedParams.subjectId
  const subjectName = resolvedSearchParams.name || 'Subject'
  const urlMode = resolvedSearchParams.mode as 'practice' | 'quiz' | undefined
  const isCompetitive = resolvedSearchParams.competitive === 'true'
  const competitiveSessionId = resolvedSearchParams.sessionId
  
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Map<string, Answer>>(new Map()) // Current selection
  const [submittedAnswers, setSubmittedAnswers] = useState<Map<string, Answer>>(new Map()) // Submitted answers
  const [textAnswer, setTextAnswer] = useState<string>('') // For codable_open questions
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set())
  const [showFeedback, setShowFeedback] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showPalette, setShowPalette] = useState(false)
  const [mode, setMode] = useState<'practice' | 'quiz'>(urlMode || 'practice')
  const [showModeSelector, setShowModeSelector] = useState(!urlMode && !isCompetitive)
  const [showExitModal, setShowExitModal] = useState(false)
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [topicSelection, setTopicSelection] = useState<TopicSelection | null>(null)
  const [topicsConfirmed, setTopicsConfirmed] = useState(isCompetitive)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)
  const finishInFlightRef = useRef(false)
  const questionTimesRef = useRef<Map<string, number>>(new Map())
  const activeQuestionIdRef = useRef<string | null>(null)
  const activeQuestionStartedAtRef = useRef<number | null>(null)

  const commitActiveQuestionTime = () => {
    const activeQuestionId = activeQuestionIdRef.current
    const startedAt = activeQuestionStartedAtRef.current
    if (!activeQuestionId || !startedAt) return

    const elapsedMs = Math.max(0, Date.now() - startedAt)
    if (elapsedMs > 0) {
      questionTimesRef.current.set(
        activeQuestionId,
        (questionTimesRef.current.get(activeQuestionId) || 0) + elapsedMs
      )
    }
    activeQuestionStartedAtRef.current = Date.now()
  }

  const activateQuestionTimer = (questionId?: string) => {
    if (activeQuestionIdRef.current && activeQuestionIdRef.current !== questionId) {
      commitActiveQuestionTime()
    }

    activeQuestionIdRef.current = questionId || null
    activeQuestionStartedAtRef.current = questionId ? Date.now() : null
  }

  const getQuestionTime = (questionId: string) => {
    const storedMs = questionTimesRef.current.get(questionId) || 0
    const activeMs = activeQuestionIdRef.current === questionId && activeQuestionStartedAtRef.current
      ? Math.max(0, Date.now() - activeQuestionStartedAtRef.current)
      : 0

    return Math.max(0, Math.round((storedMs + activeMs) / 1000))
  }

  // Check for competitive mode session on mount
  useEffect(() => {
    if (isCompetitive && competitiveSessionId) {
      const sessionData = sessionStorage.getItem('competitive_session')
      if (sessionData) {
        try {
          const { questions: competitiveQuestions } = JSON.parse(sessionData)
          if (competitiveQuestions && competitiveQuestions.length > 0) {
            // Map questions to match expected format
            const formattedQuestions = competitiveQuestions.map((q: any, index: number) => ({
              id: q.id || `competitive-${index}`,
              question_text: q.question_text || q.questionText,
              question_type: 'mcq',
              option_a: q.option_a || q.optionA,
              option_b: q.option_b || q.optionB,
              option_c: q.option_c || q.optionC,
              option_d: q.option_d || q.optionD,
              option_e: q.option_e || q.optionE,
              correct_answer: q.correct_answer || q.correctAnswer,
              explanation: q.explanation,
              topic: q.topic,
              difficulty: q.difficulty,
            }))
            setQuestions(formattedQuestions)
            setSessionId(competitiveSessionId)
            setLoading(false)
            setTopicsConfirmed(true)
            // DON'T clear session storage - keep it for page refreshes
            return
          }
        } catch (error) {
          // Failed to parse competitive session
        }
      }
      // If no session data found, redirect back to competitive mode
      router.push('/student/competitive')
    }
  }, [isCompetitive, competitiveSessionId, router])

  // Timer for competitive mode
  useEffect(() => {
    if (isCompetitive && questions.length > 0) {
      const interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1)
      }, 1000)

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
        clearInterval(interval)
        window.removeEventListener('popstate', handlePopState)
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [isCompetitive, questions.length])

  useEffect(() => {
    // Skip loading if competitive mode (already loaded above)
    if (isCompetitive) return
    
    if (!showModeSelector && !showTopicModal && topicsConfirmed && topicSelection !== null) {
      loadQuestions(topicSelection)
      
      // Timer
      const interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1)
      }, 1000)

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
        clearInterval(interval)
        window.removeEventListener('popstate', handlePopState)
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [showModeSelector, showTopicModal, topicSelection, topicsConfirmed])

  const loadQuestions = async (selection: TopicSelection) => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Create practice session with start time
      const startTime = new Date().toISOString()
      const { data: session } = await supabase
        .from("practice_sessions")
        .insert({
          user_id: user.id,
          subject_id: subjectId,
          mode: mode,
          total_questions: 0,
          correct_answers: 0,
          started_at: startTime,
        } as any)
        .select()
        .single()

      if (session) {
        setSessionId(session.id)
      }

      // Get questions based on mode: 10 for practice, 30 for quiz
      const questionLimit = mode === 'practice' ? 10 : 30

      // Get questions - either by topics/subtopics or random
      let allQuestionsData: any[] = []
      const hasSelection = selection.topicNames.length > 0 || selection.subtopicIds.length > 0
      if (hasSelection) {
        allQuestionsData = await getQuestionsByTopics(subjectId, selection.topicNames, questionLimit, selection.subtopicIds)
      } else {
        allQuestionsData = await getRandomQuestions(subjectId, questionLimit)
      }

      if (allQuestionsData && allQuestionsData.length > 0) {
        let selectedQuestions = allQuestionsData

        // Randomize option order for MCQ questions only (not for codable_open)
        const optionKeys: ('A' | 'B' | 'C' | 'D' | 'E')[] = ['A', 'B', 'C', 'D', 'E']
        selectedQuestions = selectedQuestions.map((q) => {
          const questionType = q.question_type || 'mcq'
          
          // Skip shuffling for codable_open questions
          if (questionType === 'codable_open') {
            return q
          }
          
          // Create array of options with their original keys
          const options = [
            { key: 'A' as const, text: q.option_a },
            { key: 'B' as const, text: q.option_b },
            { key: 'C' as const, text: q.option_c },
            { key: 'D' as const, text: q.option_d },
            { key: 'E' as const, text: q.option_e },
          ]

          // Shuffle options
          const shuffledOptions = shuffleArray(options)

          // Find new position of correct answer
          const correctOriginalKey = q.correct_answer
          const newCorrectIndex = shuffledOptions.findIndex(opt => opt.key === correctOriginalKey)
          const newCorrectAnswer = optionKeys[newCorrectIndex]

          // Return question with shuffled options
          return {
            ...q,
            option_a: shuffledOptions[0].text,
            option_b: shuffledOptions[1].text,
            option_c: shuffledOptions[2].text,
            option_d: shuffledOptions[3].text,
            option_e: shuffledOptions[4].text,
            correct_answer: newCorrectAnswer,
          }
        })

        questionTimesRef.current = new Map()
        activeQuestionIdRef.current = null
        activeQuestionStartedAtRef.current = null
        setQuestions(selectedQuestions as Question[])
        activateQuestionTimer(selectedQuestions[0]?.id)
        
        // Save question_ids and shuffled questions data to the session
        // This ensures the review page displays options in the same order as the test
        if (session) {
          const questionIds = selectedQuestions.map((q: any) => q.id)
          // Save shuffled question data (options and correct_answer) for review page
          const shuffledQuestionsData = selectedQuestions.map((q: any) => ({
            id: q.id,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            option_e: q.option_e,
            correct_answer: q.correct_answer,
          }))
          await supabase
            .from("practice_sessions")
            .update({ 
              question_ids: questionIds,
              shuffled_questions: shuffledQuestionsData,
            } as any)
            .eq("id", session.id)
        }
      }
    } catch (error) {
      // Error loading questions
    } finally {
      setLoading(false)
    }
  }

  // Load answer when question changes
  useEffect(() => {
    if (!questions[currentIndex]) return
    activateQuestionTimer(questions[currentIndex].id)
    
    const currentQuestion = questions[currentIndex]
    const questionType = currentQuestion.question_type || 'mcq'
    const previousAnswer = submittedAnswers.get(currentQuestion.id)
    
    if (questionType === 'codable_open') {
      setTextAnswer(previousAnswer || '')
      // Clear MCQ selection
      const newSelectedAnswers = new Map(selectedAnswers)
      newSelectedAnswers.delete(currentQuestion.id)
      setSelectedAnswers(newSelectedAnswers)
    } else {
      setTextAnswer('')
      // Load MCQ selection
      if (previousAnswer) {
        const newSelectedAnswers = new Map(selectedAnswers)
        newSelectedAnswers.set(currentQuestion.id, previousAnswer)
        setSelectedAnswers(newSelectedAnswers)
      }
    }
    
    // Show feedback if question was already submitted
    const isSubmitted = submittedAnswers.has(currentQuestion.id)
    setShowFeedback(isSubmitted && mode === 'practice')
  }, [currentIndex, questions])

  const handleAnswerSelect = (answer: Answer) => {
    const currentQuestion = questions[currentIndex]
    
    // In practice mode, can't change answer if already submitted
    // In quiz/competitive mode, can change answer until finish
    if (mode === 'practice' && submittedAnswers.has(currentQuestion.id)) return
    
    const newSelectedAnswers = new Map(selectedAnswers)
    newSelectedAnswers.set(currentQuestion.id, answer)
    setSelectedAnswers(newSelectedAnswers)
    
    // In quiz/competitive mode, auto-save to submittedAnswers (no separate submit step)
    if (mode === 'quiz' || isCompetitive) {
      const newSubmittedAnswers = new Map(submittedAnswers)
      newSubmittedAnswers.set(currentQuestion.id, answer)
      setSubmittedAnswers(newSubmittedAnswers)
    }
  }
  
  const handleTextAnswerChange = (text: string) => {
    setTextAnswer(text)
    // Auto-save to selectedAnswers Map
    if (text.trim()) {
      const currentQuestion = questions[currentIndex]
      const newSelectedAnswers = new Map(selectedAnswers)
      newSelectedAnswers.set(currentQuestion.id, text.trim())
      setSelectedAnswers(newSelectedAnswers)
      
      // In quiz/competitive mode, auto-save to submittedAnswers (no separate submit step)
      if (mode === 'quiz' || isCompetitive) {
        const newSubmittedAnswers = new Map(submittedAnswers)
        newSubmittedAnswers.set(currentQuestion.id, text.trim())
        setSubmittedAnswers(newSubmittedAnswers)
      }
    }
  }

  const handleSubmit = () => {
    commitActiveQuestionTime()
    const currentQuestion = questions[currentIndex]
    const questionType = currentQuestion.question_type || 'mcq'
    const answer = questionType === 'codable_open' ? textAnswer.trim() : selectedAnswers.get(currentQuestion.id)
    
    if (!answer) return
    
    // Mark as submitted
    const newSubmittedAnswers = new Map(submittedAnswers)
    newSubmittedAnswers.set(currentQuestion.id, answer)
    setSubmittedAnswers(newSubmittedAnswers)
    
    // Show feedback in practice mode
    if (mode === 'practice') {
      setShowFeedback(true)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      commitActiveQuestionTime()
      // Track skipped questions (not submitted and not already skipped)
      const currentQ = questions[currentIndex]
      if (currentQ && !submittedAnswers.has(currentQ.id) && !skippedQuestionIds.has(currentQ.id)) {
        setSkippedQuestionIds(prev => new Set(prev).add(currentQ.id))
      }
      setCurrentIndex(currentIndex + 1)
      setShowFeedback(false)
    }
  }

  const isQuestionSubmitted = (questionId: string) => {
    return submittedAnswers.has(questionId)
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      commitActiveQuestionTime()
      setCurrentIndex(currentIndex - 1)
      // Show feedback if this question was already submitted
      const prevQuestion = questions[currentIndex - 1]
      setShowFeedback(submittedAnswers.has(prevQuestion.id) && mode === 'practice')
    }
  }

  const handleGoBack = () => {
    router.push('/student/practice')
  }

  const handleBookmark = () => {
    const currentQuestion = questions[currentIndex]
    const newBookmarked = new Set(bookmarked)
    
    if (newBookmarked.has(currentQuestion.id)) {
      newBookmarked.delete(currentQuestion.id)
    } else {
      newBookmarked.add(currentQuestion.id)
    }
    
    setBookmarked(newBookmarked)
  }

  const handleModeSelect = (selectedMode: 'practice' | 'quiz') => {
    setMode(selectedMode)
    setShowModeSelector(false)
    setShowTopicModal(true)
  }

  const handleTopicConfirm = (selection: TopicSelection) => {
    setTopicSelection(selection)
    setShowTopicModal(false)
    setTopicsConfirmed(true)
  }

  const handleFinish = async () => {
    if (!sessionId) return
    if (finishInFlightRef.current) return

    finishInFlightRef.current = true
    setFinishing(true)
    commitActiveQuestionTime()

    try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const correctCount = Array.from(submittedAnswers.entries()).filter(
      ([questionId, answer]) => {
        const question = questions.find(q => q.id === questionId)
        if (!question || !answer) return false
        
        const questionType = question.question_type || 'mcq'
        // Case-insensitive comparison for codable_open
        if (questionType === 'codable_open') {
          return answer.toLowerCase() === question.correct_answer.toLowerCase()
        }
        return answer === question.correct_answer
      }
    ).length

    // Handle competitive mode differently
    if (isCompetitive) {
      // Update competitive_sessions table
      const { error: updateError } = await supabase
        .from("competitive_sessions")
        .update({
          correct_answers: correctCount,
          total_time_seconds: timeElapsed,
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId)

      // Continue even if update fails

      // Navigate to competitive results with data in session storage
      const resultsData = {
        sessionId,
        subjectName,
        questions,
        answers: Object.fromEntries(submittedAnswers),
        correctCount,
        totalQuestions: questions.length,
        timeElapsed,
      }
      sessionStorage.setItem('competitive_results', JSON.stringify(resultsData))
      router.push(`/student/competitive/results?sessionId=${sessionId}`)
      return
    }

    // Standard practice/quiz mode
    const { error: updateError } = await supabase
      .from("practice_sessions")
      .update({
        total_questions: questions.length,
        correct_answers: correctCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)

    if (updateError) {
      finishInFlightRef.current = false
      setFinishing(false)
      return
    }
    
    // Save answered questions through the canonical RPC so revisits update one answer row.
    for (const [questionId, answer] of submittedAnswers.entries()) {
      const question = questions.find(q => q.id === questionId)
      if (!question || !answer) continue
      
      const questionType = question.question_type || 'mcq'
      const isMCQ = ['A', 'B', 'C', 'D', 'E'].includes(answer)
      
      // Case-insensitive comparison for codable_open
      const isCorrect = questionType === 'codable_open'
        ? answer.toLowerCase() === question.correct_answer.toLowerCase()
        : answer === question.correct_answer
      
      await upsertPracticeAnswerWithTiming({
        sessionId,
        questionId,
        selectedAnswer: isMCQ ? answer : null,
        textAnswer: isMCQ ? null : answer,
        isCorrect,
        timeSpentSeconds: getQuestionTime(questionId),
        answeredAt: new Date().toISOString(),
      })
    }

    // Record skipped questions with was_skipped=true for adaptive algorithm
    // Include both tracked skips AND any question never answered (e.g. last question skipped via Finish)
    if (user?.id && sessionId) {
      const allSkipped = questions
        .filter(q => !submittedAnswers.has(q.id))
        .map(q => q.id)

      for (const qId of allSkipped) {
        await recordSkippedQuestion(user.id, qId, sessionId, getQuestionTime(qId))
      }
    }

    // Navigate to results
    router.push(`/student/practice/results?sessionId=${sessionId}`)
    } catch (error) {
      console.error('Error finishing practice session:', error)
      finishInFlightRef.current = false
      setFinishing(false)
    }
  }

  const handleExitPractice = async () => {
    // Delete the incomplete session so it doesn't count
    if (sessionId) {
      const supabase = createClient()
      await supabase
        .from("practice_sessions")
        .delete()
        .eq("id", sessionId)
    }
    
    // Navigate back to practice subjects
    router.push('/student/practice')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getOptionClass = (option: Answer) => {
    const currentQuestion = questions[currentIndex]
    const selectedAnswer = selectedAnswers.get(currentQuestion?.id)
    const submittedAnswer = submittedAnswers.get(currentQuestion?.id)
    const isSubmitted = submittedAnswers.has(currentQuestion?.id)
    
    if (!isSubmitted || !showFeedback) {
      return selectedAnswer === option
        ? "border-blue-900 bg-blue-50 dark:bg-blue-900/20"
        : "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600"
    }

    // Show feedback for submitted answer
    if (option === currentQuestion.correct_answer) {
      return "border-green-500 bg-green-50 dark:bg-green-900/20"
    }
    if (submittedAnswer === option && option !== currentQuestion.correct_answer) {
      return "border-red-500 bg-red-50 dark:bg-red-900/20"
    }
    return "border-gray-200 dark:border-gray-700"
  }
  
  const isAnswerCorrect = () => {
    const currentQuestion = questions[currentIndex]
    const submittedAnswer = submittedAnswers.get(currentQuestion?.id)
    if (!submittedAnswer) return false
    
    const questionType = currentQuestion.question_type || 'mcq'
    // Case-insensitive comparison for codable_open
    if (questionType === 'codable_open') {
      return submittedAnswer.toLowerCase() === currentQuestion.correct_answer.toLowerCase()
    }
    return submittedAnswer === currentQuestion.correct_answer
  }

  // Mode Selector Screen
  if (showModeSelector) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="max-w-2xl w-full p-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-2">
              {subjectName}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-8">
              {t('practice.modeSelector.title')}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Practice Mode */}
            <Card
              className="p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 cursor-pointer transition-all"
              onClick={() => handleModeSelect('practice')}
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4">
                  <BookOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {t('practice.modeSelector.practiceMode')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {t('practice.modeSelector.practiceModeDescription')}
                </p>
              </div>
            </Card>

            {/* Quiz Mode */}
            <Card
              className="p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-600 cursor-pointer transition-all"
              onClick={() => handleModeSelect('quiz')}
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-full mb-4">
                  <Target className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {t('practice.modeSelector.quizMode')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {t('practice.modeSelector.quizModeDescription')}
                </p>
              </div>
            </Card>
          </div>

          <div className="text-center mt-6">
            <Button 
              variant="outline" 
              onClick={() => router.push('/student/practice')}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 px-6 py-2"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              {t('practice.modeSelector.backToSubjects')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <>
        <DashboardSkeleton />
        <TopicSelectionModal
          visible={showTopicModal}
          onClose={() => {
            setShowTopicModal(false)
            setShowModeSelector(true)
          }}
          onConfirm={handleTopicConfirm}
          subjectId={subjectId}
          subjectName={subjectName}
          mode={mode}
          questionCount={mode === 'practice' ? 10 : 30}
        />
      </>
    )
  }

  if (questions.length === 0) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('practice.interface.noQuestions')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('practice.interface.noQuestionsDescription')}
            </p>
            <Button onClick={() => router.back()}>{t('practice.interface.goBack')}</Button>
          </Card>
        </div>
        <TopicSelectionModal
          visible={showTopicModal}
          onClose={() => {
            setShowTopicModal(false)
            setShowModeSelector(true)
          }}
          onConfirm={handleTopicConfirm}
          subjectId={subjectId}
          subjectName={subjectName}
          mode={mode}
          questionCount={mode === 'practice' ? 10 : 30}
        />
      </>
    )
  }

  const currentQuestion = questions[currentIndex]
  const selectedAnswer = selectedAnswers.get(currentQuestion.id)
  const isBookmarked = bookmarked.has(currentQuestion.id)
  const progress = ((currentIndex + 1) / questions.length) * 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {subjectName}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('practice.interface.question')} {currentIndex + 1} {t('practice.interface.of')} {questions.length}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-gray-600 dark:text-gray-400">
                <Clock className="h-5 w-5 mr-2" />
                <span className="font-mono">{formatTime(timeElapsed)}</span>
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
        </div>

        {/* Question Palette */}
        {showPalette && (
          <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
            <div className="grid grid-cols-10 gap-2">
              {questions.map((q, idx) => {
                const answered = submittedAnswers.has(q.id)
                const isBookmarked = bookmarked.has(q.id)
                
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      commitActiveQuestionTime()
                      setCurrentIndex(idx)
                      const isSubmitted = submittedAnswers.has(q.id)
                      setShowFeedback(isSubmitted && mode === 'practice')
                      setShowPalette(false)
                    }}
                    className={`
                      h-10 rounded-lg font-semibold text-sm transition-colors relative
                      ${idx === currentIndex 
                        ? 'bg-blue-900 text-white' 
                        : answered 
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }
                    `}
                  >
                    {idx + 1}
                    {isBookmarked && (
                      <BookmarkCheck className="h-3 w-3 absolute top-0 right-0 text-orange-500" />
                    )}
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
              <p className="text-lg text-gray-900 dark:text-white leading-relaxed">
                {currentQuestion.question_text}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFeedbackModal(true)}
                className="text-gray-400 hover:text-red-500"
                title={t('practice.questionFeedback.title')}
              >
                <Flag className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBookmark}
                className={isBookmarked ? "text-orange-500" : "text-gray-400"}
              >
                {isBookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Conditional Rendering: Text Input for Codable Open, MCQ Options for MCQ */}
          {(currentQuestion.question_type === 'codable_open') ? (
            /* Text Input for Codable Open */
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('practice.interface.yourAnswer') || 'Your Answer'}
              </label>
              <input
                type="text"
                value={textAnswer}
                onChange={(e) => handleTextAnswerChange(e.target.value)}
                placeholder={t('practice.interface.typeAnswer') || 'Type your answer'}
                disabled={submittedAnswers.has(currentQuestion.id) && mode === 'practice' && !isCompetitive}
                className={`
                  w-full px-4 py-3 border-2 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
                  text-gray-900 dark:text-white bg-white dark:bg-gray-800
                  ${submittedAnswers.has(currentQuestion.id) && showFeedback
                    ? isAnswerCorrect()
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                  }
                `}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          ) : (
            /* MCQ Options */
            <div className="space-y-3">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((option) => {
                const isSubmitted = submittedAnswers.has(currentQuestion.id)
                // In competitive/quiz mode, allow changing answers (don't disable)
                const shouldDisable = isSubmitted && mode === 'practice' && !isCompetitive
                return (
                <button
                  key={option}
                  onClick={() => handleAnswerSelect(option)}
                  disabled={shouldDisable}
                  className={`
                    w-full p-4 rounded-lg border-2 text-left transition-all
                    ${getOptionClass(option)}
                    ${shouldDisable ? 'cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-center">
                    <span className="font-bold text-gray-900 dark:text-white mr-3">
                      {option}.
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {currentQuestion[`option_${option.toLowerCase()}` as keyof Question]}
                    </span>
                    {showFeedback && option === currentQuestion.correct_answer && (
                      <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />
                    )}
                    {showFeedback && selectedAnswer === option && option !== currentQuestion.correct_answer && (
                      <XCircle className="h-5 w-5 text-red-500 ml-auto" />
                    )}
                  </div>
                </button>
              )})}
            </div>
          )}

          {/* Submit Button - Only show in practice mode (quiz/competitive auto-saves) */}
          {mode === 'practice' && !isCompetitive && !submittedAnswers.has(currentQuestion.id) && (
            (currentQuestion.question_type === 'codable_open' ? textAnswer.trim() : selectedAnswers.has(currentQuestion.id))
          ) && (
            <div className="mt-6">
              <Button
                onClick={handleSubmit}
                className="w-full bg-blue-900 hover:bg-blue-800 text-white"
              >
                {t('practice.interface.submitAnswer')}
              </Button>
            </div>
          )}

          {/* Feedback */}
          {showFeedback && submittedAnswers.has(currentQuestion.id) && (
            <div className={`mt-6 p-4 rounded-lg ${
              isAnswerCorrect()
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <p className={`font-semibold ${
                isAnswerCorrect()
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {isAnswerCorrect() ? `✓ ${t('practice.interface.correct')}` : `✗ ${t('practice.interface.incorrect')}`}
              </p>
              {currentQuestion.question_type === 'codable_open' && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('practice.interface.yourAnswer') || 'Your Answer'}: <span className="font-medium">{submittedAnswers.get(currentQuestion.id)}</span>
                  </p>
                  {!isAnswerCorrect() && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('practice.interface.correctAnswerLabel')}: <span className="font-medium text-green-600 dark:text-green-400">{currentQuestion.correct_answer}</span>
                    </p>
                  )}
                </div>
              )}
              {currentQuestion.question_type !== 'codable_open' && (
                <>
                  {!isAnswerCorrect() && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('practice.interface.correctAnswerLabel')}: {currentQuestion.correct_answer}
                    </p>
                  )}
                  {currentQuestion.explanation && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      <span className="font-medium">{t('practice.interface.explanation') || 'Explanation'}:</span> {currentQuestion.explanation}
                    </p>
                  )}
                </>
              )}
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
            {t('practice.interface.previous')}
          </Button>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            {submittedAnswers.size} / {questions.length} {t('practice.interface.answeredLabel')}
          </div>

          {/* Quiz/Competitive mode: Next Question or Submit Quiz at the end */}
          {(mode === 'quiz' || isCompetitive) ? (
            currentIndex === questions.length - 1 ? (
              <Button
                onClick={handleFinish}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={finishing}
              >
                {finishing ? t('common.loading') : (isCompetitive ? t('competitive.submitQuiz') || 'Submit Quiz' : t('practice.interface.finishPractice'))}
                {!finishing && <ChevronRight className="h-4 w-4 ml-2" />}
              </Button>
            ) : (
              <Button onClick={handleNext} className="bg-blue-900 hover:bg-blue-800 text-white">
                {t('practice.interface.nextQuestion')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )
          ) : (
            /* Practice mode: Show feedback flow */
            currentIndex === questions.length - 1 ? (
              <Button
                onClick={handleFinish}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={submittedAnswers.size === 0 || finishing}
              >
                {finishing ? t('common.loading') : t('practice.interface.finishPractice')}
              </Button>
            ) : showFeedback && submittedAnswers.has(currentQuestion.id) ? (
              <Button onClick={handleNext} className="bg-blue-900 hover:bg-blue-800 text-white">
                {t('practice.interface.nextQuestion')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleNext} variant="outline">
                {t('practice.interface.skip')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )
          )}
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      <AlertDialog open={showExitModal} onOpenChange={setShowExitModal}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              {t('practice.exit.title') || 'Exit Practice?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              {t('practice.exit.description') || 'Your progress will not be saved. Are you sure you want to exit?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExitPractice}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('practice.exit.confirm') || 'Exit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Topic Selection Modal */}
      <TopicSelectionModal
        visible={showTopicModal}
        onClose={() => {
          setShowTopicModal(false)
          setShowModeSelector(true)
        }}
        onConfirm={handleTopicConfirm}
        subjectId={subjectId}
        subjectName={subjectName}
        mode={mode}
        questionCount={mode === 'practice' ? 10 : 30}
      />

      {/* Question Feedback Modal */}
      {currentQuestion && (
        <QuestionFeedbackModal
          open={showFeedbackModal}
          questionId={currentQuestion.id}
          onClose={() => setShowFeedbackModal(false)}
        />
      )}
    </div>
  )
}
