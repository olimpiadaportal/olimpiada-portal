import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, borderRadius } from '../constants/theme';
import { studentTeacherService, StudentTeacher } from '../services/studentTeacherService';
import { scoringService } from '../services/scoringService';
import { referenceDataService } from '../services/referenceDataService';
import { LoadingSkeleton } from './LoadingSkeleton';
import { StatusBadge } from './ui';

interface LeaderboardUserDetailsModalProps {
  visible: boolean;
  studentId: string | null;
  studentName: string;
  onClose: () => void;
}

interface UserDetails {
  eloRating: number;
  monthlyScore: number;
  activityMultiplier: number;
  currentStreak: number;
  teachers: StudentTeacher[];
}

export const LeaderboardUserDetailsModal: React.FC<LeaderboardUserDetailsModalProps> = ({
  visible,
  studentId,
  studentName,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [cities, setCities] = useState<Array<{ name: string; name_az: string }>>([]);

  useEffect(() => {
    loadCities();
  }, []);

  useEffect(() => {
    if (visible && studentId) {
      loadUserDetails();
    } else {
      setDetails(null);
    }
  }, [visible, studentId]);

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const getCityDisplayName = (englishName: string | null): string => {
    if (!englishName) return '';
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  const loadUserDetails = async () => {
    if (!studentId) return;

    try {
      setLoading(true);
      const [teachers, scoreData] = await Promise.all([
        studentTeacherService.getStudentTeachers(studentId),
        scoringService.getScoreDataForStudent(studentId),
      ]);

      setDetails({
        eloRating: scoreData?.eloRating || 1000,
        monthlyScore: scoreData?.monthlyScore || 0,
        activityMultiplier: scoreData?.activityMultiplier || 1.0,
        currentStreak: scoreData?.currentStreak || 0,
        teachers: teachers,
      });
    } catch (error) {
      console.error('Error loading user details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierInfo = (elo: number) => {
    return scoringService.getELOTier(elo);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="person-circle" size={32} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>{studentName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <LoadingSkeleton width="45%" height={18} />
                <LoadingSkeleton width="100%" height={96} borderRadius={borderRadius.lg} />
                <LoadingSkeleton width="100%" height={78} borderRadius={borderRadius.lg} />
                <LoadingSkeleton width="100%" height={112} borderRadius={borderRadius.lg} />
              </View>
            ) : details ? (
              <>
                {/* ELO Rating Card */}
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {t('leaderboard.title')}
                    </Text>
                    <StatusBadge label={getTierInfo(details.eloRating).name} variant="info" />
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('profile.eloRating')}
                      </Text>
                      <Text
                        style={[
                          styles.statValue,
                          { color: getTierInfo(details.eloRating).color },
                        ]}
                      >
                        {scoringService.formatELO(details.eloRating)}
                      </Text>
                    </View>
                    <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('leaderboard.points')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {details.monthlyScore.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {t('profile.multiplier')}
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {details.activityMultiplier.toFixed(2)}×
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Streak Card */}
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="flame" size={20} color="#F59E0B" />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {t('common.streak')}
                    </Text>
                  </View>
                  <Text style={[styles.streakValue, { color: colors.text }]}>
                    {details.currentStreak} {t('common.days')}
                  </Text>
                  <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                    {t('leaderboard.officialOnlyNote')}
                  </Text>
                </View>

                {/* Teachers Card */}
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="school" size={20} color={colors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {t('myTeachers.title')}
                    </Text>
                  </View>
                  {details.teachers.length > 0 ? (
                    details.teachers.map((teacher, index) => (
                      <View
                        key={index}
                        style={[
                          styles.teacherItem,
                          index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                        ]}
                      >
                        <View style={styles.teacherSubject}>
                          <Ionicons name="book" size={16} color={colors.primary} />
                          <Text style={[styles.teacherSubjectText, { color: colors.text }]}>
                            {teacher.subject_name}
                          </Text>
                        </View>
                        <View style={styles.teacherInfo}>
                          <Ionicons name="person" size={14} color={colors.textSecondary} />
                          <Text style={[styles.teacherName, { color: colors.textSecondary }]}>
                            {teacher.teacher_name}
                          </Text>
                          {getCityDisplayName(teacher.teacher_city) ? (
                            <Text style={[styles.teacherCity, { color: colors.textSecondary }]}>
                              ({getCityDisplayName(teacher.teacher_city)})
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {t('myTeachers.noTeacher')}
                    </Text>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.text }]}>
                  {t('common.error')}
                </Text>
              </View>
            )}
          </ScrollView>
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  tierBadge: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  statsRow: {
    gap: spacing.sm,
  },
  statItem: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 16,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statDivider: {
    display: 'none',
  },
  streakValue: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  teacherItem: {
    paddingVertical: spacing.sm,
  },
  teacherSubject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  teacherSubjectText: {
    fontSize: 14,
    fontWeight: '600',
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginLeft: spacing.lg,
  },
  teacherName: {
    fontSize: 13,
  },
  teacherCity: {
    fontSize: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: spacing.md,
  },
  loadingContainer: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
