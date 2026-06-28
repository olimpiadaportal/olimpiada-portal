"use client"

import { useEffect, useState, use } from "react"
import { useRouter, useParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { CheckCircle, XCircle, ChevronLeft, ArrowLeft, Filter, Target, Flag } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { AIExplainButton } from "@/components/ai/AIExplainButton"
import { QuestionFeedbackModal } from "@/components/practice/QuestionFeedbackModal"
import { createClient } from "@/lib/supabase/client"

interface QuestionReview {
  question_id: string
  question_text: string
  question_type?: 'mcq' | 'codable_open' | 'written_open'
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string
  correct_answer: string
  selected_answer: string | null
  text_answer: string | null
  is_correct: boolean
  is_skipped: boolean
  subject_name: string
  difficulty: string
  explanation?: string
}

type FilterType = 'all' | 'correct' | 'incorrect' | 'skipped'

export default function PracticeReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const resolvedParams = use(params)
  const sessionId = resolvedParams.sessionId
  
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<QuestionReview[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [subjectName, setSubjectName] = useState<string>('')
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null)

  useEffect(() => {
    loadReview()
  }, [sessionId])

  const loadReview = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get session details with question_ids - handle potential 406 errors gracefully
      const { data: session, error: sessionError } = await supabase
        .from("practice_sessions")
        .select("*, subjects(name_en, name_az)")
        .eq("id", sessionId)
        .single()

      if (sessionError || !session) {
        console.error("Error loading session:", sessionError)
        router.replace("/student/practice")
        return
      }

      setSubjectName(locale === 'az' ? session.subjects?.name_az : session.subjects?.name_en)

      // Get user's answers with questions
      const { data: answers } = await supabase
        .from("student_answers")
        .select(`
          *,
          questions(
            id,
            question_text,
            question_type,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_answer,
            explanation,
            difficulty,
            subjects(name_en, name_az)
          )
        `)
        .eq("practice_session_id", sessionId)
        .order("answered_at")

      // Create a map of answered questions
      const answersMap = new Map<string, any>()
      ;(answers || []).forEach((answer: any) => {
        answersMap.set(answer.question_id, answer)
      })

      // Get all questions from the session's question_ids
      const questionIds = session.question_ids || []
      // Get shuffled questions data (options in the order shown during test)
      const shuffledQuestionsData = (session as any).shuffled_questions || []
      const shuffledQuestionsMap = new Map<string, any>()
      shuffledQuestionsData.forEach((sq: any) => {
        shuffledQuestionsMap.set(sq.id, sq)
      })
      
      let allQuestions: any[] = []
      
      if (questionIds.length > 0) {
        const { data: questionsData } = await supabase
          .from("questions")
          .select(`
            id,
            question_text,
            question_type,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_answer,
            explanation,
            difficulty,
            subjects(name_en, name_az)
          `)
          .in("id", questionIds)
        
        allQuestions = questionsData || []
      }

      // Build review questions in order, including skipped ones
      const reviewQuestions: QuestionReview[] = questionIds.map((questionId: string) => {
        const question = allQuestions.find((q: any) => q.id === questionId)
        const answer = answersMap.get(questionId)
        // Get shuffled options if available (to show options in same order as test)
        const shuffledData = shuffledQuestionsMap.get(questionId)
        
        if (!question) return null
        
        const isAnswered = answer && (answer.selected_answer || (answer.text_answer && answer.text_answer.trim() !== ''))
        const isCorrect = isAnswered ? answer.is_correct : false
        const isSkipped = !isAnswered

        // Use shuffled options if available, otherwise use original
        return {
          question_id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          option_a: shuffledData?.option_a || question.option_a,
          option_b: shuffledData?.option_b || question.option_b,
          option_c: shuffledData?.option_c || question.option_c,
          option_d: shuffledData?.option_d || question.option_d,
          option_e: shuffledData?.option_e || question.option_e,
          correct_answer: shuffledData?.correct_answer || question.correct_answer,
          selected_answer: answer?.selected_answer || null,
          text_answer: answer?.text_answer || null,
          is_correct: isCorrect,
          is_skipped: isSkipped,
          subject_name: locale === 'az' ? question.subjects?.name_az : question.subjects?.name_en,
          difficulty: question.difficulty,
          explanation: question.explanation,
        }
      }).filter((q: QuestionReview | null): q is QuestionReview => q !== null)

      setQuestions(reviewQuestions)
    } catch (error) {
      console.error("Error loading review:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredQuestions = questions.filter(q => {
    if (filter === 'correct' && !q.is_correct) return false
    if (filter === 'incorrect' && (q.is_correct || q.is_skipped)) return false
    if (filter === 'skipped' && !q.is_skipped) return false
    return true
  })

  const stats = {
    total: questions.length,
    correct: questions.filter(q => q.is_correct).length,
    incorrect: questions.filter(q => !q.is_correct && !q.is_skipped).length,
    skipped: questions.filter(q => q.is_skipped).length,
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push(`/student/practice/results?sessionId=${sessionId}`)}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('practice.review.backToResults')}
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('practice.review.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {subjectName}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('practice.review.total')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.correct}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('practice.review.correct')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.incorrect}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('practice.review.incorrect')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.skipped}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('practice.review.skipped') || 'Skipped'}</div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('practice.review.filters')}
            </h3>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              className={filter === 'all' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              {t('practice.review.all')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'correct' ? 'default' : 'outline'}
              onClick={() => setFilter('correct')}
              className={filter === 'correct' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {t('practice.review.correctOnly')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'incorrect' ? 'default' : 'outline'}
              onClick={() => setFilter('incorrect')}
              className={filter === 'incorrect' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {t('practice.review.incorrectOnly')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'skipped' ? 'default' : 'outline'}
              onClick={() => setFilter('skipped')}
              className={filter === 'skipped' ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              {t('practice.review.skippedOnly') || 'Skipped Only'}
            </Button>
          </div>
        </Card>

        {/* Questions */}
        <div className="space-y-6">
          {filteredQuestions.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                {t('practice.review.noQuestions')}
              </p>
            </Card>
          ) : (
            filteredQuestions.map((question, index) => (
              <Card
                key={question.question_id}
                className={`p-6 bg-white dark:bg-gray-800 border-2 ${
                  question.is_skipped
                    ? 'border-orange-200 dark:border-orange-800'
                    : question.is_correct
                    ? 'border-green-200 dark:border-green-800'
                    : 'border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    {question.is_skipped ? (
                      <Target className="h-6 w-6 text-orange-500 mt-1" />
                    ) : question.is_correct ? (
                      <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-500 mt-1" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('practice.review.question')} {questions.findIndex(q => q.question_id === question.question_id) + 1}
                      </h3>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t(`common.difficulty.${question.difficulty}`)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFeedbackQuestionId(question.question_id)}
                    className="text-gray-400 hover:text-red-500 shrink-0"
                    title={t('practice.questionFeedback.title')}
                  >
                    <Flag className="h-5 w-5" />
                  </Button>
                </div>

                <p className="text-gray-900 dark:text-white mb-4 text-lg">
                  {question.question_text}
                </p>

                {/* Conditional Rendering: Text Answer for Codable Open, MCQ Options for MCQ */}
                {question.question_type === 'codable_open' ? (
                  /* Text Answer Display for Codable Open */
                  <div className="space-y-3">
                    <div className={`p-4 rounded-lg border-2 ${
                      question.is_skipped
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : question.is_correct
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    }`}>
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t('practice.review.yourAnswer') || 'Your Answer'}:
                          </p>
                          <p className={`text-lg font-semibold ${
                            question.is_skipped
                              ? 'text-orange-700 dark:text-orange-400'
                              : question.is_correct
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}>
                            {question.is_skipped 
                              ? (t('practice.review.skippedAnswer') || 'Skipped')
                              : (question.text_answer || t('practice.review.noAnswer'))}
                          </p>
                        </div>
                        {!question.is_correct && (
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {t('practice.review.correctAnswer') || 'Correct Answer'}:
                            </p>
                            <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                              {question.correct_answer}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Explain Button for incorrect codable_open answers (not skipped) */}
                    {!question.is_correct && !question.is_skipped && (
                      <div className="mt-4">
                        <AIExplainButton
                          questionId={question.question_id}
                          questionText={question.question_text}
                          studentAnswer={question.text_answer || ''}
                          correctAnswer={question.correct_answer}
                          subject={question.subject_name}
                          difficulty={question.difficulty}
                          isCorrect={question.is_correct}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* MCQ Options Display */
                  <div className="space-y-2">
                    {['A', 'B', 'C', 'D', 'E'].map((option) => {
                      const isCorrect = option === question.correct_answer
                      const isSelected = option === question.selected_answer
                      
                      return (
                        <div
                          key={option}
                          className={`p-4 rounded-lg border-2 ${
                            isCorrect
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                              : isSelected
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 flex-1">
                              <span className="font-bold text-gray-900 dark:text-white">
                                {option}.
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {question[`option_${option.toLowerCase()}` as keyof QuestionReview]}
                              </span>
                            </div>
                            {isCorrect && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {isSelected && !isCorrect && <XCircle className="h-5 w-5 text-red-500" />}
                          </div>
                        </div>
                      )
                    })}

                    {/* AI Explain Button for incorrect MCQ answers (not skipped) */}
                    {!question.is_correct && !question.is_skipped && (() => {
                      // Get actual answer text for MCQ questions, not just the letter
                      const getOptionText = (letter: string | null) => {
                        if (!letter) return ''
                        const optionKey = `option_${letter.toLowerCase()}` as keyof QuestionReview
                        return question[optionKey] as string || letter
                      }
                      const studentAnswerText = getOptionText(question.selected_answer)
                      const correctAnswerText = getOptionText(question.correct_answer)
                      
                      return (
                        <div className="mt-4">
                          <AIExplainButton
                            questionId={question.question_id}
                            questionText={question.question_text}
                            studentAnswer={studentAnswerText}
                            correctAnswer={correctAnswerText}
                            subject={question.subject_name}
                            difficulty={question.difficulty}
                            isCorrect={question.is_correct}
                          />
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Explanation */}
                {question.explanation && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                      {t('practice.interface.explanation') || 'Explanation'}
                    </h4>
                    <p className="text-blue-800 dark:text-blue-200 text-sm">
                      {question.explanation}
                    </p>
                  </div>
                )}

                {/* Skipped Message */}
                {question.is_skipped && (
                  <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-700 dark:text-orange-400">
                      {t('practice.review.skippedMessage') || 'You skipped this question. It was counted as incorrect.'}
                    </p>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Back to Results Button */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => router.push(`/student/practice/results?sessionId=${sessionId}`)}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('practice.review.backToResults')}
          </Button>
        </div>

        {/* Question Feedback Modal */}
        {feedbackQuestionId && (
          <QuestionFeedbackModal
            open={!!feedbackQuestionId}
            questionId={feedbackQuestionId}
            onClose={() => setFeedbackQuestionId(null)}
          />
        )}
      </div>
    </div>
  )
}
