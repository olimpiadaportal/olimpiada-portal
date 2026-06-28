"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { User, Settings, LogOut, Moon, Sun, Globe, BookOpen } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useTheme } from "next-themes"
import { useTranslation, Locale } from "@/lib/i18n/useTranslation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { settingsService } from "@/services/settingsService"
import { useFeatureFlags } from "@/hooks/useFeatureFlags"

interface ProfileDrawerProps {
  userType?: "student" | "teacher"
}

export function ProfileDrawer({ userType = "student" }: ProfileDrawerProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { t, locale, changeLocale } = useTranslation()
  const { flags } = useFeatureFlags()
  const [open, setOpen] = useState(false)
  const [userName, setUserName] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      return
    }

    if (user) {
      setUserId(user.id)
      
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      if (profileError) {
        // Fallback to auth user data
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "User")
        setUserEmail(user.email || "")
        return
      }

      if (profile) {
        setUserName(profile.full_name || "User")
        setUserEmail(user.email || "")
        setAvatarUrl(profile.avatar_url || "")
      } else {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "User")
        setUserEmail(user.email || "")
      }
    }
  }

  // Handle theme change - persist to database
  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme)
    if (userId) {
      await settingsService.updateSettings(userId, { theme: newTheme as 'light' | 'dark' | 'system' })
    }
  }

  // Handle language change - persist to database
  const handleLanguageChange = async (newLocale: Locale) => {
    changeLocale(newLocale)
    if (userId) {
      await settingsService.updateSettings(userId, { language: newLocale })
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    // Use replace to clear navigation history and prevent back navigation to authenticated pages
    router.replace("/login")
    setOpen(false)
  }

  const handleProfileClick = () => {
    router.push(`/${userType}/profile`)
    setOpen(false)
  }

  const handleSettingsClick = () => {
    router.push(`/${userType}/settings`)
    setOpen(false)
  }

  const handleBookingsClick = () => {
    router.push('/student/bookings')
    setOpen(false)
  }

  const getInitials = (name: string) => {
    if (!name) return "U"
    const parts = name.trim().split(" ")
    if (parts.length === 1) {
      return parts[0][0]?.toUpperCase() || "U"
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const languages = [
    { code: "en" as Locale, name: "English", flag: "🇬🇧" },
    { code: "az" as Locale, name: "Azərbaycan", flag: "🇦🇿" },
    { code: "ru" as Locale, name: "Русский", flag: "🇷🇺" },
  ]

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl} alt={userName} />
            <AvatarFallback className="bg-blue-900 text-white text-sm">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <SheetHeader>
          <SheetTitle className="text-gray-900 dark:text-white">{t('common.profile')}</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            {t('common.manageAccount')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* User Info */}
          <div className="flex items-center space-x-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl} alt={userName} />
              <AvatarFallback className="bg-blue-600 dark:bg-blue-700 text-white text-lg">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {userName}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {userEmail}
              </p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              onClick={handleProfileClick}
            >
              <User className="h-5 w-5 mr-3 text-gray-700 dark:text-gray-300" />
              {t('common.viewProfile')}
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              onClick={handleSettingsClick}
            >
              <Settings className="h-5 w-5 mr-3 text-gray-700 dark:text-gray-300" />
              {t('common.settings')}
            </Button>

            {userType === 'student' && (
              <Button
                variant="ghost"
                className="w-full justify-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                onClick={handleBookingsClick}
              >
                <BookOpen className="h-5 w-5 mr-3 text-gray-700 dark:text-gray-300" />
                {t('common.myBookings')}
              </Button>
            )}
          </div>

          {/* Theme Toggle - Only show if dark_mode feature flag is enabled */}
          {flags.dark_mode && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t('common.appearance')}
              </p>
              <div className="flex items-center space-x-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleThemeChange("light")}
                  className={`flex-1 ${
                    theme === "light" 
                      ? "bg-blue-600 hover:bg-blue-700 text-white" 
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Sun className="h-4 w-4 mr-2" />
                  {t('common.light')}
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleThemeChange("dark")}
                  className={`flex-1 ${
                    theme === "dark" 
                      ? "bg-blue-600 hover:bg-blue-700 text-white" 
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Moon className="h-4 w-4 mr-2" />
                  {t('common.dark')}
                </Button>
              </div>
            </div>
          )}

          {/* Language Selector */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              <Globe className="h-4 w-4 inline mr-2" />
              {t('common.language')}
            </p>
            <div className="space-y-2">
              {languages.map((lang) => (
                <Button
                  key={lang.code}
                  variant={locale === lang.code ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full justify-start ${
                    locale === lang.code 
                      ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" 
                      : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className="mr-2">{lang.flag}</span>
                  {lang.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 mr-3" />
              {t('common.logout')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
