"use client"

import Link from "next/link"
import { ArrowLeft, BookOpen, Brain, Trophy, BarChart3, Zap, Target, Sparkles, CheckCircle, ArrowRight } from "lucide-react"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { motion } from "motion/react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { GlowingEffect } from "@/components/ui/glowing-effect"
import { LandingBackground } from "@/components/landing/LandingBackground"
import { useLiveStats } from "@/hooks/useLiveStats"

export default function FeaturesPage() {
  const { appName } = useAppSettings()
  const { isWebappAuthEnabled } = useFeatureFlagContext()
  const { t } = useTranslation()
  const liveStats = useLiveStats()

  const features = [
    {
      icon: BookOpen,
      titleKey: 'landing.featuresPage.features.questionBank.title',
      descKey: 'landing.featuresPage.features.questionBank.description',
      color: "from-blue-500 to-blue-600",
      detailsKey: 'landing.featuresPage.features.questionBank.details'
    },
    {
      icon: Brain,
      titleKey: 'landing.featuresPage.features.aiLearning.title',
      descKey: 'landing.featuresPage.features.aiLearning.description',
      color: "from-purple-500 to-purple-600",
      detailsKey: 'landing.featuresPage.features.aiLearning.details'
    },
    {
      icon: Trophy,
      titleKey: 'landing.featuresPage.features.mockExams.title',
      descKey: 'landing.featuresPage.features.mockExams.description',
      color: "from-amber-500 to-orange-500",
      detailsKey: 'landing.featuresPage.features.mockExams.details'
    },
    {
      icon: BarChart3,
      titleKey: 'landing.featuresPage.features.analytics.title',
      descKey: 'landing.featuresPage.features.analytics.description',
      color: "from-emerald-500 to-green-600",
      detailsKey: 'landing.featuresPage.features.analytics.details'
    },
    {
      icon: Target,
      titleKey: 'landing.featuresPage.features.topicPractice.title',
      descKey: 'landing.featuresPage.features.topicPractice.description',
      color: "from-rose-500 to-pink-600",
      detailsKey: 'landing.featuresPage.features.topicPractice.details'
    },
    {
      icon: Zap,
      titleKey: 'landing.featuresPage.features.instantFeedback.title',
      descKey: 'landing.featuresPage.features.instantFeedback.description',
      color: "from-cyan-500 to-teal-600",
      detailsKey: 'landing.featuresPage.features.instantFeedback.details'
    }
  ]

  const displayStats = [
    { value: liveStats.loading ? "..." : `${liveStats.practiceQuestions.toLocaleString()}+`, labelKey: 'landing.featuresPage.stats.questions' },
    { value: "95%", labelKey: 'landing.featuresPage.stats.satisfaction' },
    { value: "24/7", labelKey: 'landing.featuresPage.stats.access' }
  ]

  const howItWorksSteps = [
    { step: 1, titleKey: 'landing.featuresPage.howItWorks.steps.download.title', descKey: 'landing.featuresPage.howItWorks.steps.download.desc' },
    { step: 2, titleKey: 'landing.featuresPage.howItWorks.steps.signUp.title', descKey: 'landing.featuresPage.howItWorks.steps.signUp.desc' },
    { step: 3, titleKey: 'landing.featuresPage.howItWorks.steps.practice.title', descKey: 'landing.featuresPage.howItWorks.steps.practice.desc' },
    { step: 4, titleKey: 'landing.featuresPage.howItWorks.steps.improve.title', descKey: 'landing.featuresPage.howItWorks.steps.improve.desc' }
  ]

  return (
    <LandingBackground>
    <div className="min-h-screen overflow-hidden">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        {/* Static gradient orbs - no animation for better scroll performance */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full opacity-20 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full opacity-20 blur-3xl" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link 
              href="/" 
              className="inline-flex items-center text-blue-200 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('landing.featuresPage.backToHome')}
            </Link>
          </motion.div>

          <div className="text-center max-w-3xl mx-auto">
            <motion.div 
              className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {t('landing.featuresPage.discoverBadge', { appName })}
            </motion.div>
            
            <motion.h1 
              className="text-4xl md:text-6xl font-bold mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {t('landing.featuresPage.heroTitle')}
              <span className="block bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                {t('landing.featuresPage.heroTitleHighlight')}
              </span>
            </motion.h1>
            
            <motion.p 
              className="text-xl text-blue-100 mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {t('landing.featuresPage.heroSubtitle')}
            </motion.p>

            {/* Stats */}
            <motion.div 
              className="grid grid-cols-3 gap-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {displayStats.map((stat, index) => (
                <motion.div 
                  key={index}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
                  whileHover={{ scale: 1.05, y: -5 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-3xl font-bold">{stat.value}</div>
                  <div className="text-blue-200 text-sm">{t(stat.labelKey)}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" 
              className="fill-gray-50 dark:fill-gray-900"
            />
          </svg>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="relative h-full rounded-2xl">
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={2}
                />
                <motion.div 
                  className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 h-full shadow-lg group border"
                  whileHover={{ y: -8, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)" }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div 
                    className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <feature.icon className="w-7 h-7" />
                  </motion.div>
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                    {t(feature.titleKey)}
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {t(feature.descKey)}
                  </p>

                  <ul className="space-y-2">
                    {Array.isArray(t(feature.detailsKey)) && (t(feature.detailsKey) as unknown as string[]).map((detail: string, i: number) => (
                      <motion.li 
                        key={i} 
                        className="flex items-center text-sm text-gray-500 dark:text-gray-400"
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: 0.1 * i }}
                      >
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                        {detail}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-900/50 backdrop-blur-sm py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {t('landing.featuresPage.howItWorks.title')}
            </h2>
            <p className="text-gray-300 max-w-2xl mx-auto">
              {t('landing.featuresPage.howItWorks.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {howItWorksSteps.map((item, index) => (
              <motion.div 
                key={index}
                className="text-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
                <motion.div 
                  className="relative inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-400 text-2xl font-bold mb-4"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.step}
                  {index < 3 && (
                    <motion.div
                      className="absolute -right-8 hidden md:block"
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ArrowRight className="w-6 h-6 text-gray-500" />
                    </motion.div>
                  )}
                </motion.div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {t(item.titleKey)}
                </h3>
                <p className="text-gray-400 text-sm">
                  {t(item.descKey)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="relative rounded-3xl">
          <GlowingEffect
            spread={60}
            glow={true}
            disabled={false}
            proximity={100}
            inactiveZone={0.01}
            borderWidth={3}
          />
          <motion.div 
            className="relative bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-12 text-center text-white overflow-hidden"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
          <div className="absolute inset-0 overflow-hidden">
            <motion.div 
              className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"
              animate={{ scale: [1, 1.2, 1], x: [0, 20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div 
              className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"
              animate={{ scale: [1, 1.3, 1], x: [0, -20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          
          <div className="relative">
            <motion.h2 
              className="text-3xl md:text-4xl font-bold mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {t('landing.featuresPage.cta.title')}
            </motion.h2>
            <motion.p 
              className="text-blue-100 mb-8 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {t('landing.featuresPage.cta.subtitle', { appName })}
            </motion.p>
            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {isWebappAuthEnabled && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
                  >
                    {t('landing.featuresPage.cta.getStarted')}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </motion.div>
              )}
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
                >
                  {t('landing.featuresPage.cta.learnMore')}
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
    </LandingBackground>
  )
}
