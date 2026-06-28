"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()
      
      // Use Elmly-Auth for password reset (same as mobile app)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://auth.elmly.app/auth/reset-password',
      })

      if (resetError) {
        setError(resetError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-3">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('auth.forgotPassword.checkEmail')}
          </h1>
          
          <div className="space-y-2">
            <p className="text-gray-600 dark:text-gray-300">
              {t('auth.forgotPassword.emailSent')}
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {email}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('auth.forgotPassword.linkExpires')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => router.push('/login')}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white"
          >
            {t('auth.forgotPassword.backToLogin')}
          </Button>
          
          <Button
            variant="ghost"
            onClick={() => {
              setSuccess(false)
              setEmail("")
            }}
            className="w-full"
          >
            {t('auth.forgotPassword.sendAnother')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t('auth.forgotPassword.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('auth.forgotPassword.subtitle')}
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.forgotPassword.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoFocus
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-blue-900 hover:bg-blue-800 text-white"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('auth.forgotPassword.sending')}
            </>
          ) : (
            t('auth.forgotPassword.sendButton')
          )}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="text-center text-sm text-gray-600 dark:text-gray-300">
          {t('auth.forgotPassword.rememberPassword')}{" "}
          <Link href="/login" className="text-blue-900 dark:text-blue-400 font-medium hover:underline">
            {t('auth.forgotPassword.backToLogin')}
          </Link>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Link href="/">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('auth.forgotPassword.backToHome')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
