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
import { TopicWithSubtopics, SubtopicItem } from '../types/practice';

export interface TopicSelection {
  topicNames: string[];
  subtopicIds: string[];
}

interface TopicSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (selection: TopicSelection) => void;
  subjectId: string;
  subjectName: string;
  mode: 'practice' | 'quiz';
  questionCount: number;
}

export const TopicSelectionModal: React.FC<TopicSelectionModalProps> = ({
  visible,
  onClose,
  onConfirm,
  subjectId,
  subjectName,
  mode,
  questionCount,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [topics, setTopics] = useState<TopicWithSubtopics[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [selectedTopicNames, setSelectedTopicNames] = useState<Set<string>>(new Set());
  const [selectedSubtopicIds, setSelectedSubtopicIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadTopics();
    }
  }, [visible, subjectId]);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const fetched = await practiceService.getTopicsWithSubtopics(subjectId);
      setTopics(fetched);
      // Pre-select everything by default
      const names = new Set(fetched.filter(t => t.subtopics.length === 0).map(t => t.topic_name));
      const ids = new Set(fetched.flatMap(t => t.subtopics.filter(s => s.is_active).map(s => s.id)));
      setSelectedTopicNames(names);
      setSelectedSubtopicIds(ids);
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Tri-state check for a topic's header ─────────────────────────────────
  const getTopicState = (topic: TopicWithSubtopics): 'all' | 'some' | 'none' => {
    if (topic.subtopics.length === 0) {
      return selectedTopicNames.has(topic.topic_name) ? 'all' : 'none';
    }
    const activeSubtopics = topic.subtopics.filter(s => s.is_active);
    const count = activeSubtopics.filter(s => selectedSubtopicIds.has(s.id)).length;
    if (count === 0) return 'none';
    if (count === activeSubtopics.length) return 'all';
    return 'some';
  };

  // ── Global select-all state ───────────────────────────────────────────────
  const isAllSelected = (): boolean => {
    const topicsNoSub = topics.filter(t => t.subtopics.length === 0);
    const allSubs = topics.flatMap(t => t.subtopics.filter(s => s.is_active));
    return (
      topicsNoSub.every(t => selectedTopicNames.has(t.topic_name)) &&
      allSubs.every(s => selectedSubtopicIds.has(s.id))
    );
  };

  const isNoneSelected = (): boolean =>
    selectedTopicNames.size === 0 && selectedSubtopicIds.size === 0;

  const toggleSelectAll = () => {
    if (isAllSelected()) {
      setSelectedTopicNames(new Set());
      setSelectedSubtopicIds(new Set());
    } else {
      setSelectedTopicNames(
        new Set(topics.filter(t => t.subtopics.length === 0).map(t => t.topic_name)),
      );
      setSelectedSubtopicIds(
        new Set(topics.flatMap(t => t.subtopics.filter(s => s.is_active).map(s => s.id))),
      );
    }
  };

  // ── Topic header tap ──────────────────────────────────────────────────────
  const toggleTopicHeader = (topic: TopicWithSubtopics) => {
    if (topic.subtopics.length === 0) {
      const next = new Set(selectedTopicNames);
      next.has(topic.topic_name) ? next.delete(topic.topic_name) : next.add(topic.topic_name);
      setSelectedTopicNames(next);
    } else {
      const state = getTopicState(topic);
      const next = new Set(selectedSubtopicIds);
      if (state === 'none') {
        topic.subtopics.filter(s => s.is_active).forEach(s => next.add(s.id));
      } else {
        topic.subtopics.forEach(s => next.delete(s.id));
      }
      setSelectedSubtopicIds(next);
    }
  };

  // ── Expand/collapse tap (chevron area) ───────────────────────────────────
  const toggleExpand = (topicId: string) => {
    const next = new Set(expandedTopics);
    next.has(topicId) ? next.delete(topicId) : next.add(topicId);
    setExpandedTopics(next);
  };

  // ── Individual subtopic tap ───────────────────────────────────────────────
  const toggleSubtopic = (subtopicId: string) => {
    const next = new Set(selectedSubtopicIds);
    next.has(subtopicId) ? next.delete(subtopicId) : next.add(subtopicId);
    setSelectedSubtopicIds(next);
  };

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const topicNames: string[] = [];
    for (const topic of topics) {
      if (topic.subtopics.length === 0 && selectedTopicNames.has(topic.topic_name)) {
        topicNames.push(topic.topic_name);
      }
    }
    onConfirm({ topicNames, subtopicIds: Array.from(selectedSubtopicIds) });
  };

  const handleSkip = () => {
    onConfirm({ topicNames: [], subtopicIds: [] });
  };

  // ── Selection count for button label ─────────────────────────────────────
  const totalSelected = selectedTopicNames.size + selectedSubtopicIds.size;
  const selectAllState = isAllSelected() ? 'all' : isNoneSelected() ? 'none' : 'some';

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
              <Text style={styles.title}>{t('practice.topicSelection.title')}</Text>
              <Text style={styles.subtitle}>{subjectName}</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Mode Badge */}
          <View style={styles.modeBadge}>
            <Ionicons
              name={mode === 'practice' ? 'book' : 'timer'}
              size={16}
              color={mode === 'practice' ? colors.primary : colors.secondary}
            />
            <Text style={[
              styles.modeText,
              { color: mode === 'practice' ? colors.primary : colors.secondary },
            ]}>
              {mode === 'practice'
                ? t('practice.subjectDetail.practiceMode')
                : t('practice.subjectDetail.quizMode')
              } • {questionCount} {t('practice.topicSelection.questions')}
            </Text>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : topics.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>{t('practice.topicSelection.noTopics')}</Text>
              <Button
                title={t('practice.topicSelection.startAnyway')}
                onPress={handleSkip}
                style={styles.startButton}
              />
            </View>
          ) : (
            <>
              {/* Select All row */}
              <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
                <TriStateCheckbox state={selectAllState} colors={colors} />
                <Text style={styles.selectAllText}>
                  {t('practice.topicSelection.selectAll')} ({topics.length})
                </Text>
              </TouchableOpacity>

              {/* Topics List */}
              <ScrollView style={styles.topicsList} showsVerticalScrollIndicator={false}>
                {topics.map((topic) => {
                  const state = getTopicState(topic);
                  const isExpanded = expandedTopics.has(topic.id);
                  const hasSubtopics = topic.subtopics.length > 0;

                  return (
                    <View key={topic.id}>
                      {/* Topic row */}
                      <View style={[
                        styles.topicRow,
                        state !== 'none' && styles.topicRowSelected,
                      ]}>
                        {/* Checkbox tap area */}
                        <TouchableOpacity
                          style={styles.topicCheckArea}
                          onPress={() => toggleTopicHeader(topic)}
                        >
                          <TriStateCheckbox state={state} colors={colors} />
                          <View style={styles.topicInfo}>
                            <Text style={styles.topicName} numberOfLines={2}>
                              {topic.topic_name}
                            </Text>
                            <Text style={styles.topicCount}>
                              {hasSubtopics
                                ? `${topic.subtopics.filter(s => s.is_active).length} ${t('practice.topicSelection.subtopicsAvailable')}`
                                : `${topic.question_count} ${t('practice.topicSelection.questionsAvailable')}`
                              }
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Chevron — only shown when topic has subtopics */}
                        {hasSubtopics && (
                          <TouchableOpacity
                            style={styles.chevronButton}
                            onPress={() => toggleExpand(topic.id)}
                          >
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={colors.textSecondary}
                            />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Subtopics — shown when expanded */}
                      {hasSubtopics && isExpanded && (
                        <View style={styles.subtopicsContainer}>
                          {topic.subtopics.filter(s => s.is_active).map((subtopic) => {
                            const isSubSelected = selectedSubtopicIds.has(subtopic.id);
                            return (
                              <TouchableOpacity
                                key={subtopic.id}
                                style={[
                                  styles.subtopicRow,
                                  isSubSelected && styles.subtopicRowSelected,
                                ]}
                                onPress={() => toggleSubtopic(subtopic.id)}
                              >
                                <View style={[
                                  styles.checkbox,
                                  isSubSelected && styles.checkboxSelected,
                                ]}>
                                  {isSubSelected && (
                                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                                  )}
                                </View>
                                <Text style={styles.subtopicName} numberOfLines={3}>
                                  {subtopic.subtopic_name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Footer */}
              <View style={styles.footer}>
                <Button
                  title={t('practice.topicSelection.skipSelection')}
                  variant="outline"
                  size="compact"
                  onPress={handleSkip}
                  style={styles.skipButton}
                />
                <Button
                  title={t('practice.topicSelection.startWithSelected', { count: totalSelected })}
                  size="compact"
                  onPress={handleConfirm}
                  disabled={totalSelected === 0}
                  style={styles.confirmButton}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ── Tri-state checkbox component ─────────────────────────────────────────────
interface TriStateCheckboxProps {
  state: 'all' | 'some' | 'none';
  colors: any;
}

const TriStateCheckbox: React.FC<TriStateCheckboxProps> = ({ state, colors }) => {
  const styles = React.useMemo(() => createCheckboxStyles(colors), [colors]);
  return (
    <View style={[styles.base, state !== 'none' && styles.active]}>
      {state === 'all' && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      {state === 'some' && <Ionicons name="remove" size={16} color="#FFFFFF" />}
    </View>
  );
};

const createCheckboxStyles = (colors: any) =>
  StyleSheet.create({
    base: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    active: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
  });

// ── Main styles ───────────────────────────────────────────────────────────────
const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      maxHeight: '85%',
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
      marginBottom: spacing.lg,
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
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
      maxHeight: 380,
      paddingHorizontal: spacing.lg,
    },
    // Topic header row
    topicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    topicRowSelected: {
      backgroundColor: colors.primary + '08',
    },
    topicCheckArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    chevronButton: {
      padding: spacing.xs,
    },
    topicInfo: {
      flex: 1,
      marginLeft: spacing.md,
      minWidth: 0,
    },
    topicName: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: typography.fontWeights.medium,
      flexShrink: 1,
      lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    },
    topicCount: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // Subtopics container
    subtopicsContainer: {
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    subtopicRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
      paddingLeft: spacing.xl,
    },
    subtopicRowSelected: {
      // subtle highlight
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    subtopicName: {
      flex: 1,
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
      marginLeft: spacing.sm,
      minWidth: 0,
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
    confirmButton: {
      flex: 2,
    },
  });
