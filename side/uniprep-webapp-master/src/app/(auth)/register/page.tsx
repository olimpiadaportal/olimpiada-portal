"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { useAppSettings } from "@/hooks/useAppSettings"
import { motion, AnimatePresence } from "motion/react"

export default function RegisterPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isTeacherRegistrationEnabled } = useFeatureFlagContext()
  const { appName } = useAppSettings()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [userType, setUserType] = useState<"student" | "teacher">("student")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError(t('auth.register.passwordMismatch'))
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError(t('auth.register.passwordTooShort'))
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      
      const fullName = `${firstName.trim()} ${lastName.trim()}`
      
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            user_type: userType,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            full_name: fullName,
            email: email,
            user_type: userType,
          } as any)

        if (profileError) {
          setError(t('auth.register.profileError'))
          setLoading(false)
          return
        }

        if (userType === 'student') {
          await supabase.from('students').insert({
            user_id: authData.user.id,
            target_group: 'I',
            city: 'Baku',
            elo_rating: 1200,
            current_streak: 0,
            monthly_score: 0,
          } as any)
          router.replace('/student/home')
        } else {
          await supabase.from('teachers').insert({
            user_id: authData.user.id,
            hourly_rate: 0,
            rating: 0,
            is_verified: false,
          } as any)
          router.replace('/teacher/dashboard')
        }
      }
    } catch {
      setError(t('auth.register.unexpectedError'))
      setLoading(false)
    }
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="space-y-2 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('auth.register.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('auth.register.subtitle', { appName })}
        </p>
      </motion.div>

      <motion.form 
        onSubmit={handleRegister} 
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <AnimatePresence>
          {error && (
            <motion.div 
              className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm"
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, x: -20, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          <Label htmlFor="firstName">{t('auth.register.firstName')}</Label>
          <Input
            id="firstName"
            type="text"
            placeholder="John"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={loading}
            validationMessage={t('common.validation.required')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t('auth.register.lastName')}</Label>
          <Input
            id="lastName"
            type="text"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={loading}
            validationMessage={t('common.validation.required')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.register.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            validationMessage={t('common.validation.invalidEmail')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.register.password')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="pr-10"
              validationMessage={t('common.validation.required')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t('auth.register.confirmPassword')}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              className="pr-10"
              validationMessage={t('common.validation.required')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Only show user type selection if teacher registration is enabled */}
        {isTeacherRegistrationEnabled ? (
          <div className="space-y-2">
            <Label>{t('auth.register.userType')}</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUserType("student")}
                disabled={loading}
                className={`p-4 border-2 rounded-lg text-center transition-colors ${
                  userType === "student"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-900 dark:text-gray-300"
                }`}
              >
                <div className="font-semibold">{t('auth.register.student')}</div>
                <div className={`text-xs mt-1 ${userType === "student" ? "text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}`}>
                  {t('auth.register.studentDesc')}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setUserType("teacher")}
                disabled={loading}
                className={`p-4 border-2 rounded-lg text-center transition-colors ${
                  userType === "teacher"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-900 dark:text-gray-300"
                }`}
              >
                <div className="font-semibold">{t('auth.register.teacher')}</div>
                <div className={`text-xs mt-1 ${userType === "teacher" ? "text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}`}>
                  {t('auth.register.teacherDesc')}
                </div>
              </button>
            </div>
          </div>
        ) : null}

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            type="submit"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('auth.register.creatingAccount')}
              </>
            ) : (
              t('auth.register.createAccount')
            )}
          </Button>
        </motion.div>
      </motion.form>

      <motion.div 
        className="text-center text-sm text-gray-600 dark:text-gray-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        {t('auth.register.haveAccount')}{" "}
        <Link href="/login" className="text-blue-900 dark:text-blue-400 font-medium hover:underline">
          {t('auth.register.signInLink')}
        </Link>
      </motion.div>

      <motion.div 
        className="pt-4 border-t border-gray-200 dark:border-gray-700"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <Link href="/">
          <motion.div whileHover={{ x: -5 }} transition={{ duration: 0.2 }}>
            <Button variant="ghost" className="w-full">
              ← {t('auth.register.backToHome')}
            </Button>
          </motion.div>
        </Link>
      </motion.div>
    </motion.div>
  )
}
