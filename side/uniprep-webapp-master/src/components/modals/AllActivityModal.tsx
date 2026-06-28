"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { BookOpen, Target, Calendar, Clock } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { Activity } from "@/services/activityService"
import { formatRelativeTime } from "@/lib/utils/timeFormat"
import { motion } from "motion/react"

interface AllActivityModalProps {
  open: boolean
  onClose: () => void
  activities: Activity[]
  loading: boolean
}

type FilterType = 'all' | 'practice' | 'exam'

export function AllActivityModal({ open, onClose, activities, loading }: AllActivityModalProps) {
  const { t, locale } = useTranslation()
  const [filter, setFilter] = useState<FilterType>('all')

  const filters: { label: string; value: FilterType }[] = [
    { label: t('dashboard.student.activity.filters.all'), value: 'all' },
    { label: t('dashboard.student.activity.filters.practice'), value: 'practice' },
    { label: t('dashboard.student.activity.filters.exams'), value: 'exam' },
  ]

  const getFilteredActivities = () => {
    if (filter === 'all') return activities
    return activities.filter(a => a.type === filter)
  }

  const filteredActivities = getFilteredActivities()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dashboard.student.activity.title')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.student.activity.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Filter Chips */}
        <motion.div 
          className="flex gap-2 pb-4 border-b border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {filters.map((f) => (
            <motion.button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-blue-900 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {f.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Activity List */}
        <div className="overflow-y-auto max-h-[50vh] space-y-2">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex space-x-3 p-3">
                  <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-10 w-10"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredActivities.length > 0 ? (
            filteredActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                whileHover={{ x: 4 }}
              >
                <div className="flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: activity.color + '20' }}
                  >
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
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      {formatRelativeTime(activity.timestamp, locale)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">
                {filter === 'all' 
                  ? t('dashboard.student.recentActivity.noActivity')
                  : t('dashboard.student.activity.noFilteredActivity')}
              </p>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose} className="w-full bg-blue-900 hover:bg-blue-800">
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
