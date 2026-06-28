"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react"

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string
  correct_answer: string
  explanation?: string
  topic?: string
  difficulty?: string
}

interface ResultsData {
  sessionId: string
  subjectName: string
  questions: Question[]
  answers: Record<string, string>
  correctCount: number
  totalQuestions: number
  timeElapsed: number
}

export default function CompetitiveReviewPage() {
  const router = useRouter()
  const { t } = useTranslation()
  
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<ResultsData | null>(null)

  useEffect(() => {
    loadResults()
  }, [])

  const loadResults = () => {
    try {
      const resultsData = sessionStorage.getItem('competitive_results')
      if (!resultsData) {
        router.push('/student/competitive')
        return
      }

      const data: ResultsData = JSON.parse(resultsData)
      setResults(data)
    } catch (error) {
      console.error('Error loading results:', error)
      router.push('/student/competitive')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  if (!results) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('competitive.review.backToResults') || 'Back to Results'}
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('competitive.review.title') || 'Review Answers'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {results.subjectName} - {results.questions.length} {t('competitive.review.questions') || 'questions'}
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {results.questions.map((question, index) => {
            const userAnswer = results.answers[question.id]
            const isCorrect = userAnswer === question.correct_answer
            const isSkipped = !userAnswer

            return (
              <Card
                key={question.id}
                className={`p-6 bg-white dark:bg-gray-800 border-2 ${
                  isSkipped
                    ? 'border-gray-200 dark:border-gray-700'
                    : isCorrect
                    ? 'border-green-200 dark:border-green-800'
                    : 'border-red-200 dark:border-red-800'
                }`}
              >
                {/* Question Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    {isSkipped ? (
                      <AlertCircle className="h-6 w-6 text-gray-500 mt-1" />
                    ) : isCorrect ? (
                      <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-500 mt-1" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('competitive.review.question') || 'Question'} {index + 1}
                      </h3>
                      {question.topic && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {question.topic}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-medium px-2 py-1 rounded ${
                    isSkipped
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : isCorrect
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {isSkipped 
                      ? t('competitive.review.skipped') || 'Skipped'
                      : isCorrect 
                      ? t('competitive.review.correct') || 'Correct'
                      : t('competitive.review.incorrect') || 'Incorrect'
                    }
                  </span>
                </div>

                {/* Question Text */}
                <p className="text-gray-900 dark:text-white mb-4 text-lg">
                  {question.question_text}
                </p>

                {/* Options */}
                <div className="space-y-2">
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((option) => {
                    const optionKey = `option_${option.toLowerCase()}` as keyof Question
                    const optionText = question[optionKey]
                    if (!optionText) return null

                    const isCorrectOption = option === question.correct_answer
                    const isUserAnswer = option === userAnswer

                    return (
                      <div
                        key={option}
                        className={`p-4 rounded-lg border-2 ${
                          isCorrectOption
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : isUserAnswer && !isCorrectOption
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-gray-900 dark:text-white">
                              {option}.
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {optionText}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {isCorrectOption && (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                            {isUserAnswer && !isCorrectOption && (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Explanation */}
                {question.explanation && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                      {t('competitive.review.explanation') || 'Explanation'}
                    </h4>
                    <p className="text-blue-800 dark:text-blue-200 text-sm">
                      {question.explanation}
                    </p>
                  </div>
                )}

                {/* Skipped Message */}
                {isSkipped && (
                  <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('competitive.review.notAnswered') || 'This question was not answered'}
                    </p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {/* Back Button at Bottom */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => router.push(`/student/competitive/results?sessionId=${results.sessionId}`)}
            className="bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('competitive.review.backToResults') || 'Back to Results'}
          </Button>
        </div>
      </div>
    </div>
  )
}
