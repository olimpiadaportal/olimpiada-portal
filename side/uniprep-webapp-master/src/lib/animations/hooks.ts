"use client"

import { useEffect, useState, useRef } from "react"
import { useScroll, useTransform, useSpring, useInView, MotionValue } from "motion/react"

/**
 * Hook to detect if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return prefersReducedMotion
}

/**
 * Hook for parallax scroll effect
 */
export function useParallax(distance: number = 100) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], [-distance, distance])
  const smoothY = useSpring(y, { stiffness: 100, damping: 30 })

  return { ref, y: smoothY }
}

/**
 * Hook for scroll-based opacity
 */
export function useScrollOpacity() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })

  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0])

  return { ref, opacity }
}

/**
 * Hook for scroll-based scale
 */
export function useScrollScale(minScale: number = 0.8, maxScale: number = 1) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"]
  })

  const scale = useTransform(scrollYProgress, [0, 1], [minScale, maxScale])
  const smoothScale = useSpring(scale, { stiffness: 100, damping: 30 })

  return { ref, scale: smoothScale }
}

/**
 * Hook for element in view detection with animation trigger
 */
export function useAnimateInView(options?: { once?: boolean; amount?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { 
    once: options?.once ?? true, 
    amount: options?.amount ?? 0.3 
  })

  return { ref, isInView }
}

/**
 * Hook for counting animation
 */
export function useCountUp(
  end: number,
  duration: number = 2,
  start: number = 0
): { count: number; ref: React.RefObject<HTMLDivElement> } {
  const [count, setCount] = useState(start)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isInView || hasAnimated.current) return
    hasAnimated.current = true

    const startTime = Date.now()
    const endTime = startTime + duration * 1000

    const tick = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / (duration * 1000), 1)
      
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentCount = start + (end - start) * easeOut

      setCount(currentCount)

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }, [isInView, end, duration, start])

  return { count, ref: ref as React.RefObject<HTMLDivElement> }
}

/**
 * Hook for mouse position tracking (for magnetic effects)
 */
export function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return mousePosition
}

/**
 * Hook for element-relative mouse position (for hover effects)
 */
export function useRelativeMousePosition() {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0, isHovering: false })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      setPosition({ x, y, isHovering: true })
    }

    const handleMouseLeave = () => {
      setPosition({ x: 0, y: 0, isHovering: false })
    }

    element.addEventListener("mousemove", handleMouseMove)
    element.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      element.removeEventListener("mousemove", handleMouseMove)
      element.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [])

  return { ref, ...position }
}

/**
 * Hook for smooth scroll progress
 */
export function useSmoothScrollProgress(): MotionValue<number> {
  const { scrollYProgress } = useScroll()
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  return smoothProgress
}

/**
 * Hook for typewriter effect
 */
export function useTypewriter(
  text: string,
  speed: number = 50
): { displayText: string; isComplete: boolean } {
  const [displayText, setDisplayText] = useState("")
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    setDisplayText("")
    setIsComplete(false)
    
    let index = 0
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1))
        index++
      } else {
        setIsComplete(true)
        clearInterval(interval)
      }
    }, speed)

    return () => clearInterval(interval)
  }, [text, speed])

  return { displayText, isComplete }
}
