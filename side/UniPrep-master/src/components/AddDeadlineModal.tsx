import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, borderRadius, typography } from '../constants/theme';
import { formatSimpleDate } from '../utils/dateFormatting';

interface AddDeadlineModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (title: string, date: Date, type: 'exam' | 'assignment' | 'goal' | 'custom') => void;
}

export const AddDeadlineModal: React.FC<AddDeadlineModalProps> = ({
  visible,
  onClose,
  onAdd,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedType, setSelectedType] = useState<'exam' | 'assignment' | 'goal' | 'custom'>('custom');

  const types = [
    { value: 'exam', label: t('home.components.allDeadlines.addModal.types.exam'), icon: 'school', color: '#EF4444' },
    { value: 'assignment', label: t('home.components.allDeadlines.addModal.types.assignment'), icon: 'document-text', color: '#F59E0B' },
    { value: 'goal', label: t('home.components.allDeadlines.addModal.types.goal'), icon: 'flag', color: '#10B981' },
    { value: 'custom', label: t('home.components.allDeadlines.addModal.types.custom'), icon: 'calendar', color: '#3B82F6' },
  ];

  const handleAdd = () => {
    if (title.trim()) {
      onAdd(title, selectedDate, selectedType);
      setTitle('');
      setSelectedDate(new Date());
      setSelectedType('custom');
      onClose();
    }
  };

  const formatDate = (date: Date) => {
    return formatSimpleDate(date, t('common.locale'));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('home.components.allDeadlines.addModal.title')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Title Input */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t('home.components.allDeadlines.addModal.whatFor')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder={t('home.components.allDeadlines.addModal.placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Type Selection */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t('home.components.allDeadlines.addModal.type')}
            </Text>
            <View style={styles.typeGrid}>
              {types.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    {
                      backgroundColor: selectedType === type.value ? type.color + '20' : colors.background,
                      borderColor: selectedType === type.value ? type.color : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedType(type.value as 'exam' | 'assignment' | 'goal' | 'custom')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={type.icon as keyof typeof Ionicons.glyphMap}
                    size={24}
                    color={selectedType === type.value ? type.color : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      {
                        color: selectedType === type.value ? type.color : colors.textSecondary,
                      },
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date Selection */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t('home.components.allDeadlines.addModal.dueDate')}
            </Text>
            <TouchableOpacity
              style={[
                styles.dateButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={[styles.dateText, { color: colors.text }]}>
                {formatDate(selectedDate)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Date Picker */}
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) {
                  setSelectedDate(date);
                }
              }}
              minimumDate={new Date()}
            />
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { backgroundColor: colors.background }]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.addButton,
                { backgroundColor: colors.primary },
                !title.trim() && styles.buttonDisabled,
              ]}
              onPress={handleAdd}
              disabled={!title.trim()}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                {t('home.components.allDeadlines.addModal.addButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    gap: spacing.sm,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addButton: {},
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
