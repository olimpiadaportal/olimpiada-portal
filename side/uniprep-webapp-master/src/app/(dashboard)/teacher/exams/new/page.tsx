'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  FileText,
  Minus,
  Plus,
  Search,
  Lock,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useToast } from '@/contexts/ToastContext'
import { teacherExamService } from '@/services/teacherExamService'
import {
  TeacherQuestion,
  ExamFormData,
  ExamGroupSubject,
  ElmlyQuestion,
  SelectedQuestion,
} from '@/types/teacherExam'

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAM_TYPES = ['first_stage', 'second_stage', 'individual'] as const
const TARGET_GROUPS = ['I', 'II', 'III', 'IV', 'V'] as const

const EMPTY_FORM: ExamFormData = {
  title: '',
  exam_type: 'first_stage',
  target_group: 'I',
  duration_minutes: 90,
  total_questions: 0,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewExamPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const { success: showSuccess, error: showError } = useToast()

  // Step & identity
  const [step, setStep] = useState(1)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [examId, setExamId] = useState<string | null>(null)

  // Step 1 state
  const [formData, setFormData] = useState<ExamFormData>(EMPTY_FORM)
  const [groupSubjects, setGroupSubjects] = useState<ExamGroupSubject[]>([])
  const [loadingGroupConfig, setLoadingGroupConfig] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [step1Touched, setStep1Touched] = useState(false)

  // Group-change warning
  const [showGroupChangeWarning, setShowGroupChangeWarning] = useState(false)
  const pendingFormChangeRef = useRef<Partial<ExamFormData> | null>(null)

  // Step 2 state
  const [activeSubjectId, setActiveSubjectId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'mine' | 'elmly'>('mine')
  const [myQuestions, setMyQuestions] = useState<TeacherQuestion[]>([])
  const [elmlyQuestions, setElmlyQuestions] = useState<ElmlyQuestion[]>([])
  const [selectedQuestions, setSelectedQuestions] = useState<SelectedQuestion[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingQ, setLoadingQ] = useState(false)
  const [loadingElmly, setLoadingElmly] = useState(false)
  const [addingQ, setAddingQ] = useState(false)
  const [allSubjects, setAllSubjects] = useState<{ id: string; name_en: string; name_az: string }[]>([])
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Step 3 state
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
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

      const { data: subs } = await (supabase as any)
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en')
      setAllSubjects(subs || [])
    }
    init()
  }, [router])

  // Fetch group config when exam type or group changes (stage exams only)
  useEffect(() => {
    const isStage = formData.exam_type === 'first_stage' || formData.exam_type === 'second_stage'
    if (!isStage || !formData.target_group) {
      setGroupSubjects([])
      if (formData.exam_type === 'individual') {
        setFormData(f => ({ ...f, total_questions: f.total_questions || 30 }))
      }
      return
    }

    const stage: 'first' | 'second' = formData.exam_type === 'first_stage' ? 'first' : 'second'
    setLoadingGroupConfig(true)
    teacherExamService.getExamGroupConfig(formData.target_group as string, stage)
      .then(data => {
        setGroupSubjects(data)
        const total = data.reduce((sum, s) => sum + s.questions_count, 0)
        setFormData(f => ({ ...f, total_questions: total }))
      })
      .catch(console.error)
      .finally(() => setLoadingGroupConfig(false))
  }, [formData.exam_type, formData.target_group])

  // ─── Step 1: handle type/group changes with warning ──────────────────────

  const requestFormChange = (change: Partial<ExamFormData>) => {
    if (selectedQuestions.length > 0) {
      pendingFormChangeRef.current = change
      setShowGroupChangeWarning(true)
    } else {
      setFormData(f => ({ ...f, ...change }))
    }
  }

  const confirmGroupChange = async () => {
    if (!examId) {
      // No exam created yet, just apply change
      if (pendingFormChangeRef.current) {
        setFormData(f => ({ ...f, ...pendingFormChangeRef.current! }))
      }
      setSelectedQuestions([])
      setShowGroupChangeWarning(false)
      pendingFormChangeRef.current = null
      return
    }
    try {
      await teacherExamService.clearExamQuestions(examId)
      setSelectedQuestions([])
      if (pendingFormChangeRef.current) {
        setFormData(f => ({ ...f, ...pendingFormChangeRef.current! }))
      }
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setShowGroupChangeWarning(false)
      pendingFormChangeRef.current = null
    }
  }

  // ─── Step 2 data loading ──────────────────────────────────────────────────

  const loadMyQuestions = useCallback(async (tid: string, subjectId: string) => {
    setLoadingQ(true)
    try {
      const qs = await teacherExamService.getMyQuestions(tid)
      const filtered = subjectId ? qs.filter(q => q.subject_id === subjectId) : qs
      setMyQuestions(filtered)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingQ(false)
    }
  }, [])

  const loadElmlyQuestions = useCallback(async (subjectId: string, search?: string) => {
    if (!subjectId) { setElmlyQuestions([]); return }
    setLoadingElmly(true)
    try {
      const qs = await teacherExamService.searchElmlyQuestions(subjectId, search)
      setElmlyQuestions(qs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingElmly(false)
    }
  }, [])

  useEffect(() => {
    if (step !== 2 || !teacherId || !activeSubjectId) return
    loadMyQuestions(teacherId, activeSubjectId)
    setElmlyQuestions([])
    setSearchQuery('')
    setPendingIds(new Set())
    if (activeTab === 'elmly') {
      loadElmlyQuestions(activeSubjectId)
    }
  }, [step, teacherId, activeSubjectId, activeTab, loadMyQuestions, loadElmlyQuestions])

  const handleElmlySearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      loadElmlyQuestions(activeSubjectId, q)
    }, 2000)
  }

  // ─── Step 1 handlers ─────────────────────────────────────────────────────

  const handleStep1Next = async () => {
    if (!teacherId) return
    setStep1Touched(true)

    if (!formData.title.trim()) {
      showError(t('common.validation.required') || 'Please fill in exam title')
      return
    }
    if (formData.duration_minutes < 10 || formData.duration_minutes > 180) {
      showError('Duration must be 10–180 minutes')
      return
    }
    if (formData.exam_type === 'individual' && (formData.total_questions < 5 || formData.total_questions > 90)) {
      showError(t('teacherExams.exams.totalQuestionsHint') || 'Total questions must be 5–90')
      return
    }

    setSavingDetails(true)
    try {
      let eid = examId
      if (!eid) {
        eid = await teacherExamService.createExam(teacherId, formData)
        setExamId(eid)
      } else {
        await teacherExamService.updateExam(teacherId, eid, formData)
      }

      const subjectList = getSubjectList()
      if (subjectList.length > 0) setActiveSubjectId(subjectList[0].id)
      setActiveTab('mine')
      setStep(2)
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setSavingDetails(false)
    }
  }

  // ─── Step 2 helpers ───────────────────────────────────────────────────────

  const getSubjectList = () => {
    if (formData.exam_type === 'individual') return allSubjects
    return groupSubjects.map(gs => ({
      id: gs.subject_id,
      name_en: gs.subject_name_en,
      name_az: gs.subject_name_az,
    }))
  }

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return ''
    const list = getSubjectList()
    const s = list.find(s => s.id === subjectId)
    if (!s) return ''
    return locale === 'az' ? s.name_az : s.name_en
  }

  const getRequiredCount = (subjectId: string): number | null => {
    if (formData.exam_type === 'individual') return null
    return groupSubjects.find(s => s.subject_id === subjectId)?.questions_count ?? null
  }

  const getAddedCountForSubject = (subjectId: string) =>
    selectedQuestions.filter(q => q.subject_id === subjectId).length

  const addedQuestionKeys = new Set(selectedQuestions.map(q => q.key))

  const availableMyQuestions = myQuestions.filter(q => !addedQuestionKeys.has(`teacher:${q.id}`))
  const availableElmlyQuestions = elmlyQuestions.filter(q => !addedQuestionKeys.has(`elmly:${q.id}`))

  const togglePending = (key: string) => {
    setPendingIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleAddPending = async () => {
    if (!examId || pendingIds.size === 0) return
    setAddingQ(true)
    try {
      const teacherIds = [...pendingIds].filter(k => k.startsWith('teacher:')).map(k => k.replace('teacher:', ''))
      const elmlyIds = [...pendingIds].filter(k => k.startsWith('elmly:')).map(k => k.replace('elmly:', ''))

      const newEntries: SelectedQuestion[] = []

      if (teacherIds.length > 0) {
        const inserted = await teacherExamService.addQuestionsToExam(examId, teacherIds)
        for (const row of inserted) {
          const q = myQuestions.find(q => q.id === row.teacher_question_id)
          if (q) newEntries.push({
            key: `teacher:${q.id}`,
            teq_id: row.id,
            teacher_question_id: q.id,
            question_id: null,
            question_text: q.question_text,
            question_type: q.question_type,
            subject_id: q.subject_id,
            subject_name: getSubjectName(q.subject_id),
            source: 'teacher',
          })
        }
      }

      if (elmlyIds.length > 0) {
        const inserted = await teacherExamService.addElmlyQuestionsToExam(examId, elmlyIds)
        for (const row of inserted) {
          const q = elmlyQuestions.find(q => q.id === row.question_id)
          if (q) newEntries.push({
            key: `elmly:${q.id}`,
            teq_id: row.id,
            teacher_question_id: null,
            question_id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            subject_id: q.subject_id,
            subject_name: locale === 'az' ? q.subject_name_az : q.subject_name_en,
            source: 'elmly',
          })
        }
      }

      setSelectedQuestions(prev => [...prev, ...newEntries])
      setPendingIds(new Set())
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setAddingQ(false)
    }
  }

  const handleRemoveQuestion = async (teqId: string) => {
    if (!examId) return
    try {
      await teacherExamService.removeQuestionFromExam(examId, teqId)
      setSelectedQuestions(prev => prev.filter(q => q.teq_id !== teqId))
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    }
  }

  // ─── Step 3 handlers ──────────────────────────────────────────────────────

  const isDraftState = selectedQuestions.length !== formData.total_questions

  const handleSaveDraft = async () => {
    setSavingDraft(true)
    try { router.push('/teacher/exams') } finally { setSavingDraft(false) }
  }

  const handlePublish = async () => {
    if (!teacherId || !examId) return
    if (selectedQuestions.length === 0) {
      showError(t('teacherExams.exams.noQuestionsAdded') || 'Add at least one question')
      return
    }
    setPublishing(true)
    try {
      await teacherExamService.publishExam(teacherId, examId)
      showSuccess(t('teacherExams.exams.publishSuccess') || 'Submitted')
      router.push('/teacher/exams')
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setPublishing(false)
    }
  }

  // ─── Step indicator ───────────────────────────────────────────────────────

  const steps = [
    t('teacherExams.exams.steps.details'),
    t('teacherExams.exams.steps.questions'),
    t('teacherExams.exams.steps.review'),
  ]

  const subjectList = getSubjectList()

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/teacher/exams')}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('teacherExams.exams.createExam')}
          </h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center mb-8">
          {steps.map((label, i) => {
            const stepNum = i + 1
            const done = step > stepNum
            const active = step === stepNum
            return (
              <div key={stepNum} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                    done ? 'bg-green-600 border-green-600 text-white'
                    : active ? 'bg-blue-900 border-blue-900 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : stepNum}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${
                    active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                  }`}>{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    step > stepNum ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        {/* ──────────────────── STEP 1 ──────────────────── */}
        {step === 1 && (
          <Card className="p-6 bg-white dark:bg-gray-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              {t('teacherExams.exams.steps.details')}
            </h2>
            <div className="space-y-6">

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('teacherExams.exams.fields.title')} <span className="text-red-500">*</span>
                </label>
                <input
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    step1Touched && !formData.title.trim() ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  maxLength={200}
                  value={formData.title}
                  onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('teacherExams.exams.fields.title')}
                />
              </div>

              {/* Exam type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('teacherExams.exams.fields.examType')}
                </label>
                <div className="space-y-2">
                  {EXAM_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => requestFormChange({ exam_type: type })}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        formData.exam_type === type
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500 bg-white dark:bg-gray-700'
                      }`}
                    >
                      <p className="font-medium text-sm">{t(`exams.types.${type}` as any)}</p>
                      <p className={`text-xs mt-0.5 ${formData.exam_type === type ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
                        {t(`teacherExams.exams.typeDesc.${type}` as any)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target group (stage exams only) */}
              {(formData.exam_type === 'first_stage' || formData.exam_type === 'second_stage') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('teacherExams.exams.fields.targetGroup')} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    {TARGET_GROUPS.map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => requestFormChange({ target_group: g })}
                        className={`w-12 h-10 rounded-lg border font-semibold text-sm transition-colors ${
                          formData.target_group === g
                            ? 'bg-blue-900 text-white border-blue-900'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  {/* Group subjects preview */}
                  {loadingGroupConfig && (
                    <div className="mt-3 h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  )}
                  {!loadingGroupConfig && groupSubjects.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupSubjects.map(gs => (
                        <div key={gs.subject_id} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
                            {locale === 'az' ? gs.subject_name_az : gs.subject_name_en}
                          </span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            — {gs.questions_count} {t('teacherExams.exams.questionCount')}
                          </span>
                          {gs.coefficient !== 1.0 && (
                            <span className="text-xs text-blue-500">×{gs.coefficient}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('teacherExams.exams.fields.duration')}
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setFormData(f => ({ ...f, duration_minutes: Math.max(10, f.duration_minutes - 5) }))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input
                    type="number"
                    className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={10} max={180}
                    value={formData.duration_minutes}
                    onChange={e => setFormData(f => ({ ...f, duration_minutes: Math.min(180, Math.max(10, Number(e.target.value))) }))}
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setFormData(f => ({ ...f, duration_minutes: Math.min(180, f.duration_minutes + 5) }))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('common.minutes')} (max 180)</span>
                </div>
              </div>

              {/* Total questions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('teacherExams.exams.fields.totalQuestions')}
                </label>
                {formData.exam_type === 'individual' ? (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setFormData(f => ({ ...f, total_questions: Math.max(5, f.total_questions - 1) }))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <input
                      type="number"
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min={5} max={90}
                      value={formData.total_questions || ''}
                      onChange={e => setFormData(f => ({ ...f, total_questions: Number(e.target.value) }))}
                    />
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setFormData(f => ({ ...f, total_questions: Math.min(90, f.total_questions + 1) }))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-gray-400">{t('teacherExams.exams.totalQuestionsHint')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {loadingGroupConfig ? '...' : formData.total_questions}
                    </span>
                    <span className="text-xs text-gray-400">{t('teacherExams.exams.totalQuestionsLocked')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-8">
              <Button
                onClick={handleStep1Next}
                disabled={savingDetails || loadingGroupConfig}
                className="bg-blue-900 hover:bg-blue-800 text-white"
              >
                {savingDetails ? t('common.saving') : t('common.next')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* ──────────────────── STEP 2 ──────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Added questions summary */}
            <Card className="p-4 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('teacherExams.exams.steps.questions')}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-blue-900 dark:text-blue-400">{selectedQuestions.length}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/ {formData.total_questions} {t('teacherExams.exams.questionCount')}</span>
                </div>
              </div>
              <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (selectedQuestions.length / (formData.total_questions || 1)) * 100)}%` }}
                />
              </div>

              {selectedQuestions.length > 0 && (
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {selectedQuestions.map((q, idx) => (
                    <div key={q.key} className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <span className="text-xs font-mono text-gray-500 w-5 shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900 dark:text-white line-clamp-1">{q.question_text}</p>
                        <div className="flex gap-1 mt-0.5">
                          <span className="text-xs text-gray-400">{q.subject_name}</span>
                          <Badge className={`text-xs py-0 px-1 ${q.source === 'teacher' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                            {q.source === 'teacher' ? t('teacherExams.exams.tab.mine') : 'Elmly'}
                          </Badge>
                        </div>
                      </div>
                      <button
                        onClick={() => q.teq_id && handleRemoveQuestion(q.teq_id)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0 px-2"
                      >
                        {t('teacherExams.exams.removeQuestion')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Subject chips */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {subjectList.map(s => {
                const req = getRequiredCount(s.id)
                const added = getAddedCountForSubject(s.id)
                const isActive = activeSubjectId === s.id
                const isDone = req !== null && added >= req
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSubjectId(s.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                      isActive
                        ? 'bg-blue-900 text-white border-blue-900'
                        : isDone
                        ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-blue-400'
                    }`}
                  >
                    {isDone && <Check className="h-3 w-3" />}
                    <span>{locale === 'az' ? s.name_az : s.name_en}</span>
                    {req !== null && (
                      <span className={`text-xs ${isActive ? 'text-blue-200' : isDone ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                        {added}/{req}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Tabs */}
            <Card className="bg-white dark:bg-gray-800">
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                {(['mine', 'elmly'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab)
                      setPendingIds(new Set())
                      if (tab === 'elmly' && activeSubjectId) loadElmlyQuestions(activeSubjectId, searchQuery)
                    }}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-blue-900 text-blue-900 dark:text-blue-400 dark:border-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab === 'mine' ? t('teacherExams.exams.tab.mine') : t('teacherExams.exams.tab.elmly')}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {activeTab === 'elmly' && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={t('teacherExams.exams.searchElmly')}
                      value={searchQuery}
                      onChange={e => handleElmlySearch(e.target.value)}
                    />
                  </div>
                )}

                {pendingIds.size > 0 && (
                  <div className="mb-3">
                    <Button
                      onClick={handleAddPending}
                      disabled={addingQ}
                      className="bg-blue-900 hover:bg-blue-800 text-white w-full"
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {addingQ ? t('common.saving') : `${t('common.add') || 'Əlavə et'} (${pendingIds.size})`}
                    </Button>
                  </div>
                )}

                {activeTab === 'mine' ? (
                  loadingQ ? (
                    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}</div>
                  ) : availableMyQuestions.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">{t('teacherExams.exams.alreadyAdded')}</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {availableMyQuestions.map(q => {
                        const key = `teacher:${q.id}`
                        const pending = pendingIds.has(key)
                        return (
                          <div
                            key={q.id}
                            onClick={() => togglePending(key)}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                              pending ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${pending ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                              {pending && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{q.question_text}</p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {q.question_type === 'mcq' ? t('teacherExams.questions.fields.mcq') : t('teacherExams.questions.fields.shortAnswer')}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : (
                  loadingElmly ? (
                    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}</div>
                  ) : !activeSubjectId ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">Select a subject first</p>
                  ) : availableElmlyQuestions.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
                      {searchQuery ? t('teacherExams.exams.searchElmly') : t('teacherExams.exams.alreadyAdded')}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {availableElmlyQuestions.map(q => {
                        const key = `elmly:${q.id}`
                        const pending = pendingIds.has(key)
                        return (
                          <div
                            key={q.id}
                            onClick={() => togglePending(key)}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                              pending ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${pending ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                              {pending && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <p className="flex-1 text-sm text-gray-900 dark:text-white line-clamp-2">{q.question_text}</p>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            </Card>

            <div className="flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('teacherExams.exams.leaderboardNotice')}</p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-2" />{t('common.previous')}
              </Button>
              <Button onClick={() => setStep(3)} className="bg-blue-900 hover:bg-blue-800 text-white">
                {t('common.next')}<ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ──────────────────── STEP 3 ──────────────────── */}
        {step === 3 && (
          <Card className="p-6 bg-white dark:bg-gray-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">{t('teacherExams.exams.examSummary')}</h2>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('teacherExams.exams.fields.title')}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formData.title}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('teacherExams.exams.fields.examType')}</p>
                  <Badge variant="outline" className="mt-1 text-xs">{t(`exams.types.${formData.exam_type}` as any)}</Badge>
                </div>
                {formData.target_group && formData.exam_type !== 'individual' && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('teacherExams.exams.fields.targetGroup')}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{formData.target_group}</Badge>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('teacherExams.exams.fields.duration')}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-sm text-gray-900 dark:text-white">{formData.duration_minutes} {t('common.minutes')}</span>
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('teacherExams.exams.steps.questions')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedQuestions.length}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">/ {formData.total_questions} {t('teacherExams.exams.questionCount')}</span>
                </p>
              </div>
            </div>

            {isDraftState && selectedQuestions.length > 0 && (
              <div className="flex gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-6">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  {t('teacherExams.exams.countMismatchNotice')
                    .replace('{{added}}', String(selectedQuestions.length))
                    .replace('{{total}}', String(formData.total_questions))}
                </p>
              </div>
            )}
            {selectedQuestions.length === 0 && (
              <div className="flex gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-6">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">{t('teacherExams.exams.noQuestionsAdded')}</p>
              </div>
            )}

            <div className="flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('teacherExams.exams.leaderboardNotice')}</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-2" />{t('common.previous')}
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft}>
                  {savingDraft ? t('common.saving') : t('teacherExams.exams.saveDraft')}
                </Button>
                {!isDraftState && selectedQuestions.length > 0 && (
                  <Button onClick={handlePublish} disabled={publishing} className="bg-green-600 hover:bg-green-700 text-white">
                    {publishing ? t('common.saving') : t('teacherExams.exams.publish')}
                    <Check className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Group/Stage change warning modal ── */}
      {showGroupChangeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('common.confirm')}
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t('teacherExams.exams.groupChangeWarning').replace('{{count}}', String(selectedQuestions.length))}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGroupChangeWarning(false)
                  pendingFormChangeRef.current = null
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={confirmGroupChange}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
