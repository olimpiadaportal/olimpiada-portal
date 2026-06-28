"use client"

import { motion } from "motion/react"
import { textRevealContainer, textRevealWord } from "@/lib/animations/variants"
import { usePrefersReducedMotion } from "@/lib/animations/hooks"

interface TextRevealProps {
  text: string
  className?: string
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span"
  delay?: number
}

export function TextReveal({ 
  text, 
  className = "", 
  as: Component = "p",
  delay = 0 
}: TextRevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const words = text.split(" ")

  if (prefersReducedMotion) {
    return <Component className={className}>{text}</Component>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={{
        ...textRevealContainer,
        visible: {
          ...textRevealContainer.visible,
          transition: {
            ...((textRevealContainer.visible as any)?.transition || {}),
            delayChildren: delay
          }
        }
      }}
      className={`flex flex-wrap ${className}`}
      style={{ perspective: "1000px" }}
    >
      {words.map((word, index) => (
        <motion.span
          key={index}
          variants={textRevealWord}
          className="inline-block mr-[0.25em]"
          style={{ transformStyle: "preserve-3d" }}
        >
          {word}
        </motion.span>
      ))}
    </motion.div>
  )
}

interface CharacterRevealProps {
  text: string
  className?: string
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span"
  delay?: number
  staggerDelay?: number
}

export function CharacterReveal({ 
  text, 
  className = "", 
  as: Component = "p",
  delay = 0,
  staggerDelay = 0.03
}: CharacterRevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const characters = text.split("")

  if (prefersReducedMotion) {
    return <Component className={className}>{text}</Component>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: delay
          }
        }
      }}
      className={className}
      aria-label={text}
    >
      {characters.map((char, index) => (
        <motion.span
          key={index}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { 
              opacity: 1, 
              y: 0,
              transition: { duration: 0.3 }
            }
          }}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </motion.div>
  )
}
