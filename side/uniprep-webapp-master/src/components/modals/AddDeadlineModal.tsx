"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { School, FileText, Flag, CalendarDays } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { motion } from "motion/react"

interface AddDeadlineModalProps {
  open: boolean
  onClose: () => void
  onAdd: (title: string, date: Date, type: 'exam' | 'assignment' | 'goal' | 'custom') => Promise<void>
}

export function AddDeadlineModal({ open, onClose, onAdd }: AddDeadlineModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedType, setSelectedType] = useState<'exam' | 'assignment' | 'goal' | 'custom'>('custom')
  const [loading, setLoading] = useState(false)

  const types = [
    { value: 'exam' as const, label: t('dashboard.student.deadlines.types.exam'), icon: School, color: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700' },
    { value: 'assignment' as const, label: t('dashboard.student.deadlines.types.assignment'), icon: FileText, color: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700' },
    { value: 'goal' as const, label: t('dashboard.student.deadlines.types.goal'), icon: Flag, color: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-300 dark:border-green-700' },
    { value: 'custom' as const, label: t('dashboard.student.deadlines.types.custom'), icon: CalendarDays, color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700' },
  ]

  const handleAdd = async () => {
    if (!title.trim()) return

    try {
      setLoading(true)
      await onAdd(title, new Date(selectedDate), selectedType)
      setTitle("")
      setSelectedDate(new Date().toISOString().split('T')[0])
      setSelectedType('custom')
      onClose()
    } catch (error) {
      console.error('Add deadline error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('dashboard.student.deadlines.addModal.title')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.student.deadlines.addModal.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <motion.div 
          className="space-y-4 py-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Title Input */}
          <motion.div 
            className="space-y-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Label htmlFor="title">{t('dashboard.student.deadlines.addModal.whatFor')}</Label>
            <Input
              id="title"
              placeholder={t('dashboard.student.deadlines.addModal.placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </motion.div>

          {/* Type Selection */}
          <div className="space-y-2">
            <Label>{t('dashboard.student.deadlines.addModal.type')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {types.map((type) => {
                const Icon = type.icon
                const isSelected = selectedType === type.value
                return (
                  <motion.button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      isSelected ? type.color : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{type.label}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <Label htmlFor="date">{t('dashboard.student.deadlines.addModal.dueDate')}</Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div 
          className="flex gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={!title.trim() || loading}
            className="flex-1 bg-blue-900 hover:bg-blue-800"
          >
            {loading ? t('common.loading') : t('dashboard.student.deadlines.addModal.addButton')}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
