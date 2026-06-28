"use client"

import { motion } from "motion/react"
import { usePrefersReducedMotion } from "@/lib/animations/hooks"

interface GradientBlobProps {
  className?: string
  colors?: string[]
  size?: "sm" | "md" | "lg" | "xl"
  blur?: "sm" | "md" | "lg"
  speed?: "slow" | "normal" | "fast"
}

const sizeMap = {
  sm: "w-64 h-64",
  md: "w-96 h-96",
  lg: "w-[500px] h-[500px]",
  xl: "w-[700px] h-[700px]"
}

const blurMap = {
  sm: "blur-2xl",
  md: "blur-3xl",
  lg: "blur-[100px]"
}

const speedMap = {
  slow: 20,
  normal: 12,
  fast: 6
}

export function GradientBlob({
  className = "",
  colors = ["#3B82F6", "#8B5CF6", "#EC4899"],
  size = "lg",
  blur = "lg",
  speed = "normal"
}: GradientBlobProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const duration = speedMap[speed]

  const gradient = `radial-gradient(circle, ${colors[0]} 0%, ${colors[1] || colors[0]} 50%, ${colors[2] || colors[1] || colors[0]} 100%)`

  if (prefersReducedMotion) {
    return (
      <div
        className={`absolute rounded-full opacity-30 ${sizeMap[size]} ${blurMap[blur]} ${className}`}
        style={{ background: gradient }}
      />
    )
  }

  return (
    <motion.div
      className={`absolute rounded-full opacity-30 ${sizeMap[size]} ${blurMap[blur]} ${className}`}
      style={{ background: gradient }}
      animate={{
        scale: [1, 1.2, 1],
        x: [0, 50, -50, 0],
        y: [0, -30, 30, 0],
        rotate: [0, 180, 360]
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  )
}

interface AnimatedGradientBackgroundProps {
  className?: string
  children?: React.ReactNode
}

export function AnimatedGradientBackground({ 
  className = "",
  children 
}: AnimatedGradientBackgroundProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 -z-10">
        <GradientBlob 
          colors={["#3B82F6", "#8B5CF6", "#EC4899"]} 
          className="top-0 left-0 -translate-x-1/2 -translate-y-1/2"
          size="xl"
          speed="slow"
        />
        <GradientBlob 
          colors={["#10B981", "#3B82F6", "#6366F1"]} 
          className="bottom-0 right-0 translate-x-1/2 translate-y-1/2"
          size="xl"
          speed="slow"
        />
        <GradientBlob 
          colors={["#F59E0B", "#EF4444", "#EC4899"]} 
          className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          size="lg"
          speed="normal"
        />
      </div>
      {children}
    </div>
  )
}
