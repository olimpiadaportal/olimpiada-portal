"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { APP_NAME } from "@/lib/constants"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { motion, AnimatePresence } from "motion/react"

interface ProfileData {
  user_type: 'student' | 'teacher'
}

export default function LoginPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // Translate common Supabase errors
        const errorMessage = signInError.message === 'Invalid login credentials' 
          ? t('auth.login.invalidCredentials')
          : signInError.message
        setError(errorMessage)
        setLoading(false)
        return
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', data.user.id)
          .single()

        const profileData = profile as ProfileData | null

        // Block admin users from accessing the webapp
        if (!profileData || (profileData.user_type !== 'student' && profileData.user_type !== 'teacher')) {
          await supabase.auth.signOut({ scope: 'local' })
          setError(t('auth.login.accessDenied') || 'Access denied. This platform is for students and teachers only.')
          setLoading(false)
          return
        }

        // Use replace instead of push to prevent back navigation to login page
        if (profileData.user_type === 'student') {
          router.replace('/student/home')
        } else if (profileData.user_type === 'teacher') {
          router.replace('/teacher/dashboard')
        }
      }
    } catch {
      setError('An unexpected error occurred')
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('auth.login.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('auth.login.subtitle', { appName: APP_NAME })}
        </p>
      </motion.div>

      <motion.form 
        onSubmit={handleLogin} 
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

        <motion.div 
          className="space-y-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Label htmlFor="email">{t('auth.login.email')}</Label>
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
        </motion.div>

        <motion.div 
          className="space-y-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Label htmlFor="password">{t('auth.login.password')}</Label>
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              type="submit"
              className="w-full bg-blue-900 hover:bg-blue-800 text-white"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('auth.login.signingIn')}
                </>
              ) : (
                t('auth.login.signIn')
              )}
            </Button>
          </motion.div>
        </motion.div>
      </motion.form>

      <motion.div 
        className="flex items-center justify-center text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <Link
          href="/forgot-password"
          className="text-blue-900 dark:text-blue-400 hover:underline"
        >
          {t('auth.login.forgotPassword')}
        </Link>
      </motion.div>

      <motion.div 
        className="text-center text-sm text-gray-600 dark:text-gray-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        {t('auth.login.noAccount')}{" "}
        <Link href="/register" className="text-blue-900 dark:text-blue-400 font-medium hover:underline">
          {t('auth.login.signUpLink')}
        </Link>
      </motion.div>

      <motion.div 
        className="pt-4 border-t border-gray-200 dark:border-gray-700"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8 }}
      >
        <Link href="/">
          <motion.div whileHover={{ x: -5 }} transition={{ duration: 0.2 }}>
            <Button variant="ghost" className="w-full">
              ← {t('auth.login.backToHome')}
            </Button>
          </motion.div>
        </Link>
      </motion.div>
    </motion.div>
  )
}
