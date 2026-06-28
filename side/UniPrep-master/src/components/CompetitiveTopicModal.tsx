import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { colors as staticColors, typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { practiceService } from '../services/practiceService';

interface Topic {
  id: string;
  topic_name: string;
  question_count: number;
  is_active: boolean;
}

type DifficultyLevel = 'balanced' | 'easy' | 'medium' | 'hard' | 'adaptive';

interface DifficultyOption {
  key: DifficultyLevel;
  label: string;
  description: string;
  icon: string;
  color: string;
}

interface CompetitiveTopicModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (selectedTopics: string[], difficulty: DifficultyLevel) => void;
  subjectId: string;
  subjectName: string;
  questionCount?: number;
}

export const CompetitiveTopicModal: React.FC<CompetitiveTopicModalProps> = ({
  visible,
  onClose,
  onConfirm,
  subjectId,
  subjectName,
  questionCount = 15,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>('adaptive');
  const [loading, setLoading] = useState(true);
  const [selectAll, setSelectAll] = useState(false);
  const [step, setStep] = useState<'topics' | 'difficulty'>('topics');

  const difficultyOptions: DifficultyOption[] = [
    {
      key: 'adaptive',
      label: t('competitive.difficulty.adaptive', 'Adaptive'),
      description: t('competitive.difficulty.adaptiveDesc', 'AI adjusts based on your performance'),
      icon: 'sparkles',
      color: '#8B5CF6',
    },
    {
      key: 'balanced',
      label: t('competitive.difficulty.balanced', 'Balanced'),
      description: t('competitive.difficulty.balancedDesc', '30% easy, 50% medium, 20% hard'),
      icon: 'scale',
      color: '#3B82F6',
    },
    {
      key: 'easy',
      label: t('competitive.difficulty.easy', 'Easy'),
      description: t('competitive.difficulty.easyDesc', 'Focus on foundational concepts'),
      icon: 'leaf',
      color: '#10B981',
    },
    {
      key: 'medium',
      label: t('competitive.difficulty.medium', 'Medium'),
      description: t('competitive.difficulty.mediumDesc', 'Standard exam-level questions'),
      icon: 'fitness',
      color: '#F59E0B',
    },
    {
      key: 'hard',
      label: t('competitive.difficulty.hard', 'Hard'),
      description: t('competitive.difficulty.hardDesc', 'Challenge yourself with tough questions'),
      icon: 'flame',
      color: '#EF4444',
    },
  ];

  useEffect(() => {
    if (visible) {
      loadTopics();
      setStep('topics');
    }
  }, [visible, subjectId]);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const fetchedTopics = await practiceService.getTopicsBySubject(subjectId);
      setTopics(fetchedTopics);
      // By default, select all topics
      const allTopicNames = new Set(fetchedTopics.map(t => t.topic_name));
      setSelectedTopics(allTopicNames);
      setSelectAll(true);
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTopic = (topicName: string) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(topicName)) {
      newSelected.delete(topicName);
    } else {
      newSelected.add(topicName);
    }
    setSelectedTopics(newSelected);
    setSelectAll(newSelected.size === topics.length);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedTopics(new Set());
    } else {
      setSelectedTopics(new Set(topics.map(t => t.topic_name)));
    }
    setSelectAll(!selectAll);
  };

  const handleNext = () => {
    setStep('difficulty');
  };

  const handleBack = () => {
    setStep('topics');
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedTopics), selectedDifficulty);
  };

  const handleSkip = () => {
    // Skip topic selection - go to difficulty selection
    setStep('difficulty');
  };

  const handleGenerateWithoutTopics = () => {
    // Generate with AI using selected difficulty but no specific topics
    onConfirm([], selectedDifficulty);
  };

  // Calculate question distribution preview
  const getDistributionPreview = () => {
    const selectedCount = selectedTopics.size;
    if (selectedCount === 0) return null;
    
    const perTopic = Math.floor(questionCount / selectedCount);
    const remainder = questionCount % selectedCount;
    
    return { perTopic, remainder, total: questionCount };
  };

  const distribution = getDistributionPreview();

  const renderTopicsStep = () => (
    <>
      {/* Select All */}
      <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
        <View style={[styles.checkbox, selectAll && styles.checkboxSelected]}>
          {selectAll && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={styles.selectAllText}>
          {t('practice.topicSelection.selectAll')} ({topics.length})
        </Text>
      </TouchableOpacity>

      {/* Topics List */}
      <ScrollView style={styles.topicsList} showsVerticalScrollIndicator={false}>
        {topics.map((topic) => {
          const isSelected = selectedTopics.has(topic.topic_name);
          return (
            <TouchableOpacity
              key={topic.id}
              style={[styles.topicItem, isSelected && styles.topicItemSelected]}
              onPress={() => toggleTopic(topic.topic_name)}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
              <View style={styles.topicInfo}>
                <Text style={styles.topicName}>{topic.topic_name}</Text>
                <Text style={styles.topicCount}>
                  {topic.question_count} {t('practice.topicSelection.questionsAvailable')}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Distribution Preview */}
      {distribution && selectedTopics.size > 0 && (
        <View style={styles.distributionPreview}>
          <Ionicons name="pie-chart-outline" size={16} color={colors.primary} />
          <Text style={styles.distributionText}>
            {t('practice.topicSelection.distribution', {
              perTopic: distribution.perTopic,
              topics: selectedTopics.size,
            })}
            {distribution.remainder > 0 && ` (+${distribution.remainder})`}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title={t('competitive.topicModal.skipToAI', 'Let AI Decide')}
          variant="outline"
          size="compact"
          onPress={handleSkip}
          style={styles.skipButton}
        />
        <Button
          title={t('common.next')}
          size="compact"
          onPress={handleNext}
          disabled={selectedTopics.size === 0}
          style={styles.nextButton}
        />
      </View>
    </>
  );

  const renderDifficultyStep = () => (
    <>
      <ScrollView style={styles.difficultyList} showsVerticalScrollIndicator={false}>
        {difficultyOptions.map((option) => {
          const isSelected = selectedDifficulty === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.difficultyItem,
                isSelected && [styles.difficultyItemSelected, { borderColor: option.color }],
              ]}
              onPress={() => setSelectedDifficulty(option.key)}
            >
              <View style={[styles.difficultyIcon, { backgroundColor: option.color + '20' }]}>
                <Ionicons name={option.icon as keyof typeof Ionicons.glyphMap} size={24} color={option.color} />
              </View>
              <View style={styles.difficultyInfo}>
                <Text style={styles.difficultyLabel}>{option.label}</Text>
                <Text style={styles.difficultyDesc}>{option.description}</Text>
              </View>
              <View style={[
                styles.radioOuter,
                isSelected && { borderColor: option.color },
              ]}>
                {isSelected && (
                  <View style={[styles.radioInner, { backgroundColor: option.color }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Summary */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>{t('competitive.topicModal.summary', 'Summary')}</Text>
        <View style={styles.summaryRow}>
          <Ionicons name="list" size={16} color={colors.textSecondary} />
          <Text style={styles.summaryText}>
            {selectedTopics.size} {t('competitive.topicModal.topicsSelected', 'topics selected')}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="help-circle" size={16} color={colors.textSecondary} />
          <Text style={styles.summaryText}>
            {questionCount} {t('competitive.topicModal.questions', 'questions')}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title={t('common.back')}
          variant="outline"
          size="compact"
          onPress={handleBack}
          style={styles.backButton}
        />
        <Button
          title={t('competitive.topicModal.generate', 'Generate Questions')}
          size="compact"
          onPress={handleConfirm}
          style={styles.generateButton}
        />
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.title}>
                {step === 'topics' 
                  ? t('competitive.topicModal.selectTopics', 'Select Topics')
                  : t('competitive.topicModal.selectDifficulty', 'Select Difficulty')
                }
              </Text>
              <Text style={styles.subtitle}>{subjectName}</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Step Indicator */}
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, step === 'topics' && styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, step === 'difficulty' && styles.stepDotActive]} />
          </View>

          {/* Mode Badge */}
          <View style={styles.modeBadge}>
            <Ionicons name="trophy" size={16} color="#F59E0B" />
            <Text style={[styles.modeText, { color: '#F59E0B' }]}>
              {t('competitive.title')} • {questionCount} {t('practice.topicSelection.questions')}
            </Text>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : topics.length === 0 ? (
            step === 'topics' ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyText}>{t('practice.topicSelection.noTopics')}</Text>
                <Text style={styles.emptySubtext}>
                  {t('competitive.topicModal.aiWillGenerate', 'AI will generate questions from all available topics')}
                </Text>
                <Button
                  title={t('competitive.topicModal.chooseDifficulty', 'Choose Difficulty')}
                  onPress={handleSkip}
                  style={styles.startButton}
                />
              </View>
            ) : (
              // Show difficulty selection when no topics
              <>
                <ScrollView style={styles.difficultyList} showsVerticalScrollIndicator={false}>
                  {difficultyOptions.map((option) => {
                    const isSelected = selectedDifficulty === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.difficultyItem,
                          isSelected && [styles.difficultyItemSelected, { borderColor: option.color }],
                        ]}
                        onPress={() => setSelectedDifficulty(option.key)}
                      >
                        <View style={[styles.difficultyIcon, { backgroundColor: option.color + '20' }]}>
                          <Ionicons name={option.icon as keyof typeof Ionicons.glyphMap} size={24} color={option.color} />
                        </View>
                        <View style={styles.difficultyInfo}>
                          <Text style={styles.difficultyLabel}>{option.label}</Text>
                          <Text style={styles.difficultyDesc}>{option.description}</Text>
                        </View>
                        <View style={[
                          styles.radioOuter,
                          isSelected && { borderColor: option.color },
                        ]}>
                          {isSelected && (
                            <View style={[styles.radioInner, { backgroundColor: option.color }]} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Summary for no topics */}
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{t('competitive.topicModal.summary', 'Summary')}</Text>
                  <View style={styles.summaryRow}>
                    <Ionicons name="sparkles" size={16} color={colors.primary} />
                    <Text style={styles.summaryText}>
                      {t('competitive.topicModal.aiGeneratedTopics', 'AI will select topics')}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Ionicons name="help-circle" size={16} color={colors.textSecondary} />
                    <Text style={styles.summaryText}>
                      {questionCount} {t('competitive.topicModal.questions', 'questions')}
                    </Text>
                  </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                  <Button
                    title={t('common.back')}
                    variant="outline"
                    size="compact"
                    onPress={() => setStep('topics')}
                    style={styles.backButton}
                  />
                  <Button
                    title={t('competitive.topicModal.generate', 'Generate Questions')}
                    size="compact"
                    onPress={handleGenerateWithoutTopics}
                    style={styles.generateButton}
                  />
                </View>
              </>
            )
          ) : (
            step === 'topics' ? renderTopicsStep() : renderDifficultyStep()
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  placeholder: {
    width: 32,
  },
  title: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.disabled,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.disabled,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  modeText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  loadingContainer: {
    padding: spacing.xl * 2,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: spacing.xl * 2,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    marginBottom: spacing.lg,
    fontSize: typography.fontSizes.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  startButton: {
    minWidth: 200,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectAllText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginLeft: spacing.md,
  },
  topicsList: {
    maxHeight: 250,
    paddingHorizontal: spacing.lg,
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicItemSelected: {
    backgroundColor: colors.primary + '08',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  topicInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  topicName: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  topicCount: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  distributionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
  },
  distributionText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
  difficultyList: {
    maxHeight: 320,
    paddingHorizontal: spacing.lg,
  },
  difficultyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  difficultyItemSelected: {
    backgroundColor: colors.surface,
  },
  difficultyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  difficultyInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  difficultyLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  difficultyDesc: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  summaryBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  summaryTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: 2,
  },
  summaryText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  skipButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
  },
  backButton: {
    flex: 1,
  },
  generateButton: {
    flex: 2,
  },
});
