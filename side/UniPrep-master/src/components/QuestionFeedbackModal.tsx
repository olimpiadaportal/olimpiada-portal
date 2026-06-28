/**
 * QuestionFeedbackModal
 *
 * A bottom-sheet style modal allowing students to report issues with a question.
 * Predefined feedback types + optional free-text comment.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';

export type FeedbackType =
  | 'wrong_answer'
  | 'unclear_question'
  | 'unclear_options'
  | 'missing_explanation'
  | 'wrong_topic'
  | 'duplicate'
  | 'other';

interface FeedbackOption {
  type: FeedbackType;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  { type: 'wrong_answer', icon: 'close-circle-outline', labelKey: 'practice.questionFeedback.wrongAnswer' },
  { type: 'unclear_question', icon: 'help-circle-outline', labelKey: 'practice.questionFeedback.unclearQuestion' },
  { type: 'unclear_options', icon: 'list-outline', labelKey: 'practice.questionFeedback.unclearOptions' },
  { type: 'missing_explanation', icon: 'document-text-outline', labelKey: 'practice.questionFeedback.missingExplanation' },
  { type: 'wrong_topic', icon: 'bookmark-outline', labelKey: 'practice.questionFeedback.wrongTopic' },
  { type: 'duplicate', icon: 'copy-outline', labelKey: 'practice.questionFeedback.duplicate' },
  { type: 'other', icon: 'ellipsis-horizontal-circle-outline', labelKey: 'practice.questionFeedback.other' },
];

interface Props {
  visible: boolean;
  questionId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const QuestionFeedbackModal: React.FC<Props> = ({
  visible,
  questionId,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(false);
  const [checking, setChecking] = useState(false);

  // Track which questionId the async check is for to prevent race conditions
  const activeCheckRef = useRef<string | null>(null);

  // Check if user already submitted feedback — reset stale state upfront
  useEffect(() => {
    // Always clear stale state when questionId or visibility changes
    setAlreadyReported(false);
    setSubmitted(false);
    setSelectedType(null);
    setComment('');

    if (visible && questionId && user?.id) {
      activeCheckRef.current = questionId;
      checkExistingFeedback(questionId);
    } else {
      setChecking(false);
    }
  }, [visible, questionId]);

  const checkExistingFeedback = async (qId: string) => {
    try {
      setChecking(true);
      const { data } = await supabase
        .from('question_feedback')
        .select('id')
        .eq('user_id', user!.id)
        .eq('question_id', qId)
        .limit(1)
        .maybeSingle();
      // Only apply result if this is still the active check
      if (activeCheckRef.current === qId) {
        setAlreadyReported(!!data);
      }
    } catch {
      // Non-critical — allow submission if check fails
      if (activeCheckRef.current === qId) {
        setAlreadyReported(false);
      }
    } finally {
      if (activeCheckRef.current === qId) {
        setChecking(false);
      }
    }
  };

  const handleClose = () => {
    activeCheckRef.current = null;
    setSelectedType(null);
    setComment('');
    setSubmitting(false);
    setSubmitted(false);
    setAlreadyReported(false);
    setChecking(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedType || !user?.id) return;

    try {
      setSubmitting(true);

      const { error } = await supabase.from('question_feedback').insert({
        question_id: questionId,
        user_id: user.id,
        feedback_type: selectedType,
        comment: comment.trim() || null,
      });

      if (error) {
        // Unique constraint violation — user already reported this question
        if (error.code === '23505') {
          setAlreadyReported(true);
          return;
        }
        throw error;
      }

      setSubmitted(true);
      onSubmitted?.();

      // Auto-close after showing success
      setTimeout(handleClose, 1500);
    } catch (err) {
      console.warn('Failed to submit question feedback:', err);
      // Still close — feedback is non-critical
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {checking ? (
            /* Checking state — brief spinner while we verify duplicates */
            <View style={styles.successContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : alreadyReported ? (
            /* Already reported — show informational state */
            <View style={styles.successContainer}>
              <Ionicons name="information-circle" size={48} color="#F59E0B" />
              <Text style={[styles.successTitle, { color: colors.text }]}>
                {t('practice.questionFeedback.alreadyReported')}
              </Text>
              <Text style={[styles.successMessage, { color: colors.textSecondary }]}>
                {t('practice.questionFeedback.alreadyReportedDetail')}
              </Text>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#6B7280', marginTop: 12, alignSelf: 'stretch' }]}
                onPress={handleClose}
              >
                <Text style={styles.submitButtonText}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          ) : submitted ? (
            /* Success state */
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={[styles.successTitle, { color: colors.text }]}>
                {t('practice.questionFeedback.thankYou')}
              </Text>
              <Text style={[styles.successMessage, { color: colors.textSecondary }]}>
                {t('practice.questionFeedback.feedbackReceived')}
              </Text>
            </View>
          ) : (
            /* Feedback form */
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t('practice.questionFeedback.title')}
                </Text>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('practice.questionFeedback.subtitle')}
              </Text>

              {/* Feedback type options */}
              <View style={styles.optionsContainer}>
                {FEEDBACK_OPTIONS.map((opt) => {
                  const isSelected = selectedType === opt.type;
                  return (
                    <TouchableOpacity
                      key={opt.type}
                      style={[
                        styles.optionChip,
                        { borderColor: isSelected ? '#3B82F6' : colors.border, backgroundColor: isSelected ? '#EFF6FF' : colors.background },
                      ]}
                      onPress={() => setSelectedType(opt.type)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={18}
                        color={isSelected ? '#3B82F6' : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.optionLabel,
                          { color: isSelected ? '#3B82F6' : colors.text },
                        ]}
                      >
                        {t(opt.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Optional comment */}
              <Text style={[styles.commentLabel, { color: colors.textSecondary }]}>
                {t('practice.questionFeedback.commentLabel')}
              </Text>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder={t('practice.questionFeedback.commentPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              {/* Submit button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: selectedType ? '#3B82F6' : '#93C5FD', opacity: selectedType ? 1 : 0.6 },
                ]}
                onPress={handleSubmit}
                disabled={!selectedType || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {t('practice.questionFeedback.submit')}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  commentLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 16,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  successMessage: {
    fontSize: 14,
    textAlign: 'center',
  },
});
