"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Flame, Target, BookOpen, TrendingUp, Calendar, Clock, CheckCircle, Trophy, Flag } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ProfileDrawer } from "@/components/shared/ProfileDrawer"
import { NotificationCenter } from "@/components/NotificationCenter"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { activityService, Activity } from "@/services/activityService"
import { deadlineService, Deadline } from "@/services/deadlineService"
import { formatRelativeTime, formatDaysRemaining } from "@/lib/utils/timeFormat"
import { AddDeadlineModal } from "@/components/modals/AddDeadlineModal"
import { AllActivityModal } from "@/components/modals/AllActivityModal"
import { AllDeadlinesModal } from "@/components/modals/AllDeadlinesModal"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { AIInsightsCard } from "@/components/ai/AIInsightsCard"
import {
  getLocalizedSubjectName,
  getTimingAreaLabel,
  getTimingPerformanceSummary,
  TimingPerformanceSummary,
} from "@/services/timingAnalyticsService"
import { motion } from "motion/react"

interface StudentStats {
  currentStreak: number
  accuracy: number
  totalQuestions: number
  completionRate: number
}

interface ProfileData {
  full_name: string | null
}

interface StudentData {
  id: string
  current_streak: number | null
  elo_rating: number | null
}

interface DailyStat {
  questions_attempted: number | null
  questions_correct: number | null
  is_active: boolean | null
}

type TimeFilter = '7D' | '30D' | '90D'

// Helper function to get time-based greeting
const getTimeBasedGreeting = (t: any): string => {
  const hour = new Date().getHours()
  const greetings: string[] = []

  if (hour >= 5 && hour < 12) {
    // Morning: 5 AM - 11:59 AM
    greetings.push(t('greetings.morning1'))
    greetings.push(t('greetings.morning2'))
    greetings.push(t('greetings.morning3'))
  } else if (hour >= 12 && hour < 17) {
    // Afternoon: 12 PM - 4:59 PM
    greetings.push(t('greetings.afternoon1'))
    greetings.push(t('greetings.afternoon2'))
    greetings.push(t('greetings.afternoon3'))
  } else if (hour >= 17 && hour < 21) {
    // Evening: 5 PM - 8:59 PM
    greetings.push(t('greetings.evening1'))
    greetings.push(t('greetings.evening2'))
    greetings.push(t('greetings.evening3'))
  } else {
    // Night: 9 PM - 4:59 AM
    greetings.push(t('greetings.night1'))
    greetings.push(t('greetings.night2'))
    greetings.push(t('greetings.night3'))
  }

  // Return random greeting from the appropriate time period
  return greetings[Math.floor(Math.random() * greetings.length)]
}

