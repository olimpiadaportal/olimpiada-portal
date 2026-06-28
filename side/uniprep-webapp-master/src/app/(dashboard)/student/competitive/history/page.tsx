"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardSkeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { 
  ArrowLeft, 
  Clock, 
  CheckCircle, 
  Filter,
  GraduationCap,
  Trophy,
  X
} from 'lucide-react'

interface CompetitiveSession {
  id: string
  student_id: string
  subject_id: string
  subject_name: string
  total_questions: number
  correct_answers: number
  score: number
  time_spent_seconds: number
  completed_at: string
  created_at: string
}

export default function CompetitiveHistoryPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [sessions, setSessions] = useState<CompetitiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | string>('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get student ID
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!student?.id) return

      // Fetch competitive sessions with subject info
      // Only fetch completed sessions (completed_at is not null)
      const { data: sessionsData, error } = await supabase
        .from('competitive_sessions')
        .select(`
          id,
          student_id,
          subject_id,
          total_questions,
          correct_answers,
          score,
          time_spent_seconds,
          completed_at,
          created_at,
          subject_name,
          subjects(name_en, name_az)
        `)
        .eq('student_id', student.id)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })

      if (error) {
        console.error('Error loading history:', error)
        return
      }

      // Map sessions with subject names and filter out invalid dates
      const mappedSessions = (sessionsData || [])
        .filter((session: any) => {
          // Filter out sessions with epoch date (01/01/1970) or invalid dates
          const completedAt = session.completed_at ? new Date(session.completed_at) : null
          if (!completedAt || completedAt.getFullYear() < 2020) {
            return false
          }
          return true
        })
        .map((session: any) => ({
          ...session,
          // Use subject_name from session if available, otherwise get from subjects join
          subject_name: session.subject_name || (
            locale === 'az' 
              ? session.subjects?.name_az 
              : session.subjects?.name_en
          ) || 'Unknown'
        }))

      setSessions(mappedSessions)
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSessions = filter === 'all' 
    ? sessions 
    : sessions.filter(s => s.subject_name === filter)

  // Get unique subject names for filters
  const uniqueSubjects = Array.from(new Set(
    sessions
      .map(s => s.subject_name)
      .filter(name => name && name.trim() !== '')
  ))

  const averageScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
    : 0

  const totalSessions = sessions.length

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffMs = nowDay.getTime() - dateDay.getTime()
    const diffDays = Math.round(diffMs / 86400000)

    if (diffDays === 0) return t('common.today') || 'Today'
    if (diffDays === 1) return t('common.yesterday') || 'Yesterday'
    if (diffDays < 7 && diffDays > 0) return `${diffDays} ${t('common.days') || 'days'} ${t('common.ago') || 'ago'}`
    
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    })
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 dark:text-green-400'
    if (score >= 80) return 'text-blue-600 dark:text-blue-400'
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBgColor = (score: number): string => {
    if (score >= 90) return 'bg-green-100 dark:bg-green-900/30'
    if (score >= 80) return 'bg-blue-100 dark:bg-blue-900/30'
    if (score >= 70) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/student/competitive')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back') || 'Back'}
          </Button>
          
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('competitive.sessionHistory') || 'Session History'}
          </h1>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
              {averageScore}%
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('competitive.averageScore') || 'Average Score'}
            </p>
          </Card>
          <Card className="p-4 bg-white dark:bg-gray-800 text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {totalSessions}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('competitive.totalSessions') || 'Total Sessions'}
            </p>
          </Card>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>
                {filter === 'all' 
                  ? (t('competitive.all') || 'All Subjects')
                  : filter
                }
              </span>
            </div>
            {filter !== 'all' && (
              <Badge variant="secondary" className="ml-2">1</Badge>
            )}
          </Button>

          {/* Filter Dropdown */}
          {showFilters && (
            <Card className="mt-2 p-2 bg-white dark:bg-gray-800">
              <button
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  filter === 'all' 
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => {
                  setFilter('all')
                  setShowFilters(false)
                }}
              >
                {t('competitive.all') || 'All Subjects'}
              </button>
              {uniqueSubjects.map(subject => (
                <button
                  key={subject}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    filter === subject 
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => {
                    setFilter(subject)
                    setShowFilters(false)
                  }}
                >
                  {subject}
                </button>
              ))}
            </Card>
          )}
        </div>

        {/* Sessions List */}
        {filteredSessions.length > 0 ? (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <Card 
                key={session.id} 
                className="p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${getScoreBgColor(session.score)}`}>
                      <GraduationCap className={`h-6 w-6 ${getScoreColor(session.score)}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {session.subject_name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(session.completed_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getScoreColor(session.score)}`}>
                      {session.score}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{session.correct_answers}/{session.total_questions}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime(session.time_spent_seconds)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center bg-white dark:bg-gray-800">
            <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('competitive.noSessionsYet') || 'No Sessions Yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('competitive.noSessionsDescription') || 'Complete competitive sessions to see your history here'}
            </p>
            <Button onClick={() => router.push('/student/competitive')}>
              {t('competitive.start') || 'Start Competitive Mode'}
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
