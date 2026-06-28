"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { DOWNLOAD_LINKS } from "@/lib/constants"
import { Smartphone } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { ParallaxSection, FadeInSection, ScaleIn, AnimatedCounter } from "./animations/AnimatedSection"
import AnimatedText from "@/components/ui/animated-text"
import { GlowingEffect } from "@/components/ui/glowing-effect"
import { motion } from "motion/react"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useLiveStats } from "@/hooks/useLiveStats"
import { WaitlistForm } from "./WaitlistForm"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { ArrowRight } from "lucide-react"

export function Hero() {
  const { t } = useTranslation()
  const { appName } = useAppSettings()
  const stats = useLiveStats()
  const { isWebappAuthEnabled, isWaitlistEnabled } = useFeatureFlagContext()
  const subtitle = t('landing.hero.subtitle')
  
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <FadeInSection delay={0.1}>
              <motion.div 
                className="inline-flex items-center px-4 py-2 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-full text-sm font-medium text-blue-300"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <Smartphone className="w-4 h-4 mr-2" />
                {isWaitlistEnabled ? t('landing.hero.badgeWaitlist') : t('landing.hero.badge')}
              </motion.div>
            </FadeInSection>

            <div className="space-y-2">
              <AnimatedText
                text={appName}
                className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight"
                animationType="words"
                staggerDelay={0.1}
                duration={0.5}
                delay={0.2}
              />
              <AnimatedText
                text={subtitle}
                className="text-5xl sm:text-6xl lg:text-7xl font-bold text-blue-400 leading-tight"
                animationType="words"
                staggerDelay={0.08}
                duration={0.5}
                delay={0.4}
              />
            </div>

            <FadeInSection delay={0.3}>
              <p className="text-xl text-gray-300 leading-relaxed">
                {t('landing.hero.description')}
              </p>
            </FadeInSection>

            <FadeInSection delay={0.3}>
              {/* Pre-launch: show waitlist form. Post-launch: show download/login CTAs */}
              {isWebappAuthEnabled ? (
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/login">
                    <Button size="lg" className="bg-blue-600 hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all text-white h-14 px-10 text-lg font-semibold whitespace-nowrap">
                      {t('landing.hero.startPracticing')}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                  <Button size="lg" className="bg-gray-600 hover:bg-gray-600 text-white w-full sm:w-auto cursor-default opacity-80" disabled>
                    <Smartphone className="w-5 h-5 mr-2" />
                    {t('landing.hero.appStoreComingSoon')}
                  </Button>
                </div>
              ) : isWaitlistEnabled ? (
                <WaitlistForm variant="hero" source="hero" />
              ) : null}
            </FadeInSection>

            <FadeInSection delay={0.4}>
              <div className="flex items-center space-x-8 pt-4">
                {/* Students and Teachers stats hidden for pre-launch - uncomment when app has more users */}
                <div className="hover:-translate-y-1 transition-transform duration-200">
                  <div className="text-3xl font-bold text-white">
                    {stats.loading ? (
                      <span className="inline-block w-20 h-8 bg-gray-700 rounded animate-pulse" />
                    ) : (
                      <AnimatedCounter to={stats.practiceQuestions} suffix="+" />
                    )}
                  </div>
                  <div className="text-sm text-gray-400">{t('landing.hero.practiceQuestions')}</div>
                </div>
              </div>
            </FadeInSection>
          </div>

          <ParallaxSection>
            <ScaleIn delay={0.3}>
              <div className="relative z-10 rounded-3xl">
                <GlowingEffect
                  spread={50}
                  glow={true}
                  disabled={false}
                  proximity={80}
                  inactiveZone={0.01}
                  borderWidth={3}
                />
                <div className="relative bg-gradient-to-br from-blue-900 to-blue-700 rounded-3xl p-8 shadow-2xl rotate-3 hover:rotate-0 hover:scale-[1.02] transition-transform duration-300">
                <div className="bg-white rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                        <Image src="/icon.png" alt={appName} width={48} height={48} className="w-full h-full object-cover" priority />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{appName}</div>
                        <div className="text-sm text-gray-500">{t('landing.hero.studyCompanion')}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{t('landing.hero.dailyStreak')}</span>
                        <span className="text-2xl">🔥</span>
                      </div>
                      <div className="text-3xl font-bold text-blue-900">15 {t('landing.hero.days')}</div>
                    </div>

                    <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{t('landing.hero.leaderboardRank') || 'Leaderboard Rank'}</span>
                        <span className="text-2xl">🏆</span>
                      </div>
                      <div className="text-3xl font-bold text-amber-600">#42</div>
                      <div className="text-xs text-gray-600 mt-1">{t('landing.hero.nationalRanking') || 'National Ranking'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-sm text-gray-600">{t('landing.hero.examsTaken')}</div>
                        <div className="text-2xl font-bold text-green-700">24</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="text-sm text-gray-600">{t('landing.hero.avgScore')}</div>
                        <div className="text-2xl font-bold text-purple-700">82%</div>
                      </div>
                    </div>
                  </div>

                  {isWebappAuthEnabled ? (
                    <Link href="/login" className="block">
                      <Button className="w-full bg-blue-900 hover:bg-blue-800 text-white">
                        {t('landing.hero.startPracticing')}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  ) : (
                    <div className="text-center text-sm text-gray-500 py-2">
                      {t('landing.hero.comingSoonBoth') || 'Coming Soon to Play Store & App Store'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Static gradient orbs - no animation for better performance */}
            <div className="absolute -top-4 -right-4 w-72 h-72 bg-blue-200 rounded-full blur-3xl opacity-30 -z-10" />
            <div className="absolute -bottom-4 -left-4 w-72 h-72 bg-amber-200 rounded-full blur-3xl opacity-30 -z-10" />
            </ScaleIn>
          </ParallaxSection>
        </div>
      </div>
    </section>
  )
}
