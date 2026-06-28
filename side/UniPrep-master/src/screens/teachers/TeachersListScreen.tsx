import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation as useNav, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { teacherService } from '../../services/teacherService';
import { referenceDataService, City } from '../../services/referenceDataService';
import { TeacherWithDetails, TeacherFilters, ExamGroup, TeacherRecommendation, RecommendationReason } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useMessagingStore } from '../../store/messagingStore';
import { supabase } from '../../services/supabase';
import { translateSubject } from '../../utils/subjectTranslation';
import { TeacherCardSkeleton } from '../../components/skeletons/TeacherCardSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { TeacherCard } from '../../components/TeacherCard';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineScreen } from '../../components/OfflineScreen';
import { AppPressable, ChoiceChip, SectionHeader } from '../../components/ui';
import { Button } from '../../components/Button';

type TeachersListScreenNavigationProp = StackNavigationProp<any, 'TeachersList'>;
type TeachersListScreenRouteProp = RouteProp<{ params: { subject?: string } }, 'params'>;

interface Props {
  navigation?: TeachersListScreenNavigationProp;
  route?: TeachersListScreenRouteProp;
}

export const TeachersListScreen = ({ navigation: navProp, route }: Props) => {
  const { t } = useTranslation();
  const navigation = navProp || useNav<TeachersListScreenNavigationProp>();
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // Get subject from route params if navigated from search
  const initialSubject = route?.params?.subject;
  const { unreadCount } = useMessagingStore();
  
  const [cities, setCities] = useState<City[]>([]);
  const [teachers, setTeachers] = useState<TeacherWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  
  // Filter states
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    initialSubject ? [initialSubject] : []
  );
  const [selectedGroups, setSelectedGroups] = useState<ExamGroup[]>([]);
  const [minRating, setMinRating] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [draftSubjects, setDraftSubjects] = useState<string[]>(
    initialSubject ? [initialSubject] : []
  );
  const [draftGroups, setDraftGroups] = useState<ExamGroup[]>([]);
  const [draftMinRating, setDraftMinRating] = useState<number | undefined>();
  const [draftMaxPrice, setDraftMaxPrice] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<TeacherFilters['sort_by']>('rating');
  
  // Messaging states
  const [studentId, setStudentId] = useState<string | null>(null);

  // Recommendation state
  const [recommendedTeachers, setRecommendedTeachers] = useState<TeacherRecommendation[]>([]);

  const GROUPS: ExamGroup[] = ['I', 'II', 'III', 'IV', 'V'];

  const SORT_OPTIONS: { value: TeacherFilters['sort_by']; label: string }[] = [
    { value: 'rating', label: t('teachers.sortOptions.rating') },
    { value: 'price_low', label: t('teachers.sortOptions.priceLow') },
    { value: 'price_high', label: t('teachers.sortOptions.priceHigh') },
    { value: 'experience', label: t('teachers.sortOptions.experience') },
    { value: 'reviews', label: t('teachers.sortOptions.reviews') },
  ];

  const subjectOptions = useMemo(() => {
    const availableSubjects = teachers.flatMap(teacher => teacher.specializations || []);
    const options = new Set(availableSubjects);

    if (initialSubject) {
      options.add(initialSubject);
    }

    return Array.from(options).sort((left, right) =>
      translateSubject(left, t).localeCompare(translateSubject(right, t))
    );
  }, [teachers, initialSubject, t]);

  const hasAppliedFilters = Boolean(
    selectedSubjects.length || selectedGroups.length || minRating || maxPrice
  );
  const hasAnyConstraints = Boolean(searchQuery.trim() || hasAppliedFilters);
  const activeFilterCount =
    selectedSubjects.length +
    selectedGroups.length +
    (minRating ? 1 : 0) +
    (maxPrice ? 1 : 0);
  const selectedSortLabel = SORT_OPTIONS.find(opt => opt.value === sortBy)?.label || t('teachers.sortOptions.rating');

  useEffect(() => {
    loadCities();
    loadTeachers();
  }, []);

  const fetchStudentId = async () => {
    if (!user?.id) return null;

    try {
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentData) {
        return studentData.id;
      }
    } catch (error) {
      console.error('Error loading student ID:', error);
    }

    return null;
  };

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  // Convert English city name to Azerbaijani for display
  const getCityDisplayName = (englishName: string): string => {
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  // Reload data when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTeachers();
      // Unread count automatically updated by global messaging store
    });

    return unsubscribe;
  }, [navigation]);

  // Optimize filtering with useMemo instead of useEffect
  const filteredTeachers = useMemo(() => {
    let filtered = [...teachers];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLocaleLowerCase();
      filtered = filtered.filter(teacher =>
        teacher.full_name.toLocaleLowerCase().includes(query) ||
        (teacher.bio || '').toLocaleLowerCase().includes(query) ||
        teacher.specializations.some(subject =>
          translateSubject(subject, t).toLocaleLowerCase().includes(query)
        )
      );
    }

    // Subject filter
    if (selectedSubjects.length > 0) {
      filtered = filtered.filter(teacher =>
        selectedSubjects.some(subject => teacher.specializations.includes(subject))
      );
    }

    // Group filter
    if (selectedGroups.length > 0) {
      filtered = filtered.filter(teacher =>
        selectedGroups.some(group => teacher.available_groups.includes(group))
      );
    }

    // Rating filter
    if (minRating) {
      filtered = filtered.filter(teacher => teacher.rating >= minRating);
    }

    // Price filter
    if (maxPrice) {
      filtered = filtered.filter(teacher => teacher.hourly_rate <= maxPrice);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return b.rating - a.rating;
        case 'price_low':
          return a.hourly_rate - b.hourly_rate;
        case 'price_high':
          return b.hourly_rate - a.hourly_rate;
        case 'experience':
          return (b.experience_years || 0) - (a.experience_years || 0);
        case 'reviews':
          return b.total_reviews - a.total_reviews;
        default:
          return 0;
      }
    });

    return filtered;
  }, [teachers, searchQuery, selectedSubjects, selectedGroups, minRating, maxPrice, sortBy, t]);

  const loadTeachers = async () => {
    try {
      setLoading(true);
      const teachersPromise = teacherService.getTeachers(user?.id || '', {
        sort_by: sortBy,
      });
      const studentIdPromise = studentId ? Promise.resolve(studentId) : fetchStudentId();
      const [data, resolvedStudentId] = await Promise.all([teachersPromise, studentIdPromise]);

      if (resolvedStudentId && resolvedStudentId !== studentId) {
        setStudentId(resolvedStudentId);
      }

      setTeachers([...data]);

      if (resolvedStudentId && data.length > 0) {
        void loadRecommendations(data, resolvedStudentId);
      } else {
        setRecommendedTeachers([]);
      }
    } catch (error) {
      console.error('Load teachers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async (teachersList: TeacherWithDetails[], sId: string) => {
    try {
      const recs = await teacherService.getRecommendedTeachers(sId, teachersList);
      setRecommendedTeachers(recs);
    } catch (error) {
      console.error('Load recommendations error:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeachers();
    // Unread count automatically updated by global messaging store
    setRefreshing(false);
  };

  // Removed old applyFilters function - now using useMemo above

  const clearAppliedFilters = () => {
    setSelectedSubjects([]);
    setSelectedGroups([]);
    setMinRating(undefined);
    setMaxPrice(undefined);
    setDraftSubjects([]);
    setDraftGroups([]);
    setDraftMinRating(undefined);
    setDraftMaxPrice(undefined);
    setShowFilters(false);
  };

  const clearAllConstraints = () => {
    setSearchQuery('');
    clearAppliedFilters();
    setSortBy('rating');
  };

  const openFilters = () => {
    setDraftSubjects(selectedSubjects);
    setDraftGroups(selectedGroups);
    setDraftMinRating(minRating);
    setDraftMaxPrice(maxPrice);
    setShowFilters(true);
  };

  const toggleDraftSubject = (subject: string) => {
    setDraftSubjects(current =>
      current.includes(subject)
        ? current.filter(item => item !== subject)
        : [...current, subject]
    );
  };

  const toggleDraftGroup = (group: ExamGroup) => {
    setDraftGroups(current =>
      current.includes(group)
        ? current.filter(item => item !== group)
        : [...current, group]
    );
  };

  const applyDraftFilters = () => {
    setSelectedSubjects(draftSubjects);
    setSelectedGroups(draftGroups);
    setMinRating(draftMinRating);
    setMaxPrice(draftMaxPrice);
    setShowFilters(false);
  };

  // Memoized handler for teacher card press
  const handleTeacherPress = useCallback((teacherId: string) => {
    navigation.navigate('TeacherProfile', { teacherId });
  }, [navigation]);

  // Translate structured recommendation reasons
  const translateReason = useCallback((reason: RecommendationReason): string => {
    switch (reason.type) {
      case 'weak_subjects':
        return t('teachers.reasons.weakSubjects', { subjects: reason.params?.subjects });
      case 'group_match':
        return t('teachers.reasons.groupMatch', { group: reason.params?.group });
      case 'group_subjects':
        return t('teachers.reasons.groupSubjects', { group: reason.params?.group, subjects: reason.params?.subjects });
      case 'same_city':
        return t('teachers.reasons.sameCity');
      case 'high_rating':
        return t('teachers.reasons.highRating', { rating: reason.params?.rating });
      case 'verified':
        return t('teachers.reasons.verified');
      default:
        return '';
    }
  }, [t]);

  // Get match score badge color based on score tier
  const getMatchColor = useCallback((score: number) => {
    if (score >= 75) return { bg: '#10B981', text: '#FFFFFF' }; // green — excellent
    if (score >= 50) return { bg: '#3B82F6', text: '#FFFFFF' }; // blue — good
    return { bg: '#F59E0B', text: '#FFFFFF' }; // amber — fair
  }, []);

  // Get accent border color for recommended cards based on top reason
  const getCardAccent = useCallback((reasons: RecommendationReason[]) => {
    if (reasons.length === 0) return colors.border;
    const top = reasons[0].type;
    if (top === 'weak_subjects') return '#EF4444'; // red — targets weakness
    if (top === 'group_match' || top === 'group_subjects') return '#8B5CF6'; // purple — group aligned
    if (top === 'same_city') return '#10B981'; // green — local
    return colors.primary;
  }, [colors]);

  // Render recommended teachers section
  const renderRecommendedSection = useCallback(() => {
    if (recommendedTeachers.length === 0 || searchQuery.trim() || hasAppliedFilters) {
      return null;
    }

    return (
      <View style={styles.recommendedSection}>
        <SectionHeader
          title={t('teachers.recommendedForYou')}
          icon="sparkles-outline"
          style={styles.recommendedHeader}
        />
        <FlatList
          data={recommendedTeachers}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => `rec-${item.teacher.id}`}
          contentContainerStyle={styles.recommendedList}
          renderItem={({ item }) => {
            const matchColor = getMatchColor(item.match_score);
            const accentColor = getCardAccent(item.reasons);
            return (
            <AppPressable
              style={[styles.recommendedCard, { borderTopColor: accentColor, borderTopWidth: 3 }]}
              onPress={() => handleTeacherPress(item.teacher.id)}
              accessibilityLabel={item.teacher.full_name}
            >
              <View style={styles.recommendedCardHeader}>
                {item.teacher.avatar_url ? (
                  <Image source={{ uri: item.teacher.avatar_url }} style={styles.recommendedAvatar} />
                ) : (
                  <View style={[styles.recommendedAvatar, styles.recommendedAvatarPlaceholder]}>
                    <Ionicons name="person" size={20} color={colors.textSecondary} />
                  </View>
                )}
                <View style={[styles.recommendedMatchBadge, { backgroundColor: matchColor.bg }]}>
                  <Text style={[styles.recommendedMatchText, { color: matchColor.text }]}>
                    {t('teachers.matchPercent', { score: item.match_score })}
                  </Text>
                </View>
              </View>
              <Text style={styles.recommendedName} numberOfLines={1}>
                {item.teacher.full_name}
              </Text>
              <View style={styles.recommendedRating}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.recommendedRatingText}>
                  {item.teacher.rating.toFixed(1)}
                </Text>
              </View>
              {item.reasons.length > 0 && (
                <Text style={[styles.recommendedReason, { color: getCardAccent(item.reasons) }]} numberOfLines={2}>
                  {translateReason(item.reasons[0])}
                </Text>
              )}
            </AppPressable>
            );
          }}
        />
      </View>
    );
  }, [
    recommendedTeachers,
    searchQuery,
    hasAppliedFilters,
    colors,
    t,
    handleTeacherPress,
    translateReason,
    getMatchColor,
    getCardAccent,
  ]);

  const renderTeacherCard = useCallback(({ item }: { item: TeacherWithDetails }) => (
    <TeacherCard
      teacher={item}
      onPress={handleTeacherPress}
      getCityDisplayName={getCityDisplayName}
    />
  ), [handleTeacherPress, cities]);

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.skeletonContainer}>
          <TeacherCardSkeleton />
          <TeacherCardSkeleton />
          <TeacherCardSkeleton />
        </View>
      );
    }

    return (
      <EmptyState
        icon="people-outline"
        title={t('teachers.title')}
        description={
          hasAnyConstraints
            ? t('teachers.adjustFilters')
            : t('teachers.noTeachersAvailable')
        }
        actionLabel={hasAnyConstraints ? t('teachers.clearFilters') : undefined}
        onAction={hasAnyConstraints ? clearAllConstraints : undefined}
      />
    );
  };

  // Remove initial loading screen - show skeletons in list instead

  // Show offline screen when offline
  if (!isOnline) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('teachers.findTeachers')}</Text>
          <View style={styles.headerIcons}>
            <AppPressable
              accessibilityLabel={t('teachers.favorites.title')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.headerIconButton}
              onPress={() => navigation.navigate('FavoriteTeachers')}
            >
              <Ionicons name="heart-outline" size={24} color={colors.text} />
            </AppPressable>
          </View>
        </View>
        <OfflineScreen 
          title={t('offline.teachersTitle', 'Teachers Unavailable')}
          message={t('offline.teachersMessage', 'Connect to the internet to browse and book teachers. You can still practice with downloaded questions.')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="people-outline"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('teachers.findTeachers')}
        </Text>
        <View style={styles.headerIcons}>
          {/* Search Icon */}
          <AppPressable
            accessibilityLabel={t('common.search')}
            compact
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('GlobalSearch' as never)}
          >
            <Ionicons name="search-outline" size={24} color={colors.text} />
          </AppPressable>

          {/* Messages Icon */}
          <AppPressable
            accessibilityLabel={t('messaging.conversations.title')}
            compact
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('ConversationsList')}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </AppPressable>
          
          {/* Favorites Icon */}
          <AppPressable
            accessibilityLabel={t('teachers.favorites.title')}
            compact
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('FavoriteTeachers')}
          >
            <Ionicons name="heart-outline" size={24} color={colors.text} />
          </AppPressable>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('teachers.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== '' && (
          <AppPressable
            accessibilityLabel={t('common.clear')}
            compact
            style={styles.searchClearButton}
            onPress={() => setSearchQuery('')}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </AppPressable>
        )}
      </View>

      {/* Filter & Sort Bar */}
      <View style={styles.filterBar}>
        <AppPressable
          accessibilityLabel={t('teachers.filters')}
          accessibilityState={{ selected: hasAppliedFilters }}
          style={[
            styles.filterButton,
            hasAppliedFilters && styles.filterButtonActive,
          ]}
          onPress={openFilters}
        >
          <Ionicons
            name="filter"
            size={20}
            color={hasAppliedFilters ? '#FFFFFF' : colors.primary}
          />
          <Text
            style={[
              styles.filterButtonText,
              hasAppliedFilters && styles.filterButtonTextActive,
            ]}
            numberOfLines={1}
          >
            {t('teachers.filters')}
          </Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </AppPressable>

        <AppPressable
          accessibilityLabel={`${t('teachers.sort')}: ${selectedSortLabel}`}
          wrapperStyle={styles.sortButtonWrapper}
          style={styles.sortButton}
          onPress={() => setShowSortModal(true)}
        >
          <Ionicons name="swap-vertical-outline" size={18} color={colors.primary} />
          <Text style={styles.sortButtonText} numberOfLines={1}>
            {selectedSortLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
        </AppPressable>
      </View>

      {/* Results Count */}
      <View style={styles.resultsContainer}>
        <Text
          accessibilityLiveRegion="polite"
          style={styles.resultsText}
          numberOfLines={1}
        >
          {t(filteredTeachers.length === 1 ? 'teachers.teacherFound' : 'teachers.teachersFound', { count: filteredTeachers.length })}
        </Text>
        {hasAppliedFilters && (
          <AppPressable
            accessibilityLabel={t('teachers.clearFilters')}
            style={styles.resultsActionTarget}
            onPress={clearAppliedFilters}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.resultsAction}>{t('teachers.clearFilters')}</Text>
          </AppPressable>
        )}
      </View>

      {/* Teachers List */}
      <FlatList
        data={filteredTeachers}
        renderItem={renderTeacherCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderRecommendedSection}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />

      {/* Filters Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('teachers.filters')}</Text>
              <AppPressable
                accessibilityLabel={t('common.close')}
                compact
                style={styles.modalCloseButton}
                onPress={() => setShowFilters(false)}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </AppPressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Subject Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('teachers.filterSections.subject')}</Text>
                <View style={styles.chipsContainer}>
                  {subjectOptions.map(subject => (
                    <ChoiceChip
                      key={subject}
                      label={translateSubject(subject, t)}
                      selected={draftSubjects.includes(subject)}
                      onPress={() => toggleDraftSubject(subject)}
                    />
                  ))}
                </View>
              </View>

              {/* Group Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('teachers.filterSections.targetGroup')}</Text>
                <View style={styles.groupsContainer}>
                  {GROUPS.map(group => (
                    <ChoiceChip
                      key={group}
                      label={`${t('common.group')} ${group}`}
                      selected={draftGroups.includes(group)}
                      onPress={() => toggleDraftGroup(group)}
                    />
                  ))}
                </View>
              </View>

              {/* Rating Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('teachers.filterSections.minimumRating')}</Text>
                <View style={styles.ratingContainer}>
                  {[1, 2, 3, 4, 5].map(rating => (
                    <ChoiceChip
                      key={rating}
                      label={`${rating}${rating < 5 ? '+' : ''}`}
                      icon="star"
                      accentColor="#F59E0B"
                      selected={draftMinRating === rating}
                      onPress={() =>
                        setDraftMinRating(draftMinRating === rating ? undefined : rating)
                      }
                    />
                  ))}
                </View>
              </View>

              {/* Price Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('teachers.filterSections.maximumPrice')}</Text>
                <View style={styles.priceChipsContainer}>
                  {[20, 30, 40, 50, 100].map(price => (
                    <ChoiceChip
                      key={price}
                      label={`${price} AZN`}
                      selected={draftMaxPrice === price}
                      onPress={() =>
                        setDraftMaxPrice(draftMaxPrice === price ? undefined : price)
                      }
                    />
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.modalFooterButton}>
                <Button
                  title={t('teachers.clearAll')}
                  variant="outline"
                  size="compact"
                  fullWidth
                  onPress={clearAppliedFilters}
                />
              </View>
              <View style={styles.modalFooterButton}>
                <Button
                  title={t('teachers.applyFilters')}
                  size="compact"
                  fullWidth
                  onPress={applyDraftFilters}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSortModal(false)}
      >
        <AppPressable
          style={styles.sortModalOverlay}
          haptic={false}
          pressedOpacity={1}
          accessibilityLabel={t('common.close')}
          onPress={() => setShowSortModal(false)}
        >
          <View style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>{t('teachers.sort')}</Text>
            <ScrollView style={styles.sortOptionsScroll} showsVerticalScrollIndicator={false}>
              {SORT_OPTIONS.map(option => (
                <AppPressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: sortBy === option.value }}
                  style={styles.sortOption}
                  onPress={() => {
                    setSortBy(option.value);
                    setShowSortModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      sortBy === option.value && styles.sortOptionTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </Text>
                  {sortBy === option.value && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </AppPressable>
              ))}
            </ScrollView>
          </View>
        </AppPressable>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  headerIconButton: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  searchClearButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginLeft: spacing.xs,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    backgroundColor: colors.surface,
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonWrapper: {
    flex: 1,
    minWidth: 0,
  },
  sortButtonText: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  resultsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  resultsText: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  resultsAction: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '700',
  },
  resultsActionTarget: {
    minHeight: 36,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  teacherCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  teacherName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ratingText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  sameCityBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  sameCityText: {
    fontSize: typography.fontSizes.xs,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  specializationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  specializationChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  specializationText: {
    fontSize: typography.fontSizes.xs,
    color: colors.text,
  },
  moreText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    alignSelf: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceContainer: {
    flex: 1,
  },
  priceLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  sessionMethodContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  sessionMethodText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  viewProfileText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  clearFiltersButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  clearFiltersText: {
    fontSize: typography.fontSizes.md,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
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
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    maxHeight: 430,
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterSectionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ratingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  priceChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalFooterButton: {
    flex: 1,
  },
  // Sort Modal styles
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    width: '80%',
    maxWidth: 300,
    padding: spacing.md,
  },
  sortModalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortOptionsScroll: {
    maxHeight: 300,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  sortOptionText: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    marginRight: spacing.sm,
  },
  sortOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Skeleton styles
  skeletonContainer: {
    paddingTop: spacing.sm,
  },
  // Recommended section styles
  recommendedSection: {
    marginBottom: spacing.lg,
  },
  recommendedHeader: {
    marginBottom: spacing.sm,
  },
  recommendedList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  recommendedCard: {
    width: 172,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  recommendedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  recommendedAvatarPlaceholder: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedMatchBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recommendedMatchText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  recommendedName: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  recommendedRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  recommendedRatingText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  recommendedReason: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
