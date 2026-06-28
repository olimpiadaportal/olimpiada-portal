import React, { useRef, useCallback, useEffect } from 'react';
import { 
  TouchableOpacity, 
  Animated, 
  TouchableOpacityProps,
  GestureResponderEvent 
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { animations, animationPresets } from '../../utils/animations';

interface ScaleButtonProps extends TouchableOpacityProps {
  children: React.ReactNode;
  scaleValue?: number;
  duration?: number;
  haptic?: boolean;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
}

export const ScaleButton: React.FC<ScaleButtonProps> = ({ 
  children, 
  scaleValue = animationPresets.buttonPress.scale,
  duration = animationPresets.buttonPress.duration,
  haptic = true,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...props 
}) => {
  // Use opacity instead of transform:[{scale}] to avoid Hermes __detach crash
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    Animated.timing(opacityAnim, {
      toValue: 0.7,
      duration: duration,
      useNativeDriver: false,
    }).start();
    onPressIn?.(event);
  }, [opacityAnim, duration, onPressIn]);

  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: duration,
      useNativeDriver: false,
    }).start();
    onPressOut?.(event);
  }, [opacityAnim, duration, onPressOut]);

  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (haptic) {
      Haptics.impactAsync(hapticStyle).catch(() => {});
    }
    onPress?.(event);
  }, [haptic, hapticStyle, onPress]);

  return (
    <TouchableOpacity
      {...props}
      style={style}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
      accessibilityRole={props.accessibilityRole || "button"}
    >
      <Animated.View style={{ opacity: opacityAnim, width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};
