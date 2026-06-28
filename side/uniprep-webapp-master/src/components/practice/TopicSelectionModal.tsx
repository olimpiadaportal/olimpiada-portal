"use client"

import { useEffect, useState } from 'react'
import { X, CheckSquare, Square, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { getTopicsWithSubtopics, TopicSelection } from '@/services/practiceService'
import { TopicWithSubtopics, SubtopicItem } from '@/types/practice'

export type { TopicSelection }

interface TopicSelectionModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: (selection: TopicSelection) => void
  subjectId: string
  subjectName: string
  mode: 'practice' | 'quiz'
  questionCount: number
}

export function TopicSelectionModal({
  visible,
  onClose,
  onConfirm,
  subjectId,
  subjectName,
  mode,
  questionCount,
}: TopicSelectionModalProps) {
  const { t } = useTranslation()
  const [topics, setTopics] = useState<TopicWithSubtopics[]>([])
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [selectedTopicNames, setSelectedTopicNames] = useState<Set<string>>(new Set())
  const [selectedSubtopicIds, setSelectedSubtopicIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (visible) loadTopics()
  }, [visible, subjectId])

  const loadTopics = async () => {
    setLoading(true)
    try {
      const fetched = await getTopicsWithSubtopics(subjectId)
      setTopics(fetched)
      // Pre-select all by default
      setSelectedTopicNames(
        new Set(fetched.filter(t => t.subtopics.length === 0).map(t => t.topic_name))
      )
      setSelectedSubtopicIds(
        new Set(fetched.flatMap(t => t.subtopics.filter(s => s.is_active).map(s => s.id)))
      )
    } catch (error) {
      console.error('Failed to load topics:', error)
    } finally {
      setLoading(false)
    }
  }

  // ── Tri-state check for topic header ────────────────────────────────────
  const getTopicState = (topic: TopicWithSubtopics): 'all' | 'some' | 'none' => {
    if (topic.subtopics.length === 0) {
      return selectedTopicNames.has(topic.topic_name) ? 'all' : 'none'
    }
    const active = topic.subtopics.filter(s => s.is_active)
    const count = active.filter(s => selectedSubtopicIds.has(s.id)).length
    if (count === 0) return 'none'
    if (count === active.length) return 'all'
    return 'some'
  }

  // ── Global select-all ─────────────────────────────────────────────────────
  const isAllSelected = () => {
    const noSub = topics.filter(t => t.subtopics.length === 0)
    const allSubs = topics.flatMap(t => t.subtopics.filter(s => s.is_active))
    return (
      noSub.every(t => selectedTopicNames.has(t.topic_name)) &&
      allSubs.every(s => selectedSubtopicIds.has(s.id))
    )
  }
  const isNoneSelected = () => selectedTopicNames.size === 0 && selectedSubtopicIds.size === 0

  const toggleSelectAll = () => {
    if (isAllSelected()) {
      setSelectedTopicNames(new Set())
      setSelectedSubtopicIds(new Set())
    } else {
      setSelectedTopicNames(
        new Set(topics.filter(t => t.subtopics.length === 0).map(t => t.topic_name))
      )
      setSelectedSubtopicIds(
        new Set(topics.flatMap(t => t.subtopics.filter(s => s.is_active).map(s => s.id)))
      )
    }
  }

  // ── Topic header checkbox tap ─────────────────────────────────────────────
  const toggleTopicHeader = (topic: TopicWithSubtopics) => {
    if (topic.subtopics.length === 0) {
      const next = new Set(selectedTopicNames)
      if (next.has(topic.topic_name)) { next.delete(topic.topic_name) } else { next.add(topic.topic_name) }
      setSelectedTopicNames(next)
    } else {
      const state = getTopicState(topic)
      const next = new Set(selectedSubtopicIds)
      if (state === 'none') {
        topic.subtopics.filter(s => s.is_active).forEach(s => next.add(s.id))
      } else {
        topic.subtopics.forEach(s => next.delete(s.id))
      }
      setSelectedSubtopicIds(next)
    }
  }

  // ── Expand/collapse ───────────────────────────────────────────────────────
  const toggleExpand = (topicId: string) => {
    const next = new Set(expandedTopics)
    if (next.has(topicId)) { next.delete(topicId) } else { next.add(topicId) }
    setExpandedTopics(next)
  }

  // ── Individual subtopic ───────────────────────────────────────────────────
  const toggleSubtopic = (subtopicId: string) => {
    const next = new Set(selectedSubtopicIds)
    if (next.has(subtopicId)) { next.delete(subtopicId) } else { next.add(subtopicId) }
    setSelectedSubtopicIds(next)
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const topicNames: string[] = []
    for (const topic of topics) {
      if (topic.subtopics.length === 0 && selectedTopicNames.has(topic.topic_name)) {
        topicNames.push(topic.topic_name)
      }
    }
    onConfirm({ topicNames, subtopicIds: Array.from(selectedSubtopicIds) })
  }

  const handleSkip = () => {
    onConfirm({ topicNames: [], subtopicIds: [] })
  }

  const totalSelected = selectedTopicNames.size + selectedSubtopicIds.size
  const selectAllState = isAllSelected() ? 'all' : isNoneSelected() ? 'none' : 'some'

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('practice.topicSelection.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subjectName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Mode Badge */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/20">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-400">
              {mode === 'practice'
                ? t('practice.subjectDetail.practiceMode')
                : t('practice.subjectDetail.quizMode')
              } • {questionCount} {t('practice.topicSelection.questions')}
            </span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">{t('common.loading')}</p>
          </div>
        ) : topics.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('practice.topicSelection.noTopics')}
            </p>
            <Button onClick={handleSkip}>{t('practice.topicSelection.startAnyway') || 'Start Anyway'}</Button>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="px-6 pt-4 flex-shrink-0">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <TriStateIcon state={selectAllState} />
                <span className="font-medium text-gray-900 dark:text-white">
                  {t('practice.topicSelection.selectAll')} ({topics.length})
                </span>
              </button>
            </div>

            {/* Topics List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-1">
                {topics.map((topic) => {
                  const state = getTopicState(topic)
                  const isExpanded = expandedTopics.has(topic.id)
                  const hasSubtopics = topic.subtopics.length > 0

                  return (
                    <div key={topic.id}>
                      {/* Topic header row */}
                      <div
                        className={`flex items-center gap-2 rounded-lg border-2 transition-all ${
                          state !== 'none'
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {/* Checkbox area */}
                        <button
                          onClick={() => toggleTopicHeader(topic)}
                          className="flex items-center gap-3 flex-1 p-4 text-left"
                        >
                          <TriStateIcon state={state} />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {topic.topic_name}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {hasSubtopics
                                ? `${topic.subtopics.filter(s => s.is_active).length} ${t('practice.topicSelection.subtopicsAvailable')}`
                                : `${topic.question_count} ${t('practice.topicSelection.questionsAvailable')}`
                              }
                            </p>
                          </div>
                        </button>

                        {/* Chevron — only when topic has subtopics */}
                        {hasSubtopics && (
                          <button
                            onClick={() => toggleExpand(topic.id)}
                            className="p-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          >
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />
                            }
                          </button>
                        )}
                      </div>

                      {/* Subtopics — shown when expanded */}
                      {hasSubtopics && isExpanded && (
                        <div className="ml-8 mt-1 space-y-1 pb-1">
                          {topic.subtopics.filter(s => s.is_active).map((subtopic) => {
                            const isSubSelected = selectedSubtopicIds.has(subtopic.id)
                            return (
                              <button
                                key={subtopic.id}
                                onClick={() => toggleSubtopic(subtopic.id)}
                                className={`flex items-center gap-3 w-full p-3 rounded-lg border transition-all text-left ${
                                  isSubSelected
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                                }`}
                              >
                                <div className="flex-shrink-0">
                                  {isSubSelected
                                    ? <CheckSquare className="h-4 w-4 text-blue-600" />
                                    : <Square className="h-4 w-4 text-gray-400" />
                                  }
                                </div>
                                <span className="text-sm text-gray-900 dark:text-white">
                                  {subtopic.subtopic_name}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <Button variant="outline" onClick={handleSkip} className="flex-1">
                {t('practice.topicSelection.skipSelection')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={totalSelected === 0}
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white"
              >
                {t('practice.topicSelection.startWithSelected').replace('{count}', String(totalSelected))}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// ── Tri-state checkbox icon ──────────────────────────────────────────────────
function TriStateIcon({ state }: { state: 'all' | 'some' | 'none' }) {
  if (state === 'all') return <CheckSquare className="h-5 w-5 text-blue-600 flex-shrink-0" />
  if (state === 'some') return (
    <div className="h-5 w-5 border-2 border-blue-600 rounded flex items-center justify-center flex-shrink-0">
      <Minus className="h-3 w-3 text-blue-600" />
    </div>
  )
  return <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
}
