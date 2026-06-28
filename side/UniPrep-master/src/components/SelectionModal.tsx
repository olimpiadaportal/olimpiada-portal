import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomModal } from './CustomModal';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../constants/theme';

interface SelectionOption {
  label: string;
  value: string;
  icon?: string;
}

interface SelectionModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: SelectionOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
}

export const SelectionModal: React.FC<SelectionModalProps> = ({
  visible,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const handleSelect = (value: string) => {
    // Close modal first for immediate visual feedback
    onClose();
    
    // Execute callback after a small delay to ensure modal is closed
    // This prevents the "double-click" feeling
    setTimeout(() => {
      onSelect(value);
    }, 50);
  };

  return (
    <CustomModal
      visible={visible}
      onClose={onClose}
      title={title}
      height="small"
    >
      <View style={styles.optionsContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              selectedValue === option.value && styles.optionSelected,
            ]}
            onPress={() => handleSelect(option.value)}
            activeOpacity={0.7}
          >
            {option.icon && (
              <Ionicons
                name={option.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={
                  selectedValue === option.value
                    ? colors.primary
                    : colors.textSecondary
                }
                style={styles.optionIcon}
              />
            )}
            <Text
              style={[
                styles.optionText,
                selectedValue === option.value && styles.optionTextSelected,
              ]}
            >
              {option.label}
            </Text>
            {selectedValue === option.value && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.primary}
                style={styles.checkIcon}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </CustomModal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    optionsContainer: {
      gap: spacing.xs,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionSelected: {
      backgroundColor: colors.primary + '10',
      borderColor: colors.primary,
      borderWidth: 2,
    },
    optionIcon: {
      marginRight: spacing.sm,
    },
    optionText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: typography.fontWeights.medium,
    },
    optionTextSelected: {
      color: colors.primary,
      fontWeight: typography.fontWeights.bold,
    },
    checkIcon: {
      marginLeft: spacing.sm,
    },
  });
