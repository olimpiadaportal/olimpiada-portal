"use client"

import { Button } from "@/components/ui/button"
import { Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation, Locale } from "@/lib/i18n/useTranslation"

const languages = [
  { code: "en" as Locale, label: "EN", name: "English", flag: "🇬🇧" },
  { code: "az" as Locale, label: "AZ", name: "Azərbaycan", flag: "🇦🇿" },
  { code: "ru" as Locale, label: "RU", name: "Русский", flag: "🇷🇺" },
]

export function LanguageSwitcher() {
  const { locale, changeLocale } = useTranslation()
  const currentLanguage = languages.find((lang) => lang.code === locale) || languages[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-gray-700 dark:text-gray-300">
          <Globe className="h-4 w-4" />
          <span>{currentLanguage.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => changeLocale(language.code)}
            className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
              locale === language.code ? "bg-gray-100 dark:bg-gray-700" : ""
            }`}
          >
            <span className="mr-2">{language.flag}</span>
            <span className="text-gray-900 dark:text-gray-100">{language.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
