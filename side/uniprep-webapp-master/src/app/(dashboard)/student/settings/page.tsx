"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  ArrowLeft,
  Globe,
  Bell,
  Shield,
  Settings,
  Moon,
  Lock,
  User,
  Loader2
} from "lucide-react"
import { FormSkeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { settingsService } from "@/services/settingsService"
import { UserSettings, Language, Theme } from "@/types/settings"
import { useTheme } from "next-themes"

export default function SettingsPage() {
  const router = useRouter()
  const { t, locale, changeLocale } = useTranslation()
  const { setTheme } = useTheme()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const userSettings = await settingsService.getSettings(user.id)
      setSettings(userSettings)
    } catch (error) {
      // Settings load error - silently fail
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async (key: keyof UserSettings, value: any) => {
    if (!settings) return

    try {
      setSaving(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const updated = { ...settings, [key]: value }
      setSettings(updated)
      
      await settingsService.updateSettings(user.id, { [key]: value })
      
      // Apply language change immediately
      if (key === 'language') {
        changeLocale(value as Language)
      }
      
      // Apply theme change immediately using next-themes (syncs with ProfileDrawer)
      if (key === 'theme') {
        setTheme(value as Theme)
      }
    } catch (error) {
      // Setting update error - silently fail
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <FormSkeleton />;
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('settings.notFound')}</p>
          <Button onClick={() => router.push('/student/home')} className="mt-4">
            {t('common.back')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-800 text-white p-8 pb-16 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <Button
            onClick={() => router.push('/student/profile')}
            variant="ghost"
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-4xl font-bold">{t('settings.title')}</h1>
          <p className="text-blue-50 mt-2">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-6">
        {/* General Settings */}
        <Card className="p-6 shadow-lg mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('settings.general')}
            </h2>
          </div>

          <div className="space-y-4">
            {/* Language */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.language')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.languageDesc')}
                </p>
              </div>
              <Select 
                value={settings.language} 
                onValueChange={(value) => updateSetting('language', value)}
                disabled={saving}
              >
                <SelectTrigger className="w-40 text-gray-900 dark:text-gray-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="az">Azərbaycan</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ru">Русский</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Theme */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.theme')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.themeDesc')}
                </p>
              </div>
              <Select 
                value={settings.theme} 
                onValueChange={(value) => updateSetting('theme', value)}
                disabled={saving}
              >
                <SelectTrigger className="w-40 text-gray-900 dark:text-gray-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                  <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
                  <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Notification Settings */}
        <Card className="p-6 shadow-lg mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('settings.notifications')}
            </h2>
          </div>

          <div className="space-y-4">
            {/* Enable Notifications */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.enableNotifications')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.enableNotificationsDesc')}
                </p>
              </div>
              <Switch
                checked={settings.notificationsEnabled}
                onCheckedChange={(checked) => updateSetting('notificationsEnabled', checked)}
                disabled={saving}
              />
            </div>

            {/* Study Reminders */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.studyReminders')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.studyRemindersDesc')}
                </p>
              </div>
              <Switch
                checked={settings.studyReminders}
                onCheckedChange={(checked) => updateSetting('studyReminders', checked)}
                disabled={saving || !settings.notificationsEnabled}
              />
            </div>

            {/* Exam Reminders */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.examReminders')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.examRemindersDesc')}
                </p>
              </div>
              <Switch
                checked={settings.examReminders}
                onCheckedChange={(checked) => updateSetting('examReminders', checked)}
                disabled={saving || !settings.notificationsEnabled}
              />
            </div>

            {/* Achievement Notifications */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.achievementNotifications')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.achievementNotificationsDesc')}
                </p>
              </div>
              <Switch
                checked={settings.achievementNotifications}
                onCheckedChange={(checked) => updateSetting('achievementNotifications', checked)}
                disabled={saving || !settings.notificationsEnabled}
              />
            </div>
          </div>
        </Card>

        {/* Privacy Settings */}
        <Card className="p-6 shadow-lg mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('settings.privacy')}
            </h2>
          </div>

          <div className="space-y-4">
            {/* Show in Leaderboard */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{t('settings.showInLeaderboard')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {t('settings.showInLeaderboardDesc')}
                </p>
              </div>
              <Switch
                checked={settings.showInLeaderboard}
                onCheckedChange={(checked) => updateSetting('showInLeaderboard', checked)}
                disabled={saving}
              />
            </div>
          </div>
        </Card>

        {/* Saving Indicator */}
        {saving && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('settings.saving')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
