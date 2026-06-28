// Shared animation variants for consistent animations across the app

import type { Variants } from "motion/react"

// Easing curves
export const easings = {
  smooth: [0.22, 1, 0.36, 1] as const,
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
  elastic: [0.175, 0.885, 0.32, 1.275] as const,
  snappy: [0.25, 0.1, 0.25, 1] as const,
}

// Fade animations
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.5, ease: easings.smooth }
  }
}

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

// Scale animations
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.5, ease: easings.smooth }
  }
}

export const scaleInBounce: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.6, ease: easings.bounce }
  }
}

// Stagger container
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
}

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05
    }
  }
}

// Stagger items
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: easings.smooth }
  }
}

// Card hover effects
export const cardHover = {
  rest: { 
    scale: 1, 
    y: 0,
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"
  },
  hover: { 
    scale: 1.02, 
    y: -8,
    boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    transition: { duration: 0.3, ease: easings.smooth }
  },
  tap: { 
    scale: 0.98,
    transition: { duration: 0.1 }
  }
}

// Button animations
export const buttonHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: { duration: 0.2, ease: easings.smooth }
  },
  tap: { 
    scale: 0.95,
    transition: { duration: 0.1 }
  }
}

export const buttonPulse = {
  rest: { scale: 1 },
  pulse: {
    scale: [1, 1.05, 1],
    transition: { 
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

// Text reveal (word by word)
export const textRevealContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
}

export const textRevealWord: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    rotateX: -90
  },
  visible: { 
    opacity: 1, 
    y: 0,
    rotateX: 0,
    transition: { 
      duration: 0.5, 
      ease: easings.smooth 
    }
  }
}

// Floating animation
export const floating = {
  initial: { y: 0 },
  animate: {
    y: [-10, 10, -10],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

// Glow pulse
export const glowPulse = {
  initial: { 
    boxShadow: "0 0 0 0 rgba(59, 130, 246, 0)" 
  },
  animate: {
    boxShadow: [
      "0 0 0 0 rgba(59, 130, 246, 0.4)",
      "0 0 0 20px rgba(59, 130, 246, 0)",
      "0 0 0 0 rgba(59, 130, 246, 0)"
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

// Page transitions
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: easings.smooth }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: { duration: 0.3, ease: easings.smooth }
  }
}

// Slide in from edges
export const slideInFromBottom: Variants = {
  hidden: { opacity: 0, y: 100 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

export const slideInFromTop: Variants = {
  hidden: { opacity: 0, y: -100 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

// Blur in
export const blurIn: Variants = {
  hidden: { 
    opacity: 0, 
    filter: "blur(10px)" 
  },
  visible: { 
    opacity: 1, 
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

// Icon animations
export const iconBounce = {
  rest: { y: 0, rotate: 0 },
  hover: { 
    y: -5,
    rotate: [0, -10, 10, 0],
    transition: { duration: 0.4, ease: easings.bounce }
  }
}

export const iconSpin = {
  rest: { rotate: 0 },
  hover: { 
    rotate: 360,
    transition: { duration: 0.6, ease: easings.smooth }
  }
}

// List item animations
export const listItem: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.3, ease: easings.smooth }
  },
  exit: { 
    opacity: 0, 
    x: 20,
    transition: { duration: 0.2 }
  }
}

// Modal animations
export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.2 }
  }
}

export const modalContent: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
    y: 20
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: { 
      duration: 0.3, 
      ease: easings.smooth 
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 }
  }
}

// Drawer animations
export const drawerSlideRight: Variants = {
  hidden: { x: "100%" },
  visible: { 
    x: 0,
    transition: { 
      type: "spring",
      damping: 30,
      stiffness: 300
    }
  },
  exit: { 
    x: "100%",
    transition: { duration: 0.2 }
  }
}

export const drawerSlideLeft: Variants = {
  hidden: { x: "-100%" },
  visible: { 
    x: 0,
    transition: { 
      type: "spring",
      damping: 30,
      stiffness: 300
    }
  },
  exit: { 
    x: "-100%",
    transition: { duration: 0.2 }
  }
}

// ─── Elmly Education-Specific Variants (Phase B) ───

// Progress bar fill animation
export const progressFill = {
  initial: { width: "0%" },
  animate: (percent: number) => ({
    width: `${percent}%`,
    transition: { duration: 0.8, ease: easings.smooth }
  })
}

// Number count-up (use with motion value or useMotionValue)
export const numberReveal: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: easings.bounce }
  }
}

// Skeleton shimmer pulse
export const skeletonPulse = {
  initial: { opacity: 0.4 },
  animate: {
    opacity: [0.4, 0.7, 0.4],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}

// Tab content cross-fade
export const tabContentSwitch: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easings.smooth }
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 }
  }
}

// Dashboard card stagger (slower, more dramatic for landing)
export const dashboardContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15
    }
  }
}

export const dashboardCard: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: easings.smooth }
  }
}

// Celebration / achievement unlock
export const celebrationBadge: Variants = {
  hidden: { opacity: 0, scale: 0, rotate: -180 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.6,
      ease: easings.bounce,
      scale: { type: "spring", damping: 8, stiffness: 100 }
    }
  }
}

// Streak fire animation
export const streakFire = {
  initial: { scale: 1, y: 0 },
  animate: {
    scale: [1, 1.15, 1],
    y: [0, -4, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      repeatDelay: 2,
      ease: "easeInOut"
    }
  }
}

// Correct/incorrect answer feedback
export const correctAnswer: Variants = {
  hidden: { opacity: 0, scale: 0.8, backgroundColor: "transparent" },
  visible: {
    opacity: 1,
    scale: 1,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    transition: { duration: 0.3, ease: easings.smooth }
  }
}

export const incorrectAnswer: Variants = {
  hidden: { opacity: 1, x: 0 },
  visible: {
    opacity: 1,
    x: [0, -8, 8, -4, 4, 0],
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    transition: { duration: 0.4 }
  }
}
