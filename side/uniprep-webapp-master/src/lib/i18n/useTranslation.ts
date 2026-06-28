"use client"

import { useState, useEffect } from 'react'

export type Locale = 'en' | 'az' | 'ru'

const translations: Record<Locale, any> = {
  en: require('../../../messages/en.json'),
  az: require('../../../messages/az.json'),
  ru: require('../../../messages/ru.json'),
}

// Global state for locale changes
let globalLocale: Locale = 'en'
const listeners = new Set<(locale: Locale) => void>()

const notifyListeners = (locale: Locale) => {
  listeners.forEach(listener => listener(locale))
}

export function useTranslation() {
  const [locale, setLocale] = useState<Locale>(globalLocale)

  useEffect(() => {
    // Initialize from localStorage
    const savedLocale = localStorage.getItem('locale') as Locale
    if (savedLocale && ['en', 'az', 'ru'].includes(savedLocale)) {
      globalLocale = savedLocale
      setLocale(savedLocale)
    }

    // Subscribe to locale changes
    const listener = (newLocale: Locale) => {
      setLocale(newLocale)
    }
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }, [])

  const changeLocale = (newLocale: Locale) => {
    globalLocale = newLocale
    setLocale(newLocale)
    localStorage.setItem('locale', newLocale)
    notifyListeners(newLocale)
  }

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split('.')
    let value: any = translations[locale]

    for (const k of keys) {
      value = value?.[k]
    }

    if (typeof value !== 'string') {
      return key
    }

    if (params) {
      Object.keys(params).forEach((param) => {
        value = value.replace(`{${param}}`, params[param])
      })
    }

    return value
  }

  return { t, locale, changeLocale }
}
