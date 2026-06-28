"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { motion, AnimatePresence } from "motion/react"

interface WaitlistFormProps {
  className?: string
  variant?: "default" | "compact" | "hero"
  source?: string
}

interface WaitlistResponse {
  success: boolean
  message?: string
  error?: string
  subscriber_id?: string
  retry_after?: number
}

export function WaitlistForm({ className = "", variant = "default", source = "landing_page" }: WaitlistFormProps) {
  const { t, locale } = useTranslation()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "already_subscribed" | "rate_limited">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [retryAfter, setRetryAfter] = useState<number>(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) return
    
    setStatus("loading")
    setErrorMessage("")

    try {
      // Use API route for rate limiting support (captures IP server-side)
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          source,
          locale,
          metadata: {}
        })
      })

      const data: WaitlistResponse = await response.json()

      if (response.status === 429 || data.error === 'rate_limited') {
        setStatus("rate_limited")
        setRetryAfter(data.retry_after || 3600)
        setErrorMessage(t("landing.waitlist.rateLimited"))
        return
      }

      if (!response.ok) {
        setStatus("error")
        setErrorMessage(t("landing.waitlist.errorGeneric"))
        return
      }

      if (data.success) {
        setStatus("success")
        setEmail("")
        setName("")
      } else if (data.error === "already_subscribed") {
        setStatus("already_subscribed")
      } else if (data.error === "invalid_email") {
        setStatus("error")
        setErrorMessage(t("landing.waitlist.invalidEmail"))
      } else {
        setStatus("error")
        setErrorMessage(t("landing.waitlist.errorGeneric"))
      }
    } catch (err) {
      console.error("Waitlist submission error:", err)
      setStatus("error")
      setErrorMessage(t("landing.waitlist.errorGeneric"))
    }
  }

  // Success state
  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex items-center gap-3 p-4 bg-green-500/20 border border-green-500/30 rounded-xl ${className}`}
      >
        <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-green-300 font-medium">{t("landing.waitlist.successTitle")}</p>
          <p className="text-green-400/80 text-sm">{t("landing.waitlist.successMessage")}</p>
        </div>
      </motion.div>
    )
  }

  // Already subscribed state
  if (status === "already_subscribed") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex items-center gap-3 p-4 bg-blue-500/20 border border-blue-500/30 rounded-xl ${className}`}
      >
        <CheckCircle2 className="w-6 h-6 text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-blue-300 font-medium">{t("landing.waitlist.alreadySubscribedTitle")}</p>
          <p className="text-blue-400/80 text-sm">{t("landing.waitlist.alreadySubscribedMessage")}</p>
        </div>
      </motion.div>
    )
  }

  // Rate limited state
  if (status === "rate_limited") {
    const minutes = Math.ceil(retryAfter / 60)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex items-center gap-3 p-4 bg-amber-500/20 border border-amber-500/30 rounded-xl ${className}`}
      >
        <Clock className="w-6 h-6 text-amber-400 flex-shrink-0" />
        <div>
          <p className="text-amber-300 font-medium">{t("landing.waitlist.rateLimitedTitle")}</p>
          <p className="text-amber-400/80 text-sm">
            {t("landing.waitlist.rateLimitedMessage", { minutes: String(minutes) })}
          </p>
        </div>
      </motion.div>
    )
  }

  // Compact variant (just email input)
  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="email"
            placeholder={t("landing.waitlist.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400 h-12"
            required
            disabled={status === "loading"}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="bg-blue-600 hover:bg-blue-500 text-white h-12 px-8 whitespace-nowrap"
          disabled={status === "loading" || !email.trim()}
        >
          {status === "loading" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            t("landing.waitlist.joinButton")
          )}
        </Button>
        <AnimatePresence>
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-sm flex items-center gap-1 sm:absolute sm:-bottom-6"
            >
              <AlertCircle className="w-4 h-4" />
              {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    )
  }

  // Hero variant (prominent, with name field)
  if (variant === "hero") {
    return (
      <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="email"
              placeholder={t("landing.waitlist.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400 h-14 text-lg"
              required
              disabled={status === "loading"}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all text-white h-14 px-10 text-lg font-semibold whitespace-nowrap"
            disabled={status === "loading" || !email.trim()}
          >
            {status === "loading" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Mail className="w-5 h-5 mr-2" />
                {t("landing.waitlist.joinButton")}
              </>
            )}
          </Button>
        </div>
        <AnimatePresence>
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-sm flex items-center gap-1"
            >
              <AlertCircle className="w-4 h-4" />
              {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
        <p className="text-gray-400 text-sm">
          {t("landing.waitlist.privacyNote")}
        </p>
      </form>
    )
  }

  // Default variant (full form with name)
  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          type="text"
          placeholder={t("landing.waitlist.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 h-12"
          disabled={status === "loading"}
        />
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="email"
            placeholder={t("landing.waitlist.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400 h-12"
            required
            disabled={status === "loading"}
          />
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] transition-all text-white h-12 text-lg font-semibold"
        disabled={status === "loading" || !email.trim()}
      >
        {status === "loading" ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Mail className="w-5 h-5 mr-2" />
            {t("landing.waitlist.joinButton")}
          </>
        )}
      </Button>
      <AnimatePresence>
        {status === "error" && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-sm flex items-center gap-1"
          >
            <AlertCircle className="w-4 h-4" />
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="text-gray-400 text-sm text-center">
        {t("landing.waitlist.privacyNote")}
      </p>
    </form>
  )
}
