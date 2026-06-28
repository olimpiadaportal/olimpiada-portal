import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

const getIconConfig = (type: AlertType) => {
  switch (type) {
    case 'success':
      return { name: 'checkmark-circle', color: '#00B67A' };
    case 'error':
      return { name: 'close-circle', color: '#FF4444' };
    case 'warning':
      return { name: 'warning', color: '#FFB800' };
    case 'info':
    default:
      return { name: 'information-circle', color: '#4A90D9' };
  }
};

export const AlertModal: React.FC<AlertModalProps> = ({
  visible,
  onClose,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK', onPress: onClose }],
}) => {
  const { colors, isDark } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      Animated.spring(fadeAnim, {
        toValue: 1,
        useNativeDriver: false,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }).start();
    }
  }, [visible]);

  const iconConfig = getIconConfig(type);
  const styles = createStyles(colors, isDark);

  const handleButtonPress = (button: AlertButton) => {
    // Close modal first for immediate visual feedback
    onClose();
    
    // Execute callback after a small delay to ensure modal is closed
    // This prevents the "double-click" feeling
    if (button.onPress) {
      setTimeout(() => {
        button.onPress?.();
      }, 50);
    }
  };

  const getButtonStyle = (buttonStyle?: 'default' | 'cancel' | 'destructive') => {
    switch (buttonStyle) {
      case 'destructive':
        return { backgroundColor: '#FF4444' };
      case 'cancel':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border };
      default:
        return { backgroundColor: colors.primary };
    }
  };

  const getButtonTextStyle = (buttonStyle?: 'default' | 'cancel' | 'destructive') => {
    switch (buttonStyle) {
      case 'cancel':
        return { color: colors.textSecondary };
      default:
        return { color: '#FFFFFF' };
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.alertContainer,
                {
                  opacity: fadeAnim,
                },
              ]}
            >
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: `${iconConfig.color}15` }]}>
                <Ionicons
                  name={iconConfig.name as keyof typeof Ionicons.glyphMap}
                  size={48}
                  color={iconConfig.color}
                />
              </View>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              <Text style={styles.message}>{message}</Text>

              {/* Buttons */}
              <View style={[
                styles.buttonContainer,
                buttons.length > 2 && styles.buttonContainerVertical,
              ]}>
                {buttons.map((button, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      getButtonStyle(button.style),
                      buttons.length === 2 && index === 0 && styles.buttonMarginRight,
                      buttons.length > 2 && styles.buttonFullWidth,
                      buttons.length > 2 && index < buttons.length - 1 && styles.buttonMarginBottom,
                    ]}
                    onPress={() => handleButtonPress(button)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.buttonText, getButtonTextStyle(button.style)]}>
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// Alert service for easy usage throughout the app
type AlertCallback = (config: {
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
}) => void;

let showAlertCallback: AlertCallback | null = null;

export const AlertService = {
  setCallback: (callback: AlertCallback) => {
    showAlertCallback = callback;
  },
  show: (config: {
    title: string;
    message: string;
    type?: AlertType;
    buttons?: AlertButton[];
  }) => {
    if (showAlertCallback) {
      showAlertCallback(config);
    }
  },
  success: (title: string, message: string, onOk?: () => void) => {
    AlertService.show({
      title,
      message,
      type: 'success',
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  },
  error: (title: string, message: string, onOk?: () => void) => {
    AlertService.show({
      title,
      message,
      type: 'error',
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  },
  warning: (title: string, message: string, onOk?: () => void) => {
    AlertService.show({
      title,
      message,
      type: 'warning',
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  },
  info: (title: string, message: string, onOk?: () => void) => {
    AlertService.show({
      title,
      message,
      type: 'info',
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  },
  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  ) => {
    AlertService.show({
      title,
      message,
      type: 'warning',
      buttons: [
        { text: cancelText, style: 'cancel', onPress: onCancel },
        { text: confirmText, style: 'default', onPress: onConfirm },
      ],
    });
  },
  // Generic alert — shows as info type
  alert: (title: string, message: string, onOk?: () => void) => {
    AlertService.info(title, message, onOk);
  },
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    alertContainer: {
      width: SCREEN_WIDTH - spacing.lg * 2,
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 10,
      },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 24,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    message: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.xl,
    },
    buttonContainer: {
      flexDirection: 'row',
      width: '100%',
    },
    buttonContainerVertical: {
      flexDirection: 'column',
    },
    button: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    buttonFullWidth: {
      flex: 0,
      width: '100%',
    },
    buttonMarginRight: {
      marginRight: spacing.sm,
    },
    buttonMarginBottom: {
      marginBottom: spacing.xs,
    },
    buttonText: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.semibold,
    },
  });

export default AlertModal;
