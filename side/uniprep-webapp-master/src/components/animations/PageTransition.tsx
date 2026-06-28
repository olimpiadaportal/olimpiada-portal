"use client"

import { motion, AnimatePresence } from "motion/react"
import { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { pageTransition } from "@/lib/animations/variants"
import { usePrefersReducedMotion } from "@/lib/animations/hooks"

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname()
  const prefersReducedMotion = usePrefersReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

interface FadePageProps {
  children: ReactNode
  className?: string
}

export function FadePage({ children, className = "" }: FadePageProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface SlidePageProps {
  children: ReactNode
  className?: string
  direction?: "up" | "down" | "left" | "right"
}

export function SlidePage({ 
  children, 
  className = "",
  direction = "up"
}: SlidePageProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  const directionMap = {
    up: { initial: { y: 50 }, exit: { y: -50 } },
    down: { initial: { y: -50 }, exit: { y: 50 } },
    left: { initial: { x: 50 }, exit: { x: -50 } },
    right: { initial: { x: -50 }, exit: { x: 50 } }
  }

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...directionMap[direction].initial }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...directionMap[direction].exit }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
