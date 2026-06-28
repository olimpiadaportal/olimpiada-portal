/**
 * WalkthroughTooltip Component
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Displays a tooltip bubble with title, description, step counter,
 * and navigation buttons during the walkthrough
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  WalkthroughStep,
  TargetMeasurements,
  TooltipPlacement,
  WalkthroughAnimationConfig,
} from '../../types/walkthrough';
import { colors } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TOOLTIP_WIDTH = Math.min(SCREEN_WIDTH - 40, 320);
const TOOLTIP_MARGIN = 16;
const ARROW_SIZE = 12;

interface WalkthroughTooltipProps {
  /** Current step data */
  step: WalkthroughStep;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Target element measurements */
  targetMeasurements: TargetMeasurements | null;
  /** Animation configuration */
  animationConfig: WalkthroughAnimationConfig;
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Called when "Got it" / "Next" is pressed */
  onNext: () => void;
  /** Called when "Skip" is pressed */
  onSkip: () => void;
  /** Called when "Back" is pressed */
  onPrevious?: () => void;
  /** Whether this is the last step */
  isLastStep: boolean;
  /** Whether this is the first step */
  isFirstStep: boolean;
}

export const WalkthroughTooltip: React.FC<WalkthroughTooltipProps> = ({
  step,
  stepIndex,
  totalSteps,
  targetMeasurements,
  animationConfig,
  visible,
  onNext,
  onSkip,
  onPrevious,
  isLastStep,
  isFirstStep,
}) => {
  const { t } = useLanguage();
  
  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  // Calculate tooltip position
  const tooltipPosition = useMemo(() => {
    if (!targetMeasurements) {
      return {
        top: SCREEN_HEIGHT / 2 - 100,
        left: (SCREEN_WIDTH - TOOLTIP_WIDTH) / 2,
        placement: 'bottom' as TooltipPlacement,
        arrowLeft: TOOLTIP_WIDTH / 2 - ARROW_SIZE,
      };
    }

    const targetCenterX = targetMeasurements.pageX + targetMeasurements.width / 2;
    
    // Determine best placement
    let placement = step.placement;
    
    if (placement === 'auto') {
      // Auto-determine placement based on available space
      const spaceAbove = targetMeasurements.pageY;
      const spaceBelow = SCREEN_HEIGHT - (targetMeasurements.pageY + targetMeasurements.height);
      
      placement = spaceBelow > spaceAbove ? 'bottom' : 'top';
    }

    // Calculate tooltip position
    let top = 0;
    let left = targetCenterX - TOOLTIP_WIDTH / 2;
    
    // Ensure tooltip stays within screen bounds horizontally
    left = Math.max(TOOLTIP_MARGIN, Math.min(left, SCREEN_WIDTH - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
    
    // Calculate arrow position relative to tooltip
    const arrowLeft = Math.max(
      20,
      Math.min(targetCenterX - left - ARROW_SIZE, TOOLTIP_WIDTH - 40)
    );

    if (placement === 'top') {
      top = targetMeasurements.pageY - 150 - ARROW_SIZE - TOOLTIP_MARGIN;
    } else {
      top = targetMeasurements.pageY + targetMeasurements.height + ARROW_SIZE + TOOLTIP_MARGIN;
    }

    // Ensure tooltip stays within screen bounds vertically
    top = Math.max(TOOLTIP_MARGIN + 50, Math.min(top, SCREEN_HEIGHT - 200));

    return { top, left, placement, arrowLeft };
  }, [targetMeasurements, step.placement]);

  // Animate tooltip visibility
  useEffect(() => {
    if (visible) {
      // Delay then animate in
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: animationConfig.tooltipDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            damping: 15,
            stiffness: 150,
            useNativeDriver: false,
          }),
          Animated.spring(scale, {
            toValue: 1,
            damping: 12,
            stiffness: 120,
            useNativeDriver: false,
          }),
        ]).start();
      }, animationConfig.staggerDelay);
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: animationConfig.tooltipDuration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(translateY, {
          toValue: 20,
          duration: animationConfig.tooltipDuration,
          useNativeDriver: false,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: animationConfig.tooltipDuration,
          useNativeDriver: false,
        }),
      ]).start();
    }

    // Stop all animations on unmount to prevent stopTracking crash on Hermes
    return () => {
      try { opacity.stopAnimation(); } catch (_) {}
      try { translateY.stopAnimation(); } catch (_) {}
      try { scale.stopAnimation(); } catch (_) {}
    };
  }, [visible, animationConfig]);

  // Get translated text with fallback
  const title = t(step.titleKey) !== step.titleKey ? t(step.titleKey) : step.title;
  const description = t(step.descriptionKey) !== step.descriptionKey ? t(step.descriptionKey) : step.description;
  const stepCounterText = t('walkthrough.stepCounter', { current: stepIndex + 1, total: totalSteps });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: TOOLTIP_WIDTH,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {/* Arrow pointing to target */}
      {tooltipPosition.placement === 'bottom' && (
        <View style={[styles.arrowUp, { left: tooltipPosition.arrowLeft }]} />
      )}

      {/* Tooltip content */}
      <View style={styles.content}>
        {/* Header with icon and step counter */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            {step.icon && (
              <Ionicons
                name={step.icon as keyof typeof Ionicons.glyphMap}
                size={24}
                color={colors.primary}
              />
            )}
          </View>
          <View style={styles.stepCounter}>
            <Text style={styles.stepCounterText}>{stepCounterText}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Description */}
        <Text style={styles.description}>{description}</Text>

        {/* Progress dots */}
        <View style={styles.progressContainer}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === stepIndex && styles.progressDotActive,
                index < stepIndex && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          {/* Skip button */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>
              {t('walkthrough.buttons.skip')}
            </Text>
          </TouchableOpacity>

          {/* Navigation buttons */}
          <View style={styles.navButtons}>
            {/* Back button (if not first step) */}
            {!isFirstStep && onPrevious && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onPrevious}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}

            {/* Next/Finish button */}
            <TouchableOpacity
              style={[styles.nextButton, isLastStep && styles.finishButton]}
              onPress={onNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>
                {isLastStep
                  ? t('walkthrough.buttons.finish')
                  : t('walkthrough.buttons.gotIt')}
              </Text>
              {!isLastStep && (
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Arrow pointing to target (bottom placement) */}
      {tooltipPosition.placement === 'top' && (
        <View style={[styles.arrowDown, { left: tooltipPosition.arrowLeft }]} />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCounter: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.gray[600],
    marginBottom: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray[200],
  },
  progressDotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  progressDotCompleted: {
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[500],
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 4,
  },
  finishButton: {
    backgroundColor: colors.success || '#10B981',
    paddingHorizontal: 24,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  arrowUp: {
    position: 'absolute',
    top: -ARROW_SIZE + 1,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW_SIZE + 1,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
});

export default WalkthroughTooltip;
