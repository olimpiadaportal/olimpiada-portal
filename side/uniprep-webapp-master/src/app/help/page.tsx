"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Search, ChevronDown, BookOpen, Smartphone, Brain, Trophy, Settings, HelpCircle, MessageCircle, Shield } from "lucide-react"
import { useAppSettings } from "@/hooks/useAppSettings"
import { motion, AnimatePresence } from "motion/react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { LandingBackground } from "@/components/landing/LandingBackground"

interface FAQItem {
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  titleKey: string
  icon: React.ReactNode
  items: { questionKey: string; answerKey: string }[]
}

const faqCategories: FAQCategory[] = [
  {
    id: "getting-started",
    titleKey: "landing.helpPage.faq.gettingStarted.title",
    icon: <BookOpen className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.gettingStarted.q1.question", answerKey: "landing.helpPage.faq.gettingStarted.q1.answer" },
      { questionKey: "landing.helpPage.faq.gettingStarted.q2.question", answerKey: "landing.helpPage.faq.gettingStarted.q2.answer" },
      { questionKey: "landing.helpPage.faq.gettingStarted.q3.question", answerKey: "landing.helpPage.faq.gettingStarted.q3.answer" },
      { questionKey: "landing.helpPage.faq.gettingStarted.q4.question", answerKey: "landing.helpPage.faq.gettingStarted.q4.answer" }
    ]
  },
  {
    id: "practice",
    titleKey: "landing.helpPage.faq.practice.title",
    icon: <Smartphone className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.practice.q1.question", answerKey: "landing.helpPage.faq.practice.q1.answer" },
      { questionKey: "landing.helpPage.faq.practice.q2.question", answerKey: "landing.helpPage.faq.practice.q2.answer" },
      { questionKey: "landing.helpPage.faq.practice.q3.question", answerKey: "landing.helpPage.faq.practice.q3.answer" },
      { questionKey: "landing.helpPage.faq.practice.q4.question", answerKey: "landing.helpPage.faq.practice.q4.answer" }
    ]
  },
  {
    id: "ai-features",
    titleKey: "landing.helpPage.faq.aiFeatures.title",
    icon: <Brain className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.aiFeatures.q1.question", answerKey: "landing.helpPage.faq.aiFeatures.q1.answer" },
      { questionKey: "landing.helpPage.faq.aiFeatures.q2.question", answerKey: "landing.helpPage.faq.aiFeatures.q2.answer" },
      { questionKey: "landing.helpPage.faq.aiFeatures.q3.question", answerKey: "landing.helpPage.faq.aiFeatures.q3.answer" },
      { questionKey: "landing.helpPage.faq.aiFeatures.q4.question", answerKey: "landing.helpPage.faq.aiFeatures.q4.answer" }
    ]
  },
  {
    id: "exams",
    titleKey: "landing.helpPage.faq.exams.title",
    icon: <Trophy className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.exams.q1.question", answerKey: "landing.helpPage.faq.exams.q1.answer" },
      { questionKey: "landing.helpPage.faq.exams.q2.question", answerKey: "landing.helpPage.faq.exams.q2.answer" },
      { questionKey: "landing.helpPage.faq.exams.q3.question", answerKey: "landing.helpPage.faq.exams.q3.answer" },
      { questionKey: "landing.helpPage.faq.exams.q4.question", answerKey: "landing.helpPage.faq.exams.q4.answer" }
    ]
  },
  {
    id: "account",
    titleKey: "landing.helpPage.faq.account.title",
    icon: <Settings className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.account.q1.question", answerKey: "landing.helpPage.faq.account.q1.answer" },
      { questionKey: "landing.helpPage.faq.account.q2.question", answerKey: "landing.helpPage.faq.account.q2.answer" },
      { questionKey: "landing.helpPage.faq.account.q3.question", answerKey: "landing.helpPage.faq.account.q3.answer" },
      { questionKey: "landing.helpPage.faq.account.q4.question", answerKey: "landing.helpPage.faq.account.q4.answer" }
    ]
  },
  {
    id: "privacy",
    titleKey: "landing.helpPage.faq.privacy.title",
    icon: <Shield className="w-5 h-5" />,
    items: [
      { questionKey: "landing.helpPage.faq.privacy.q1.question", answerKey: "landing.helpPage.faq.privacy.q1.answer" },
      { questionKey: "landing.helpPage.faq.privacy.q2.question", answerKey: "landing.helpPage.faq.privacy.q2.answer" },
      { questionKey: "landing.helpPage.faq.privacy.q3.question", answerKey: "landing.helpPage.faq.privacy.q3.answer" },
      { questionKey: "landing.helpPage.faq.privacy.q4.question", answerKey: "landing.helpPage.faq.privacy.q4.answer" }
    ]
  }
]

