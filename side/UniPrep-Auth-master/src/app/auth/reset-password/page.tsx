'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Language, getSavedLanguage, saveLanguage } from '@/lib/i18n'
import { translations } from '@/lib/translations'
import Image from 'next/image'
import { LanguageToggle } from '@/components/LanguageToggle'

const APP_NAME = 'Elmly'

// Sanitize URL params to prevent XSS
function sanitizeUrlParam(value: string | null): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim()
}

// H-1: Map Supabase errors to generic user-facing messages
function getGenericErrorMessage(error: { message?: string; code?: string }): string {
  const msg = error.message?.toLowerCase() || ''
  if (msg.includes('expired') || msg.includes('token')) return 'expired'
  if (msg.includes('invalid')) return 'The reset link is invalid. Please request a new one.'
  if (msg.includes('rate') || msg.includes('limit')) return 'Too many attempts. Please try again later.'
  if (msg.includes('same_password') || msg.includes('same password')) return 'New password must be different from your current password.'
  return 'An unexpected error occurred. Please try again.'
}

// H-2: Clear sensitive tokens from URL after extraction
function clearUrlTokens() {
  if (typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}

type ResetStatus = 'loading' | 'ready' | 'success' | 'error' | 'expired'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<ResetStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  // Guard against React Strict Mode double-invocation (token can only be verified once)
  const verificationAttempted = useRef(false)

  // Initialize language on mount
  useEffect(() => {
    setLanguage(getSavedLanguage())
  }, [])

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    saveLanguage(lang)
  }

  const t = translations[language]

  useEffect(() => {
    // Prevent double execution — OTP tokens are single-use
    if (verificationAttempted.current) return
    verificationAttempted.current = true

    const verifyToken = async () => {
      try {
        // First check for error params in URL
        const errorParam = searchParams.get('error')
        const errorCode = searchParams.get('error_code')
        const errorDescription = searchParams.get('error_description')

        if (errorParam || errorCode) {
          console.error('Auth error from URL:', { errorCode })
          // H-2: Clear tokens from URL
          clearUrlTokens()
          if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
            setStatus('expired')
          } else {
            setErrorMessage(sanitizeUrlParam(errorDescription) || 'Authentication failed. Please request a new link.')
            setStatus('error')
          }
          return
        }

        // Check for hash fragment (Supabase puts tokens there for password reset)
        if (typeof window !== 'undefined') {
          const hash = window.location.hash
          if (hash) {
            const hashParams = new URLSearchParams(hash.substring(1))

            // Check for error in hash fragment too
            const hashError = hashParams.get('error')
            const hashErrorCode = hashParams.get('error_code')
            const hashErrorDescription = hashParams.get('error_description')

            if (hashError || hashErrorCode) {
              console.error('Auth error from hash:', { hashErrorCode })
              // H-2: Clear tokens from URL
              clearUrlTokens()
              if (hashErrorCode === 'otp_expired' || hashErrorDescription?.includes('expired')) {
                setStatus('expired')
              } else {
                setErrorMessage(sanitizeUrlParam(hashErrorDescription) || 'Authentication failed. Please request a new link.')
                setStatus('error')
              }
              return
            }

            const accessToken = hashParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token')
            const type = hashParams.get('type')

            if (accessToken && refreshToken && type === 'recovery') {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })

              // H-2: Clear tokens from URL after extraction
              clearUrlTokens()

              if (error) {
                console.error('Session error:', error.code)
                const msg = getGenericErrorMessage(error)
                if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
                return
              }

              setStatus('ready')
              return
            }
          }
        }

        // Check query params for token_hash or code parameter
        const token_hash = searchParams.get('token_hash')
        const code = searchParams.get('code')
        const tokenToVerify = token_hash || code

        // H-2: Clear tokens from URL after extraction
        clearUrlTokens()

        if (tokenToVerify) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenToVerify,
            type: 'recovery',
          })

          if (error) {
            console.error('Verification error:', error.code)
            const msg = getGenericErrorMessage(error)
            if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
            return
          }

          setStatus('ready')
          return
        }

        // No valid tokens found
        setErrorMessage('No valid reset token found. Please check your email link.')
        setStatus('error')
      } catch (err: any) {
        console.error('Unexpected verification error')
        setErrorMessage('An unexpected error occurred. Please try again.')
        setStatus('error')
      }
    }

    verifyToken()
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setErrorMessage(t.passwordReset.passwordMismatch)
      return
    }

    if (password.length < 8) {
      setErrorMessage(t.passwordReset.passwordTooShort)
      return
    }

    // Validate password policy requirements
    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      setErrorMessage(t.passwordReset.passwordRequirements)
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      // Get current user to check if they have an old password
      const { data: { user } } = await supabase.auth.getUser()
      
      // Note: We cannot verify if new password is same as old password in password reset flow
      // because the user is authenticated via recovery token, not their old password
      // This is acceptable for password reset (forgot password) flow
      
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        setErrorMessage(getGenericErrorMessage(error))
        return
      }

      setStatus('success')
    } catch (err: any) {
      setErrorMessage('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenApp = () => {
    const appScheme = process.env.NEXT_PUBLIC_APP_SCHEME || 'elmly'
    window.location.href = `${appScheme}://auth/callback`
  }

  const handleRequestNewLink = () => {
    alert(t.alerts.requestNewReset)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Language Toggle */}
        <div className="flex justify-center mb-6">
          <LanguageToggle currentLanguage={language} onLanguageChange={handleLanguageChange} />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
            <Image src="/icon.png" alt={APP_NAME} width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{APP_NAME}</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {status === 'loading' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.verifying}</h2>
              <p className="text-gray-600">{t.emailConfirm.subtitle}</p>
            </div>
          )}

          {status === 'ready' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">{t.passwordReset.title}</h2>
              <p className="text-gray-600 mb-6 text-center">{t.passwordReset.subtitle}</p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    {t.passwordReset.newPassword}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors text-gray-900 bg-white"
                      placeholder={t.passwordReset.newPasswordPlaceholder}
                      required
                      minLength={8}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    {t.passwordReset.confirmPassword}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors text-gray-900 bg-white"
                    placeholder={t.passwordReset.confirmPasswordPlaceholder}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>

                {errorMessage && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t.passwordReset.resetting : t.passwordReset.resetButton}
                </button>
              </form>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.passwordReset.successTitle}</h2>
              <p className="text-gray-600 mb-6">{t.passwordReset.successMessage}</p>
              <button
                onClick={handleOpenApp}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                {t.emailConfirm.openApp}
              </button>
              <p className="text-sm text-gray-500 mt-4">
                {t.emailConfirm.openAppHint}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.passwordReset.errorTitle}</h2>
              <p className="text-gray-600 mb-2">{t.passwordReset.errorMessage}</p>
              {errorMessage && (
                <p className="text-sm text-red-600 mb-6 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
              )}
              <button
                onClick={handleRequestNewLink}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                {t.passwordReset.requestNewLink}
              </button>
            </div>
          )}

          {status === 'expired' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.passwordReset.expiredTitle}</h2>
              <p className="text-gray-600 mb-6">{t.passwordReset.expiredMessage}</p>
              <button
                onClick={handleRequestNewLink}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                {t.passwordReset.requestNewLink}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          © {new Date().getFullYear()} {APP_NAME}. {t.copyright}
        </p>
      </div>
    </main>
  )
}

// Wrap in Suspense boundary as required by Next.js 14 for useSearchParams
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">{translations[getSavedLanguage()].loading}</p>
        </div>
      </main>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
