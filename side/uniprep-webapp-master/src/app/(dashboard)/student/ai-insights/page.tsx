"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Lightbulb, Loader2, ArrowLeft, Trophy, AlertCircle, BookOpen, CheckCircle } from 'lucide-react'
import { aiInsightsService } from '@/services/aiInsightsService'
import { AIInsight } from '@/types/ai'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useFeatureFlagContext } from '@/contexts/FeatureFlagContext'
import { translateSubjectNamesInText } from '@/lib/utils/subjectTranslation'

export default function AIInsightsPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const { isAIInsightsEnabled, loading: flagsLoading } = useFeatureFlagContext()
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Redirect if AI insights is disabled
  useEffect(() => {
    if (!flagsLoading && !isAIInsightsEnabled) {
      router.push('/student/home')
    }
  }, [flagsLoading, isAIInsightsEnabled, router])

  useEffect(() => {
    if (isAIInsightsEnabled) {
      loadUser()
    }
  }, [isAIInsightsEnabled])

  const loadUser = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
      loadInsights(user.id)
    } else {
      router.push('/login')
    }
  }

  const loadInsights = async (uid: string) => {
    setLoading(true)
    try {
      const response = await aiInsightsService.fetchInsights(uid, false)
      if (response.success && response.data) {
        setInsights(response.data)
      } else if (response.data) {
        setInsights(response.data)
      }
    } catch (error) {
      // Silent fail - insights will be empty
    } finally {
      setLoading(false)
    }
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'strength':
        return <Trophy className="h-6 w-6 text-green-600 dark:text-green-400" />
      case 'weakness':
      case 'weak_area':
        return <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      case 'recommendation':
        return <Lightbulb className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
      case 'study_tip':
        return <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      default:
        return <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
    }
  }

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'strength':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      case 'weakness':
      case 'weak_area':
        return 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
      case 'recommendation':
        return 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20'
      case 'study_tip':
        return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
      default:
        return 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20'
    }
  }

  // Get insight content - handle both 'content' (mobile) and 'description' (webapp) fields
  const getInsightContent = (insight: AIInsight & { content?: string }) => {
    return translateSubjectNamesInText(insight.description || (insight as any).content || '', locale, t)
  }

  // Separate insights by read status (matching mobile app)
  // Support both 'viewed' (webapp) and 'isRead' (mobile) properties
  const unreadInsights = insights.filter(i => !i.viewed && !(i as any).isRead)
  const readInsights = insights.filter(i => i.viewed || (i as any).isRead)

  const handleMarkAsRead = async (insightId: string) => {
    try {
      // Optimistically update local state
      setInsights(prev =>
        prev.map(insight =>
          insight.id === insightId
            ? { ...insight, viewed: true }
            : insight
        )
      )

      // Update in backend
      await aiInsightsService.markInsightAsRead(insightId)
    } catch (error) {
      console.error('Failed to mark insight as read:', error)
      // Revert on error
      setInsights(prev =>
        prev.map(insight =>
          insight.id === insightId
            ? { ...insight, viewed: false }
            : insight
        )
      )
    }
  }

  const getPriorityBadge = (priority: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
    }
    return colors[priority as keyof typeof colors] || colors.medium
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-12 w-12 text-purple-600 animate-spin mb-4" />
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {t('ai.insights.loading')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/student/home')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t('ai.insights.title')}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {t('ai.insights.subtitle')}
                </p>
              </div>
            </div>
{/* Refresh button removed - server-side caching handles refresh automatically */}
          </div>
        </div>

        {/* Stats - matching mobile app */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <p className="text-2xl font-bold text-indigo-600">{insights.length}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai.insights.totalInsights')}</p>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <p className="text-2xl font-bold text-green-600">{unreadInsights.length}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai.insights.unread')}</p>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <p className="text-2xl font-bold text-gray-600">{readInsights.length}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai.insights.read')}</p>
          </Card>
        </div>

        {/* Insights List */}
        {insights.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-gray-800">
            <Sparkles className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('ai.insights.noInsights')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Complete more practice sessions to get personalized insights
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <Card
                key={insight.id || `insight-${index}`}
                className={`p-6 ${getInsightColor(insight.type)} border-2 transition-all hover:shadow-lg`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getInsightIcon(insight.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {translateSubjectNamesInText(insight.title, locale, t)}
                      </h3>
                      <Badge className={getPriorityBadge(insight.priority)}>
                        {t(`ai.insights.priority.${insight.priority}`)}
                      </Badge>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                      {getInsightContent(insight)}
                    </p>
                    
                    {/* Metadata */}
                    {insight.metadata && (
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {insight.metadata.accuracy !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">Accuracy:</span>
                            <span>{insight.metadata.accuracy}%</span>
                          </div>
                        )}
                        {insight.metadata.questionsAttempted !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">Questions:</span>
                            <span>{insight.metadata.questionsAttempted}</span>
                          </div>
                        )}
                        {insight.metadata.improvementRate !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">Improvement:</span>
                            <span>+{insight.metadata.improvementRate}%</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Related Topics/Subjects */}
                    {(insight.relatedSubjects || insight.relatedTopics) && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {insight.relatedSubjects?.map((subject, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {translateSubjectNamesInText(subject, locale, t)}
                          </Badge>
                        ))}
                        {insight.relatedTopics?.map((topic, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 mt-2">
                      {/* Mark as Read Button - only show for unread insights with valid database UUIDs (not temp IDs) */}
                      {!insight.viewed && insight.id && !insight.id.startsWith('temp-') && !insight.id.startsWith('fallback-') && !insight.id.startsWith('default-') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsRead(insight.id!)}
                          className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('ai.insights.markAsRead') || 'Mark as Read'}
                        </Button>
                      )}
                      
                      {/* Action Button */}
                      {insight.actionable && insight.actionText && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                        >
                          {translateSubjectNamesInText(insight.actionText, locale, t)}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
