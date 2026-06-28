"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { motion, useScroll, useTransform } from "motion/react"

export function Navbar() {
  const { t } = useTranslation()
  const { appName, loading } = useAppSettings()
  const { isWebappAuthEnabled } = useFeatureFlagContext()
  const { scrollY } = useScroll()
  
  const backgroundColor = useTransform(
    scrollY,
    [0, 100],
    ["rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 0.95)"]
  )
  
  const darkBackgroundColor = useTransform(
    scrollY,
    [0, 100],
    ["rgba(17, 24, 39, 0.5)", "rgba(17, 24, 39, 0.95)"]
  )
  
  const borderOpacity = useTransform(scrollY, [0, 100], [0, 1])
  const shadowOpacity = useTransform(scrollY, [0, 100], [0, 0.1])
  
  return (
    <motion.nav 
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: useTransform(borderOpacity, (v) => `rgba(229, 231, 235, ${v})`),
        boxShadow: useTransform(shadowOpacity, (v) => `0 4px 6px -1px rgba(0, 0, 0, ${v})`),
      }}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div 
        className="absolute inset-0 dark:hidden"
        style={{ backgroundColor }}
      />
      <motion.div 
        className="absolute inset-0 hidden dark:block"
        style={{ backgroundColor: darkBackgroundColor }}
      />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <motion.div 
            className="flex items-center"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <Link href="/" className="flex items-center space-x-2">
              <motion.div 
                className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <Image src="/icon.png" alt={appName} width={32} height={32} className="w-full h-full object-cover" priority />
              </motion.div>
              {loading ? (
                <span className="text-xl font-bold text-gray-900 dark:text-white opacity-0">Loading</span>
              ) : (
                <span className="text-xl font-bold text-gray-900 dark:text-white">{appName}</span>
              )}
            </Link>
          </motion.div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {isWebappAuthEnabled && (
              <>
                <Link href="/login">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="ghost" size="sm" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2 sm:px-4">
                      {t('landing.auth.login')}
                    </Button>
                  </motion.div>
                </Link>
                <Link href="/register">
                  <motion.div
                    whileHover="hovered"
                    whileTap={{ scale: 0.95 }}
                    animate="rest"
                    initial="rest"
                  >
                    <motion.div variants={{ rest: { scale: 1 }, hovered: { scale: 1.05 } }} transition={{ duration: 0.2 }}>
                      <Button size="sm" className="bg-blue-900 text-white relative overflow-hidden px-2 sm:px-4 border-0">
                        <span className="relative z-10">{t('landing.auth.signUp')}</span>
                        <motion.span
                          className="absolute inset-0 bg-gradient-to-r from-blue-700 to-blue-500"
                          variants={{ rest: { x: "-100%" }, hovered: { x: 0 } }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                        />
                      </Button>
                    </motion.div>
                  </motion.div>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
