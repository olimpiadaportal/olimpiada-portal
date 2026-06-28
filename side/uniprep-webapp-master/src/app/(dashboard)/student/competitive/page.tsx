"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Trophy, Target, Zap, ArrowLeft, Loader2, Play, Clock, History, Lock } from 'lucide-react'
import { TopicSelectionModal } from '@/components/practice/TopicSelectionModal'
import { competitiveModeService } from '@/services/competitiveModeService'
import { aiCache, CacheKeys } from '@/lib/utils/aiCache'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { DashboardSkeleton } from '@/components/ui/skeleton'
import { CompetitiveModeResponse } from '@/types/ai'
import { useFeatureFlagContext } from '@/contexts/FeatureFlagContext'

interface Subject {
  id: string
  name_en: string
  name_az: string
  hasCachedQuestions?: boolean
}

export default function CompetitiveModePage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const { isCompetitiveModeEnabled, loading: flagsLoading } = useFeatureFlagContext()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [cachedSubjects, setCachedSubjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Redirect if competitive mode is disabled
    if (!flagsLoading && !isCompetitiveModeEnabled) {
      router.push('/student/practice')
      return
    }
    loadSubjects()
  }, [flagsLoading, isCompetitiveModeEnabled])

  // Check for cached sessions for each subject
  const checkCachedSessions = async (uid: string, subjectsList: Subject[]) => {
    const cached = new Set<string>()
    for (const subject of subjectsList) {
      const cacheKey = CacheKeys.competitiveSession(uid, subject.id)
      const cachedData = await aiCache.get<CompetitiveModeResponse>(cacheKey)
      if (cachedData && cachedData.questions && cachedData.questions.length > 0) {
        cached.add(subject.id)
      }
    }
    setCachedSubjects(cached)
  }

  const loadSubjects = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserId(user.id)

      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en')

      if (subjectsData) {
        setSubjects(subjectsData)
        // Check for cached sessions
        checkCachedSessions(user.id, subjectsData)
      }
    } catch (error) {
      // Error loading subjects
    } finally {
      setLoading(false)
    }
  }

  const handleSubjectSelect = async (subject: Subject) => {
    setSelectedSubject(subject)
    
    // Check if this subject has cached questions
    const hasCached = cachedSubjects.has(subject.id)
    
    if (hasCached && userId) {
      // If cached, load directly without showing topic modal
      const cacheKey = CacheKeys.competitiveSession(userId, subject.id)
      const cachedData = await aiCache.get<CompetitiveModeResponse>(cacheKey)
      
      if (cachedData && cachedData.questions && cachedData.sessionId) {
        // Store in sessionStorage and navigate
        sessionStorage.setItem('competitive_session', JSON.stringify({
          sessionId: cachedData.sessionId,
          questions: cachedData.questions,
          subjectId: subject.id,
          subjectName: locale === 'az' ? subject.name_az : subject.name_en
        }))
        
        router.push(`/student/practice/${subject.id}?mode=quiz&competitive=true&sessionId=${cachedData.sessionId}`)
        return
      }
    }
    
    // If not cached or cache failed, show topic modal for new generation
    setShowTopicModal(true)
  }

  const handleTopicConfirm = async (topics: string[]) => {
    if (!selectedSubject || !userId) return

    setShowTopicModal(false)
    setGenerating(true)

    try {
      const response = await competitiveModeService.generateSession(
        userId,
        selectedSubject.id,
        15,
        topics
      )

      if (response.success && response.data) {
        // Store the session data in sessionStorage for the quiz page
        sessionStorage.setItem('competitive_session', JSON.stringify({
          sessionId: response.data.sessionId,
          questions: response.data.questions,
          subjectId: selectedSubject.id,
          subjectName: locale === 'az' ? selectedSubject.name_az : selectedSubject.name_en
        }))
        
        // Navigate directly to quiz page with generated questions
        router.push(`/student/practice/${selectedSubject.id}?mode=quiz&competitive=true&sessionId=${response.data.sessionId}`)
      } else {
        alert(response.error?.message || 'Failed to generate questions')
      }
    } catch (error) {
      alert('Failed to generate competitive mode questions')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  if (generating) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 max-w-md mx-auto text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full mb-4 animate-pulse">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('practice.generatingQuestions')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('practice.competitiveMode.loading')}
          </p>
          <Loader2 className="h-8 w-8 text-purple-600 animate-spin mx-auto" />
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push('/student/home')}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full mb-4">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('ai.competitive.title')}
          </h1>
          
          {/* History Button */}
          <Button
            variant="outline"
            onClick={() => router.push('/student/competitive/history')}
            className="mt-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0 hover:from-purple-600 hover:to-blue-600 dark:from-purple-600 dark:to-blue-600 dark:hover:from-purple-700 dark:hover:to-blue-700"
          >
            <History className="h-4 w-4 mr-2" />
            {t('competitive.viewHistory') || 'View History'}
          </Button>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {t('competitive.description')}
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full mb-4">
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('competitive.features.aiPowered.title')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.features.aiPowered.description')}
            </p>
          </Card>

          <Card className="p-6 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4">
              <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('competitive.features.targetedPractice.title')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.features.targetedPractice.description')}
            </p>
          </Card>

          <Card className="p-6 bg-white dark:bg-gray-800 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
              <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('competitive.features.adaptiveDifficulty.title')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('competitive.features.adaptiveDifficulty.description')}
            </p>
          </Card>
        </div>

        {/* Subject Selection */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {t('practice.selectSubject') || 'Select a Subject'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((subject) => {
              const hasCached = cachedSubjects.has(subject.id)
              return (
                <Card
                  key={subject.id}
                  className={`p-6 bg-white dark:bg-gray-800 border-2 transition-all hover:shadow-lg cursor-pointer ${
                    hasCached 
                      ? 'border-amber-300 dark:border-amber-700 hover:border-amber-500' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-600'
                  }`}
                  onClick={() => handleSubjectSelect(subject)}
                >
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      {locale === 'az' ? subject.name_az : subject.name_en}
                    </h3>
                    {hasCached ? (
                      <div className="flex items-center justify-center gap-2">
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          <Clock className="h-3 w-3 mr-1" />
                          {t('practice.competitiveMode.cached') || 'Cached'}
                        </Badge>
                        <Button size="sm" variant="outline" className="text-amber-600 border-amber-300">
                          <Play className="h-3 w-3 mr-1" />
                          {t('practice.competitiveMode.startCached') || 'Start'}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Zap className="h-3 w-3 mr-1" />
                        {t('practice.competitiveMode.generateNew') || 'Generate'}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Topic Selection Modal */}
        {selectedSubject && (
          <TopicSelectionModal
            visible={showTopicModal}
            onClose={() => {
              setShowTopicModal(false)
              setSelectedSubject(null)
            }}
            onConfirm={handleTopicConfirm}
            subjectId={selectedSubject.id}
            subjectName={locale === 'az' ? selectedSubject.name_az : selectedSubject.name_en}
            mode="quiz"
            questionCount={15}
          />
        )}
      </div>
    </div>
  )
}
