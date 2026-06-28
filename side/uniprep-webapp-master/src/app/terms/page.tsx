"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useAppSettings } from "@/hooks/useAppSettings"
import { motion } from "motion/react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { LandingBackground } from "@/components/landing/LandingBackground"

export default function TermsOfServicePage() {
  const { appName } = useAppSettings()
  const { t } = useTranslation()
  const [termsContent, setTermsContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const defaultLastUpdated = 'January 29, 2026'

  useEffect(() => {
    async function fetchTerms() {
      try {
        const response = await fetch('/api/legal?type=terms_of_service', { cache: 'no-store' })
        const data = await response.json()
        
        if (data.content) {
          setTermsContent(data.content)
        }
        if (data.lastUpdated) {
          setLastUpdated(new Date(data.lastUpdated).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }))
        }
      } catch (error) {
        console.error('Failed to fetch terms:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchTerms()
  }, [])

  return (
    <LandingBackground>
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link 
            href="/" 
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('landing.termsPage.backToHome')}
          </Link>
        </motion.div>

        <motion.div 
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <motion.h1 
            className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {t('landing.termsPage.title')}
          </motion.h1>
          <motion.p 
            className="text-gray-500 dark:text-gray-400 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {loading ? (
              <span className="inline-block h-4 w-48 animate-pulse rounded bg-gray-200 align-middle dark:bg-gray-700" />
            ) : (
              <>
                {t('landing.termsPage.lastUpdated')}: {lastUpdated || defaultLastUpdated}
              </>
            )}
          </motion.p>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            </div>
          ) : termsContent ? (
            <div 
              className="prose prose-gray dark:prose-invert max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: termsContent }}
            />
          ) : (
            <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">1. Acceptance of Terms</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  By accessing or using {appName} (&quot;the App&quot;), you agree to be bound by these Terms of Service. 
                  If you do not agree to these terms, please do not use the App.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">2. Description of Service</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {appName} is an educational platform designed to help students prepare for university entrance exams. 
                  The App provides practice questions, mock exams, AI-powered insights, progress tracking, and other 
                  educational features.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">3. User Accounts</h2>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>You must provide accurate and complete information when creating an account.</li>
                  <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                  <li>You must be at least 13 years old to use the App.</li>
                  <li>One person may not maintain more than one account.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">4. Acceptable Use</h2>
                <p className="text-gray-600 dark:text-gray-300">You agree not to:</p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>Share your account with others or use another person&apos;s account.</li>
                  <li>Attempt to gain unauthorized access to the App or its systems.</li>
                  <li>Use the App for any illegal or unauthorized purpose.</li>
                  <li>Copy, distribute, or share exam questions or content without permission.</li>
                  <li>Use automated systems or bots to access the App.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">5. Intellectual Property</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  All content, including questions, explanations, and educational materials, is the property of 
                  {appName} or its licensors. You may not reproduce, distribute, or create derivative works 
                  without explicit permission.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">6. AI Features</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  The App uses artificial intelligence to provide personalized insights and explanations. 
                  While we strive for accuracy, AI-generated content is provided for educational purposes 
                  and should not be considered as professional advice.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">7. Limitation of Liability</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {appName} is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that 
                  using the App will result in specific exam outcomes. We are not liable for any indirect, 
                  incidental, or consequential damages.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">8. Termination</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We reserve the right to suspend or terminate your account if you violate these terms. 
                  You may also delete your account at any time through the App settings.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">9. Changes to Terms</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We may update these terms from time to time. Continued use of the App after changes 
                  constitutes acceptance of the new terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">10. Contact</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  For questions about these Terms of Service, please contact us through the App or 
                  via our support email.
                </p>
              </section>
            </div>
          )}
        </motion.div>
      </div>
    </div>
    </LandingBackground>
  )
}
