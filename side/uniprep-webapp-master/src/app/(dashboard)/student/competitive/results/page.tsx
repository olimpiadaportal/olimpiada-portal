"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardSkeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { streakService } from "@/services/streakService"
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Target,
  ArrowLeft,
  RotateCcw,
  Trophy,
  TrendingUp,
  TrendingDown
} from "lucide-react"

interface Question {
  id: string
  question_text: string
  correct_answer: string
  topic?: string
  difficulty?: string
}

interface TopicPerformance {
  topic: string
  correct: number
  total: number
  percentage: number
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

function CompetitiveResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const sessionId = searchParams.get('sessionId')
  
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<ResultsData | null>(null)
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([])
  const streakUpdatedRef = useRef(false)

  useEffect(() => {
    loadResults()
  }, [sessionId])

  const loadResults = () => {
    try {
      const resultsData = sessionStorage.getItem('competitive_results')
      if (!resultsData) {
        router.push('/student/competitive')
        return
      }

      const data: ResultsData = JSON.parse(resultsData)
      setResults(data)

      // Update streak (only once per results view)
      if (!streakUpdatedRef.current) {
        streakUpdatedRef.current = true
        streakService.updateStreakRealtime('competitive').catch(() => {})
      }

      // Calculate topic performance
      const topicMap = new Map<string, { correct: number; total: number }>()
      
      data.questions.forEach(question => {
        const userAnswer = data.answers[question.id]
        const topic = question.topic || 'General'
        
        if (!topicMap.has(topic)) {
          topicMap.set(topic, { correct: 0, total: 0 })
        }
        
        const stats = topicMap.get(topic)!
        stats.total += 1
        if (userAnswer === question.correct_answer) {
          stats.correct += 1
        }
      })

      const topicPerf: TopicPerformance[] = Array.from(topicMap.entries())
        .map(([topic, stats]) => ({
          topic,
          correct: stats.correct,
          total: stats.total,
          percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        }))
        .sort((a, b) => a.percentage - b.percentage)

      setTopicPerformance(topicPerf)
    } catch (error) {
      console.error('Error loading results:', error)
      router.push('/student/competitive')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400"
    if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return t('competitive.results.score90') || "Outstanding! 🎉"
    if (percentage >= 80) return t('competitive.results.score80') || "Excellent! 🌟"
    if (percentage >= 70) return t('competitive.results.score70') || "Good job! 👍"
    if (percentage >= 60) return t('competitive.results.score60') || "Keep practicing! 💪"
    return t('competitive.results.score0') || "Don't give up! 📚"
  }

  const handleReviewAnswers = () => {
    router.push(`/student/competitive/review?sessionId=${sessionId}`)
  }

  const handlePracticeAgain = () => {
    // Clear results and go back to competitive mode
    sessionStorage.removeItem('competitive_results')
    sessionStorage.removeItem('competitive_session')
    router.push('/student/competitive')
  }

  const handleBackToHome = () => {
    sessionStorage.removeItem('competitive_results')
    sessionStorage.removeItem('competitive_session')
    router.push('/student/home')
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('competitive.results.notFound') || 'Results not found'}
          </h3>
          <Button onClick={() => router.push('/student/competitive')}>
            {t('competitive.backToCompetitive') || 'Back to Competitive Mode'}
          </Button>
        </Card>
      </div>
    )
  }

  const percentage = results.totalQuestions > 0 
    ? Math.round((results.correctCount / results.totalQuestions) * 100) 
    : 0
  const incorrectCount = Object.keys(results.answers).length - results.correctCount
  const skippedCount = results.totalQuestions - Object.keys(results.answers).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
            <Trophy className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('competitive.results.title') || 'Quiz Complete!'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {results.subjectName}
          </p>
        </div>

        {/* Score Card */}
        <Card className="p-8 mb-6 bg-white dark:bg-gray-800 text-center">
          <div className={`text-6xl font-bold mb-2 ${getScoreColor(percentage)}`}>
            {percentage}%
          </div>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            {getScoreMessage(percentage)}
          </p>
          <div className="flex items-center justify-center space-x-2 text-gray-500 dark:text-gray-400">
            <Clock className="h-5 w-5" />
            <span>{t('competitive.results.timeTaken') || 'Time'}: {formatTime(results.timeElapsed)}</span>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {results.correctCount}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.results.correct') || 'Correct'}
            </div>
          </Card>

          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-2">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {incorrectCount}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.results.incorrect') || 'Incorrect'}
            </div>
          </Card>

          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-2">
              <Target className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
              {skippedCount}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.results.skipped') || 'Skipped'}
            </div>
          </Card>
        </div>

        {/* Topic Performance */}
        {topicPerformance.length > 0 && (
          <Card className="p-6 mb-6 bg-white dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('competitive.results.topicPerformance') || 'Performance by Topic'}
            </h3>
            <div className="space-y-4">
              {topicPerformance.map((topic) => (
                <div key={topic.topic}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      {topic.percentage >= 70 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {topic.topic}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${
                      topic.percentage >= 70 
                        ? 'text-green-600 dark:text-green-400' 
                        : topic.percentage >= 50 
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {topic.correct}/{topic.total} ({topic.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        topic.percentage >= 70 
                          ? 'bg-green-500' 
                          : topic.percentage >= 50 
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${topic.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleReviewAnswers}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('competitive.results.reviewAnswers') || 'Review Answers'}
          </Button>
          
          <Button
            onClick={handlePracticeAgain}
            variant="outline"
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('competitive.results.practiceAgain') || 'Practice Again'}
          </Button>
          
          <Button
            onClick={handleBackToHome}
            variant="ghost"
            className="w-full text-gray-600 dark:text-gray-400"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('competitive.results.backToHome') || 'Back to Dashboard'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CompetitiveResultsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <CompetitiveResultsContent />
    </Suspense>
  )
}
