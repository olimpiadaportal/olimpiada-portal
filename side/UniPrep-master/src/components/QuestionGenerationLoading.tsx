import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../constants/theme';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface QuestionGenerationLoadingProps {
  visible: boolean;
  subjectName?: string;
  questionCount?: number; // Number of questions being generated
  onComplete?: () => void; // Called after completion animation
  completed?: boolean; // Set to true when questions are ready
}

const LOADING_MESSAGE_KEYS = [
  { key: "competitive.loading.analyzing", icon: "analytics" as const, duration: 15 },
  { key: "competitive.loading.crafting", icon: "create" as const, duration: 30 },
  { key: "competitive.loading.explanations", icon: "document-text" as const, duration: 25 },
  { key: "competitive.loading.difficulty", icon: "trending-up" as const, duration: 20 },
  { key: "competitive.loading.finalizing", icon: "checkmark-circle" as const, duration: 10 },
];

// Animated Circle Component
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const QuestionGenerationLoading: React.FC<QuestionGenerationLoadingProps> = ({
  visible,
  subjectName = "your subject",
  questionCount = 15,
  onComplete,
  completed = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  // Circle dimensions
  const size = 140;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (visible) {
      // Reset
      setCurrentMessageIndex(0);
      setIsCompleting(false);
      rotationAnim.setValue(0);
      pulseAnim.setValue(1);
      glowAnim.setValue(0);

      // Continuous rotation animation
      const rotationLoop = Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
      rotationLoop.start();

      // Pulse animation for the inner icon
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
      pulseLoop.start();

      // Glow animation
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
      glowLoop.start();

      // Cycle through messages based on their durations
      let elapsed = 0;
      let messageIndex = 0;
      
      const messageInterval = setInterval(() => {
        elapsed += 1;
        
        // Calculate which message to show based on elapsed time
        let totalDuration = 0;
        for (let i = 0; i < LOADING_MESSAGE_KEYS.length; i++) {
          totalDuration += LOADING_MESSAGE_KEYS[i].duration;
          if (elapsed < totalDuration) {
            if (messageIndex !== i) {
              messageIndex = i;
              setCurrentMessageIndex(i);
            }
            break;
          }
        }
        
        // Stay on last message after all durations
        if (elapsed >= 100) {
          setCurrentMessageIndex(LOADING_MESSAGE_KEYS.length - 1);
        }
      }, 1000);

      return () => {
        rotationLoop.stop();
        pulseLoop.stop();
        glowLoop.stop();
        clearInterval(messageInterval);
      };
    }
  }, [visible]);

  // Handle completion
  useEffect(() => {
    if (completed && !isCompleting) {
      setIsCompleting(true);
      setCurrentMessageIndex(LOADING_MESSAGE_KEYS.length - 1); // Last message
      
      // Wait 1 second then call onComplete
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, 1000);
    }
  }, [completed, isCompleting]);

  if (!visible) return null;

  const currentMessage = LOADING_MESSAGE_KEYS[currentMessageIndex];
  
  const rotation = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Animated Loading Circle */}
          <View style={styles.circleContainer}>
            {/* Glow effect */}
            <Animated.View 
              style={[
                styles.glowEffect,
                { opacity: glowOpacity }
              ]} 
            />
            
            {/* Rotating circle */}
            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
              <Svg width={size} height={size}>
                <Defs>
                  <LinearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#F59E0B" />
                    <Stop offset="50%" stopColor="#FBBF24" />
                    <Stop offset="100%" stopColor="#F97316" />
                  </LinearGradient>
                </Defs>
                {/* Background circle */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={colors.border}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={0.3}
                />
                {/* Animated gradient arc */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="url(#gradient)"
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                />
              </Svg>
            </Animated.View>

            {/* Center icon with pulse */}
            <Animated.View 
              style={[
                styles.centerIcon,
                { opacity: pulseAnim }
              ]}
            >
              <Ionicons name="sparkles" size={40} color="#F59E0B" />
            </Animated.View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{t('competitive.loading.title')}</Text>
          <Text style={styles.subtitle}>
            {t('competitive.loading.subtitle', { subject: subjectName, count: questionCount })}
          </Text>

          {/* Current Message */}
          <View style={styles.messageContainer}>
            <View style={styles.messageIconContainer}>
              <Ionicons 
                name={currentMessage.icon} 
                size={24} 
                color="#F59E0B" 
              />
            </View>
            <Text style={styles.messageText}>{t(currentMessage.key)}</Text>
          </View>

          {/* Info */}
          <View style={styles.infoContainer}>
            <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
            <Text style={styles.infoText}>
              {t('competitive.loading.info')}
            </Text>
          </View>

          {/* Tip */}
          <View style={styles.tipContainer}>
            <Text style={styles.tipLabel}>💡 {t('common.optional')}</Text>
            <Text style={styles.tipText}>
              {t('competitive.loading.tip')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    container: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    circleContainer: {
      width: 160,
      height: 160,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    glowEffect: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: '#F59E0B',
      opacity: 0.3,
    },
    centerIcon: {
      position: 'absolute',
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: typography.fontSizes.xxl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    messageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.background,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    messageIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
    },
    messageText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      flex: 1,
    },
    infoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    infoText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      flex: 1,
    },
    tipContainer: {
      backgroundColor: colors.background,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    tipLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    tipText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });
