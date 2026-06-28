"use client"

import gsap from "gsap"
import { SplitText } from "gsap/SplitText"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { useRef, ReactNode } from "react"

// Register plugins only on client side
if (typeof window !== "undefined") {
  gsap.registerPlugin(SplitText, ScrollTrigger)
}

interface TextBlockAnimationProps {
  children: ReactNode
  animateOnScroll?: boolean
  delay?: number
  blockColor?: string
  stagger?: number
  duration?: number
  className?: string
}

export default function TextBlockAnimation({
  children,
  animateOnScroll = true,
  delay = 0,
  blockColor = "hsl(var(--primary))",
  stagger = 0.1,
  duration = 0.6,
  className = "",
}: TextBlockAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return

    // 1. Setup SplitText
    const split = new SplitText(containerRef.current, {
      type: "lines",
      linesClass: "block-line-parent",
    })

    // 2. Wrap lines and inject the block revealer manually
    const lines = split.lines
    const blocks: HTMLDivElement[] = []

    lines.forEach((line) => {
      // Create the wrapper
      const wrapper = document.createElement("div")
      wrapper.style.position = "relative"
      wrapper.style.display = "block"
      wrapper.style.overflow = "hidden"

      // Create the Revealer Block
      const block = document.createElement("div")
      block.style.position = "absolute"
      block.style.top = "0"
      block.style.left = "0"
      block.style.width = "100%"
      block.style.height = "100%"
      block.style.backgroundColor = blockColor
      block.style.zIndex = "2"
      block.style.transform = "scaleX(0)"
      block.style.transformOrigin = "left center"

      // Insert wrapper and move line inside
      if (line.parentNode) {
        line.parentNode.insertBefore(wrapper, line)
      }
      wrapper.appendChild(line)
      wrapper.appendChild(block)

      // Set initial state of line to invisible
      gsap.set(line, { opacity: 0 })

      blocks.push(block)
    })

    // 3. Create the Master Timeline
    const tl = gsap.timeline({
      defaults: { ease: "expo.inOut" },
      scrollTrigger: animateOnScroll
        ? {
            trigger: containerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          }
        : undefined,
      delay: delay,
    })

    // 4. Build the Animation Sequence
    // Step A: Scale Block 0 -> 1 (Left to Right)
    tl.to(blocks, {
      scaleX: 1,
      duration: duration,
      stagger: stagger,
      transformOrigin: "left center",
    })
      // Step B: Reveal Text (Instant)
      .set(
        lines,
        {
          opacity: 1,
          stagger: stagger,
        },
        `<${duration / 2}`
      )
      // Step C: Scale Block 1 -> 0 (Left to Right)
      .to(
        blocks,
        {
          scaleX: 0,
          duration: duration,
          stagger: stagger,
          transformOrigin: "right center",
        },
        `<${duration * 0.4}`
      )

    // Cleanup
    return () => {
      tl.kill()
      split.revert()
    }
  }, {
    scope: containerRef,
    dependencies: [animateOnScroll, delay, blockColor, stagger, duration],
  })

  return (
    <div ref={containerRef} style={{ position: "relative" }} className={className}>
      {children}
    </div>
  )
}
