import { createClient } from '@/lib/supabase/client'
import { Locale } from '@/lib/i18n/useTranslation'

export interface TimingPerformanceRow {
  subject_id: string
  subject_name: string | null
  subject_name_en: string | null
  subject_name_az: string | null
  topic_name: string | null
  subtopic_id: string | null
  subtopic_name: string | null
  total_attempts: number
  answered_attempts: number
  skipped_attempts: number
  correct_attempts: number
  accuracy: number | null
  avg_time_seconds: number | null
  median_time_seconds: number | null
  p95_time_seconds: number | null
  avg_expected_seconds: number | null
  easy_attempts: number
  medium_attempts: number
  hard_attempts: number
  fast_count: number
  normal_count: number
  slow_count: number
  very_slow_count: number
  last_attempted: string | null
}

export interface TimingPerformanceSummary {
  rows: TimingPerformanceRow[]
  totals: {
    answered: number
    fast: number
    normal: number
    slow: number
    verySlow: number
  }
  slowAreas: TimingPerformanceRow[]
}

const periodDays: Record<'7D' | '30D' | '90D', number> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
}

const getTimingRatio = (row: TimingPerformanceRow) => {
  const expectedSeconds = Number(row.avg_expected_seconds || 0)
  const averageSeconds = Number(row.avg_time_seconds || 0)
  return expectedSeconds > 0 ? averageSeconds / expectedSeconds : averageSeconds
}

export const getLocalizedSubjectName = (row: TimingPerformanceRow, locale: Locale) => {
  if (locale === 'az' || locale === 'ru') {
    return row.subject_name_az || row.subject_name_en || row.subject_name || ''
  }

  return row.subject_name_en || row.subject_name || ''
}

export const getTimingAreaLabel = (row: TimingPerformanceRow, locale: Locale) => {
  return row.subtopic_name || row.topic_name || getLocalizedSubjectName(row, locale)
}

export async function getTimingPerformanceSummary(
  studentId: string,
  period: '7D' | '30D' | '90D'
): Promise<TimingPerformanceSummary> {
  const supabase = createClient()
  const { data, error } = await (supabase as any).rpc('get_student_timing_performance', {
    p_student_id: studentId,
    p_period_days: periodDays[period],
    p_subject_id: null,
  })

  if (error) throw error

  const rows = (data || []) as TimingPerformanceRow[]
  const totals = rows.reduce(
    (acc, row) => {
      acc.answered += Number(row.answered_attempts || 0)
      acc.fast += Number(row.fast_count || 0)
      acc.normal += Number(row.normal_count || 0)
      acc.slow += Number(row.slow_count || 0)
      acc.verySlow += Number(row.very_slow_count || 0)
      return acc
    },
    { answered: 0, fast: 0, normal: 0, slow: 0, verySlow: 0 }
  )

  const slowAreas = [...rows]
    .filter(row => Number(row.answered_attempts || 0) > 0 && Number(row.avg_time_seconds || 0) > 0)
    .sort((a, b) => {
      const ratioDiff = getTimingRatio(b) - getTimingRatio(a)
      if (ratioDiff !== 0) return ratioDiff
      return new Date(b.last_attempted || 0).getTime() - new Date(a.last_attempted || 0).getTime()
    })
    .slice(0, 3)

  return { rows, totals, slowAreas }
}
