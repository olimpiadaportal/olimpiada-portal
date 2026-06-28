import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { ProgressBar } from '../ProgressBar';

export interface SubjectProgress {
  id: string;
  name: string;
  accuracy: number;
  questionsAttempted: number;
  completionRate: number;
  color: string;
}

interface SubjectProgressVisualizationProps {
  subjects: SubjectProgress[];
  onSubjectPress?: (subjectId: string) => void;
}

export const SubjectProgressVisualization: React.FC<SubjectProgressVisualizationProps> = ({
  subjects,
  onSubjectPress,
}) => {
  const { colors } = useTheme();

  if (subjects.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Subject Progress
        </Text>
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Start practicing to see your progress by subject!
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Subject Progress
      </Text>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {subjects.map((subject) => (
          <TouchableOpacity
            key={subject.id}
            style={[
              styles.subjectCard,
              { backgroundColor: colors.background },
            ]}
            onPress={() => onSubjectPress?.(subject.id)}
            activeOpacity={0.7}
          >
            {/* Subject Icon */}
            <View style={[styles.subjectIcon, { backgroundColor: subject.color + '20' }]}>
              <Ionicons name="book" size={24} color={subject.color} />
            </View>

            {/* Subject Name */}
            <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={1}>
              {subject.name}
            </Text>

            {/* Accuracy */}
            <View style={styles.accuracyContainer}>
              <Text style={[styles.accuracyValue, { color: subject.color }]}>
                {subject.accuracy}%
              </Text>
              <Text style={[styles.accuracyLabel, { color: colors.textSecondary }]}>
                Accuracy
              </Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <ProgressBar 
                progress={subject.completionRate} 
                color={subject.color}
                height={6}
              />
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {subject.completionRate}% Complete
              </Text>
            </View>

            {/* Questions Count */}
            <View style={styles.questionsContainer}>
              <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.questionsText, { color: colors.textSecondary }]}>
                {subject.questionsAttempted} questions
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingRight: spacing.md,
  },
  subjectCard: {
    width: 160,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginRight: spacing.md,
  },
  subjectIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  accuracyContainer: {
    marginBottom: spacing.md,
  },
  accuracyValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  accuracyLabel: {
    fontSize: 12,
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressText: {
    fontSize: 11,
    marginTop: 4,
  },
  questionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  questionsText: {
    fontSize: 11,
  },
});
