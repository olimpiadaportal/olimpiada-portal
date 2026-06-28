"use client"

import { useState } from 'react'
import { Sparkles, Loader2, X, Lightbulb, BookOpen, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { aiExplanationService } from '@/services/aiExplanationService'
import { AIExplanation } from '@/types/ai'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface AIExplainButtonProps {
  questionId: string
  questionText: string
  studentAnswer: string
  correctAnswer: string
  subject?: string
  topic?: string
  difficulty?: string
  isCorrect: boolean
}

export function AIExplainButton({
  questionId,
  questionText,
  studentAnswer,
  correctAnswer,
  subject,
  topic,
  difficulty,
  isCorrect,
}: AIExplainButtonProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [explanation, setExplanation] = useState<AIExplanation | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExplain = async () => {
    setLoading(true)
    setError(null)
    setShowModal(true)

    try {
      const response = await aiExplanationService.getExplanation({
        questionId,
        questionText,
        studentAnswer,
        correctAnswer,
        subject,
        topic,
        difficulty,
      })

      if (response.success && response.data) {
        setExplanation(response.data)
      } else {
        setError(response.error?.message || 'Failed to get explanation')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setShowModal(false)
    setExplanation(null)
    setError(null)
  }

  return (
    <>
      {/* AI Explain Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExplain}
        disabled={isCorrect}
        className="flex items-center gap-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/30 dark:hover:to-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="text-purple-700 dark:text-purple-300 font-medium">
          {t('ai.explain.button') || 'AI Explain'}
        </span>
      </Button>

      {/* Explanation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t('ai.explain.title') || 'AI Explanation'}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('ai.explain.subtitle') || 'Understanding your mistake'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-purple-600 animate-spin mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('ai.explain.loading') || 'AI is analyzing your answer...'}
                  </p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
                    <X className="h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-red-600 dark:text-red-400 text-center">{error}</p>
                  <Button onClick={handleExplain} className="mt-4">
                    {t('common.tryAgain') || 'Try Again'}
                  </Button>
                </div>
              ) : explanation ? (
                <div className="space-y-6">
                  {/* Main Explanation */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {t('ai.explain.explanation') || 'Explanation'}
                      </h3>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                      {explanation.explanation}
                    </p>
                  </div>

                  {/* Key Points */}
                  {explanation.keyPoints && explanation.keyPoints.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {t('ai.explain.keyPoints') || 'Key Points'}
                        </h3>
                      </div>
                      <ul className="space-y-2">
                        {explanation.keyPoints.map((point, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-3 text-gray-700 dark:text-gray-300"
                          >
                            <span className="flex-shrink-0 w-6 h-6 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center text-yellow-700 dark:text-yellow-400 text-sm font-medium">
                              {index + 1}
                            </span>
                            <span className="flex-1">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Study Tip */}
                  {explanation.studyTip && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {t('ai.explain.studyTip') || 'Study Tip'}
                        </h3>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{explanation.studyTip}</p>
                    </div>
                  )}

                  {/* Related Topics */}
                  {explanation.relatedTopics && explanation.relatedTopics.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        {t('ai.explain.relatedTopics') || 'Related Topics'}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {explanation.relatedTopics.map((topic, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700">
              <Button onClick={handleClose} className="w-full">
                {t('common.close') || 'Close'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
