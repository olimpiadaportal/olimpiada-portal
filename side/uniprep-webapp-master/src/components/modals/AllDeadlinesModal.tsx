"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { School, FileText, Flag, CalendarDays, Clock, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { Deadline } from "@/services/deadlineService"
import { motion } from "motion/react"

interface AllDeadlinesModalProps {
  open: boolean
  onClose: () => void
  deadlines: Deadline[]
  loading: boolean
  onAddDeadline: () => void
  onDeleteDeadline: (id: string) => void
}

type FilterType = 'all' | 'exam' | 'assignment' | 'goal' | 'custom'

export function AllDeadlinesModal({ 
  open, 
  onClose, 
  deadlines, 
  loading, 
  onAddDeadline,
  onDeleteDeadline 
}: AllDeadlinesModalProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<FilterType>('all')

  const filters: { label: string; value: FilterType }[] = [
    { label: t('dashboard.student.deadlines.filters.all'), value: 'all' },
    { label: t('dashboard.student.deadlines.filters.exams'), value: 'exam' },
    { label: t('dashboard.student.deadlines.filters.assignments'), value: 'assignment' },
    { label: t('dashboard.student.deadlines.filters.goals'), value: 'goal' },
    { label: t('dashboard.student.deadlines.filters.custom'), value: 'custom' },
  ]

  const getFilteredDeadlines = () => {
    if (filter === 'all') return deadlines
    return deadlines.filter(d => d.type === filter)
  }

  const filteredDeadlines = getFilteredDeadlines()

  const getDeadlineIcon = (type: string) => {
    switch (type) {
      case 'exam':
        return School
      case 'assignment':
        return FileText
      case 'goal':
        return Flag
      case 'custom':
        return CalendarDays
      default:
        return CalendarDays
    }
  }

  const getDeadlineColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'urgent':
        return 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700'
      case 'soon':
        return 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700'
      case 'upcoming':
        return 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
      default:
        return 'bg-gray-100 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dashboard.student.deadlines.allTitle')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.student.deadlines.allDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filter Chips */}
          <motion.div 
            className="flex gap-2 flex-wrap"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {filters.map((f) => (
              <motion.div key={f.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter(f.value)}
                  className={filter === f.value ? 'bg-blue-900 text-white border-blue-900 hover:bg-blue-800 hover:text-white' : ''}
                >
                  {f.label}
                </Button>
              </motion.div>
            ))}
          </motion.div>
          
          {/* Add Deadline Button */}
          <Button
            onClick={onAddDeadline}
            size="sm"
            className="bg-blue-900 hover:bg-blue-800 text-white w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('dashboard.student.deadlines.addModal.addButton')}
          </Button>
        </div>

        {/* Deadlines List */}
        <div className="overflow-y-auto max-h-[50vh] space-y-2">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex space-x-3 p-3">
                  <div className="rounded-lg bg-gray-200 dark:bg-gray-700 h-16 w-16"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredDeadlines.length > 0 ? (
            filteredDeadlines.map((deadline) => {
              const Icon = getDeadlineIcon(deadline.type)
              return (
                <div
                  key={deadline.id}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="flex-shrink-0">
                    <div className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center border-2 ${getDeadlineColor(deadline.urgencyLevel)}`}>
                      <span className="text-2xl font-bold">
                        {Math.abs(deadline.daysLeft)}
                      </span>
                      <span className="text-xs">
                        {deadline.daysLeft === 0 
                          ? t('common.today') 
                          : deadline.daysLeft === 1 
                            ? t('common.day') 
                            : t('common.days')}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-500" />
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {deadline.title}
                          </p>
                        </div>
                        {deadline.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {deadline.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {new Date(deadline.date).toLocaleDateString()}
                            {deadline.time && ` at ${deadline.time}`}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteDeadline(deadline.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">
                {filter === 'all' 
                  ? t('dashboard.student.upcomingDeadlines.noDeadlines')
                  : t('dashboard.student.deadlines.noFilteredDeadlines')}
              </p>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose} variant="outline" className="w-full">
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
