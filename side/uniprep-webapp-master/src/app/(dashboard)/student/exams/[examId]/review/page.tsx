"use client"

import { useEffect, useState, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, Filter, Clock } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { AIExplainButton } from "@/components/ai/AIExplainButton"
import { ContextFlipCard } from "@/components/shared/ContextFlipCard"

interface QuestionReview {
  question_id: string
  question_order: number
  question_text: string
  question_type?: 'mcq' | 'codable_open' | 'written_open'
  group_id?: string
  group_order?: number
  context_text?: string
  context_image_url?: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string
  correct_answer: string
  selected_answer: string | null
  text_answer: string | null
  is_correct: boolean
  is_pending_grading: boolean
  is_skipped: boolean
  subject_name: string
  difficulty: string
  explanation?: string
  ai_score?: number
  ai_explanation?: string
  final_score?: number
}

type FilterType = 'all' | 'correct' | 'incorrect' | 'unanswered'

export default function ExamReviewPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, locale } = useTranslation()
  const resolvedParams = use(params)
  const examId = resolvedParams.examId
  const attemptId = searchParams.get('attemptId')
  
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<QuestionReview[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedSubject, setSelectedSubject] = useState<string>('all')
  const [subjects, setSubjects] = useState<string[]>([])

  useEffect(() => {
    if (attemptId) {
      loadReview()
    }
  }, [attemptId])

  const loadReview = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get exam questions
      const { data: examQuestions } = await supabase
        .from("mock_exam_questions")
        .select(`
          question_order,
          questions(
            id,
            question_text,
            question_type,
            group_id,
            group_order,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_answer,
            difficulty,
            subjects(name_en, name_az),
            question_groups(context_text, context_image_url)
          )
        `)
        .eq("mock_exam_id", examId)
        .order("question_order")

      // Get user's answers
      const { data: answers } = await supabase
        .from("exam_answers")
        .select("*")
        .eq("attempt_id", attemptId)

      const answersMap = new Map()
      ;(answers || []).forEach((answer: any) => {
        answersMap.set(answer.question_id, {
          selected_answer: answer.selected_answer,
          text_answer: answer.text_answer,
          ai_score: answer.ai_score,
          ai_explanation: answer.ai_explanation,
          final_score: answer.final_score,
        })
      })

      const reviewQuestions: QuestionReview[] = (examQuestions || []).map((item: any) => {
        const question = item.questions
        const answerData = answersMap.get(question.id) || { selected_answer: null, text_answer: null, ai_score: null, ai_explanation: null, final_score: null }
        const questionType = question.question_type || 'mcq'
        
        // Check if question was actually answered
        const isAnswered = questionType === 'mcq' 
          ? answerData.selected_answer !== null
          : answerData.text_answer && answerData.text_answer.trim() !== ''
        
        // Calculate is_correct based on question type
        let isCorrect = false
        let isPendingGrading = false
        
        if (isAnswered) {
          if (questionType === 'mcq') {
            isCorrect = answerData.selected_answer === question.correct_answer
          } else if (questionType === 'codable_open') {
            // Case-insensitive comparison for codable_open (graded like MCQ)
            isCorrect = answerData.text_answer && question.correct_answer
              ? answerData.text_answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim()
              : false
          } else if (questionType === 'written_open') {
            // written_open uses AI grading - check final_score
            if (answerData.final_score !== null && answerData.final_score !== undefined) {
              isCorrect = answerData.final_score > 0
            } else {
              // Has answer but pending AI grading
              isPendingGrading = true
            }
          }
        }

        return {
          question_id: question.id,
          question_order: item.question_order,
          question_text: question.question_text,
          question_type: questionType,
          group_id: question.group_id,
          group_order: question.group_order,
          context_text: question.question_groups?.context_text,
          context_image_url: question.question_groups?.context_image_url,
          option_a: question.option_a,
          option_b: question.option_b,
          option_c: question.option_c,
          option_d: question.option_d,
          option_e: question.option_e,
          correct_answer: question.correct_answer,
          selected_answer: answerData.selected_answer,
          text_answer: answerData.text_answer,
          is_correct: isCorrect,
          is_pending_grading: isPendingGrading,
          is_skipped: !isAnswered,
          subject_name: locale === 'en' ? question.subjects.name_en : (question.subjects.name_az || question.subjects.name_en),
          difficulty: question.difficulty,
          explanation: question.explanation,
          ai_score: answerData.ai_score,
          ai_explanation: answerData.ai_explanation,
          final_score: answerData.final_score,
        }
      })

      setQuestions(reviewQuestions)

      // Get unique subjects
      const uniqueSubjects = Array.from(new Set(reviewQuestions.map(q => q.subject_name)))
      setSubjects(uniqueSubjects)
    } catch (error) {
      console.error("Error loading review:", error)
    } finally {
      setLoading(false)
    }
  }

  // Helper to check if a question has an answer (MCQ or text)
  const hasAnswer = (q: QuestionReview) => {
    if (q.question_type === 'mcq') return !!q.selected_answer
    return !!q.text_answer
  }

  const filteredQuestions = questions.filter(q => {
    // Filter by answer status
    if (filter === 'correct' && !q.is_correct) return false
    if (filter === 'incorrect' && (q.is_correct || !hasAnswer(q))) return false
    if (filter === 'unanswered' && hasAnswer(q)) return false

    // Filter by subject
    if (selectedSubject !== 'all' && q.subject_name !== selectedSubject) return false

    return true
  })

  const stats = {
    total: questions.length,
    correct: questions.filter(q => q.is_correct).length,
    incorrect: questions.filter(q => hasAnswer(q) && !q.is_correct).length,
    unanswered: questions.filter(q => !hasAnswer(q)).length,
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
          onClick={() => router.push(`/student/exams/${examId}/results`)}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('exams.review.backToResults')}
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('exams.review.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('exams.review.description')}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('exams.review.total')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.correct}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('exams.review.correct')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.incorrect}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('exams.review.incorrect')}</div>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.unanswered}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('exams.review.unanswered')}</div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('exams.review.filters')}
            </h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                {t('exams.review.filterByStatus')}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilter('all')}
                  className={filter === 'all' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  {t('exams.review.all')}
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'correct' ? 'default' : 'outline'}
                  onClick={() => setFilter('correct')}
                  className={filter === 'correct' ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {t('exams.review.correctOnly')}
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'incorrect' ? 'default' : 'outline'}
                  onClick={() => setFilter('incorrect')}
                  className={filter === 'incorrect' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                  {t('exams.review.incorrectOnly')}
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'unanswered' ? 'default' : 'outline'}
                  onClick={() => setFilter('unanswered')}
                  className={filter === 'unanswered' ? 'bg-gray-600 hover:bg-gray-700' : ''}
                >
                  {t('exams.review.unansweredOnly')}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                {t('exams.review.filterBySubject')}
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">{t('exams.review.allSubjects')}</option>
                {subjects.map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Questions */}
        <div className="space-y-6">
          {filteredQuestions.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                {t('exams.review.noQuestions')}
              </p>
            </Card>
          ) : (
            filteredQuestions.map((question, index) => {
              const hasAnyAnswer = question.selected_answer || question.text_answer
              return (
              <Card
                key={question.question_id}
                className={`p-6 bg-white dark:bg-gray-800 border-2 ${
                  !hasAnyAnswer
                    ? 'border-gray-200 dark:border-gray-700'
                    : question.is_pending_grading
                    ? 'border-yellow-200 dark:border-yellow-800'
                    : question.is_correct
                    ? 'border-green-200 dark:border-green-800'
                    : 'border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    {!hasAnyAnswer ? (
                      <AlertCircle className="h-6 w-6 text-gray-500 mt-1" />
                    ) : question.is_pending_grading ? (
                      <Clock className="h-6 w-6 text-yellow-500 mt-1" />
                    ) : question.is_correct ? (
                      <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-500 mt-1" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('exams.review.question')} {question.question_order}
                      </h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {question.subject_name}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {t(`common.difficulty.${question.difficulty}`)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Context Flip Card for written_open groups — show once per group */}
                {question.question_type === 'written_open' && question.context_text &&
                  (index === 0 || filteredQuestions[index - 1]?.group_id !== question.group_id) && (
                  <ContextFlipCard
                    contextText={question.context_text}
                    contextImageUrl={question.context_image_url}
                    labelText={`📝 ${t('exams.interface.situation') || 'Situation'}`}
                    tapToSeeImageText={t('exams.review.tapToSeeImage') || 'Click to see figure'}
                    tapToSeeTextText={t('exams.review.tapToSeeText') || 'Click to see text'}
                  />
                )}

                <p className="text-gray-900 dark:text-white mb-4 text-lg">
                  {question.question_text}
                </p>

                {/* Written Open or Codable Open Question Display */}
                {(question.question_type === 'written_open' || question.question_type === 'codable_open') ? (
                  <div className="space-y-4">
                    {/* Student's Answer */}
                    <div className={`p-4 rounded-lg border-2 ${
                      question.text_answer 
                        ? question.is_correct
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20'
                    }`}>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {t('exams.review.yourAnswer')}
                      </h4>
                      <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                        {question.text_answer || t('exams.review.notAnswered')}
                      </p>
                    </div>

                    {/* Correct Answer for codable_open */}
                    {question.question_type === 'codable_open' && question.text_answer && !question.is_correct && (
                      <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          {t('exams.review.correct')}
                        </h4>
                        <p className="text-green-700 dark:text-green-400 font-medium">
                          {question.correct_answer}
                        </p>
                      </div>
                    )}

                    {/* AI Grading Feedback for written_open */}
                    {question.question_type === 'written_open' && question.final_score !== null && question.final_score !== undefined && (
                      <div className={`p-4 rounded-lg border-2 ${
                        question.final_score >= 70 
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                          : question.final_score >= 50
                          ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {t('exams.review.aiGradingFeedback') || 'AI Grading Feedback'}
                          </h4>
                          <span className={`text-lg font-bold ${
                            question.final_score >= 70 
                              ? 'text-green-600 dark:text-green-400'
                              : question.final_score >= 50
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {question.final_score}%
                          </span>
                        </div>
                        {question.ai_explanation && (() => {
                          // Parse AI explanation - it might be JSON or plain text
                          let feedback = ''
                          let explanation = ''
                          try {
                            const parsed = typeof question.ai_explanation === 'string' && question.ai_explanation.trim().startsWith('{')
                              ? JSON.parse(question.ai_explanation)
                              : null
                            if (parsed) {
                              feedback = parsed.feedback || ''
                              explanation = parsed.explanation || ''
                            } else {
                              explanation = question.ai_explanation
                            }
                          } catch {
                            explanation = question.ai_explanation
                          }
                          return (
                            <div className="space-y-3">
                              {feedback && (
                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                                  {feedback}
                                </p>
                              )}
                              {explanation && (
                                <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    {t('exams.review.explanation') || 'Explanation'}:
                                  </p>
                                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                                    {explanation}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })()}
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
                  </div>
                )}

                {/* Explanation */}
                {question.explanation && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                      {t('exams.review.explanation') || 'Explanation'}
                    </h4>
                    <p className="text-blue-800 dark:text-blue-200 text-sm">
                      {question.explanation}
                    </p>
                  </div>
                )}

                {/* AI Explain Button for incorrect answers (not skipped, not pending, not written_open) */}
                {!question.is_skipped && !question.is_correct && !question.is_pending_grading && question.question_type !== 'written_open' && (() => {
                  // Get actual answer text for MCQ questions, not just the letter
                  const getOptionText = (letter: string | null) => {
                    if (!letter) return ''
                    const optionKey = `option_${letter.toLowerCase()}` as keyof QuestionReview
                    return question[optionKey] as string || letter
                  }
                  const studentAnswerText = question.question_type === 'mcq' || !question.question_type
                    ? getOptionText(question.selected_answer)
                    : (question.text_answer || '')
                  const correctAnswerText = question.question_type === 'mcq' || !question.question_type
                    ? getOptionText(question.correct_answer)
                    : question.correct_answer
                  
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

                {/* Skipped Message - only for truly skipped questions */}
                {question.is_skipped && (
                  <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-700 dark:text-orange-400">
                      {t('exams.review.youSkippedThisQuestion') || 'You skipped this question'}
                    </p>
                  </div>
                )}
              </Card>
            )})
          )}
        </div>

        {/* Back to Results Button */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => router.push(`/student/exams/${examId}/results`)}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('exams.review.backToResults')}
          </Button>
        </div>
      </div>
    </div>
  )
}
