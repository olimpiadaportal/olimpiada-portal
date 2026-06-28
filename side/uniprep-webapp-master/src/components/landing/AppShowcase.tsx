"use client"

import { CheckCircle2 } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { FadeInSection, SlideIn, StaggerContainer, StaggerItem } from "./animations/AnimatedSection"
import AnimatedText from "@/components/ui/animated-text"
import { GlowingEffect } from "@/components/ui/glowing-effect"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useLiveStats } from "@/hooks/useLiveStats"
import { WaitlistForm } from "./WaitlistForm"

import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"

export function AppShowcase() {
  const { t } = useTranslation()
  const { appName } = useAppSettings()
  const { practiceQuestions } = useLiveStats()
  const { isWaitlistEnabled } = useFeatureFlagContext()
  
  // Replace hardcoded "50,000+" in highlight1 with real dynamic count
  const formattedCount = practiceQuestions.toLocaleString() + '+'
  const highlight1 = t('landing.showcase.highlight1').replace(/[\d,.]+\+/, formattedCount)
  
  const highlights = [
    highlight1,
    t('landing.showcase.highlight2'),
    t('landing.showcase.highlight3'),
    t('landing.showcase.highlight4'),
    t('landing.showcase.highlight5'),
    t('landing.showcase.highlight6'),
    t('landing.showcase.highlight7'),
    t('landing.showcase.highlight8'),
  ]
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <AnimatedText
            text={isWaitlistEnabled ? t('landing.showcase.titleWaitlist', { appName }) : t('landing.showcase.title', { appName })}
            className="text-4xl sm:text-5xl font-bold text-white mb-4"
            animationType="words"
            staggerDelay={0.08}
            duration={0.5}
          />
          <FadeInSection delay={0.3}>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              {isWaitlistEnabled ? t('landing.showcase.subtitleWaitlist', { appName }) : t('landing.showcase.subtitle', { appName })}
            </p>
          </FadeInSection>
        </div>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <SlideIn direction="left">
            <div className="space-y-6">
              <StaggerContainer className="space-y-3">
                {highlights.map((highlight, index) => (
                  <StaggerItem key={index}>
                    <div className="flex items-start space-x-3 hover:translate-x-1 transition-transform duration-200">
                      <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mt-1">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-gray-300">{highlight}</p>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>

              <FadeInSection delay={0.2}>
                {/* Waitlist Form - shown during pre-launch */}
                <WaitlistForm variant="compact" source="showcase" />
                
                {/* Hidden: App Store/Google Play buttons - uncomment after launch
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Button size="lg" className="w-full bg-gray-600 hover:bg-gray-600 text-white cursor-default opacity-80" disabled>
                      <Download className="w-5 h-5 mr-2" />
                      {t('landing.hero.appStoreComingSoon')}
                    </Button>
                  </div>
                  <Link href={DOWNLOAD_LINKS.playStore} target="_blank" className="flex-1">
                    <Button size="lg" className="w-full bg-blue-900 hover:bg-blue-800 hover:scale-105 active:scale-95 transition-transform text-white">
                      <Download className="w-5 h-5 mr-2" />
                      {t('landing.hero.playStorePreRegister')}
                    </Button>
                  </Link>
                </div>
                */}
              </FadeInSection>
            </div>
          </SlideIn>

          <SlideIn direction="right" delay={0.1}>
            <div className="relative rounded-3xl">
              <GlowingEffect
                spread={50}
                glow={true}
                disabled={false}
                proximity={80}
                inactiveZone={0.01}
                borderWidth={3}
              />
              <div className="relative bg-gradient-to-br from-blue-900 to-blue-700 rounded-3xl p-8 shadow-2xl hover:scale-[1.01] transition-transform duration-300">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">{t('landing.showcase.todaysProgress')}</span>
                      <span className="text-2xl">📊</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">{t('landing.showcase.questionsSolved')}</span>
                      <span className="font-bold text-blue-900 dark:text-blue-400">45/50</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-blue-900 dark:bg-blue-600 h-2 rounded-full w-[90%]" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('landing.showcase.upcomingExam')}</span>
                      <span className="text-xl">📝</span>
                    </div>
                    <div className="font-semibold text-gray-900 dark:text-white">{t('landing.showcase.mockExamGroup')}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('landing.showcase.examSubjects')}</div>
                    <div className="flex items-center space-x-2 mt-3">
                      <div className="px-2 py-1 bg-white dark:bg-gray-700 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300">
                        90 {t('landing.showcase.questions')}
                      </div>
                      <div className="px-2 py-1 bg-white dark:bg-gray-700 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300">
                        180 {t('landing.showcase.minutes')}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('landing.showcase.leaderboardRank')}</span>
                      <span className="text-xl">🏆</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-400">#127</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('landing.showcase.nationalRanking')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600 dark:text-green-400">↑ 15</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('landing.showcase.thisWeek')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Static gradient orbs - no animation for better scroll performance */}
              <div className="absolute -top-4 -right-4 w-64 h-64 bg-amber-400 rounded-full blur-3xl opacity-20 -z-10" />
              <div className="absolute -bottom-4 -left-4 w-64 h-64 bg-blue-400 rounded-full blur-3xl opacity-20 -z-10" />
            </div>
          </SlideIn>
        </div>
      </div>
    </section>
  )
}