export default function HelpPage() {
  const { appName } = useAppSettings()
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategory, setExpandedCategory] = useState<string | null>("getting-started")
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  // Build translated FAQ data
  const faqData = useMemo(() => {
    return faqCategories.map(category => ({
      id: category.id,
      title: t(category.titleKey),
      icon: category.icon,
      items: category.items.map(item => ({
        question: t(item.questionKey, { appName }),
        answer: t(item.answerKey, { appName })
      }))
    }))
  }, [t, appName])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
  }

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions)
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId)
    } else {
      newExpanded.add(questionId)
    }
    setExpandedQuestions(newExpanded)
  }

  const filteredData = searchQuery
    ? faqData.map(category => ({
        ...category,
        items: category.items.filter(
          item =>
            item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.answer.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(category => category.items.length > 0)
    : faqData

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
            className="inline-flex items-center text-blue-400 hover:text-blue-300 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('landing.helpPage.backToHome')}
          </Link>
        </motion.div>

        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <motion.div 
            className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ duration: 0.2 }}
          >
            <HelpCircle className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {t('landing.helpPage.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {t('landing.helpPage.subtitle', { appName })}
          </p>
        </motion.div>

        {/* Search */}
        <motion.div 
          className="relative mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('landing.helpPage.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </motion.div>

        {/* FAQ Categories */}
        <div className="space-y-4">
          {filteredData.map((category, index) => (
            <motion.div 
              key={category.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * index }}
              whileHover={{ y: -2 }}
            >
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <motion.div 
                    className="text-blue-600 dark:text-blue-400"
                    animate={{ rotate: expandedCategory === category.id ? 360 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {category.icon}
                  </motion.div>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {category.title}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    ({category.items.length})
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: expandedCategory === category.id ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </motion.div>
              </button>

              <AnimatePresence>
                {expandedCategory === category.id && (
                  <motion.div 
                    className="border-t border-gray-100 dark:border-gray-700"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {category.items.map((item, itemIndex) => {
                      const questionId = `${category.id}-${itemIndex}`
                      const isExpanded = expandedQuestions.has(questionId)
                      
                      return (
                        <div 
                          key={itemIndex}
                          className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        >
                          <button
                            onClick={() => toggleQuestion(questionId)}
                            className="w-full flex items-center justify-between p-4 pl-14 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <span className="text-gray-700 dark:text-gray-300 pr-4">
                              {item.question}
                            </span>
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            </motion.div>
                          </button>
                          
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div 
                                className="px-14 pb-4"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                  {item.answer}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {t('landing.helpPage.noResultsFor', { query: searchQuery })}
            </p>
          </div>
        )}

        {/* Contact Support */}
        <motion.div 
          className="mt-12 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-center text-white relative overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div 
            className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ duration: 0.2 }}
            >
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-90" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-2">{t('landing.helpPage.contactSupport.title')}</h2>
            <p className="text-blue-100 mb-6">
              {t('landing.helpPage.contactSupport.subtitle')}
            </p>
            <motion.a
              href="mailto:support@elmly.az"
              className="inline-flex items-center px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {t('landing.helpPage.contactSupport.button')}
            </motion.a>
          </div>
        </motion.div>
      </div>
    </div>
    </LandingBackground>
  )
}
