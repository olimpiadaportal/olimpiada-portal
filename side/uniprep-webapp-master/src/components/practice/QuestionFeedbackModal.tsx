"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { checkExistingFeedback, submitQuestionFeedback } from "@/services/practiceService"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  XCircle,
  HelpCircle,
  List,
  FileText,
  Bookmark,
  Copy,
  MoreHorizontal,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react"

type FeedbackType =
  | "wrong_answer"
  | "unclear_question"
  | "unclear_options"
  | "missing_explanation"
  | "wrong_topic"
  | "duplicate"
  | "other"

interface FeedbackOption {
  type: FeedbackType
  icon: React.ReactNode
  labelKey: string
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  { type: "wrong_answer", icon: <XCircle className="h-4 w-4" />, labelKey: "practice.questionFeedback.wrongAnswer" },
  { type: "unclear_question", icon: <HelpCircle className="h-4 w-4" />, labelKey: "practice.questionFeedback.unclearQuestion" },
  { type: "unclear_options", icon: <List className="h-4 w-4" />, labelKey: "practice.questionFeedback.unclearOptions" },
  { type: "missing_explanation", icon: <FileText className="h-4 w-4" />, labelKey: "practice.questionFeedback.missingExplanation" },
  { type: "wrong_topic", icon: <Bookmark className="h-4 w-4" />, labelKey: "practice.questionFeedback.wrongTopic" },
  { type: "duplicate", icon: <Copy className="h-4 w-4" />, labelKey: "practice.questionFeedback.duplicate" },
  { type: "other", icon: <MoreHorizontal className="h-4 w-4" />, labelKey: "practice.questionFeedback.other" },
]

interface QuestionFeedbackModalProps {
  open: boolean
  questionId: string
  onClose: () => void
  onSubmitted?: () => void
}

export function QuestionFeedbackModal({
  open,
  questionId,
  onClose,
  onSubmitted,
}: QuestionFeedbackModalProps) {
  const { t } = useTranslation()
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyReported, setAlreadyReported] = useState(false)
  const [checking, setChecking] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Track which questionId the async check is for to prevent race conditions
  const activeCheckRef = useRef<string | null>(null)

  // Get user on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
  }, [])

  // Check if user already submitted feedback — reset stale state upfront
  useEffect(() => {
    // Always clear stale state when questionId or visibility changes
    setAlreadyReported(false)
    setSubmitted(false)
    setSelectedType(null)
    setComment("")

    if (open && questionId && userId) {
      activeCheckRef.current = questionId
      setChecking(true)
      checkExistingFeedback(userId, questionId).then((exists) => {
        if (activeCheckRef.current === questionId) {
          setAlreadyReported(exists)
          setChecking(false)
        }
      }).catch(() => {
        if (activeCheckRef.current === questionId) {
          setAlreadyReported(false)
          setChecking(false)
        }
      })
    } else {
      setChecking(false)
    }
  }, [open, questionId, userId])

  const handleClose = () => {
    activeCheckRef.current = null
    setSelectedType(null)
    setComment("")
    setSubmitting(false)
    setSubmitted(false)
    setAlreadyReported(false)
    setChecking(false)
    onClose()
  }

  const handleSubmit = async () => {
    if (!selectedType || !userId) return

    try {
      setSubmitting(true)
      const result = await submitQuestionFeedback(userId, questionId, selectedType, comment)

      if (result.alreadyReported) {
        setAlreadyReported(true)
        return
      }

      if (result.success) {
        setSubmitted(true)
        onSubmitted?.()
        setTimeout(handleClose, 1500)
      } else {
        handleClose()
      }
    } catch {
      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800">
        {checking ? (
          <>
            <DialogTitle className="sr-only">{t("practice.questionFeedback.title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("practice.questionFeedback.subtitle")}</DialogDescription>
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          </>
        ) : alreadyReported ? (
          <>
            <DialogTitle className="sr-only">{t("practice.questionFeedback.alreadyReported")}</DialogTitle>
            <DialogDescription className="sr-only">{t("practice.questionFeedback.alreadyReportedDetail")}</DialogDescription>
            <div className="flex flex-col items-center py-8 gap-3">
              <AlertCircle className="h-12 w-12 text-amber-500" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("practice.questionFeedback.alreadyReported")}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                {t("practice.questionFeedback.alreadyReportedDetail")}
              </p>
              <Button variant="outline" onClick={handleClose} className="mt-2">
                {t("common.close")}
              </Button>
            </div>
          </>
        ) : submitted ? (
          <>
            <DialogTitle className="sr-only">{t("practice.questionFeedback.thankYou")}</DialogTitle>
            <DialogDescription className="sr-only">{t("practice.questionFeedback.feedbackReceived")}</DialogDescription>
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("practice.questionFeedback.thankYou")}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                {t("practice.questionFeedback.feedbackReceived")}
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">
                {t("practice.questionFeedback.title")}
              </DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                {t("practice.questionFeedback.subtitle")}
              </DialogDescription>
            </DialogHeader>

            {/* Feedback type chips */}
            <div className="flex flex-wrap gap-2 mt-2">
              {FEEDBACK_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.type
                return (
                  <button
                    key={opt.type}
                    onClick={() => setSelectedType(opt.type)}
                    className={`
                      flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium
                      transition-colors cursor-pointer
                      ${isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400"
                        : "border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }
                    `}
                  >
                    {opt.icon}
                    {t(opt.labelKey)}
                  </button>
                )
              })}
            </div>

            {/* Optional comment */}
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t("practice.questionFeedback.commentLabel")}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("practice.questionFeedback.commentPlaceholder")}
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={!selectedType || submitting}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("practice.questionFeedback.submit")
              )}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
