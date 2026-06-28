"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Target, Clock, CheckCircle, Calendar, Sparkles, ChevronRight, Flag, Sun, Moon, CloudMoon, Sunrise } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { goalService } from "@/services/goalService"
import { studyPlanService } from "@/services/studyPlanService"
import { StudentGoal, StudyPlan, StudyPlanWeek, DailyGoalStatus, QUESTION_TARGET_OPTIONS, TIME_TARGET_OPTIONS, STUDY_TIME_OPTIONS } from "@/types/goals"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"

const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6]

const SUBJECT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4']

export default function GoalsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isGoalSettingEnabled, loading: flagsLoading } = useFeatureFlagContext()

  // Redirect if goal setting is disabled
  useEffect(() => {
    if (!flagsLoading && !isGoalSettingEnabled) {
      router.replace('/student/home')
    }
  }, [flagsLoading, isGoalSettingEnabled, router])

  const DAY_LABELS = [
    t('goals.daySun') || 'S',
    t('goals.dayMon') || 'M',
    t('goals.dayTue') || 'T',
    t('goals.dayWed') || 'W',
    t('goals.dayThu') || 'T',
    t('goals.dayFri') || 'F',
    t('goals.daySat') || 'S',
  ]

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [goals, setGoals] = useState<StudentGoal | null>(null)
  const [goalStatus, setGoalStatus] = useState<DailyGoalStatus | null>(null)
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [currentWeek, setCurrentWeek] = useState<StudyPlanWeek | null>(null)

  // Form state
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(20)
  const [dailyTimeTarget, setDailyTimeTarget] = useState(30)
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [preferredTime, setPreferredTime] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('evening')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .single() as { data: { id: string } | null; error: unknown }

      if (!student) return
      setStudentId(student.id)

      const [goalsData, statusData, planData] = await Promise.all([
        goalService.getGoals(student.id),
        goalService.getDailyGoalStatus(student.id),
        studyPlanService.getActivePlan(student.id),
      ])

      setGoals(goalsData)
      setGoalStatus(statusData)
      setPlan(planData)

      if (planData) {
        setCurrentWeek(studyPlanService.getCurrentWeek(planData))
      }

      if (goalsData) {
        setDailyQuestionTarget(goalsData.daily_question_target)
        setDailyTimeTarget(goalsData.daily_time_target_minutes)
        setPreferredDays(goalsData.preferred_study_days || [1, 2, 3, 4, 5])
        setPreferredTime(goalsData.preferred_study_time as any || 'evening')
      }
    } catch (error) {
      console.error('Error loading goals data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!studentId) return
    try {
      setSaving(true)
      await goalService.saveGoals(studentId, {
        dailyQuestionTarget,
        dailyTimeTargetMinutes: dailyTimeTarget,
        targetExamDate: null,
        targetScore: null,
        preferredStudyDays: preferredDays,
        preferredStudyTime: preferredTime,
      })
      setShowSettings(false)
      await loadData()
    } catch (error) {
      console.error('Error saving goals:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: number) => {
    setPreferredDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const getTimeIcon = (time: string) => {
    switch (time) {
      case 'morning': return <Sunrise className="w-4 h-4" />
      case 'afternoon': return <Sun className="w-4 h-4" />
      case 'evening': return <Moon className="w-4 h-4" />
      case 'night': return <CloudMoon className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  const getTimeLabel = (time: string) => {
    switch (time) {
      case 'morning': return t('goals.morning') || 'Morning'
      case 'afternoon': return t('goals.afternoon') || 'Afternoon'
      case 'evening': return t('goals.evening') || 'Evening'
      case 'night': return t('goals.night') || 'Night'
      default: return time
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const progressPercent = goalStatus?.progressPercentage ?? 0
  const circumference = 2 * Math.PI * 45
  const strokeDashoffset = circumference - (circumference * Math.min(progressPercent, 100)) / 100

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('goals.title') || 'Your Goals'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('goals.setDailyGoalDesc') || 'Track your progress and build study habits'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Target className="w-4 h-4 mr-2" />
          {showSettings ? (t('common.cancel') || 'Cancel') : (t('goals.title') || 'Edit Goals')}
        </Button>
      </div>

      {/* Daily Progress Card */}
      {goalStatus && (
        <Card className="p-6">
          <div className="flex items-center gap-6">
            {/* Circular Progress */}
            <div className="relative flex-shrink-0">
              <svg width="110" height="110" className="-rotate-90">
                <circle cx="55" cy="55" r="45" stroke="currentColor" strokeWidth="8" fill="none" className="text-gray-200 dark:text-gray-700" />
                <circle
                  cx="55" cy="55" r="45"
                  stroke={goalStatus.bothGoalsMet ? '#10B981' : progressPercent >= 50 ? '#F59E0B' : '#3B82F6'}
                  strokeWidth="8" fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {goalStatus.bothGoalsMet ? (
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                ) : (
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{progressPercent}%</span>
                )}
              </div>
            </div>

            {/* Goal Details */}
            <div className="flex-1 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {goalStatus.bothGoalsMet
                  ? (t('goals.dailyGoalComplete') || "Today's Goal Complete!")
                  : (t('goals.dailyGoal') || "Today's Goal")}
              </h2>

              {/* Questions */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Target className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.min(goalStatus.questionsCompleted, goalStatus.questionsTarget)}/{goalStatus.questionsTarget} {t('goals.questions') || 'questions'}
                    </span>
                    {goalStatus.questionGoalMet && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((goalStatus.questionsCompleted / goalStatus.questionsTarget) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.min(goalStatus.timeSpentMinutes, goalStatus.timeTarget)}/{goalStatus.timeTarget} {t('goals.min') || 'min'}
                    </span>
                    {goalStatus.timeGoalMet && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((goalStatus.timeSpentMinutes / goalStatus.timeTarget) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Goal Settings (expandable) */}
      {showSettings && (
        <Card className="p-6 space-y-6 border-blue-200 dark:border-blue-800">
          {/* Daily Questions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              {t('goals.dailyQuestions') || 'Daily Questions'}
            </h3>
            <p className="text-xs text-gray-500 mb-3">{t('goals.dailyQuestionsDesc') || 'How many questions per day?'}</p>
            <div className="flex gap-2">
              {QUESTION_TARGET_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setDailyQuestionTarget(opt)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    dailyQuestionTarget === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Time */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-500" />
              {t('goals.dailyTime') || 'Daily Study Time'}
            </h3>
            <p className="text-xs text-gray-500 mb-3">{t('goals.dailyTimeDesc') || 'How many minutes per day?'}</p>
            <div className="flex gap-2">
              {TIME_TARGET_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setDailyTimeTarget(opt)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    dailyTimeTarget === opt
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300'
                  }`}
                >
                  {opt} {t('goals.min') || 'min'}
                </button>
              ))}
            </div>
          </div>

          {/* Study Days */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-500" />
              {t('goals.studyDays') || 'Study Days'}
            </h3>
            <div className="flex gap-2">
              {DAY_VALUES.map((day, idx) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`w-10 h-10 rounded-full text-sm font-semibold border-2 transition-colors ${
                    preferredDays.includes(day)
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {DAY_LABELS[idx]}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Time */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              {t('goals.studyTime') || 'Preferred Time'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {STUDY_TIME_OPTIONS.map(time => (
                <button
                  key={time}
                  onClick={() => setPreferredTime(time)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    preferredTime === time
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {getTimeIcon(time)}
                  {getTimeLabel(time)}
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <CheckCircle className="w-4 h-4 mr-2" />
            {saving ? (t('common.saving') || 'Saving...') : (t('goals.saveGoals') || 'Save Goals')}
          </Button>
        </Card>
      )}

      {/* Study Plan Section */}
      {plan && currentWeek && (
        <Card className="p-6">
          {/* Plan Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.title}</h2>
              {plan.description && (
                <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>
              )}
            </div>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
              {Math.round(plan.progress_percentage)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(plan.progress_percentage, 100)}%` }}
            />
          </div>

          {/* Current Week */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {t('studyPlan.weekNumber', { num: String(currentWeek.week_number) }) || `Week ${currentWeek.week_number}`}
                <span className="ml-2 text-xs bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                  {t('studyPlan.current') || 'Current'}
                </span>
              </span>
              <span className="text-xs text-gray-500">
                {currentWeek.completed_questions}/{currentWeek.target_questions} {t('goals.questions') || 'questions'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {currentWeek.focus_subject_names.map((name, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: SUBJECT_COLORS[idx % SUBJECT_COLORS.length] + '15',
                    color: SUBJECT_COLORS[idx % SUBJECT_COLORS.length],
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[idx % SUBJECT_COLORS.length] }} />
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* All Weeks */}
          <div className="space-y-2">
            {plan.weeks?.map(week => {
              const isCurrent = week.id === currentWeek?.id
              const isCompleted = week.is_completed
              return (
                <div
                  key={week.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                    isCurrent
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800'
                      : isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-900/10'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full border-2 border-indigo-500 bg-indigo-500/20" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                    )}
                    <span className={`font-medium ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {t('studyPlan.weekNumber', { num: String(week.week_number) }) || `Week ${week.week_number}`}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {week.focus_subject_names.slice(0, 2).join(', ')}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* No Plan CTA */}
      {!plan && goals && (
        <Card className="p-6 text-center border-dashed border-2 border-gray-300 dark:border-gray-600">
          <Calendar className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {t('studyPlan.noPlan') || 'No Study Plan Yet'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {t('studyPlan.noPlanDesc') || 'Set your exam date to generate a personalized study plan.'}
          </p>
        </Card>
      )}

      {/* No Goals CTA */}
      {!goals && !showSettings && (
        <Card className="p-8 text-center border-dashed border-2 border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10">
          <Flag className="w-12 h-12 text-blue-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {t('goals.setDailyGoal') || 'Set Your Daily Goal'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {t('goals.setDailyGoalDesc') || 'Track your progress and build study habits'}
          </p>
          <Button onClick={() => setShowSettings(true)}>
            <Target className="w-4 h-4 mr-2" />
            {t('goals.setGoals') || 'Set Goals'}
          </Button>
        </Card>
      )}
    </div>
  )
}
