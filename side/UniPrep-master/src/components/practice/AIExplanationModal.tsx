import React from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';

interface AIExplanation {
  explanation: string;
  keyPoints?: string[];
  studyTip?: string;
  relatedTopics?: string[];
}

interface AIExplanationModalProps {
  visible: boolean;
  onClose: () => void;
  explanation: AIExplanation | null;
  loading: boolean;
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
}

export const AIExplanationModal: React.FC<AIExplanationModalProps> = ({
  visible,
  onClose,
  explanation,
  loading,
  questionText,
  correctAnswer,
  userAnswer,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={24} color="#6366F1" />
              <Text style={styles.headerTitle}>{t('ai.modal.title')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>
                  {t('ai.modal.loading')}
                </Text>
                <Text style={styles.loadingSubtext}>
                  {t('ai.modal.loadingSubtext')}
                </Text>
              </View>
            ) : explanation ? (
              <>
                {/* Question Context */}
                <View style={styles.contextSection}>
                  <Text style={styles.contextLabel}>{t('ai.modal.question')}:</Text>
                  <Text style={styles.contextText}>{questionText}</Text>
                  <View style={styles.answersRow}>
                    <View style={styles.answerItem}>
                      <Text style={styles.answerLabel}>{t('ai.modal.yourAnswer')}:</Text>
                      <Text style={[styles.answerValue, styles.wrongAnswer]}>
                        {userAnswer}
                      </Text>
                    </View>
                    <View style={styles.answerItem}>
                      <Text style={styles.answerLabel}>{t('ai.modal.correct')}:</Text>
                      <Text style={[styles.answerValue, styles.correctAnswer]}>
                        {correctAnswer}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* AI Explanation */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="bulb" size={20} color="#6366F1" />
                    <Text style={styles.sectionTitle}>{t('ai.modal.explanation')}</Text>
                  </View>
                  <Text style={styles.sectionText}>{explanation.explanation}</Text>
                </View>

                {/* Key Points */}
                {explanation.keyPoints && explanation.keyPoints.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="list" size={20} color="#10B981" />
                      <Text style={styles.sectionTitle}>{t('ai.modal.keyPoints')}</Text>
                    </View>
                    {explanation.keyPoints.map((point: string, index: number) => (
                      <View key={index} style={styles.conceptItem}>
                        <View style={styles.conceptBullet} />
                        <Text style={styles.conceptText}>{point}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Study Tip */}
                {explanation.studyTip && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="school" size={20} color="#F59E0B" />
                      <Text style={styles.sectionTitle}>{t('ai.modal.studyTip')}</Text>
                    </View>
                    <Text style={styles.sectionText}>
                      {explanation.studyTip}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color={colors.error} />
                <Text style={styles.errorText}>
                  {t('ai.modal.error')}
                </Text>
                <Text style={styles.errorSubtext}>
                  {t('ai.modal.errorSubtext')}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          {!loading && explanation && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.closeFooterButton}
                onPress={onClose}
              >
                <Text style={styles.closeFooterButtonText}>{t('ai.modal.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: '95%',
      paddingBottom: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    loadingContainer: {
      paddingVertical: 60,
      alignItems: 'center',
      gap: 16,
    },
    loadingText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    loadingSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
    },
    contextSection: {
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 12,
      marginTop: 16,
      marginBottom: 8,
    },
    contextLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    contextText: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 22,
      marginBottom: 12,
    },
    answersRow: {
      flexDirection: 'row',
      gap: 12,
    },
    answerItem: {
      flex: 1,
    },
    answerLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    answerValue: {
      fontSize: 18,
      fontWeight: '700',
    },
    wrongAnswer: {
      color: '#EF4444',
    },
    correctAnswer: {
      color: '#10B981',
    },
    section: {
      marginTop: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    sectionText: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 24,
    },
    conceptItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 8,
    },
    conceptBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#F59E0B',
      marginTop: 8,
    },
    conceptText: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      lineHeight: 24,
    },
    errorContainer: {
      paddingVertical: 60,
      alignItems: 'center',
      gap: 12,
    },
    errorText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    errorSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    closeFooterButton: {
      backgroundColor: '#6366F1',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    closeFooterButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
