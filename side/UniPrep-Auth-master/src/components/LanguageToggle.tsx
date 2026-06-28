'use client'

import { Language } from '@/lib/i18n'

interface LanguageToggleProps {
  currentLanguage: Language
  onLanguageChange: (lang: Language) => void
}

export function LanguageToggle({ currentLanguage, onLanguageChange }: LanguageToggleProps) {
  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'az', label: 'AZ', flag: '🇦🇿' },
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
  ]

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl p-1 shadow-sm border border-gray-200">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => onLanguageChange(lang.code)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all
            ${
              currentLanguage === lang.code
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }
          `}
        >
          <span className="text-base">{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      ))}
    </div>
  )
}
