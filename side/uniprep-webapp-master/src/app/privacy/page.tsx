"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { motion } from "motion/react"
import { LandingBackground } from "@/components/landing/LandingBackground"

export default function PrivacyPolicyPage() {
  const { appName } = useAppSettings()
  const { t } = useTranslation()
  const [privacyContent, setPrivacyContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const defaultLastUpdated = 'January 29, 2026'

  useEffect(() => {
    async function fetchPrivacy() {
      try {
        const response = await fetch('/api/legal?type=privacy_policy', { cache: 'no-store' })
        const data = await response.json()
        
        if (data.content) {
          setPrivacyContent(data.content)
        }
        if (data.lastUpdated) {
          setLastUpdated(new Date(data.lastUpdated).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }))
        }
      } catch (error) {
        console.error('Failed to fetch privacy policy:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchPrivacy()
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
            {t('landing.privacyPage.backToHome')}
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
            {t('landing.privacyPage.title')}
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
                {t('landing.privacyPage.lastUpdated')}: {lastUpdated || defaultLastUpdated}
              </>
            )}
          </motion.p>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            </div>
          ) : privacyContent ? (
            <div 
              className="prose prose-gray dark:prose-invert max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: privacyContent }}
            />
          ) : (
            <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">1. Information We Collect</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  When you use {appName}, we collect the following types of information:
                </p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li><strong>Account Information:</strong> Name, email address, and password when you register.</li>
                  <li><strong>Profile Information:</strong> Optional details like profile picture and study preferences.</li>
                  <li><strong>Usage Data:</strong> Questions answered, exam results, study time, and progress metrics.</li>
                  <li><strong>Device Information:</strong> Device type, operating system, and app version for troubleshooting.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">2. How We Use Your Information</h2>
                <p className="text-gray-600 dark:text-gray-300">We use your information to:</p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>Provide and improve our educational services.</li>
                  <li>Personalize your learning experience with AI-powered insights.</li>
                  <li>Track your progress and generate performance analytics.</li>
                  <li>Send important notifications about your account and study reminders.</li>
                  <li>Respond to your support requests and feedback.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">3. Data Storage and Security</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Your data is stored securely using industry-standard encryption. We use Supabase as our 
                  backend provider, which implements robust security measures including:
                </p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>Encryption in transit (TLS/SSL) and at rest.</li>
                  <li>Row-level security policies to protect your data.</li>
                  <li>Regular security audits and updates.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">4. AI and Data Processing</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We use AI services to provide personalized study insights and explanations. When using 
                  AI features:
                </p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>Your study data may be processed by AI models to generate insights.</li>
                  <li>We do not share your personal information with AI providers.</li>
                  <li>AI-generated content is for educational purposes only.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">5. Data Sharing</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We do not sell your personal information. We may share data only in these cases:
                </p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li>With your consent for specific features.</li>
                  <li>To comply with legal obligations.</li>
                  <li>With service providers who help us operate the App (under strict confidentiality).</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">6. Your Rights</h2>
                <p className="text-gray-600 dark:text-gray-300">You have the right to:</p>
                <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                  <li><strong>Access:</strong> Request a copy of your personal data.</li>
                  <li><strong>Correction:</strong> Update or correct your information.</li>
                  <li><strong>Deletion:</strong> Request deletion of your account and data.</li>
                  <li><strong>Export:</strong> Download your study data and progress.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">7. Cookies and Tracking</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We use essential cookies to maintain your session and preferences. We do not use 
                  third-party tracking cookies for advertising purposes.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">8. Children&apos;s Privacy</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Our App is designed for students aged 13 and above. We do not knowingly collect 
                  information from children under 13. If you believe a child under 13 has provided 
                  us with personal information, please contact us.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">9. Changes to This Policy</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  We may update this Privacy Policy from time to time. We will notify you of significant 
                  changes through the App or via email.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">10. Contact Us</h2>
                <p className="text-gray-600 dark:text-gray-300">
                  If you have questions about this Privacy Policy or your data, please contact us 
                  through the App or via our support email.
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
