import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation as useNav } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { teacherService } from '../../services/teacherService';
import { referenceDataService } from '../../services/referenceDataService';
import { TeacherWithDetails } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useAlert } from '../../components/AlertProvider';
import { TeacherCard } from '../../components/TeacherCard';
import { TeacherCardSkeleton } from '../../components/skeletons/TeacherCardSkeleton';
import { EmptyState } from '../../components/EmptyState';

type FavoriteTeachersScreenNavigationProp = StackNavigationProp<any, 'FavoriteTeachers'>;

interface Props {
  navigation?: FavoriteTeachersScreenNavigationProp;
}

type FavoritesCacheEntry = {
  teachers: TeacherWithDetails[];
  timestamp: number;
};

const FAVORITES_CACHE_MS = 60_000;
const favoritesCache = new Map<string, FavoritesCacheEntry>();

export const FavoriteTeachersScreen: React.FC<Props> = ({ navigation: navProp }) => {
  const { t } = useTranslation();
  const navigation = navProp || useNav<FavoriteTeachersScreenNavigationProp>();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError, showConfirm } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [teachers, setTeachers] = useState<TeacherWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cities, setCities] = useState<any[]>([]);

  const loadFavorites = useCallback(async (silent = false, force = false) => {
    const userId = user?.id || '';
    if (!userId) {
      setTeachers([]);
      setLoading(false);
      return;
    }

    const cached = favoritesCache.get(userId);
    const hasFreshCache = cached && Date.now() - cached.timestamp < FAVORITES_CACHE_MS;

    if (!force && hasFreshCache) {
      setTeachers(cached.teachers);
      setLoading(false);
      void loadFavorites(true, true);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }

      const data = await teacherService.getFavoriteTeachers(userId);
      favoritesCache.set(userId, { teachers: data, timestamp: Date.now() });
      setTeachers(data);
    } catch (error) {
      console.error('Load favorites error:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    void loadFavorites();
    void loadCities();
  }, [loadFavorites]);

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const getCityDisplayName = useCallback((englishName: string): string => {
    if (!englishName) return '';
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  }, [cities]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFavorites(true, true);
    setRefreshing(false);
  };

  const handleRemoveFavorite = useCallback((teacher: TeacherWithDetails) => {
    showConfirm(
      t('teachers.favorites.removeFavorite'),
      t('teachers.favorites.removeFavoriteConfirm', { name: teacher.full_name }),
      async () => {
        try {
          await teacherService.toggleFavorite(user?.id || '', teacher.id);
          const nextTeachers = teachers.filter(t => t.id !== teacher.id);
          setTeachers(nextTeachers);
          if (user?.id) {
            favoritesCache.set(user.id, { teachers: nextTeachers, timestamp: Date.now() });
          }
          showSuccess(t('common.success'), t('teachers.favorites.removedFromFavorites'));
        } catch (error) {
          console.error('Remove favorite error:', error);
          showError(t('common.error'), t('teachers.favorites.failedToRemove'));
        }
      },
      undefined,
      t('common.remove'),
      t('common.cancel')
    );
  }, [showConfirm, showError, showSuccess, t, teachers, user?.id]);

  const renderTeacherCard = useCallback(({ item }: { item: TeacherWithDetails }) => (
    <TeacherCard
      teacher={item}
      onPress={(teacherId) => navigation.navigate('TeacherProfile', { teacherId })}
      getCityDisplayName={getCityDisplayName}
      headerAction={(
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => handleRemoveFavorite(item)}
          accessibilityRole="button"
          accessibilityLabel={t('teachers.favorites.removeFavorite')}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="heart" size={19} color={colors.secondary} />
        </TouchableOpacity>
      )}
    />
  ), [colors.secondary, getCityDisplayName, handleRemoveFavorite, navigation, styles, t]);

  const renderEmptyState = () => (
    <EmptyState
      icon="heart-outline"
      title={t('teachers.favorites.noFavorites')}
      description={t('teachers.favorites.noFavoritesDesc')}
      actionLabel={t('teachers.favorites.findTeachers')}
      onAction={() => navigation.navigate('TeachersList')}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {t('teachers.favorites.title')}
        </Text>
        <View style={styles.headerIconSpacer} />
      </View>

      {!loading && teachers.length > 0 && (
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {t('teachers.favorites.count', { count: teachers.length })}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.listContent}>
          <TeacherCardSkeleton />
          <TeacherCardSkeleton />
          <TeacherCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={teachers}
          renderItem={renderTeacherCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerIconSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: spacing.md,
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  countContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  countText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  listContent: {
    padding: spacing.lg,
  },
  favoriteButton: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    padding: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
