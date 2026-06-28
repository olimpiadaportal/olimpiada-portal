"use client"

import { motion } from "motion/react"
import { ReactNode } from "react"
import { usePrefersReducedMotion } from "@/lib/animations/hooks"

interface MarqueeProps {
  children: ReactNode
  speed?: number
  direction?: "left" | "right"
  pauseOnHover?: boolean
  className?: string
}

export function Marquee({
  children,
  speed = 30,
  direction = "left",
  pauseOnHover = true,
  className = ""
}: MarqueeProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const directionMultiplier = direction === "left" ? -1 : 1

  if (prefersReducedMotion) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <div className="flex gap-8">{children}</div>
      </div>
    )
  }

  return (
    <div 
      className={`overflow-hidden ${className}`}
      style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}
    >
      <motion.div
        className={`flex gap-8 ${pauseOnHover ? "hover:[animation-play-state:paused]" : ""}`}
        animate={{
          x: [0, directionMultiplier * -50 + "%"]
        }}
        transition={{
          x: {
            duration: speed,
            repeat: Infinity,
            ease: "linear"
          }
        }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  )
}

interface InfiniteScrollProps {
  items: ReactNode[]
  speed?: number
  direction?: "left" | "right" | "up" | "down"
  className?: string
  itemClassName?: string
}

export function InfiniteScroll({
  items,
  speed = 20,
  direction = "left",
  className = "",
  itemClassName = ""
}: InfiniteScrollProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const isHorizontal = direction === "left" || direction === "right"
  const isReverse = direction === "right" || direction === "down"

  if (prefersReducedMotion) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <div className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-4`}>
          {items.map((item, index) => (
            <div key={index} className={itemClassName}>{item}</div>
          ))}
        </div>
      </div>
    )
  }

  const animationProps = isHorizontal
    ? { x: isReverse ? ["0%", "50%"] : ["0%", "-50%"] }
    : { y: isReverse ? ["0%", "50%"] : ["0%", "-50%"] }

  return (
    <div 
      className={`overflow-hidden ${className}`}
      style={{ 
        maskImage: isHorizontal 
          ? "linear-gradient(to right, transparent, black 10%, black 90%, transparent)"
          : "linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)"
      }}
    >
      <motion.div
        className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-4`}
        animate={animationProps}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        {items.map((item, index) => (
          <div key={index} className={itemClassName}>{item}</div>
        ))}
        {items.map((item, index) => (
          <div key={`duplicate-${index}`} className={itemClassName}>{item}</div>
        ))}
      </motion.div>
    </div>
  )
}
