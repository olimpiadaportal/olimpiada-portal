"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Clock, Target, TrendingUp, ChevronRight, ArrowLeft, Zap, Brain } from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { motion } from "motion/react"
import { staggerContainer, staggerItem, easings } from "@/lib/animations/variants"

interface Subject {
  id: string
  name_en: string
  name_az: string
  category: string
  coefficient: number
  max_points: number
  total_questions?: number
  completed_questions?: number
  accuracy?: number
}

export default function PracticePage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [studentId, setStudentId] = useState<string | null>(null)

  useEffect(() => {
    loadSubjects()
  }, [])

  const loadSubjects = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get student ID
      const { data: student } = await supabase
        .from("students")
        .select("id, target_group")
        .eq("user_id", user.id)
        .single()

      if (!student) {
        setLoading(false)
        return
      }

      setStudentId((student as any).id)

      // Get all subjects - subjects table uses name_en, name_az columns
      const { data: subjectsData, error: subjectsError } = await supabase
        .from("subjects")
        .select("*")
        .order("name_en")

      if (subjectsData && subjectsData.length > 0) {
        // Get progress for each subject
        const subjectsWithProgress = await Promise.all(
          subjectsData.map(async (subject) => {
            // Get total questions available for this subject (exclude written_open from practice)
            const { count: totalQuestionsAvailable } = await supabase
              .from("questions")
              .select("*", { count: 'exact', head: true })
              .eq("subject_id", (subject as any).id)
              .eq("is_active", true)
              .eq("exclude_from_practice", false)
              .neq("question_type", "written_open")

            // Get user's answers for this subject via student_answers table
            const { data: userAnswers } = await supabase
              .from("student_answers")
              .select("question_id, is_correct, questions!inner(subject_id)")
              .eq("user_id", user.id)
              .eq("questions.subject_id", (subject as any).id)

            // Calculate unique questions practiced
            const uniqueQuestions = new Set((userAnswers || []).map((a: any) => a.question_id))
            const practicedQuestions = uniqueQuestions.size

            // Calculate accuracy from all attempts
            const correctAnswers = (userAnswers || []).filter((a: any) => a.is_correct).length
            const totalAnswers = (userAnswers || []).length
            const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0

            return {
              ...(subject as any),
              total_questions: totalQuestionsAvailable || 0,
              completed_questions: practicedQuestions,
              accuracy,
            }
          })
        )

        setSubjects(subjectsWithProgress)
      } else {
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const getSubjectName = (subject: Subject) => {
    if (locale === 'az') return subject.name_az
    return subject.name_en
  }

  const handleSubjectClick = (subject: Subject) => {
    const subjectName = getSubjectName(subject)
    router.push(`/student/practice/${subject.id}?name=${encodeURIComponent(subjectName)}`)
  }

  const getSubjectColor = (index: number) => {
    const colors = [
      "from-blue-500 to-blue-600",
      "from-green-500 to-green-600",
      "from-purple-500 to-purple-600",
      "from-orange-500 to-orange-600",
      "from-pink-500 to-pink-600",
      "from-indigo-500 to-indigo-600",
    ]
    return colors[index % colors.length]
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CardSkeleton key={i} />
            ))}
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
          className="mb-8"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easings.smooth }}
        >
          <Button
            variant="ghost"
            onClick={() => router.push('/student/home')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('practice.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('practice.subtitle')}
          </p>
        </motion.div>

        {/* Practice Mode Selection */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: easings.smooth }}
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('practice.chooseModeTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Standard Mode Card */}
            <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
            <Card
              className="p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 cursor-pointer transition-all hover:shadow-xl"
              onClick={() => {/* Scroll to subjects section */
                document.getElementById('subjects-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-4 shadow-lg">
                  <BookOpen className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('practice.standardMode.title')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {t('practice.standardMode.description')}
                </p>
                <div className="space-y-2 text-sm text-left">
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    {t('practice.standardMode.feature1')}
                  </div>
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    {t('practice.standardMode.feature2')}
                  </div>
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    {t('practice.standardMode.feature3')}
                  </div>
                </div>
              </div>
            </Card>
            </motion.div>

            {/* Competitive Mode Card */}
            <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
            <Card
              className="p-8 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-300 dark:border-purple-700 hover:border-purple-500 dark:hover:border-purple-600 cursor-pointer transition-all hover:shadow-xl"
              onClick={() => router.push('/student/competitive')}
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-4 shadow-lg">
                  <Zap className="h-10 w-10 text-white" />
                </div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('practice.competitiveMode.title')}
                  </h3>
                  <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                    AI
                  </Badge>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {t('practice.competitiveMode.description')}
                </p>
                <div className="space-y-2 text-sm text-left">
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    {t('practice.competitiveMode.feature1')}
                  </div>
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    {t('practice.competitiveMode.feature2')}
                  </div>
                  <div className="flex items-center text-gray-700 dark:text-gray-300">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    {t('practice.competitiveMode.feature3')}
                  </div>
                </div>
              </div>
            </Card>
            </motion.div>
          </div>
        </motion.div>

        {/* Subjects Section for Standard Mode */}
        <div id="subjects-section">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('practice.selectSubject')}
          </h2>
        {subjects.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('practice.noSubjects')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('practice.noSubjectsDesc')}
            </p>
          </Card>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {subjects.map((subject, index) => (
              <motion.div key={subject.id} variants={staggerItem} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
              <Card
                className="overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => handleSubjectClick(subject)}
              >
                <div className={`h-2 bg-gradient-to-r ${getSubjectColor(index)}`}></div>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {getSubjectName(subject)}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('practice.coefficient')}: {subject.coefficient}x
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                      <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 flex items-center">
                        <Target className="h-4 w-4 mr-2" />
                        {t('practice.questionsCompleted')}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {subject.completed_questions || 0} / {subject.total_questions || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 flex items-center">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        {t('dashboard.student.stats.accuracy')}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {subject.accuracy || 0}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>{t('dashboard.student.stats.progress')}</span>
                      <span>{subject.completed_questions || 0} / {subject.total_questions || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full bg-gradient-to-r ${getSubjectColor(index)} transition-all`}
                        style={{
                          width: `${subject.total_questions && subject.total_questions > 0 ? Math.min(((subject.completed_questions || 0) / subject.total_questions) * 100, 100) : 0}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <Button className="w-full bg-blue-900 hover:bg-blue-800 text-white">
                    {t('practice.startPractice')}
                  </Button>
                </div>
              </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
        </div>
      </div>
    </div>
  )
}
