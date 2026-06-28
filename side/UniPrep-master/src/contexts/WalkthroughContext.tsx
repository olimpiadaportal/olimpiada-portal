/**
 * Walkthrough Context
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Provides global state management for the interactive walkthrough system
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { findNodeHandle, UIManager, Platform, Vibration } from 'react-native';

// Haptic feedback helper - uses Vibration as fallback if expo-haptics not available
const HapticFeedback = {
  light: () => {
    try {
      // Try expo-haptics if available
      const Haptics = require('expo-haptics');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Fallback to Vibration
      Vibration.vibrate(10);
    }
  },
  success: () => {
    try {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Vibration.vibrate([0, 50, 50, 50]);
    }
  },
  warning: () => {
    try {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      Vibration.vibrate([0, 100]);
    }
  },
};
import {
  WalkthroughStep,
  WalkthroughState,
  TargetMeasurements,
  RegisteredTarget,
  DEFAULT_ANIMATION_CONFIG,
  WalkthroughAnimationConfig,
} from '../types/walkthrough';
import { walkthroughService, UserType } from '../services/walkthroughService';
import { useAuthStore } from '../store/authStore';
import { systemSettingsService } from '../services/systemSettingsService';

/**
 * Context value interface
 */
interface WalkthroughContextType {
  // State
  isActive: boolean;
  isWalkthroughEnabled: boolean;
  currentStep: WalkthroughStep | null;
  currentStepIndex: number;
  totalSteps: number;
  targetMeasurements: TargetMeasurements | null;
  isTransitioning: boolean;
  animationConfig: WalkthroughAnimationConfig;
  
  // Actions
  startWalkthrough: () => Promise<void>;
  nextStep: () => void;
  previousStep: () => void;
  skipWalkthrough: () => void;
  goToStep: (index: number) => void;
  endWalkthrough: (completed?: boolean) => void;
  
  // Target registration
  registerTarget: (id: string, ref: React.RefObject<any>) => void;
  unregisterTarget: (id: string) => void;
  measureTarget: (id: string) => Promise<TargetMeasurements | null>;
  
  // Utilities
  resetWalkthrough: () => Promise<void>;
  isStepActive: (stepId: string) => boolean;
  checkWalkthroughEnabled: () => Promise<boolean>;
}

// Create context with undefined default
const WalkthroughContext = createContext<WalkthroughContextType | undefined>(undefined);

/**
 * Props for the WalkthroughProvider
 */
interface WalkthroughProviderProps {
  children: ReactNode;
  /** Custom animation configuration */
  animationConfig?: Partial<WalkthroughAnimationConfig>;
  /** Callback when walkthrough completes */
  onComplete?: () => void;
  /** Callback when walkthrough is skipped */
  onSkip?: (stepIndex: number) => void;
}

/**
 * WalkthroughProvider Component
 * Wraps the app to provide walkthrough functionality
 */
