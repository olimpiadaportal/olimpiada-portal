/**
 * WalkthroughOverlay Component
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Main overlay that shows spotlight and tooltip during walkthrough
 */

import React, { useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Modal, 
  StatusBar, 
  View, 
  Text, 
  ActivityIndicator, 
  Dimensions,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from 'react-native';
import { useWalkthrough } from '../../contexts/WalkthroughContext';
import { walkthroughService } from '../../services/walkthroughService';
import { useLanguage } from '../../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WalkthroughOverlayProps {
  useModal?: boolean;
}

export const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({
  useModal = true,
}) => {
  const {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    targetMeasurements,
    isTransitioning,
    nextStep,
    previousStep,
    skipWalkthrough,
  } = useWalkthrough();
  const { t } = useLanguage();

  // Animated values for spotlight
  const spotlightTop = useRef(new Animated.Value(SCREEN_HEIGHT / 2)).current;
  const spotlightLeft = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  const spotlightWidth = useRef(new Animated.Value(100)).current;
  const spotlightHeight = useRef(new Animated.Value(100)).current;
  const spotlightOpacity = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;

  // Animate spotlight when target changes
  useEffect(() => {
    if (targetMeasurements && !isTransitioning) {
      // Larger padding for better visibility around highlighted elements
      const padding = 16;
      
      // Calculate exact positions - the measurements give us the element's position
      // We add padding around all sides for the spotlight border
      const spotlightY = targetMeasurements.pageY - padding;
      const spotlightX = targetMeasurements.pageX - padding;
      const spotlightW = targetMeasurements.width + (padding * 2);
      const spotlightH = targetMeasurements.height + (padding * 2);
      
      console.log(`🎯 Spotlight position: x=${spotlightX}, y=${spotlightY}, w=${spotlightW}, h=${spotlightH}`);
      
      Animated.parallel([
        Animated.spring(spotlightTop, {
          toValue: spotlightY,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightLeft, {
          toValue: spotlightX,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightWidth, {
          toValue: spotlightW,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightHeight, {
          toValue: spotlightH,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.timing(spotlightOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(tooltipOpacity, {
          toValue: 1,
          duration: 250,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isTransitioning) {
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }

    // Stop all animations on unmount to prevent stopTracking crash on Hermes
    return () => {
      try { spotlightTop.stopAnimation(); } catch (_) {}
      try { spotlightLeft.stopAnimation(); } catch (_) {}
      try { spotlightWidth.stopAnimation(); } catch (_) {}
      try { spotlightHeight.stopAnimation(); } catch (_) {}
      try { spotlightOpacity.stopAnimation(); } catch (_) {}
      try { tooltipOpacity.stopAnimation(); } catch (_) {}
    };
  }, [targetMeasurements, isTransitioning]);

  if (!isActive) return null;

  const isLoading = isTransitioning || !targetMeasurements;
  const isLastStep = walkthroughService.isLastStep(currentStepIndex);
  const isFirstStep = walkthroughService.isFirstStep(currentStepIndex);

  const title = currentStep ? (t(currentStep.titleKey) || currentStep.title) : '';
  const description = currentStep ? (t(currentStep.descriptionKey) || currentStep.description) : '';
  
  const tooltipPosition = targetMeasurements 
    ? (targetMeasurements.pageY > SCREEN_HEIGHT / 2 ? 'top' : 'bottom')
    : 'bottom';

  const content = (
    <View style={styles.container}>
      {/* Dark backdrop */}
      <View style={styles.backdrop} />

      {/* Animated Spotlight */}
      <Animated.View 
        style={[
          styles.spotlight,
          {
            top: spotlightTop,
            left: spotlightLeft,
            width: spotlightWidth,
            height: spotlightHeight,
            opacity: spotlightOpacity,
          }
        ]}
      />

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Preparing tour...</Text>
        </View>
      )}

      {/* Tooltip Card */}
      {currentStep && (
        <Animated.View 
          style={[
            styles.tooltipWrapper,
            tooltipPosition === 'top' ? styles.tooltipTop : styles.tooltipBottom,
            { opacity: tooltipOpacity }
          ]} 
          pointerEvents="box-none"
        >
          <SafeAreaView>
            <View style={styles.tooltipCard}>
              {/* Arrow */}
              {tooltipPosition === 'bottom' && <View style={styles.arrowUp} />}
              {tooltipPosition === 'top' && <View style={styles.arrowDown} />}
              
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  {currentStep.icon && (
                    <Ionicons
                      name={currentStep.icon as keyof typeof Ionicons.glyphMap}
                      size={24}
                      color="#3B82F6"
                    />
                  )}
                </View>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>
                    {currentStepIndex + 1} of {totalSteps}
                  </Text>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Description */}
              <Text style={styles.description}>{description}</Text>

              {/* Progress dots */}
              <View style={styles.progressDots}>
                {Array.from({ length: totalSteps }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      index === currentStepIndex && styles.dotActive,
                      index < currentStepIndex && styles.dotCompleted,
                    ]}
                  />
                ))}
              </View>

              {/* Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={skipWalkthrough}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipButtonText}>
                    {t('walkthrough.buttons.skip') || 'Skip'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.navButtons}>
                  {!isFirstStep && (
                    <TouchableOpacity
                      style={styles.backButton}
                      onPress={previousStep}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-back" size={20} color="#3B82F6" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.nextButton, isLastStep && styles.finishButton]}
                    onPress={nextStep}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextButtonText}>
                      {isLastStep 
                        ? (t('walkthrough.buttons.finish') || 'Finish')
                        : (t('walkthrough.buttons.next') || 'Next')}
                    </Text>
                    {!isLastStep && (
                      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      )}
    </View>
  );

  if (useModal) {
    return (
      <Modal
        visible={isActive}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={skipWalkthrough}
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        {content}
      </Modal>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  spotlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    // Enhanced glow effect
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 25,
    elevation: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  tooltipWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  tooltipTop: {
    top: 60,
  },
  tooltipBottom: {
    bottom: 0,
  },
  tooltipCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  arrowUp: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -12,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -12,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    marginBottom: 16,
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#3B82F6',
  },
  dotCompleted: {
    backgroundColor: '#3B82F6',
    opacity: 0.4,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    gap: 4,
  },
  finishButton: {
    backgroundColor: '#10B981',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default WalkthroughOverlay;
