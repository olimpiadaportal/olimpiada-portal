// YearPicker Component - Roller/Picker for Graduation Year
// Task 6: Make graduation year a roller/picker with current year onwards + blank option

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors as staticColors, typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface YearPickerProps {
  label: string;
  value: number | undefined;
  onChange: (year: number | undefined) => void;
  error?: string;
  placeholder?: string;
}

export const YearPicker: React.FC<YearPickerProps> = ({
  label,
  value,
  onChange,
  error,
  placeholder,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showPicker, setShowPicker] = useState(false);

  // Generate years from current year to current year + 10
  const currentYear = new Date().getFullYear();
  const years: (number | null)[] = [null]; // null represents "Leave blank" option
  for (let i = 0; i <= 10; i++) {
    years.push(currentYear + i);
  }

  const handleSelect = (year: number | null) => {
    onChange(year === null ? undefined : year);
    setShowPicker(false);
  };

  const displayValue = value ? value.toString() : '';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.selector, error && styles.selectorError]}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[styles.selectorText, !value && styles.placeholderText]}>
          {displayValue || placeholder || t('auth.signUp.selectYear', 'Select year')}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Year Picker Modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('auth.signUp.graduationYear', 'Graduation Year')}
              </Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={years}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.yearItem,
                    (item === null && value === undefined) || item === value
                      ? styles.yearItemSelected
                      : null,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.yearText,
                      (item === null && value === undefined) || item === value
                        ? styles.yearTextSelected
                        : null,
                    ]}
                  >
                    {item === null
                      ? t('auth.signUp.leaveBlank', 'Leave blank')
                      : item.toString()}
                  </Text>
                  {((item === null && value === undefined) || item === value) && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.disabled,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectorError: {
    borderColor: colors.error,
  },
  selectorText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  placeholderText: {
    color: colors.placeholder,
  },
  errorText: {
    fontSize: typography.fontSizes.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  yearItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  yearItemSelected: {
    backgroundColor: colors.primary + '10',
  },
  yearText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  yearTextSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
});

export default YearPicker;