export default function StudentHomePage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const { isLeaderboardEnabled, isTeacherMarketplaceEnabled, isAIInsightsEnabled, isCompetitiveModeEnabled, isGoalSettingEnabled } = useFeatureFlagContext()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState("Student")
  const [userId, setUserId] = useState<string | null>(null)
  const [greeting, setGreeting] = useState("")
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30D')
  const [stats, setStats] = useState<StudentStats>({
    currentStreak: 0,
    accuracy: 0,
    totalQuestions: 0,
    completionRate: 0,
  })
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [loadingDeadlines, setLoadingDeadlines] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [showAddDeadlineModal, setShowAddDeadlineModal] = useState(false)
  const [showAllActivityModal, setShowAllActivityModal] = useState(false)
  const [showAllDeadlinesModal, setShowAllDeadlinesModal] = useState(false)
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [timingSummary, setTimingSummary] = useState<TimingPerformanceSummary | null>(null)

  useEffect(() => {
    setGreeting(getTimeBasedGreeting(t))
    loadDashboardData()
  }, [timeFilter, locale])

  const loadDashboardData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      // Get user profile - fetch from profiles table, not auth.users
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single() as { data: ProfileData | null; error: unknown }

      if (profileError) {
        console.error('Profile fetch error:', profileError)
      }

      if (profile?.full_name) {
        setUserName(profile.full_name.split(" ")[0] || "Student")
      } else {
        console.warn('No full_name found in profile for user:', user.id)
        setUserName("Student")
      }

      // Get student data
      const { data: student } = await supabase
        .from("students")
        .select("id, current_streak, elo_rating")
        .eq("user_id", user.id)
        .single() as { data: StudentData | null; error: unknown }

      if (student) {
        setStudentId(student.id)
        
        // Load activity and deadlines
        loadActivity(user.id, student.id)
        loadDeadlines(student.id)
        loadTimingPerformance(student.id)
        // Calculate date range based on filter
        const endDate = new Date()
        const startDate = new Date()
        const daysAgo = timeFilter === '7D' ? 7 : timeFilter === '30D' ? 30 : 90
        startDate.setDate(endDate.getDate() - daysAgo)

        // Fetch daily stats for the period (like mobile app)
        const { data: dailyStats } = await supabase
          .from("daily_stats")
          .select("*")
          .eq("student_id", student.id)
          .gte("date", startDate.toISOString().split('T')[0])
          .lte("date", endDate.toISOString().split('T')[0])
          .order("date", { ascending: false }) as { data: DailyStat[] | null; error: unknown }

        // Calculate aggregated stats from daily_stats
        let totalQuestions = 0
        let totalCorrect = 0
        let activeDays = 0

        if (dailyStats && dailyStats.length > 0) {
          dailyStats.forEach(stat => {
            totalQuestions += stat.questions_attempted || 0
            totalCorrect += stat.questions_correct || 0
            if (stat.is_active) activeDays++
          })
        }

        const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
        const completionRate = Math.min(Math.round((totalQuestions / 500) * 100), 100)

        setStats({
          currentStreak: Math.max(student.current_streak || 1, 1),
          accuracy,
          totalQuestions,
          completionRate,
        })
      }
    } catch (error) {
      console.error("Error loading dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadActivity = async (userId: string, studentId: string) => {
    try {
      setLoadingActivity(true)
      const activities = await activityService.getLatestResults(userId, studentId)
      setRecentActivity(activities)
    } catch (error) {
      console.error('Load activity error:', error)
    } finally {
      setLoadingActivity(false)
    }
  }

  const loadDeadlines = async (studentId: string) => {
    try {
      setLoadingDeadlines(true)
      const upcomingDeadlines = await deadlineService.getUpcomingDeadlines(studentId, 5)
      setDeadlines(upcomingDeadlines)
    } catch (error) {
      console.error('Load deadlines error:', error)
    } finally {
      setLoadingDeadlines(false)
    }
  }

  const loadTimingPerformance = async (studentId: string) => {
    try {
      const summary = await getTimingPerformanceSummary(studentId, timeFilter)
      setTimingSummary(summary)
    } catch (error) {
      console.error('Load timing performance error:', error)
      setTimingSummary(null)
    }
  }

  const handleViewAllActivity = async () => {
    if (!studentId) return
    setShowAllActivityModal(true)
    // Load more activities for the modal
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const activities = await activityService.getRecentActivity(user.id, studentId, 50)
        setAllActivities(activities)
      }
    } catch (error) {
      console.error('Load all activities error:', error)
    }
  }

  const handleAddDeadline = () => {
    setShowAddDeadlineModal(true)
  }

  const handleSaveDeadline = async (title: string, date: Date, type: 'exam' | 'assignment' | 'goal' | 'custom') => {
    if (!studentId) return
    
    try {
      await deadlineService.createReminder(
        studentId,
        title,
        date.toISOString().split('T')[0],
        type,
        'medium'
      )
      // Reload deadlines
      await loadDeadlines(studentId)
    } catch (error) {
      console.error('Save deadline error:', error)
    }
  }

  const handleDeleteDeadline = async (deadlineId: string) => {
    if (!studentId) return
    
    try {
      await deadlineService.deleteDeadline(deadlineId)
      // Reload deadlines
      await loadDeadlines(studentId)
    } catch (error) {
      console.error('Delete deadline error:', error)
    }
  }

  const handleViewAllDeadlines = () => {
    setShowAllDeadlinesModal(true)
  }

  // Build quick actions based on feature flags
  const quickActions = [
    {
      titleKey: "dashboard.student.quickActions.practice",
      descKey: "dashboard.student.quickActions.practiceDesc",
      icon: BookOpen,
      color: "bg-blue-500",
      href: "/student/practice",
    },
    {
      titleKey: "dashboard.student.quickActions.mockExam",
      descKey: "dashboard.student.quickActions.mockExamDesc",
      icon: Target,
      color: "bg-purple-500",
      href: "/student/exams",
    },
    // Only show Competitive Mode if enabled
    ...(isCompetitiveModeEnabled ? [{
      titleKey: "dashboard.student.quickActions.competitive",
      descKey: "dashboard.student.quickActions.competitiveDesc",
      icon: Flame,
      color: "bg-orange-500",
      href: "/student/competitive",
    }] : []),
    // Only show Goals if goal setting is enabled
    ...(isGoalSettingEnabled ? [{
      titleKey: "dashboard.student.quickActions.goals",
      descKey: "dashboard.student.quickActions.goalsDesc",
      icon: Flag,
      color: "bg-indigo-500",
      href: "/student/goals",
    }] : []),
    // Only show Find Teachers if teacher marketplace is enabled
    ...(isTeacherMarketplaceEnabled ? [{
      titleKey: "dashboard.student.quickActions.findTeachers",
      descKey: "dashboard.student.quickActions.findTeachersDesc",
      icon: TrendingUp,
      color: "bg-green-500",
      href: "/student/teachers",
    }] : []),
    // Only show Leaderboard if leaderboards are enabled
    ...(isLeaderboardEnabled ? [{
      titleKey: "dashboard.student.quickActions.leaderboard",
      descKey: "dashboard.student.quickActions.leaderboardDesc",
      icon: Trophy,
      color: "bg-yellow-500",
      href: "/student/leaderboard",
    }] : []),
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
              <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
              <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{greeting}, {userName}!</h1>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter userId={userId} />
            <ProfileDrawer userType="student" />
          </div>
        </motion.div>

        {/* Time Filter */}
        <motion.div 
          className="flex items-center justify-between mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.student.yourStats')}</h2>
          <div className="flex items-center space-x-2">
            {(['7D', '30D', '90D'] as TimeFilter[]).map((filter) => (
              <motion.button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  timeFilter === filter
                    ? 'bg-blue-900 dark:bg-blue-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {filter}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full">
              <div className="flex items-center space-x-4">
                <motion.div 
                  className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-full"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Flame className="h-6 w-6 text-orange-500" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.currentStreak}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.student.stats.dayStreak')}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full">
              <div className="flex items-center space-x-4">
                <motion.div 
                  className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Target className="h-6 w-6 text-blue-500" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.accuracy}%</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.student.stats.accuracy')}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full">
              <div className="flex items-center space-x-4">
                <motion.div 
                  className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-full"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <BookOpen className="h-6 w-6 text-purple-500" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalQuestions}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.student.stats.questions')}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-full">
              <div className="flex items-center space-x-4">
                <motion.div 
                  className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completionRate}%</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.student.stats.progress')}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.student.quickActions.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon
              return (
                <motion.div
                  key={action.titleKey}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card
                    className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                    onClick={() => router.push(action.href)}
                  >
                    <div className="flex items-start space-x-4">
                      <motion.div 
                        className={`p-4 ${action.color} rounded-lg`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Icon className="h-8 w-8 text-white" />
                      </motion.div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t(action.titleKey)}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t(action.descKey)}</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {timingSummary && timingSummary.totals.answered > 0 && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.75 }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {t('dashboard.student.timing.title')}
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('dashboard.student.timing.subtitle')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      {[
                        { key: 'fast', value: timingSummary.totals.fast, color: 'bg-emerald-500' },
                        { key: 'normal', value: timingSummary.totals.normal, color: 'bg-blue-500' },
                        { key: 'slow', value: timingSummary.totals.slow, color: 'bg-amber-500' },
                        { key: 'verySlow', value: timingSummary.totals.verySlow, color: 'bg-red-500' },
                      ].map(bucket => {
                        if (bucket.value <= 0) return null;
                        const percent = Math.max(
                          3,
                          Math.round((bucket.value / timingSummary.totals.answered) * 100)
                        );

                        return (
                          <div
                            key={bucket.key}
                            className={bucket.color}
                            style={{ width: `${percent}%` }}
                            title={`${t(`dashboard.student.timing.${bucket.key}`)}: ${bucket.value}`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-4">
                      {[
                        { key: 'fast', color: 'bg-emerald-500' },
                        { key: 'normal', color: 'bg-blue-500' },
                        { key: 'slow', color: 'bg-amber-500' },
                        { key: 'verySlow', color: 'bg-red-500' },
                      ].map(bucket => (
                        <div key={bucket.key} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${bucket.color}`} />
                          <span>{t(`dashboard.student.timing.${bucket.key}`)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    {[
                      { key: 'fast', value: timingSummary.totals.fast, color: 'bg-emerald-500' },
                      { key: 'normal', value: timingSummary.totals.normal, color: 'bg-blue-500' },
                      { key: 'slow', value: timingSummary.totals.slow, color: 'bg-amber-500' },
                      { key: 'verySlow', value: timingSummary.totals.verySlow, color: 'bg-red-500' },
                    ].map(bucket => {
                      const percent = Math.round((bucket.value / timingSummary.totals.answered) * 100)
                      return (
                        <div key={bucket.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${bucket.color}`} />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {t(`dashboard.student.timing.${bucket.key}`)}
                            </span>
                          </div>
                          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{bucket.value}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{percent}%</p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    {t('dashboard.student.timing.benchmarkNote')}
                  </p>
                </div>

                <div className="w-full lg:max-w-md">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    {t('dashboard.student.timing.slowestAreas')}
                  </h3>
                  <div className="space-y-3">
                    {timingSummary.slowAreas.map((row, index) => (
                      <div
                        key={`${row.subject_id}-${row.topic_name}-${row.subtopic_id}-${index}`}
                        className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                              {getTimingAreaLabel(row, locale)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {getLocalizedSubjectName(row, locale)} · {Math.round(Number(row.accuracy || 0))}%
                            </p>
                          </div>
                          <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                            {Math.round(Number(row.avg_time_seconds || 0))}s
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* AI Insights - gated by feature flag */}
        {userId && isAIInsightsEnabled && (
          <motion.div 
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <AIInsightsCard userId={userId} />
          </motion.div>
        )}

        {/* Recent Activity */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.student.recentActivity.title')}</h2>
            <Button variant="ghost" size="sm" className="text-blue-900 dark:text-blue-400" onClick={handleViewAllActivity}>
              {t('dashboard.student.activity.seeAll')}
            </Button>
          </div>
          <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            {loadingActivity ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex space-x-3">
                    <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-10 w-10"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: activity.color + '20' }}>
                        {activity.type === 'practice' && <BookOpen className="w-5 h-5" style={{ color: activity.color }} />}
                        {activity.type === 'exam' && <Target className="w-5 h-5" style={{ color: activity.color }} />}
                        {activity.type === 'booking' && <Calendar className="w-5 h-5" style={{ color: activity.color }} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {activity.title
                          .replace('Practice:', t('common.practice') + ':')
                          .replace('Exam:', t('common.exam') + ':')
                          .replace('__BOOKING_WITH_TEACHER__', t('common.bookingWithTeacher'))
                          .replace('__BOOKING_WITH__', t('common.bookingWith'))
                          .replace('__TEACHER__', t('common.teacher'))}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {activity.subtitle
                          .replace('Score:', t('common.score') + ':')
                          .replace('__STATUS__:', t('common.status') + ':')
                          .replace('pending', t('common.pending'))
                          .replace('confirmed', t('common.confirmed'))
                          .replace('completed', t('common.completed'))
                          .replace('cancelled', t('common.cancelled'))}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {formatRelativeTime(activity.timestamp, locale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">{t('dashboard.student.recentActivity.noActivity')}</p>
            )}
          </Card>
        </motion.div>

        {/* Upcoming Deadlines */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.student.upcomingDeadlines.title')}</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-blue-900 dark:text-blue-400" onClick={handleAddDeadline}>
                <Calendar className="h-4 w-4 mr-1" />
                +
              </Button>
              <Button variant="ghost" size="sm" className="text-blue-900 dark:text-blue-400" onClick={handleViewAllDeadlines}>
                {t('dashboard.student.deadlines.all')}
              </Button>
            </div>
          </div>
          <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            {loadingDeadlines ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse flex space-x-3">
                    <div className="rounded-lg bg-gray-200 dark:bg-gray-700 h-16 w-16"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : deadlines.length > 0 ? (
              <div className="space-y-3">
                {deadlines.map((deadline) => (
                  <div key={deadline.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex-shrink-0">
                      <div className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center ${
                        deadline.urgencyLevel === 'urgent' ? 'bg-red-100 dark:bg-red-900/20' :
                        deadline.urgencyLevel === 'soon' ? 'bg-orange-100 dark:bg-orange-900/20' :
                        'bg-blue-100 dark:bg-blue-900/20'
                      }`}>
                        <span className={`text-2xl font-bold ${
                          deadline.urgencyLevel === 'urgent' ? 'text-red-600 dark:text-red-400' :
                          deadline.urgencyLevel === 'soon' ? 'text-orange-600 dark:text-orange-400' :
                          'text-blue-600 dark:text-blue-400'
                        }`}>{Math.abs(deadline.daysLeft)}</span>
                        <span className={`text-xs ${
                          deadline.urgencyLevel === 'urgent' ? 'text-red-600 dark:text-red-400' :
                          deadline.urgencyLevel === 'soon' ? 'text-orange-600 dark:text-orange-400' :
                          'text-blue-600 dark:text-blue-400'
                        }`}>{deadline.daysLeft === 0 ? t('common.today') : deadline.daysLeft === 1 ? t('common.day') : t('common.days')}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{deadline.title}</p>
                      {deadline.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{deadline.description}</p>
                      )}
                      <div className="flex items-center space-x-2 mt-2">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          {new Date(deadline.date).toLocaleDateString()}
                          {deadline.time && ` at ${deadline.time}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">{t('dashboard.student.upcomingDeadlines.noDeadlines')}</p>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Modals */}
      <AddDeadlineModal
        open={showAddDeadlineModal}
        onClose={() => setShowAddDeadlineModal(false)}
        onAdd={handleSaveDeadline}
      />
      
      <AllActivityModal
        open={showAllActivityModal}
        onClose={() => setShowAllActivityModal(false)}
        activities={allActivities}
        loading={loadingActivity}
      />
      
      <AllDeadlinesModal
        open={showAllDeadlinesModal}
        onClose={() => setShowAllDeadlinesModal(false)}
        deadlines={deadlines}
        loading={loadingDeadlines}
        onAddDeadline={() => {
          setShowAllDeadlinesModal(false)
          setShowAddDeadlineModal(true)
        }}
        onDeleteDeadline={handleDeleteDeadline}
      />
    </div>
  )
}
