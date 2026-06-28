/**
 * Walkthrough Types
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Type definitions for the interactive app walkthrough system
 */

import { RefObject } from 'react';

/**
 * Position measurements for a target element
 */
export interface TargetMeasurements {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
}

/**
 * Placement options for the tooltip relative to the target
 */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

/**
 * Individual walkthrough step configuration
 */
export interface WalkthroughStep {
  /** Unique identifier for the step */
  id: string;
  
  /** ID used to find the target element (nativeID or testID) */
  targetId: string;
  
  /** Title displayed in the tooltip (fallback if translation not found) */
  title: string;
  
  /** i18n key for the title */
  titleKey: string;
  
  /** Description displayed in the tooltip (fallback if translation not found) */
  description: string;
  
  /** i18n key for the description */
  descriptionKey: string;
  
  /** Preferred placement of the tooltip relative to target */
  placement: TooltipPlacement;
  
  /** Which screen this step belongs to (for navigation if needed) */
  screen?: string;
  
  /** Optional icon name to display in tooltip */
  icon?: string;
  
  /** Optional delay before showing this step (ms) */
  delay?: number;
}

/**
 * Current state of the walkthrough
 */
export interface WalkthroughState {
  /** Whether the walkthrough is currently active */
  isActive: boolean;
  
  /** Current step index (0-based) */
  currentStepIndex: number;
  
  /** All walkthrough steps */
  steps: WalkthroughStep[];
  
  /** Measurements of the current target element */
  targetMeasurements: TargetMeasurements | null;
  
  /** Whether the walkthrough is transitioning between steps */
  isTransitioning: boolean;
  
  /** Whether the walkthrough has been completed before */
  hasBeenCompleted: boolean;
}

/**
 * Registered target element with its ref
 */
export interface RegisteredTarget {
  id: string;
  ref: RefObject<any>;
  measure: () => Promise<TargetMeasurements | null>;
}

/**
 * Animation configuration for walkthrough transitions
 */
export interface WalkthroughAnimationConfig {
  /** Duration of spotlight transition (ms) */
  spotlightDuration: number;
  
  /** Duration of tooltip fade in/out (ms) */
  tooltipDuration: number;
  
  /** Easing function name */
  easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
  
  /** Delay between spotlight and tooltip animations (ms) */
  staggerDelay: number;
}

/**
 * Default animation configuration
 */
export const DEFAULT_ANIMATION_CONFIG: WalkthroughAnimationConfig = {
  spotlightDuration: 300,
  tooltipDuration: 250,
  easing: 'ease-out',
  staggerDelay: 100,
};

/**
 * Walkthrough storage keys
 */
export const WALKTHROUGH_STORAGE_KEYS = {
  COMPLETED: 'walkthrough_completed',
  VERSION: 'walkthrough_version',
  SKIPPED: 'walkthrough_skipped',
  LAST_STEP: 'walkthrough_last_step',
} as const;

/**
 * Current walkthrough version - bump this to show walkthrough again after major updates
 */
export const WALKTHROUGH_VERSION = '1.0.0';

/**
 * Target IDs for walkthrough elements
 * Use these as nativeID props on components to make them walkthrough targets
 */
export const WALKTHROUGH_TARGET_IDS = {
  // Student Home Screen
  GREETING: 'walkthrough-greeting',
  STREAK_INDICATOR: 'walkthrough-streak',
  QUICK_ACTIONS: 'walkthrough-quick-actions',
  PRACTICE_BUTTON: 'walkthrough-practice-button',
  EXAM_BUTTON: 'walkthrough-exam-button',
  TEACHERS_BUTTON: 'walkthrough-teachers-button',
  PROGRESS_BUTTON: 'walkthrough-progress-button',
  RECOMMENDATIONS: 'walkthrough-recommendations',
  ACTIVITY_FEED: 'walkthrough-activity',
  DEADLINES: 'walkthrough-deadlines',
  
  // Student Bottom Navigation
  HOME_TAB: 'walkthrough-home-tab',
  PRACTICE_TAB: 'walkthrough-practice-tab',
  EXAMS_TAB: 'walkthrough-exams-tab',
  TEACHERS_TAB: 'walkthrough-teachers-tab',
  PROFILE_TAB: 'walkthrough-profile-tab',
  
  // Teacher Dashboard
  TEACHER_STATS: 'walkthrough-teacher-stats',
  TEACHER_BOOKINGS: 'walkthrough-teacher-bookings',
  TEACHER_EARNINGS: 'walkthrough-teacher-earnings',
  TEACHER_PROFILE: 'walkthrough-teacher-profile',
} as const;

export type WalkthroughTargetId = typeof WALKTHROUGH_TARGET_IDS[keyof typeof WALKTHROUGH_TARGET_IDS];
