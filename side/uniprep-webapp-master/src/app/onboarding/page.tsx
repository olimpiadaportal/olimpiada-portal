"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  GraduationCap, Trophy, Target, Flame, Calendar,
  ChevronRight, ChevronLeft, Check, Rocket, Clock, Sparkles
} from "lucide-react"

interface SubjectItem {
  id: string
  name: string
}

const QUESTION_PRESETS = [
  { value: 10, label: "10", desc: "Light" },
  { value: 20, label: "20", desc: "Moderate" },
  { value: 30, label: "30", desc: "Focused" },
  { value: 50, label: "50", desc: "Intensive" },
]

const TIME_PRESETS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
]

const EXAM_GROUPS = [
  { value: "I", desc: "Medicine, Dentistry" },
  { value: "II", desc: "Engineering, IT" },
  { value: "III", desc: "Economics, Law" },
  { value: "IV", desc: "Humanities, Languages" },
  { value: "V", desc: "Arts, Music" },
]

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [studentId, setStudentId] = useState<string | null>(null)

  // Subjects
  const [subjects, setSubjects] = useState<SubjectItem[]>([])

  // User selections
  const [targetGroup, setTargetGroup] = useState<string | null>(null)
  const [strongestSubjects, setStrongestSubjects] = useState<string[]>([])
  const [weakestSubjects, setWeakestSubjects] = useState<string[]>([])
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(20)
  const [dailyTimeTarget, setDailyTimeTarget] = useState(30)
  const [targetExamDate, setTargetExamDate] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: student } = await supabase
        .from("students" as any)
        .select("id, target_group, onboarding_completed")
        .eq("user_id", user.id)
        .single() as { data: any }

      if (!student) { router.push("/login"); return }
      if (student.onboarding_completed) { router.push("/student"); return }

      setStudentId(student.id)
      setTargetGroup(student.target_group)

      const { data: subjectData } = await supabase
        .from("subjects")
        .select("id, name_en, name_az")
        .order("name_en")

      if (subjectData) {
        setSubjects(subjectData.map((s: any) => ({
          id: s.id,
          name: s.name_en,
        })))
      }
    } catch (error) {
      console.error("Error loading onboarding data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1)
  }

  const handleSkip = () => handleComplete()

  const handleComplete = async () => {
    if (!studentId) return
    try {
      setSaving(true)

      // Save subject preferences and mark onboarding complete
      await (supabase
        .from("students") as any)
        .update({
          onboarding_completed: true,
          strongest_subjects: strongestSubjects,
          weakest_subjects: weakestSubjects,
        })
        .eq("id", studentId)

      // Create initial goals
      await (supabase
        .from("student_goals") as any)
        .upsert({
          student_id: studentId,
          daily_question_target: dailyQuestionTarget,
          daily_time_target_minutes: dailyTimeTarget,
          target_exam_date: targetExamDate || null,
          preferred_study_days: [1, 2, 3, 4, 5],
          preferred_study_time: "evening",
        }, { onConflict: "student_id" })

      router.push("/student")
    } catch (error) {
      console.error("Error completing onboarding:", error)
    } finally {
      setSaving(false)
    }
  }

  const toggleSubject = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={handleBack}
            className={`p-2 rounded-lg hover:bg-gray-100 transition ${currentStep === 1 ? 'invisible' : ''}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-500">
            {currentStep} / {TOTAL_STEPS}
          </span>
          <button
            onClick={handleSkip}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition"
          >
            {t("common.skip") || "Skip"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <Card className="p-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          {currentStep === 1 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
                <GraduationCap className="w-10 h-10 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t("personalization.examGroupTitle") || "Your Exam Group"}</h2>
                <p className="text-gray-500 mt-2">{t("personalization.examGroupDesc") || "Confirm your exam preparation group"}</p>
              </div>
              <div className="space-y-3">
                {EXAM_GROUPS.map(group => (
                  <button
                    key={group.value}
                    onClick={() => setTargetGroup(group.value)}
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
                      targetGroup === group.value
                        ? 'border-blue-600 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`text-lg font-bold ${targetGroup === group.value ? 'text-blue-600' : 'text-gray-900'}`}>
                      {t(`personalization.group${group.value}`) || `Group ${group.value}`}
                    </span>
                    <span className={`text-sm ${targetGroup === group.value ? 'text-blue-500' : 'text-gray-400'}`}>
                      {group.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <Trophy className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t("personalization.strongSubjectsTitle") || "Your Strongest Subjects"}</h2>
                <p className="text-gray-500 mt-2">{t("personalization.strongSubjectsDesc") || "Select subjects you feel most confident in"}</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                {subjects.map(subject => {
                  const isSelected = strongestSubjects.includes(subject.id)
                  return (
                    <button
                      key={subject.id}
                      onClick={() => toggleSubject(subject.id, strongestSubjects, setStrongestSubjects)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        isSelected
                          ? 'border-green-500 bg-green-500 text-white shadow-sm'
                          : 'border-gray-200 text-gray-700 hover:border-green-300'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                      {subject.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
                <Target className="w-10 h-10 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t("personalization.weakSubjectsTitle") || "Subjects to Improve"}</h2>
                <p className="text-gray-500 mt-2">{t("personalization.weakSubjectsDesc") || "Select subjects you want to focus on improving"}</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                {subjects.map(subject => {
                  const isSelected = weakestSubjects.includes(subject.id)
                  return (
                    <button
                      key={subject.id}
                      onClick={() => toggleSubject(subject.id, weakestSubjects, setWeakestSubjects)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                          : 'border-gray-200 text-gray-700 hover:border-amber-300'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                      {subject.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-violet-100 flex items-center justify-center">
                <Flame className="w-10 h-10 text-violet-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t("personalization.dailyGoalTitle") || "Set Your Daily Goal"}</h2>
                <p className="text-gray-500 mt-2">{t("personalization.dailyGoalDesc") || "How much do you want to study each day?"}</p>
              </div>

              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700 mb-3">{t("personalization.questionsPerDay") || "Questions per day"}</p>
                <div className="grid grid-cols-4 gap-3">
                  {QUESTION_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setDailyQuestionTarget(preset.value)}
                      className={`flex flex-col items-center py-4 rounded-xl border-2 transition-all ${
                        dailyQuestionTarget === preset.value
                          ? 'border-violet-500 bg-violet-500 text-white shadow-sm'
                          : 'border-gray-200 hover:border-violet-300'
                      }`}
                    >
                      <span className="text-xl font-bold">{preset.label}</span>
                      <span className={`text-xs mt-1 ${dailyQuestionTarget === preset.value ? 'text-violet-100' : 'text-gray-400'}`}>
                        {preset.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700 mb-3">{t("personalization.timePerDay") || "Study time per day"}</p>
                <div className="grid grid-cols-4 gap-3">
                  {TIME_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setDailyTimeTarget(preset.value)}
                      className={`flex flex-col items-center py-4 rounded-xl border-2 transition-all ${
                        dailyTimeTarget === preset.value
                          ? 'border-violet-500 bg-violet-500 text-white shadow-sm'
                          : 'border-gray-200 hover:border-violet-300'
                      }`}
                    >
                      <Clock className={`w-4 h-4 mb-1 ${dailyTimeTarget === preset.value ? 'text-white' : 'text-gray-400'}`} />
                      <span className="text-sm font-bold">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                <Calendar className="w-10 h-10 text-red-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t("personalization.examDateTitle") || "When is Your Exam?"}</h2>
                <p className="text-gray-500 mt-2">{t("personalization.examDateDesc") || "This helps us create a personalized study plan for you"}</p>
              </div>

              <input
                type="date"
                value={targetExamDate}
                onChange={(e) => setTargetExamDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-lg transition"
              />

              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl text-left">
                <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-600">
                  {t("personalization.examDateTip") || "You can always change this later in your goal settings."}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Continue button */}
        <div className="mt-6">
          <Button
            onClick={handleNext}
            disabled={saving}
            className="w-full py-6 text-lg font-bold rounded-xl shadow-lg"
            size="lg"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                {currentStep === TOTAL_STEPS
                  ? (t("personalization.finish") || "Get Started!")
                  : (t("personalization.continue") || "Continue")}
                {currentStep === TOTAL_STEPS
                  ? <Rocket className="w-5 h-5 ml-2" />
                  : <ChevronRight className="w-5 h-5 ml-2" />}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
