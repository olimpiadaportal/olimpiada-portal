import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { FadeIn } from '../../components/animated';
import { competitiveSessionService, CompetitiveSession } from '../../services/competitiveSessionService';
import { SessionDetailsModal } from '../../components/SessionDetailsModal';
import { supabase } from '../../services/supabase';

// Helper to convert subject name to translation key
const getSubjectTranslationKey = (subjectName: string): string => {
  const mapping: Record<string, string> = {
    'Azerbaijani Language': 'azerbaijaniLanguage',
    'Russian Language': 'russianLanguage',
    'Mathematics': 'mathematics',
    'Physics': 'physics',
    'Chemistry': 'chemistry',
    'Biology': 'biology',
    'History': 'history',
    'Geography': 'geography',
    'Literature': 'literature',
    'English': 'english',
  };
  return mapping[subjectName] || subjectName.toLowerCase().replace(/\s+/g, '');
};

// Use CompetitiveSession from service
type SessionHistory = CompetitiveSession;

export const CompetitiveHistoryScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      
      if (!user?.id) {
        console.error('No user ID available');
        return;
      }

      // Get student ID from students table
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!student?.id) {
        console.error('No student record found for user');
        return;
      }

      console.log('📊 Loading history for student:', student.id);

      // Fetch real sessions from database using student ID
      const sessions = await competitiveSessionService.getSessionHistory(student.id);
      setSessions(sessions);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = filter === 'all' 
    ? sessions 
    : sessions.filter(s => s.subject_name === filter);

  // Get unique subject names for filters (exclude null/undefined)
  const uniqueSubjects = Array.from(new Set(
    sessions
      .map(s => s.subject_name)
      .filter(name => name && name.trim() !== '')
  ));

  const averageScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
    : 0;

  const totalSessions = sessions.length;

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    
    // Compare dates by calendar day (ignoring time) to handle timezone properly
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = nowDay.getTime() - dateDay.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays === 0) return t('common.today');
    if (diffDays === 1) return t('common.yesterday');
    if (diffDays < 7 && diffDays > 0) return t('common.daysAgo', { count: diffDays });
    
    // Format as localized date for older entries
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#10B981';
    if (score >= 80) return '#3B82F6';
    if (score >= 70) return '#F59E0B';
    return '#EF4444';
  };

  const handleSessionPress = (session: SessionHistory) => {
    setSelectedSessionId(session.id);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedSessionId(null);
  };

  const renderSession = ({ item, index }: { item: SessionHistory; index: number }) => (
    <FadeIn delay={index * 60}>
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={() => handleSessionPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.sessionHeader}>
        <View style={styles.sessionLeft}>
          <View style={[styles.subjectIcon, { backgroundColor: `${getScoreColor(item.score)}20` }]}>
            <Ionicons name="school" size={24} color={getScoreColor(item.score)} />
          </View>
          <View style={styles.sessionInfo}>
            <Text style={styles.subjectName}>
              {item.subject_name ? t(`subjects.${getSubjectTranslationKey(item.subject_name)}`) : t('common.unknown')}
            </Text>
            <Text style={styles.sessionDate}>{formatDate(item.completed_at)}</Text>
          </View>
        </View>
        <View style={styles.sessionRight}>
          <Text style={[styles.scoreText, { color: getScoreColor(item.score) }]}>
            {item.score}%
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
      </View>

      <View style={styles.sessionStats}>
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.statText}>
            {item.correct_answers}/{item.total_questions}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="time" size={16} color={colors.textSecondary} />
          <Text style={styles.statText}>{formatTime(item.time_spent_seconds)}</Text>
        </View>
      </View>
    </TouchableOpacity>
    </FadeIn>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('competitive.loadingHistory')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('competitive.sessionHistory')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{averageScore}%</Text>
          <Text style={styles.summaryLabel}>{t('competitive.averageScore')}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalSessions}</Text>
          <Text style={styles.summaryLabel}>{t('competitive.totalSessions')}</Text>
        </View>
      </View>

      {/* Filter Button */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="filter" size={20} color={colors.primary} />
          <Text style={styles.filterButtonText}>
            {filter === 'all' ? t('competitive.all') : t(`subjects.${getSubjectTranslationKey(filter)}`)}
          </Text>
          {filter !== 'all' && <View style={styles.filterBadge} />}
          <Ionicons name="chevron-down" size={16} color={colors.primary} style={styles.chevron} />
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      {filteredSessions.length > 0 ? (
        <FlatList
          data={filteredSessions}
          renderItem={renderSession}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color={colors.border} />
          <Text style={styles.emptyTitle}>{t('competitive.noSessionsYet')}</Text>
          <Text style={styles.emptyText}>
            {t('competitive.noSessionsDescription')}
          </Text>
        </View>
      )}

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('competitive.filterBySubject')}</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* All Option */}
              <TouchableOpacity
                style={[
                  styles.subjectOption,
                  filter === 'all' && styles.subjectOptionSelected,
                ]}
                onPress={() => {
                  setFilter('all');
                  setShowFilters(false);
                }}
              >
                <Text
                  style={[
                    styles.subjectOptionText,
                    filter === 'all' && styles.subjectOptionTextSelected,
                  ]}
                >
                  {t('competitive.all')}
                </Text>
                {filter === 'all' && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>

              {/* Subject Options */}
              {uniqueSubjects.map(subject => (
                <TouchableOpacity
                  key={subject}
                  style={[
                    styles.subjectOption,
                    filter === subject && styles.subjectOptionSelected,
                  ]}
                  onPress={() => {
                    setFilter(subject);
                    setShowFilters(false);
                  }}
                >
                  <Text
                    style={[
                      styles.subjectOptionText,
                      filter === subject && styles.subjectOptionTextSelected,
                    ]}
                  >
                    {t(`subjects.${getSubjectTranslationKey(subject)}`)}
                  </Text>
                  {filter === subject && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Session Details Modal */}
      <SessionDetailsModal
        visible={modalVisible}
        sessionId={selectedSessionId}
        onClose={handleCloseModal}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    loadingText: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
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
    backButton: {
      padding: spacing.xs,
    },
    headerTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    summaryContainer: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.md,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: typography.fontSizes.xxl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    summaryLabel: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    filterBar: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    filterButtonText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.medium,
      color: colors.text,
    },
    filterBadge: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    chevron: {
      marginLeft: spacing.xs,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    modalBody: {
      paddingVertical: spacing.sm,
    },
    subjectOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    subjectOptionSelected: {
      backgroundColor: colors.surface,
    },
    subjectOptionText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.medium,
      color: colors.text,
    },
    subjectOptionTextSelected: {
      color: colors.primary,
      fontWeight: typography.fontWeights.semibold,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    sessionCard: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sessionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sessionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      flex: 1,
    },
    subjectIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sessionInfo: {
      flex: 1,
    },
    subjectName: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    sessionDate: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sessionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    scoreText: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
    },
    sessionStats: {
      flexDirection: 'row',
      gap: spacing.lg,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    statText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      marginTop: spacing.lg,
    },
    emptyText: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