export const WalkthroughProvider: React.FC<WalkthroughProviderProps> = ({
  children,
  animationConfig: customAnimationConfig,
  onComplete,
  onSkip,
}) => {
  // Get user type from auth store
  const { user } = useAuthStore();
  const userType: UserType = user?.user_type === 'teacher' ? 'teacher' : 'student';
  
  // State
  const [isActive, setIsActive] = useState(false);
  const [isWalkthroughEnabled, setIsWalkthroughEnabled] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetMeasurements, setTargetMeasurements] = useState<TargetMeasurements | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Check if walkthrough is enabled on mount
  useEffect(() => {
    const checkEnabled = async () => {
      const enabled = await systemSettingsService.isWalkthroughEnabled();
      setIsWalkthroughEnabled(enabled);
      console.log(`🎯 Walkthrough enabled: ${enabled}`);
    };
    checkEnabled();
  }, []);
  
  // Refs for registered targets
  const registeredTargets = useRef<Map<string, React.RefObject<any>>>(new Map());
  
  // Get steps from service based on user type
  const steps = walkthroughService.getWalkthroughSteps(userType);
  const totalSteps = steps.length;
  
  // Merge animation config with defaults
  const animationConfig: WalkthroughAnimationConfig = {
    ...DEFAULT_ANIMATION_CONFIG,
    ...customAnimationConfig,
  };
  
  // Current step
  const currentStep = isActive && currentStepIndex < steps.length 
    ? steps[currentStepIndex] 
    : null;

  /**
   * Measure a target element's position and dimensions
   */
  const measureTarget = useCallback(async (targetId: string): Promise<TargetMeasurements | null> => {
    const ref = registeredTargets.current.get(targetId);
    
    if (!ref) {
      console.warn(`⚠️ Walkthrough target not registered: ${targetId}`);
      console.log(`📋 Registered targets: ${Array.from(registeredTargets.current.keys()).join(', ')}`);
      return null;
    }
    
    if (!ref.current) {
      console.warn(`⚠️ Walkthrough target ref is null: ${targetId}`);
      return null;
    }

    return new Promise((resolve) => {
      try {
        const handle = findNodeHandle(ref.current);
        
        if (!handle) {
          console.warn(`⚠️ Could not get handle for target: ${targetId}`);
          resolve(null);
          return;
        }

        // Use measureInWindow for accurate screen coordinates
        if (ref.current.measureInWindow) {
          ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
            if (width === 0 && height === 0) {
              console.warn(`⚠️ Target has zero dimensions: ${targetId}`);
              resolve(null);
              return;
            }
            
            console.log(`📐 Measured ${targetId}: x=${x}, y=${y}, w=${width}, h=${height}`);
            
            resolve({
              x,
              y,
              width,
              height,
              pageX: x,
              pageY: y,
            });
          });
        } else if (ref.current.measure) {
          // Fallback to measure
          ref.current.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
            if (width === 0 && height === 0) {
              console.warn(`⚠️ Target has zero dimensions: ${targetId}`);
              resolve(null);
              return;
            }
            
            resolve({
              x,
              y,
              width,
              height,
              pageX,
              pageY,
            });
          });
        } else {
          // Use UIManager as last resort
          UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
            if (width === 0 && height === 0) {
              resolve(null);
              return;
            }
            
            resolve({
              x,
              y,
              width,
              height,
              pageX,
              pageY,
            });
          });
        }
      } catch (error) {
        console.error(`Error measuring target ${targetId}:`, error);
        resolve(null);
      }
    });
  }, []);

  /**
   * Update measurements for current step
   */
  const updateCurrentMeasurements = useCallback(async () => {
    if (!currentStep) {
      setTargetMeasurements(null);
      return;
    }

    const measurements = await measureTarget(currentStep.targetId);
    setTargetMeasurements(measurements);
  }, [currentStep, measureTarget]);

  /**
   * Register a target element
   */
  const registerTarget = useCallback((id: string, ref: React.RefObject<any>) => {
    console.log(`📍 Registering walkthrough target: ${id}`);
    registeredTargets.current.set(id, ref);
    
    // If this is the current step's target, update measurements
    if (currentStep?.targetId === id && isActive) {
      console.log(`🎯 Current step target registered, updating measurements`);
      // Small delay to ensure the element is rendered
      setTimeout(() => {
        updateCurrentMeasurements();
      }, 100);
    }
  }, [currentStep, isActive, updateCurrentMeasurements]);

  /**
   * Unregister a target element
   */
  const unregisterTarget = useCallback((id: string) => {
    registeredTargets.current.delete(id);
  }, []);

  /**
   * Start the walkthrough
   */
  const startWalkthrough = useCallback(async () => {
    // Check if walkthrough is enabled in system settings
    const enabled = await systemSettingsService.isWalkthroughEnabled();
    if (!enabled) {
      console.log('🚫 Walkthrough is disabled in system settings');
      setIsWalkthroughEnabled(false);
      return;
    }
    
    // Check if already completed
    const completed = await walkthroughService.isWalkthroughCompleted();
    if (completed) {
      console.log('📱 Walkthrough already completed');
      return;
    }

    console.log('🚀 Starting walkthrough');
    setCurrentStepIndex(0);
    setIsActive(true);
    setIsTransitioning(true);

    // Haptic feedback
    HapticFeedback.light();

    // Wait for targets to be registered, then measure with retries
    const attemptMeasure = async (retries: number = 0): Promise<void> => {
      const maxRetries = 5;
      const retryDelay = 300;
      
      const firstStep = steps[0];
      if (!firstStep) {
        console.warn('⚠️ No walkthrough steps defined');
        setIsTransitioning(false);
        return;
      }

      const measurements = await measureTarget(firstStep.targetId);
      
      if (measurements) {
        console.log('✅ Walkthrough target found:', firstStep.targetId);
        setTargetMeasurements(measurements);
        setIsTransitioning(false);
      } else if (retries < maxRetries) {
        console.log(`⏳ Waiting for target registration (attempt ${retries + 1}/${maxRetries})...`);
        setTimeout(() => attemptMeasure(retries + 1), retryDelay);
      } else {
        console.warn('⚠️ Could not find walkthrough target after retries, ending walkthrough');
        // End walkthrough gracefully if targets never become available
        setIsActive(false);
        setIsTransitioning(false);
        setTargetMeasurements(null);
      }
    };

    // Initial delay to let the screen render, then attempt measurement
    setTimeout(() => attemptMeasure(0), steps[0]?.delay || 500);
  }, [steps, measureTarget]);

  /**
   * Go to next step
   */
  const nextStep = useCallback(() => {
    if (!isActive || isTransitioning) return;

    // Haptic feedback
    HapticFeedback.light();

    if (currentStepIndex >= totalSteps - 1) {
      // Last step - complete walkthrough
      endWalkthrough(true);
      return;
    }

    setIsTransitioning(true);
    const nextIndex = currentStepIndex + 1;
    
    // Save progress
    walkthroughService.saveCurrentStep(nextIndex);

    // Transition to next step
    const nextStepData = steps[nextIndex];
    
    // Clear current measurements to trigger animation
    setTargetMeasurements(null);
    
    setTimeout(() => {
      setCurrentStepIndex(nextIndex);
      
      // Measure new target with retry logic
      const attemptMeasure = async (retries: number = 0) => {
        if (nextStepData) {
          const measurements = await measureTarget(nextStepData.targetId);
          if (measurements) {
            console.log(`✅ Step ${nextIndex + 1} target measured:`, nextStepData.targetId);
            setTargetMeasurements(measurements);
            setIsTransitioning(false);
          } else if (retries < 3) {
            console.log(`⏳ Retrying measurement for ${nextStepData.targetId} (${retries + 1}/3)`);
            setTimeout(() => attemptMeasure(retries + 1), 200);
          } else {
            console.warn(`⚠️ Could not measure target: ${nextStepData.targetId}, skipping to next`);
            setIsTransitioning(false);
            // Skip this step if target not found
            if (nextIndex < totalSteps - 1) {
              setTimeout(() => nextStep(), 100);
            }
          }
        } else {
          setIsTransitioning(false);
        }
      };
      
      setTimeout(() => attemptMeasure(0), nextStepData?.delay || 100);
    }, animationConfig.spotlightDuration);
  }, [isActive, isTransitioning, currentStepIndex, totalSteps, steps, measureTarget, animationConfig]);

  /**
   * Go to previous step
   */
  const previousStep = useCallback(() => {
    if (!isActive || isTransitioning || currentStepIndex <= 0) return;

    // Haptic feedback
    HapticFeedback.light();

    setIsTransitioning(true);
    const prevIndex = currentStepIndex - 1;
    
    // Clear current measurements to trigger animation
    setTargetMeasurements(null);

    setTimeout(() => {
      setCurrentStepIndex(prevIndex);
      
      setTimeout(async () => {
        const prevStepData = steps[prevIndex];
        if (prevStepData) {
          const measurements = await measureTarget(prevStepData.targetId);
          if (measurements) {
            console.log(`✅ Previous step ${prevIndex + 1} target measured:`, prevStepData.targetId);
            setTargetMeasurements(measurements);
          }
        }
        setIsTransitioning(false);
      }, 100);
    }, animationConfig.spotlightDuration);
  }, [isActive, isTransitioning, currentStepIndex, steps, measureTarget, animationConfig]);

  /**
   * Go to a specific step
   */
  const goToStep = useCallback((index: number) => {
    if (!isActive || isTransitioning || index < 0 || index >= totalSteps) return;

    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentStepIndex(index);
      
      setTimeout(async () => {
        const stepData = steps[index];
        if (stepData) {
          const measurements = await measureTarget(stepData.targetId);
          setTargetMeasurements(measurements);
        }
        setIsTransitioning(false);
      }, 100);
    }, animationConfig.spotlightDuration);
  }, [isActive, isTransitioning, totalSteps, steps, measureTarget, animationConfig]);

  /**
   * Skip the walkthrough
   */
  const skipWalkthrough = useCallback(() => {
    // Haptic feedback
    HapticFeedback.warning();

    walkthroughService.markWalkthroughSkipped(currentStepIndex);
    
    setIsActive(false);
    setTargetMeasurements(null);
    setCurrentStepIndex(0);
    
    onSkip?.(currentStepIndex);
    console.log('⏭️ Walkthrough skipped at step', currentStepIndex);
  }, [currentStepIndex, onSkip]);

  /**
   * End the walkthrough
   */
  const endWalkthrough = useCallback((completed: boolean = false) => {
    // Haptic feedback
    HapticFeedback.success();

    if (completed) {
      walkthroughService.markWalkthroughCompleted();
      onComplete?.();
      console.log('✅ Walkthrough completed');
    }

    setIsActive(false);
    setTargetMeasurements(null);
    setCurrentStepIndex(0);
  }, [onComplete]);

  /**
   * Reset walkthrough (for testing)
   */
  const resetWalkthrough = useCallback(async () => {
    await walkthroughService.resetWalkthrough();
    setIsActive(false);
    setTargetMeasurements(null);
    setCurrentStepIndex(0);
  }, []);

  /**
   * Check if a specific step is currently active
   */
  const isStepActive = useCallback((stepId: string): boolean => {
    return isActive && currentStep?.id === stepId;
  }, [isActive, currentStep]);

  /**
   * Check if walkthrough is enabled (refresh from server)
   */
  const checkWalkthroughEnabled = useCallback(async (): Promise<boolean> => {
    const enabled = await systemSettingsService.isWalkthroughEnabled();
    setIsWalkthroughEnabled(enabled);
    return enabled;
  }, []);

  // Update measurements when step changes
  useEffect(() => {
    if (isActive && currentStep && !isTransitioning) {
      updateCurrentMeasurements();
    }
  }, [isActive, currentStep, isTransitioning, updateCurrentMeasurements]);

  // Context value
  const contextValue: WalkthroughContextType = {
    // State
    isActive,
    isWalkthroughEnabled,
    currentStep,
    currentStepIndex,
    totalSteps,
    targetMeasurements,
    isTransitioning,
    animationConfig,
    
    // Actions
    startWalkthrough,
    nextStep,
    previousStep,
    skipWalkthrough,
    goToStep,
    endWalkthrough,
    
    // Target registration
    registerTarget,
    unregisterTarget,
    measureTarget,
    
    // Utilities
    resetWalkthrough,
    isStepActive,
    checkWalkthroughEnabled,
  };

  return (
    <WalkthroughContext.Provider value={contextValue}>
      {children}
    </WalkthroughContext.Provider>
  );
};

/**
 * Hook to use the walkthrough context
 */
export const useWalkthrough = (): WalkthroughContextType => {
  const context = useContext(WalkthroughContext);
  
  if (context === undefined) {
    throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  }
  
  return context;
};

/**
 * Hook to register a walkthrough target
 * Use this in components that should be highlighted during walkthrough
 */
export const useWalkthroughTarget = (targetId: string) => {
  const { registerTarget, unregisterTarget, isStepActive } = useWalkthrough();
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      registerTarget(targetId, ref);
    }

    return () => {
      unregisterTarget(targetId);
    };
  }, [targetId, registerTarget, unregisterTarget]);

  return {
    ref,
    isHighlighted: isStepActive(targetId),
  };
};

export default WalkthroughContext;
