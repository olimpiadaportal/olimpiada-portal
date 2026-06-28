"use client"

import { useEffect, useRef, useState, use, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { FileText, CheckCircle, Loader2 } from "lucide-react"

interface GradingStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  count?: number
}

function ExamGradingContent({ examId }: { examId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const attemptId = searchParams.get('attemptId')
  
  const mcqCount = parseInt(searchParams.get('mcq') || '0')
  const codableCount = parseInt(searchParams.get('codable') || '0')
  const writtenCount = parseInt(searchParams.get('written') || '0')

  const [steps, setSteps] = useState<GradingStep[]>([
    {
      id: 'mcq',
      label: t('exams.grading.mcqQuestions') || 'Multiple Choice Questions',
      status: 'pending',
      count: mcqCount,
    },
    {
      id: 'codable',
      label: t('exams.grading.codableQuestions') || 'Codable Open Questions',
      status: 'pending',
      count: codableCount,
    },
    {
      id: 'written',
      label: t('exams.grading.writtenQuestions') || 'Written Open Questions',
      status: 'pending',
      count: writtenCount,
    },
  ])

  const [progress, setProgress] = useState(0)
  const [aiProgress, setAiProgress] = useState(0)
  const aiProgressRef = useRef<NodeJS.Timeout | null>(null)
  const gradingStartedRef = useRef(false)

  useEffect(() => {
    if (!attemptId) {
      router.push(`/student/exams/${examId}`)
      return
    }
    if (gradingStartedRef.current) {
      return
    }
    gradingStartedRef.current = true
    startGrading()
  }, [attemptId, examId])

  const updateStep = (index: number, status: GradingStep['status']) => {
    setSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, status } : step
    ))
  }

  const simulateDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // Animated progress: starts fast, slows down, stops at 99%
  const startAiProgressAnimation = () => {
    let current = 0
    const tick = () => {
      current += Math.max(0.3, (99 - current) * 0.04)
      if (current >= 99) current = 99
      setAiProgress(Math.round(current))
      if (current < 99) {
        aiProgressRef.current = setTimeout(tick, 200)
      }
    }
    tick()
  }

  const stopAiProgressAnimation = () => {
    if (aiProgressRef.current) {
      clearTimeout(aiProgressRef.current)
      aiProgressRef.current = null
    }
    setAiProgress(100)
  }

  const startGrading = async () => {
    // Helper function to fetch with timeout
    const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 30000) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response
      } catch (error: any) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
          throw new Error('Request timeout')
        }
        throw error
      }
    }

    try {
      // Step 1: Grade MCQ questions (instant via API)
      updateStep(0, 'in_progress')
      await simulateDelay(500)
      
      // Call the submit API which grades MCQ and codable_open
      try {
        const response = await fetchWithTimeout('/api/exams/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, deferLeaderboardUpdate: writtenCount > 0 }),
        }, 30000)

        // Continue even if response not ok
      } catch (submitError) {
        // Continue anyway - the exam might already be submitted
      }

      updateStep(0, 'completed')
      setProgress(33)

      // Step 2: Codable Open (already graded in submit)
      updateStep(1, 'in_progress')
      await simulateDelay(500)
      updateStep(1, 'completed')
      setProgress(66)

      // Step 3: Written Open (AI grading if needed)
      if (writtenCount > 0) {
        updateStep(2, 'in_progress')
        startAiProgressAnimation()

        // Call AI grading API for written_open questions with longer timeout
        try {
          const aiResponse = await fetchWithTimeout('/api/exams/grade-written', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId }),
          }, 120000) // 2 minute timeout for AI grading

          // AI grading complete or failed - continue either way
        } catch (aiError) {
          // Continue anyway - results will show pending grading status
        }

        stopAiProgressAnimation()
        await simulateDelay(500)
        updateStep(2, 'completed')
      } else {
        updateStep(2, 'completed')
      }
      setProgress(100)

      // Navigate to results
      await simulateDelay(500)
      router.replace(`/student/exams/${examId}/results?attemptId=${attemptId}`)
      
    } catch (error) {
      // Still navigate to results on error
      router.replace(`/student/exams/${examId}/results?attemptId=${attemptId}`)
    }
  }

  const renderStep = (step: GradingStep, index: number) => {
    const isActive = step.status === 'in_progress'
    const isCompleted = step.status === 'completed'

    return (
      <div
        key={step.id}
        className={`flex items-start p-4 rounded-lg border-2 transition-all ${
          isActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : isCompleted
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}
      >
        <div className="mr-4">
          {isCompleted ? (
            <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
          ) : isActive ? (
            <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{index + 1}</span>
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${
              isCompleted 
                ? 'text-green-700 dark:text-green-400' 
                : isActive 
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-gray-900 dark:text-white'
            }`}>
              {step.label}
            </span>
            {step.count !== undefined && step.count > 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">({step.count})</span>
            )}
          </div>

          {isActive && step.id === 'written' && (
            <div className="mt-2">
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                {t('exams.grading.aiAnalyzing') || 'AI is analyzing your answers...'}
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${aiProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">{aiProgress}%</p>
            </div>
          )}

          {isCompleted && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              {step.count === 0 
                ? (t('exams.grading.noQuestions') || 'No questions')
                : (t('exams.grading.done') || 'Done')
              }
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="p-8 bg-white dark:bg-gray-800">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {t('exams.grading.title') || 'Grading Your Exam'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('exams.grading.subtitle') || 'Please wait while we grade your answers'}
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-8">
            {steps.map((step, index) => renderStep(step, index))}
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t('exams.grading.pleaseWait') || 'Please do not close this page'}
          </p>
        </Card>
      </div>
    </div>
  )
}

function GradingLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="p-8 bg-white dark:bg-gray-800">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Grading Your Exam
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we grade your answers
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function ExamGradingPage({ params }: { params: Promise<{ examId: string }> }) {
  const resolvedParams = use(params)
  const examId = resolvedParams.examId

  return (
    <Suspense fallback={<GradingLoadingFallback />}>
      <ExamGradingContent examId={examId} />
    </Suspense>
  )
}
