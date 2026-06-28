// Bookmarked Questions Screen
// Dark mode support added - Phase 2

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { practiceService } from '../../services/practiceService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { BookmarkedQuestion } from '../../types/practice';
import { Card } from '../../components/Card';
import { useTranslation } from 'react-i18next';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';
import { FadeIn } from '../../components/animated';

export const BookmarkedQuestionsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showConfirm } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    if (!user?.id) return;

    try {
      const data = await practiceService.getBookmarkedQuestions(user.id);
      setBookmarks(data);
    } catch (error) {
      console.error('Load bookmarks error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBookmarks();
  };

  const handleRemoveBookmark = async (bookmark: BookmarkedQuestion) => {
    if (!user?.id) return;

    showConfirm(
      'Remove Bookmark',
      'Are you sure you want to remove this bookmark?',
      async () => {
        const success = await practiceService.removeBookmark(user.id, bookmark.question_id);
        if (success) {
          setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
        }
      },
      undefined,
      'Remove',
      'Cancel'
    );
  };

  const renderBookmarkCard = ({ item, index }: { item: BookmarkedQuestion; index: number }) => {
    if (!item.question) return null;

    return (
      <FadeIn delay={index * 70} duration={350}>
      <Card style={styles.bookmarkCard}>
        <View style={styles.cardHeader}>
          <View style={styles.subjectBadge}>
            <Text style={styles.subjectBadgeText}>
              {item.question.subject_name || 'Subject'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => handleRemoveBookmark(item)}>
            <Ionicons name="bookmark" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.questionText} numberOfLines={3}>
          {item.question.question_text}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.difficultyBadge}>
            <Text style={styles.difficultyText}>{item.question.difficulty_level}</Text>
          </View>
          <Text style={styles.dateText}>
            {formatShortDate(item.created_at, t('common.locale'))}
          </Text>
        </View>

        {item.notes && (
          <View style={styles.notesContainer}>
            <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.practiceButton}>
          <Text style={styles.practiceButtonText}>Practice This Question</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </Card>
      </FadeIn>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="bookmark-outline" size={64} color={colors.textTertiary} />
      <Text style={styles.emptyText}>No bookmarked questions</Text>
      <Text style={styles.emptySubtext}>
        Bookmark questions while practicing to save them for later review
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Bookmarked Questions</Text>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>{bookmarks.length}</Text>
        </View>
      </View>

      <FlatList
        data={bookmarks}
        renderItem={renderBookmarkCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    minWidth: 32,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  bookmarkCard: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subjectBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  subjectBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.primary,
  },
  questionText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  difficultyBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  difficultyText: {
    fontSize: typography.fontSizes.xs,
    color: colors.warning,
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  notesText: {
    flex: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  practiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  practiceButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
