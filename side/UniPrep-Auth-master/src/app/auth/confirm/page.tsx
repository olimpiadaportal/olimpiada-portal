'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Language, getSavedLanguage, saveLanguage } from '@/lib/i18n'
import { translations } from '@/lib/translations'
import Image from 'next/image'
import { LanguageToggle } from '@/components/LanguageToggle'

const APP_NAME = 'Elmly'

// MEDIUM-07: Allowlist for OTP verification types
const VALID_OTP_TYPES = ['signup', 'email', 'recovery', 'invite', 'email_change', 'magiclink'] as const
type OtpType = typeof VALID_OTP_TYPES[number]

function sanitizeUrlParam(value: string | null): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim()
}

// H-1: Map Supabase error codes/messages to generic user-facing messages
function getGenericErrorMessage(error: { message?: string; code?: string }): string {
  const msg = error.message?.toLowerCase() || ''
  if (msg.includes('expired') || msg.includes('token')) return 'expired'
  if (msg.includes('invalid')) return 'The verification link is invalid. Please request a new one.'
  if (msg.includes('rate') || msg.includes('limit')) return 'Too many attempts. Please try again later.'
  return 'An unexpected error occurred. Please try again.'
}

// H-2: Clear sensitive tokens from URL after extraction
function clearUrlTokens() {
  if (typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}

// H-3: Redact all sensitive parameters from URL for logging
function redactUrl(url: string): string {
  return url
    .replace(/(token_hash=)[^&]+/g, '$1[REDACTED]')
    .replace(/(access_token=)[^&#]+/g, '$1[REDACTED]')
    .replace(/(refresh_token=)[^&#]+/g, '$1[REDACTED]')
    .replace(/(code=)[^&]+/g, '$1[REDACTED]')
}

function getValidOtpType(type: string | null): OtpType {
  if (type && VALID_OTP_TYPES.includes(type as OtpType)) return type as OtpType
  return 'email'
}

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired'

function EmailConfirmContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<VerificationStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
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

    const verifyEmail = async () => {
      try {
        // H-3: Log URL with ALL tokens redacted
        if (typeof window !== 'undefined') {
          console.log('🔍 Full URL:', redactUrl(window.location.href))
        }

        // H-4: Sanitize all URL-derived values
        const token_hash = sanitizeUrlParam(searchParams.get('token_hash'))
        const type = sanitizeUrlParam(searchParams.get('type'))
        const access_token = sanitizeUrlParam(searchParams.get('access_token'))
        const refresh_token = sanitizeUrlParam(searchParams.get('refresh_token'))

        console.log('🔍 Verification params:', { token_hash: !!token_hash, type: type || null, access_token: !!access_token, refresh_token: !!refresh_token })

        // Check for hash fragment (Supabase sometimes puts tokens there)
        if (typeof window !== 'undefined') {
          const hash = window.location.hash
          if (hash) {
            const hashParams = new URLSearchParams(hash.substring(1))
            const hashAccessToken = hashParams.get('access_token')
            const hashRefreshToken = hashParams.get('refresh_token')
            const hashType = hashParams.get('type')

            if (hashAccessToken && hashRefreshToken) {
              console.log('🔑 Using hash fragment tokens, type:', hashType)
              const { error } = await supabase.auth.setSession({
                access_token: hashAccessToken,
                refresh_token: hashRefreshToken,
              })

              // H-2: Clear tokens from URL after extraction
              clearUrlTokens()

              if (error) {
                console.error('Session error:', error.code)
                const msg = getGenericErrorMessage(error)
                if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
                return
              }

              setStatus('success')
              return
            }
          }
        }

        // H-2: Clear tokens from URL after extraction
        clearUrlTokens()

        // Handle token_hash verification (email confirmation link)
        if (token_hash) {
          const verifyType = getValidOtpType(type || null)
          console.log('🔑 Verifying OTP with token_hash, type:', verifyType)
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: verifyType,
          })

          if (error) {
            console.error('Verification error:', error.code)
            const msg = getGenericErrorMessage(error)
            if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
            return
          }

          console.log('✅ OTP verified, session:', !!data?.session)
          setStatus('success')
          return
        }

        // Handle access_token/refresh_token (direct session)
        if (access_token && refresh_token) {
          console.log('🔑 Setting session with access/refresh tokens')
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })

          if (error) {
            console.error('Session error:', error.code)
            const msg = getGenericErrorMessage(error)
            if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
            return
          }

          setStatus('success')
          return
        }

        // Check for code parameter (PKCE flow)
        const code = sanitizeUrlParam(searchParams.get('code'))
        if (code) {
          console.log('🔑 Exchanging PKCE code for session')
          const { error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error('Code exchange error:', error.code)
            // Fallback: try verifyOtp with the code
            console.log('🔄 Fallback: trying verifyOtp with code')
            const { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: code,
              type: getValidOtpType(type || null),
            })

            if (otpError) {
              console.error('OTP fallback error:', otpError.code)
              const msg = getGenericErrorMessage(otpError)
              if (msg === 'expired') { setStatus('expired') } else { setErrorMessage(msg); setStatus('error') }
              return
            }
          }

          setStatus('success')
          return
        }

        // No valid tokens found
        console.error('❌ No verification token found in URL')
        setErrorMessage('No verification token found. Please check your email link.')
        setStatus('error')
      } catch (err: any) {
        console.error('Unexpected verification error')
        setErrorMessage('An unexpected error occurred. Please try again.')
        setStatus('error')
      }
    }

    verifyEmail()
  }, [searchParams])

  const handleOpenApp = () => {
    const appScheme = process.env.NEXT_PUBLIC_APP_SCHEME || 'elmly'
    window.location.href = `${appScheme}://auth/callback`
  }

  const handleResendEmail = async () => {
    // This would need the user's email - for now just show a message
    alert(t.alerts.requestNewEmail)
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
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.emailConfirm.title}</h2>
              <p className="text-gray-600">{t.emailConfirm.subtitle}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.emailConfirm.successTitle}</h2>
              <p className="text-gray-600 mb-6">{t.emailConfirm.successMessage}</p>
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
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.emailConfirm.errorTitle}</h2>
              <p className="text-gray-600 mb-2">{t.emailConfirm.errorMessage}</p>
              {errorMessage && (
                <p className="text-sm text-red-600 mb-6 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
              )}
              <button
                onClick={handleResendEmail}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                {t.emailConfirm.requestNewLink}
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
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.emailConfirm.expiredTitle}</h2>
              <p className="text-gray-600 mb-6">{t.emailConfirm.expiredMessage}</p>
              <button
                onClick={handleResendEmail}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                {t.emailConfirm.requestNewLink}
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
export default function EmailConfirmPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">{translations[getSavedLanguage()].loading}</p>
        </div>
      </main>
    }>
      <EmailConfirmContent />
    </Suspense>
  )
}
