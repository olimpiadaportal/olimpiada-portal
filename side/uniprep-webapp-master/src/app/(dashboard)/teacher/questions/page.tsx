'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useToast } from '@/contexts/ToastContext'
import { teacherExamService } from '@/services/teacherExamService'
import {
  TeacherQuestion,
  QuestionFormData,
  SubjectTopic,
  SubjectSubtopic,
} from '@/types/teacherExam'

interface Subject {
  id: string
  name_en: string
  name_az: string
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'easy',
  2: 'easy',
  3: 'medium',
  4: 'hard',
  5: 'hard',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  hard: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
}

const EMPTY_FORM: QuestionFormData = {
  question_text: '',
  question_type: 'mcq',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  option_e: '',
  correct_answer: '',
  explanation: '',
  difficulty: 3,
  subject_id: '',
  topic_id: '',
  subtopic_id: '',
}

export default function TeacherQuestionsPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const { success: showSuccess, error: showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestion | null>(null)
  const [formData, setFormData] = useState<QuestionFormData>(EMPTY_FORM)
  const [topics, setTopics] = useState<SubjectTopic[]>([])
  const [subtopics, setSubtopics] = useState<SubjectSubtopic[]>([])
  const [saving, setSaving] = useState(false)
  // Track which required fields were touched (for red border on submit)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<TeacherQuestion | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: teacher } = await (supabase as any)
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!teacher) { router.push('/teacher/dashboard'); return }

      setTeacherId(teacher.id)

      const [qs, subs] = await Promise.all([
        teacherExamService.getMyQuestions(teacher.id),
        (supabase as any).from('subjects').select('id, name_en, name_az').order('name_en'),
      ])

      setQuestions(qs)
      setSubjects(subs.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Close modals on Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showModal) { setShowModal(false); return }
        if (deleteTarget) { setDeleteTarget(null); return }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showModal, deleteTarget])

  const handleSubjectChange = async (subjectId: string) => {
    setFormData(f => ({ ...f, subject_id: subjectId, topic_id: '', subtopic_id: '' }))
    setTopics([])
    setSubtopics([])
    if (subjectId) {
      try {
        const t = await teacherExamService.getTopics(subjectId)
        setTopics(t)
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleTopicChange = async (topicId: string) => {
    setFormData(f => ({ ...f, topic_id: topicId, subtopic_id: '' }))
    setSubtopics([])
    if (topicId) {
      try {
        const st = await teacherExamService.getSubtopics(topicId)
        setSubtopics(st)
      } catch (err) {
        console.error(err)
      }
    }
  }

  const openAddModal = () => {
    setEditingQuestion(null)
    setFormData(EMPTY_FORM)
    setTopics([])
    setSubtopics([])
    setTouched({})
    setShowModal(true)
  }

  const openEditModal = async (q: TeacherQuestion) => {
    setEditingQuestion(q)
    const newForm: QuestionFormData = {
      question_text: q.question_text,
      question_type: q.question_type,
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      option_e: q.option_e || '',
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 3,
      subject_id: q.subject_id || '',
      topic_id: '',
      subtopic_id: q.subtopic_id || '',
    }
    setFormData(newForm)
    setTopics([])
    setSubtopics([])
    setTouched({})

    // Pre-load topics/subtopics if question has a subject
    if (q.subject_id) {
      try {
        const loadedTopics = await teacherExamService.getTopics(q.subject_id)
        setTopics(loadedTopics)
        // Find which topic contains this subtopic
        if (q.subtopic_id && loadedTopics.length > 0) {
          for (const topic of loadedTopics) {
            const sts = await teacherExamService.getSubtopics(topic.id)
            const found = sts.find(st => st.id === q.subtopic_id)
            if (found) {
              setFormData(f => ({ ...f, topic_id: topic.id }))
              setSubtopics(sts)
              break
            }
          }
        }
      } catch (err) {
        console.error(err)
      }
    }

    setShowModal(true)
  }

  const handleSave = async () => {
    if (!teacherId) return

    // Validate required fields
    const newTouched: Record<string, boolean> = {}
    let hasError = false

    if (!formData.subject_id) {
      newTouched.subject_id = true
      hasError = true
    }
    if (!formData.question_text.trim()) {
      newTouched.question_text = true
      hasError = true
    }
    if (!formData.correct_answer.trim()) {
      newTouched.correct_answer = true
      hasError = true
    }
    if (formData.question_type === 'mcq') {
      if (!formData.option_a?.trim()) { newTouched.option_a = true; hasError = true }
      if (!formData.option_b?.trim()) { newTouched.option_b = true; hasError = true }
      if (!formData.option_c?.trim()) { newTouched.option_c = true; hasError = true }
      if (!formData.option_d?.trim()) { newTouched.option_d = true; hasError = true }
      if (!formData.option_e?.trim()) { newTouched.option_e = true; hasError = true }
    }

    if (hasError) {
      setTouched(newTouched)
      showError(t('common.validation.required') || 'Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      if (editingQuestion) {
        await teacherExamService.updateQuestion(teacherId, editingQuestion.id, formData)
      } else {
        await teacherExamService.createQuestion(teacherId, formData)
      }
      setShowModal(false)
      await loadData()
      showSuccess(t('common.success') || 'Saved')
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!teacherId || !deleteTarget) return
    setDeleting(true)
    try {
      await teacherExamService.deleteQuestion(teacherId, deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
      showSuccess(t('teacherExams.questions.deleteSuccess') || 'Deleted')
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setDeleting(false)
    }
  }

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return '—'
    const sub = subjects.find(s => s.id === subjectId)
    if (!sub) return '—'
    return locale === 'az' ? sub.name_az : sub.name_en
  }

  const getDiffLabel = (difficulty: number | null) => {
    if (!difficulty) return null
    return DIFFICULTY_LABELS[difficulty] || 'medium'
  }

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      touched[field]
        ? 'border-red-500 ring-1 ring-red-500'
        : 'border-gray-300 dark:border-gray-600'
    }`

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            ))}
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
            onClick={() => router.push('/teacher/dashboard')}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {t('teacherExams.questions.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {questions.length} {t('teacherExams.exams.questionCount')}
              </p>
            </div>
            <Button
              onClick={openAddModal}
              className="bg-blue-900 hover:bg-blue-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('teacherExams.questions.addQuestion')}
            </Button>
          </div>
        </div>

        {/* Questions list */}
        {questions.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-gray-800">
            <HelpCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teacherExams.questions.empty')}
            </h3>
            <Button
              onClick={openAddModal}
              className="mt-4 bg-blue-900 hover:bg-blue-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('teacherExams.questions.addQuestion')}
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => {
              const diffLabel = getDiffLabel(q.difficulty)
              return (
                <Card
                  key={q.id}
                  className="p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white font-medium line-clamp-2">
                        {q.question_text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {q.question_type === 'mcq'
                            ? t('teacherExams.questions.fields.mcq')
                            : t('teacherExams.questions.fields.shortAnswer')}
                        </Badge>
                        {diffLabel && (
                          <Badge className={`text-xs ${DIFFICULTY_COLORS[diffLabel]}`}>
                            {t(`common.difficulty.${diffLabel}`)}
                          </Badge>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {getSubjectName(q.subject_id)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(q)}
                        className="text-gray-600 dark:text-gray-400 hover:text-blue-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(q)}
                        className="text-gray-600 dark:text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                {editingQuestion
                  ? t('teacherExams.questions.editQuestion')
                  : t('teacherExams.questions.addQuestion')}
              </h2>

              <div className="space-y-4">
                {/* Subject → Topic → Subtopic cascade */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.subject')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      touched.subject_id ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    value={formData.subject_id}
                    onChange={e => {
                      setTouched(prev => ({ ...prev, subject_id: false }))
                      handleSubjectChange(e.target.value)
                    }}
                  >
                    <option value="">{t('common.notSelected') || 'Not Selected'}</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {locale === 'az' ? s.name_az : s.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                {topics.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('teacherExams.questions.fields.topic') || 'Topic'}
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.topic_id}
                      onChange={e => handleTopicChange(e.target.value)}
                    >
                      <option value="">{t('common.notSelected') || 'Not Selected'}</option>
                      {topics.map(tp => (
                        <option key={tp.id} value={tp.id}>{tp.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {subtopics.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('teacherExams.questions.fields.subtopic') || 'Subtopic'}
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.subtopic_id}
                      onChange={e => setFormData(f => ({ ...f, subtopic_id: e.target.value }))}
                    >
                      <option value="">{t('common.notSelected') || 'Not Selected'}</option>
                      {subtopics.map(st => (
                        <option key={st.id} value={st.id}>{st.subtopic_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Question type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.questionType')} *
                  </label>
                  <div className="flex gap-3">
                    {(['mcq', 'short_answer'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, question_type: type, correct_answer: '' }))}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          formData.question_type === type
                            ? 'bg-blue-900 text-white border-blue-900'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500'
                        }`}
                      >
                        {type === 'mcq'
                          ? t('teacherExams.questions.fields.mcq')
                          : t('teacherExams.questions.fields.shortAnswer')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.questionText')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className={`${inputClass('question_text')} resize-none`}
                    rows={3}
                    maxLength={3000}
                    value={formData.question_text}
                    onChange={e => {
                      setTouched(prev => ({ ...prev, question_text: false }))
                      setFormData(f => ({ ...f, question_text: e.target.value }))
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">{formData.question_text.length}/3000</p>
                </div>

                {/* MCQ Options */}
                {formData.question_type === 'mcq' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['a', 'b', 'c', 'd', 'e'] as const).map((opt) => {
                      const key = `option_${opt}` as keyof QuestionFormData
                      return (
                        <div key={opt}>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t(`teacherExams.questions.fields.option${opt.toUpperCase()}` as any)} <span className="text-red-500">*</span>
                          </label>
                          <input
                            className={inputClass(key)}
                            maxLength={500}
                            value={formData[key] as string}
                            onChange={e => {
                              setTouched(prev => ({ ...prev, [key]: false }))
                              setFormData(f => ({ ...f, [key]: e.target.value }))
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Correct Answer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.correctAnswer')} <span className="text-red-500">*</span>
                  </label>
                  {formData.question_type === 'mcq' ? (
                    <div className="flex gap-2 flex-wrap">
                      {(['A', 'B', 'C', 'D', 'E'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setTouched(prev => ({ ...prev, correct_answer: false }))
                            setFormData(f => ({ ...f, correct_answer: opt }))
                          }}
                          className={`w-10 h-10 rounded-lg border font-semibold text-sm transition-colors ${
                            formData.correct_answer === opt
                              ? 'bg-green-600 text-white border-green-600'
                              : touched.correct_answer
                              ? 'border-red-500 text-gray-700 dark:text-gray-300 hover:border-green-500'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-500'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className={inputClass('correct_answer')}
                      maxLength={1000}
                      value={formData.correct_answer}
                      onChange={e => {
                        setTouched(prev => ({ ...prev, correct_answer: false }))
                        setFormData(f => ({ ...f, correct_answer: e.target.value }))
                      }}
                    />
                  )}
                </div>

                {/* Difficulty */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.difficulty')}
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.difficulty}
                    onChange={e => setFormData(f => ({ ...f, difficulty: Number(e.target.value) }))}
                  >
                    <option value={1}>{t('common.difficulty.easy')}</option>
                    <option value={3}>{t('common.difficulty.medium')}</option>
                    <option value={5}>{t('common.difficulty.hard')}</option>
                  </select>
                </div>

                {/* Explanation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('teacherExams.questions.fields.explanation')} ({t('common.optional')})
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                    maxLength={2000}
                    value={formData.explanation}
                    onChange={e => setFormData(f => ({ ...f, explanation: e.target.value }))}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-900 hover:bg-blue-800 text-white"
                >
                  {saving ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('common.delete')}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              {t('teacherExams.questions.deleteConfirm')}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? '...' : t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
