"use client"

import { motion } from "motion/react"
import { useCountUp, usePrefersReducedMotion } from "@/lib/animations/hooks"

interface CountUpProps {
  end: number
  start?: number
  duration?: number
  suffix?: string
  prefix?: string
  decimals?: number
  className?: string
  separator?: string
}

export function CountUp({
  end,
  start = 0,
  duration = 2,
  suffix = "",
  prefix = "",
  decimals = 0,
  className = "",
  separator = ","
}: CountUpProps) {
  const { count, ref } = useCountUp(end, duration, start)
  const prefersReducedMotion = usePrefersReducedMotion()

  const formatNumber = (num: number) => {
    const fixed = num.toFixed(decimals)
    const parts = fixed.split(".")
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    return parts.join(".")
  }

  if (prefersReducedMotion) {
    return (
      <span className={className}>
        {prefix}{formatNumber(end)}{suffix}
      </span>
    )
  }

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {prefix}{formatNumber(count)}{suffix}
    </motion.span>
  )
}
