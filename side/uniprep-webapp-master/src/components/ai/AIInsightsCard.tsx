"use client"

import { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Lightbulb, Loader2, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { aiInsightsService } from '@/services/aiInsightsService'
import { AIInsight } from '@/types/ai'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useRouter } from 'next/navigation'
import { translateSubjectNamesInText } from '@/lib/utils/subjectTranslation'

interface AIInsightsCardProps {
  userId: string
}

export function AIInsightsCard({ userId }: AIInsightsCardProps) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadInsights()
  }, [userId])

  const loadInsights = async () => {
    setLoading(true)
    try {
      const response = await aiInsightsService.fetchInsights(userId, false)
      if (response.data && response.data.length > 0) {
        setInsights(response.data.slice(0, 3)) // Show top 3 insights
        // Count unread insights (those not yet viewed)
        const unread = response.data.filter(i => !i.viewed).length
        setUnreadCount(unread)
      }
    } catch (error) {
      console.error('Failed to load insights:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewAll = () => {
    // Navigate to AI insights page (to be created)
    router.push('/student/ai-insights')
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'strength':
        return <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
      case 'weakness':
        return <Sparkles className="h-5 w-5 text-red-600 dark:text-red-400" />
      case 'recommendation':
        return <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
      default:
        return <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
    }
  }

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'strength':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      case 'weakness':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      case 'recommendation':
        return 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
      default:
        return 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20'
    }
  }

  return (
    <Card className="p-6 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('ai.insights.title')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('ai.insights.subtitle')}
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadCount}
            </Badge>
          )}
        </div>
{/* Refresh button removed - server-side caching handles refresh automatically */}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-purple-600 animate-spin mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('ai.insights.loading')}
          </p>
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">
            {t('ai.insights.noInsights')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, index) => (
            <div
              key={insight.id || `insight-${index}`}
              className={`p-4 rounded-lg border-2 ${getInsightColor(insight.type)} transition-all hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getInsightIcon(insight.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {translateSubjectNamesInText(insight.title, locale, t)}
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {translateSubjectNamesInText(insight.description, locale, t)}
                  </p>
                  {insight.actionable && insight.actionText && (
                    <button className="mt-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline">
                      {translateSubjectNamesInText(insight.actionText, locale, t)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* View All Button */}
          <Button
            variant="ghost"
            onClick={handleViewAll}
            className="w-full mt-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            {t('common.viewAll') || 'View All'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </Card>
  )
}
