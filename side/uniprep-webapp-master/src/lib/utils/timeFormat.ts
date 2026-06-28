import { formatDistanceToNow } from "date-fns"
import { az, ru, enUS } from "date-fns/locale"

type Locale = 'en' | 'az' | 'ru'

const localeMap = {
  en: enUS,
  az: az,
  ru: ru,
}

/**
 * Format a date to relative time with proper locale support
 */
export function formatRelativeTime(date: Date | string, locale: Locale = 'en'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  return formatDistanceToNow(dateObj, {
    addSuffix: true,
    locale: localeMap[locale],
  })
}

/**
 * Format days remaining with proper translation
 */
export function formatDaysRemaining(days: number, t: (key: string) => string): string {
  if (days === 0) {
    return t('common.today')
  } else if (days === 1) {
    return `1 ${t('common.day')}`
  } else {
    return `${days} ${t('common.days')}`
  }
}
