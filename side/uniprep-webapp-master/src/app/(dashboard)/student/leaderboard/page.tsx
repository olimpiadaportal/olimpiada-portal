"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Flame, MapPin, Users, Globe, ArrowLeft } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { 
  leaderboardService, 
  LeaderboardEntry, 
  StudentRank, 
  RankType, 
  LeaderboardScope 
} from "@/services/leaderboardService"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"

interface StudentData {
  id: string
  city: string | null
}

const formatLeaderboardValue = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString()

function LeaderboardContent() {
  const router = useRouter()
  const { t } = useTranslation()
  const supabase = createClient()
  const { isLeaderboardEnabled, loading: flagsLoading } = useFeatureFlagContext()
  
  // State
  const [scope, setScope] = useState<LeaderboardScope>('city')
  const [rankType, setRankType] = useState<RankType>('score')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [studentRank, setStudentRank] = useState<StudentRank | null>(null)
  const [loading, setLoading] = useState(true)
  const [studentCity, setStudentCity] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')

  // Redirect if leaderboard is disabled
  useEffect(() => {
    if (!flagsLoading && !isLeaderboardEnabled) {
      router.push('/student/home')
    }
  }, [flagsLoading, isLeaderboardEnabled, router])

  // Load data on mount and when filters change
  useEffect(() => {
    if (isLeaderboardEnabled) {
      loadLeaderboard()
    }
  }, [scope, rankType, isLeaderboardEnabled])

  // Load student city
  useEffect(() => {
    loadStudentCity()
  }, [])

  const loadStudentCity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

      const { data: student } = await supabase
        .from('students')
        .select('city')
        .eq('user_id', user.id)
        .single()

      const studentData = student as StudentData | null
      if (studentData?.city) {
        setStudentCity(studentData.city)
      }
    } catch (error) {
      console.error('Error loading student city:', error)
    }
  }

  const loadLeaderboard = async () => {
    try {
      if (loading) setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Get student ID first
      const { data: student } = await supabase
        .from('students')
        .select('id, city')
        .eq('user_id', user.id)
        .single()

      const studentData = student as StudentData | null
      if (!studentData) {
        console.error('Student not found')
        setLoading(false)
        return
      }

      // Fetch leaderboard
      let data: LeaderboardEntry[] = []
      if (scope === 'city') {
        data = await leaderboardService.fetchCityLeaderboard(
          studentData.city || 'Baku',
          rankType
        )
      } else {
        data = await leaderboardService.fetchNationalLeaderboard(rankType)
      }

      setLeaderboard(data)

      // Fetch student rank
      const rank = await leaderboardService.getStudentRank(
        studentData.id,
        rankType,
        scope
      )
      setStudentRank(rank)

      setLoading(false)
    } catch (error) {
      console.error('Error loading leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 dark:border-blue-500 mx-auto mb-6"></div>
          <p className="text-xl text-gray-700 dark:text-gray-300 font-semibold">{t('leaderboard.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-800 dark:to-purple-900 text-white p-8 rounded-b-3xl shadow-2xl">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Button
              onClick={() => router.push('/student/home')}
              variant="ghost"
              className="text-white hover:bg-white/20 mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {t('common.back')}
            </Button>
            <h1 className="text-4xl font-bold flex items-center gap-3 mb-2">
              <Trophy className="w-10 h-10" />
              {t('leaderboard.title')}
            </h1>
            <p className="text-blue-50 dark:text-blue-200 text-lg mt-2">{t('leaderboard.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-12">
        {/* Scope Tabs */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <Card
            className={`p-6 cursor-pointer transition-all border-2 ${
              scope === 'city'
                ? 'bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-900 text-white shadow-2xl scale-105 border-blue-500'
                : 'bg-white dark:bg-gray-800 hover:shadow-lg border-gray-200 dark:border-gray-700'
            }`}
            onClick={() => setScope('city')}
          >
            <div className="flex items-center gap-4">
              <MapPin className="w-8 h-8" />
              <div>
                <h3 className="font-bold text-lg">{t('leaderboard.myCity')}</h3>
                {studentCity && (
                  <p className={`text-base mt-1 ${
                    scope === 'city' 
                      ? 'text-blue-100 dark:text-blue-200' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {studentCity}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card
            className={`p-6 cursor-pointer transition-all border-2 ${
              scope === 'national'
                ? 'bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-900 text-white shadow-2xl scale-105 border-purple-500'
                : 'bg-white dark:bg-gray-800 hover:shadow-lg border-gray-200 dark:border-gray-700'
            }`}
            onClick={() => setScope('national')}
          >
            <div className="flex items-center gap-4">
              <Globe className="w-8 h-8" />
              <div>
                <h3 className="font-bold text-lg">{t('leaderboard.national')}</h3>
                <p className={`text-base mt-1 ${
                  scope === 'national' 
                    ? 'text-purple-100 dark:text-purple-200' 
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {t('leaderboard.azerbaijan')}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Rank Type Filters */}
        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => setRankType('score')}
            variant={rankType === 'score' ? 'default' : 'outline'}
            className={`flex-1 py-6 text-lg font-semibold ${
              rankType === 'score'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 dark:from-blue-700 dark:to-blue-800 shadow-lg'
                : 'border-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <Trophy className="w-5 h-5 mr-2" />
            {t('leaderboard.score')}
          </Button>

          <Button
            onClick={() => setRankType('streak')}
            variant={rankType === 'streak' ? 'default' : 'outline'}
            className={`flex-1 py-6 text-lg font-semibold ${
              rankType === 'streak'
                ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 dark:from-orange-600 dark:to-red-700 shadow-lg'
                : 'border-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <Flame className="w-5 h-5 mr-2" />
            {t('leaderboard.streak')}
          </Button>
        </div>

        {/* Current User Rank Card */}
        {studentRank && (
          <Card className="p-8 mb-8 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950 dark:via-indigo-950 dark:to-purple-950 border-3 border-blue-300 dark:border-blue-700 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="bg-gradient-to-br from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-800 text-white rounded-full w-20 h-20 flex items-center justify-center shadow-2xl">
                  <span className="text-3xl font-bold">#{studentRank.rank}</span>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('leaderboard.yourRank')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {rankType === 'score'
                      ? `${formatLeaderboardValue(studentRank.value)} ${t('leaderboard.points')}`
                      : `${studentRank.value} ${t('leaderboard.days')}`}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                    {t('leaderboard.outOf').replace('{total}', studentRank.total.toString())}
                  </p>
                </div>
              </div>
              <div className="text-blue-600 dark:text-blue-400">
                {rankType === 'score' ? (
                  <Trophy className="w-16 h-16" />
                ) : (
                  <Flame className="w-16 h-16" />
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Leaderboard List */}
        <div className="space-y-4">
          {leaderboard.length === 0 ? (
            <Card className="p-16 text-center bg-white dark:bg-gray-800 border-2 dark:border-gray-700">
              <Trophy className="w-20 h-20 mx-auto text-gray-300 dark:text-gray-600 mb-6" />
              <h3 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-3">
                {t('leaderboard.noRankings')}
              </h3>
              <p className="text-lg text-gray-500 dark:text-gray-400">
                {rankType === 'score'
                  ? t('leaderboard.completeExamsToRank')
                  : t('leaderboard.startStreakToRank')}
              </p>
            </Card>
          ) : (
            leaderboard.map((entry) => {
              const isCurrentUser = entry.id === currentUserId
              const medal = getMedalEmoji(entry.rank)

              return (
                <Card
                  key={entry.id}
                  className={`p-6 transition-all hover:shadow-xl border-2 ${
                    isCurrentUser
                      ? 'border-blue-500 dark:border-blue-600 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 shadow-lg'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-6">
                    {/* Rank */}
                    <div className="w-20 text-center">
                      {medal ? (
                        <span className="text-5xl">{medal}</span>
                      ) : (
                        <span className="text-3xl font-bold text-gray-400 dark:text-gray-500">
                          #{entry.rank}
                        </span>
                      )}
                    </div>

                    {/* Student Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3
                          className={`text-xl font-bold ${
                            isCurrentUser ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {entry.display_name}
                        </h3>
                        {isCurrentUser && (
                          <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 text-sm font-semibold">
                            {t('leaderboard.you')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-base text-gray-600 dark:text-gray-400 mt-2">
                        <MapPin className="w-4 h-4" />
                        <span>{entry.city}</span>
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-right">
                      <p
                        className={`text-3xl font-bold ${
                          isCurrentUser ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {rankType === 'score'
                          ? formatLeaderboardValue(entry.monthly_score ?? entry.score)
                          : entry.streak}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                        {rankType === 'score'
                          ? t('leaderboard.points')
                          : t('leaderboard.days')}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    }>
      <LeaderboardContent />
    </Suspense>
  )
}
