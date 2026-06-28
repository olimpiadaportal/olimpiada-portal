"use client"

import { Card } from "@/components/ui/card"
import { GlowingEffect } from "@/components/ui/glowing-effect"
import { BookOpen, FileText, Zap, Users, BarChart3, Trophy } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { FadeInSection, StaggerContainer, StaggerItem } from "./animations/AnimatedSection"
import AnimatedText from "@/components/ui/animated-text"

export function Features() {
  const { t } = useTranslation()
  
  const features = [
    {
      icon: BookOpen,
      titleKey: 'landing.features.items.practice.title',
      descKey: 'landing.features.items.practice.description',
      gradient: 'from-blue-500 to-blue-700',
      bgGradient: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
    },
    {
      icon: FileText,
      titleKey: 'landing.features.items.mockExams.title',
      descKey: 'landing.features.items.mockExams.description',
      gradient: 'from-purple-500 to-purple-700',
      bgGradient: 'from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
    },
    {
      icon: Zap,
      titleKey: 'landing.features.items.aiMode.title',
      descKey: 'landing.features.items.aiMode.description',
      gradient: 'from-amber-500 to-orange-600',
      bgGradient: 'from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-800/20',
    },
    {
      icon: Users,
      titleKey: 'landing.features.items.teachers.title',
      descKey: 'landing.features.items.teachers.description',
      gradient: 'from-green-500 to-emerald-600',
      bgGradient: 'from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20',
    },
    {
      icon: BarChart3,
      titleKey: 'landing.features.items.analytics.title',
      descKey: 'landing.features.items.analytics.description',
      gradient: 'from-cyan-500 to-blue-600',
      bgGradient: 'from-cyan-50 to-blue-100 dark:from-cyan-900/20 dark:to-blue-800/20',
    },
    {
      icon: Trophy,
      titleKey: 'landing.features.items.leaderboards.title',
      descKey: 'landing.features.items.leaderboards.description',
      gradient: 'from-yellow-500 to-amber-600',
      bgGradient: 'from-yellow-50 to-amber-100 dark:from-yellow-900/20 dark:to-amber-800/20',
    },
  ]
  
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/50 backdrop-blur-sm relative overflow-hidden">
      {/* Static gradient orbs - no animation for better scroll performance */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl opacity-30 -z-10" />
      
      <div className="max-w-7xl mx-auto">
        <FadeInSection>
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-full text-sm font-medium text-blue-300 mb-4">
              ✨ {t('landing.features.badge') || 'Powerful Features'}
            </span>
            <AnimatedText
              text={t('landing.features.title')}
              className="text-4xl sm:text-5xl font-bold text-white mb-4 text-center"
              animationType="words"
              staggerDelay={0.08}
              duration={0.5}
            />
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>
        </FadeInSection>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <StaggerItem key={index} className="h-full">
                <div className="relative h-full rounded-2xl hover:-translate-y-2 transition-transform duration-300">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={2}
                  />
                  <Card className="relative p-6 h-full border border-gray-700/50 bg-gray-800/80 backdrop-blur-sm hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 group flex flex-col rounded-2xl">
                    <div className={`w-14 h-14 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-5 shadow-lg flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-blue-400 transition-colors flex-shrink-0">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="text-gray-400 leading-relaxed flex-grow">
                      {t(feature.descKey)}
                    </p>
                  </Card>
                </div>
              </StaggerItem>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}
