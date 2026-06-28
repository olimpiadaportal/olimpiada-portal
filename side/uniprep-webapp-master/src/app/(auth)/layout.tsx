"use client"

import Image from "next/image"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useLiveStats } from "@/hooks/useLiveStats"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const { appName, loading } = useAppSettings()
  const stats = useLiveStats()
  const firstLetter = appName ? appName.charAt(0).toUpperCase() : 'U'
  
  // Don't render until app name is loaded to prevent flash
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 to-blue-700 dark:from-blue-950 dark:to-blue-800 p-12 flex-col justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            <Image src="/icon.png" alt={appName} width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <span className="text-2xl font-bold text-white">{appName}</span>
        </div>

        <div className="space-y-6 text-white">
          <h2 className="text-4xl font-bold leading-tight">
            {t('auth.layout.title')}
          </h2>
          <p className="text-xl text-blue-100 dark:text-blue-200">
            {t('auth.layout.subtitle')}
          </p>
          <div className="grid grid-cols-3 gap-6 pt-8">
            <div>
              <div className="text-3xl font-bold">
                {stats.loading ? '...' : `${stats.practiceQuestions.toLocaleString()}+`}
              </div>
              <div className="text-sm text-blue-200">{t('auth.layout.questions')}</div>
            </div>
            <div>
              <div className="text-3xl font-bold">
                {stats.loading ? '...' : `${stats.activeStudents.toLocaleString()}+`}
              </div>
              <div className="text-sm text-blue-200">{t('auth.layout.students')}</div>
            </div>
            <div>
              <div className="text-3xl font-bold">
                {stats.loading ? '...' : `${stats.verifiedTeachers.toLocaleString()}+`}
              </div>
              <div className="text-sm text-blue-200">{t('auth.layout.teachers')}</div>
            </div>
          </div>
        </div>

        <div className="text-sm text-blue-200">
          © {new Date().getFullYear()} {appName}. {t('landing.footer.allRightsReserved')}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
