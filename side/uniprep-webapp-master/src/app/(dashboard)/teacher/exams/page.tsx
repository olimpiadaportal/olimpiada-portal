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
  Trash2,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useToast } from '@/contexts/ToastContext'
import { teacherExamService } from '@/services/teacherExamService'
import { TeacherExam } from '@/types/teacherExam'

const STATUS_CONFIG = {
  draft: {
    label: 'teacherExams.exams.draft',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  pending: {
    label: 'teacherExams.exams.pendingReview',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  },
  approved: {
    label: 'teacherExams.exams.approved',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  },
}

function getExamStatus(exam: TeacherExam): 'draft' | 'pending' | 'approved' {
  if (exam.is_draft) return 'draft'
  if (exam.is_approved) return 'approved'
  return 'pending'
}

export default function TeacherExamsPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { success: showSuccess, error: showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [exams, setExams] = useState<TeacherExam[]>([])
  const [deleteTarget, setDeleteTarget] = useState<TeacherExam | null>(null)
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
      const data = await teacherExamService.getMyExams(teacher.id)
      setExams(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async () => {
    if (!teacherId || !deleteTarget) return
    setDeleting(true)
    try {
      await teacherExamService.deleteExam(teacherId, deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
      showSuccess(t('teacherExams.exams.deleteSuccess') || 'Deleted')
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    } finally {
      setDeleting(false)
    }
  }

  const handlePublish = async (exam: TeacherExam) => {
    if (!teacherId) return
    try {
      await teacherExamService.publishExam(teacherId, exam.id)
      await loadData()
      showSuccess(t('teacherExams.exams.publishSuccess') || 'Submitted')
    } catch (err) {
      console.error(err)
      showError(t('common.error') || 'Error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('teacherExams.exams.title')}
            </h1>
            <Button
              onClick={() => router.push('/teacher/exams/new')}
              className="bg-blue-900 hover:bg-blue-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('teacherExams.exams.createExam')}
            </Button>
          </div>
        </div>

        {/* Exams list */}
        {exams.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-gray-800">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teacherExams.exams.empty')}
            </h3>
            <Button
              onClick={() => router.push('/teacher/exams/new')}
              className="mt-4 bg-blue-900 hover:bg-blue-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('teacherExams.exams.createExam')}
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => {
              const status = getExamStatus(exam)
              const statusConfig = STATUS_CONFIG[status]
              return (
                <Card key={exam.id} className="p-5 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {exam.title}
                        </h3>
                        <Badge className={statusConfig.color}>
                          {t(statusConfig.label as any)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {exam.duration_minutes} {t('common.minutes')}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {exam.question_count} {t('teacherExams.exams.questionCount')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {exam.target_group}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t(`exams.types.${exam.exam_type}` as any)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {status === 'draft' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/teacher/exams/${exam.id}/edit`)}
                          >
                            {t('common.edit')}
                          </Button>
                          {exam.question_count > 0 && exam.question_count === exam.total_questions && (
                            <Button
                              size="sm"
                              onClick={() => handlePublish(exam)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('teacherExams.exams.publish')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(exam)}
                            className="text-gray-600 dark:text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

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
              {t('teacherExams.exams.deleteConfirm')}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
