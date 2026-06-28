'use client';

// Elmly Design System — PageTransition (Web)
// Wraps page content with motion.div for smooth enter/exit transitions
// Use inside page components to animate content on mount

import React from 'react';
import { motion } from 'motion/react';
import { easings } from '@/lib/animations/variants';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: easings.smooth }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
