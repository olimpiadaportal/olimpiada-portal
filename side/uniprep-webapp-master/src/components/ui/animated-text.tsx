"use client";

import { motion } from "motion/react";
import { useState, useEffect } from "react";

interface AnimatedTextProps {
  text: string;
  className?: string;
  animationType?: "letters" | "words";
  duration?: number;
  delay?: number;
  staggerDelay?: number;
  initialY?: number;
  initialOpacity?: number;
  animateY?: number;
  animateOpacity?: number;
}

// Check for reduced motion preference
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);
  
  return prefersReducedMotion;
};

export default function AnimatedText({
  text,
  className = "text-4xl font-bold",
  animationType = "letters",
  duration = 0.4,
  delay = 0,
  staggerDelay = 0.03,
  initialY = 8,
  initialOpacity = 0,
  animateY = 0,
  animateOpacity = 1
}: AnimatedTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Return static text if user prefers reduced motion
  if (prefersReducedMotion) {
    return <div className={className}>{text}</div>;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: delay
      }
    }
  };

  const itemVariants = {
    hidden: {
      y: initialY,
      opacity: initialOpacity
    },
    visible: {
      y: animateY,
      opacity: animateOpacity,
      transition: {
        duration: duration,
        ease: [0.22, 1, 0.36, 1] as const
      }
    }
  };

  const renderLetters = () => {
    return text.split("").map((char, index) => (
      <motion.span
        key={`letter-${index}`}
        variants={itemVariants}
        className="inline-block"
        style={{ whiteSpace: char === " " ? "pre" : "normal", willChange: "transform, opacity" }}>
        {char}
      </motion.span>
    ));
  };

  const renderWords = () => {
    return text.split(" ").map((word, index) => (
      <motion.span 
        key={`word-${index}`} 
        variants={itemVariants} 
        className="mr-2 inline-block"
        style={{ willChange: "transform, opacity" }}>
        {word}
      </motion.span>
    ));
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}>
      {animationType === "letters" ? renderLetters() : renderWords()}
    </motion.div>
  );
}
