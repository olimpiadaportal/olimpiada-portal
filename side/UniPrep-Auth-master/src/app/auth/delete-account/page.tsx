'use client'

import { Suspense, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Language, getSavedLanguage, saveLanguage } from '@/lib/i18n'
import { translations } from '@/lib/translations'
import Image from 'next/image'
import { LanguageToggle } from '@/components/LanguageToggle'

const APP_NAME = 'Elmly'

type DeleteStatus = 'warning' | 'login' | 'confirm' | 'deleting' | 'success' | 'error'

function DeleteAccountContent() {
  const [status, setStatus] = useState<DeleteStatus>('warning')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  // C-2: Track failed login attempts for exponential backoff
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number>(0)

  useEffect(() => {
    setLanguage(getSavedLanguage())
  }, [])

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    saveLanguage(lang)
  }

  const t = translations[language]
  const td = t.deleteAccount

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    // C-2: Check if locked out due to failed attempts
    const now = Date.now()
    if (lockedUntil > now) {
      const secondsLeft = Math.ceil((lockedUntil - now) / 1000)
      setErrorMessage(td.tooManyAttempts.replace('{seconds}', String(secondsLeft)))
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        // C-2: Exponential backoff — 2s, 4s, 8s, 16s, 32s...
        const attempts = failedAttempts + 1
        setFailedAttempts(attempts)
        if (attempts >= 3) {
          const backoffMs = Math.min(2000 * Math.pow(2, attempts - 3), 60000)
          setLockedUntil(Date.now() + backoffMs)
        }
        setErrorMessage(td.wrongCredentials)
        return
      }
      // M-5: Clear credentials from state after successful auth
      setPassword('')
      setFailedAttempts(0)
      setLockedUntil(0)
      setStatus('confirm')
    } catch {
      setErrorMessage(td.errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()

    if (confirmText !== 'DELETE') {
      setErrorMessage(td.mustTypeDelete)
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setStatus('deleting')

    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
      })

      if (error) {
        setErrorMessage(td.errorMessage)
        setStatus('error')
        return
      }

      await supabase.auth.signOut()
      setStatus('success')
    } catch {
      setErrorMessage(td.errorMessage)
      setStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
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

          {/* Step 0: Warning */}
          {status === 'warning' && (
            <div>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">{td.title}</h2>
              <p className="text-gray-500 text-center mb-6">{td.subtitle}</p>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-red-700 mb-3">{td.warningTitle}</p>
                <ul className="space-y-2">
                  {td.warningItems.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-600">
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setStatus('login')}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 transition-colors"
              >
                {td.loginButton}
              </button>
            </div>
          )}

          {/* Step 1: Login */}
          {status === 'login' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">{td.stepLogin}</h2>
              <p className="text-gray-500 text-center text-sm mb-6">{td.subtitle}</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    {td.email}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors text-gray-900 bg-white"
                    placeholder={td.emailPlaceholder}
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    {td.password}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors text-gray-900 bg-white"
                      placeholder={td.passwordPlaceholder}
                      required
                      autoComplete="current-password"
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

                {errorMessage && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? td.verifying : td.loginButton}
                </button>
              </form>
            </div>
          )}

          {/* Step 2: Confirm DELETE */}
          {status === 'confirm' && (
            <div>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">{td.stepConfirm}</h2>
              <p className="text-gray-500 text-center text-sm mb-6">{td.confirmInstruction}</p>

              <form onSubmit={handleDelete} className="space-y-4">
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors text-gray-900 bg-white text-center font-mono text-lg tracking-widest"
                  placeholder={td.confirmPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />

                {errorMessage && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || confirmText !== 'DELETE'}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {td.deleteButton}
                </button>
              </form>
            </div>
          )}

          {/* Deleting spinner */}
          {status === 'deleting' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{td.deleting}</h2>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{td.successTitle}</h2>
              <p className="text-gray-600">{td.successMessage}</p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{td.errorTitle}</h2>
              <p className="text-gray-600 mb-2">{td.errorMessage}</p>
              {errorMessage && (
                <p className="text-sm text-red-600 mb-6 bg-red-50 p-3 rounded-lg">{errorMessage}</p>
              )}
              <button
                onClick={() => { setStatus('confirm'); setErrorMessage('') }}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 transition-colors"
              >
                Try Again
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

export default function DeleteAccountPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    }>
      <DeleteAccountContent />
    </Suspense>
  )
}
