import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { searchService } from '../../services/searchService';
import {
  SearchResult,
  SearchCategory,
  SearchHistory,
  SearchSuggestion,
} from '../../types/search';
import { spacing, typography, borderRadius, shadows } from '../../constants/theme';
import { EmptyState } from '../../components/EmptyState';
import { FadeIn } from '../../components/animated/FadeIn';
import { ScaleButton } from '../../components/animated/ScaleButton';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

export const GlobalSearchScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRequestRef = useRef(0);

  // Load search history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch();
      } else {
        searchRequestRef.current += 1;
        setResults([]);
        setLoading(false);
        setShowSuggestions(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, category]);

  // Load suggestions when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuggestions();
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const loadHistory = async () => {
    const data = await searchService.getSearchHistory();
    setHistory(data);
  };

  const loadSuggestions = async () => {
    const data = await searchService.getSuggestions(query);
    setSuggestions(data);
  };

  const performSearch = async () => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setLoading(true);
    setShowSuggestions(false);

    try {
      let searchResults: SearchResult[] = [];

      switch (category) {
        case 'all':
          searchResults = await searchService.searchAll(query);
          break;
        case 'teachers':
          searchResults = await searchService.searchTeachers(query);
          break;
        case 'subjects':
          searchResults = await searchService.searchSubjects(query);
          break;
        case 'exams':
          searchResults = await searchService.searchExams(query);
          break;
      }

      if (requestId !== searchRequestRef.current) {
        return;
      }

      setResults(searchResults);
      
      // Save to history
      if (query.trim()) {
        await searchService.saveSearch(query, category);
        loadHistory();
      }
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        console.error('Search error:', error);
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const handleResultPress = (result: SearchResult) => {
    switch (result.type) {
      case 'teacher':
        (navigation as any).navigate('TeacherProfile', { teacherId: result.id });
        break;
      case 'subject':
        // Navigate directly to SubjectDetail in Practice stack.
        // The detail screen can hydrate progress with partial subject metadata.
        const subject = result.metadata || { id: result.id, name_en: result.title };
        (navigation as any).navigate('Practice', {
          screen: 'SubjectDetail',
          params: { 
            subject,
            returnTo: 'Teachers'
          }
        });
        break;
      case 'exam':
        // Navigate directly to MockExamDetails in MockExams stack
        (navigation as any).navigate('MockExams', {
          screen: 'MockExamDetails',
          params: { 
            examId: result.id,
            returnTo: 'Teachers'
          }
        });
        break;
    }
  };

  const handleHistoryPress = (item: SearchHistory) => {
    setQuery(item.query);
    setCategory(item.category);
  };

  const handleRemoveHistory = async (id: string) => {
    await searchService.removeSearchHistoryItem(id);
    loadHistory();
  };

  const handleClearHistory = async () => {
    await searchService.clearSearchHistory();
    setHistory([]);
  };

  const handleSuggestionPress = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
  };

  const categories: { key: SearchCategory; label: string }[] = [
    { key: 'all', label: t('search.categories.all') },
    { key: 'teachers', label: t('search.categories.teachers') },
    { key: 'subjects', label: t('search.categories.subjects') },
    { key: 'exams', label: t('search.categories.exams') },
  ];

  const renderCategoryChip = (cat: { key: SearchCategory; label: string }) => {
    const isSelected = category === cat.key;
    return (
      <TouchableOpacity
        key={cat.key}
        style={[
          styles.categoryChip,
          {
            backgroundColor: isSelected ? colors.primary : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
          },
        ]}
        onPress={() => setCategory(cat.key)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.categoryText,
            { color: isSelected ? '#FFFFFF' : colors.text },
          ]}
        >
          {cat.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderResult = ({ item, index }: { item: SearchResult; index: number }) => (
    <FadeIn delay={index * 30} duration={250}>
      <ScaleButton
        style={[styles.resultItem, { backgroundColor: colors.surface }, shadows.sm]}
        onPress={() => handleResultPress(item)}
        scaleValue={0.98}
      >
        {item.type === 'teacher' && item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.resultAvatar}
          />
        ) : (
          <View style={[styles.resultIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons
              name={
                item.type === 'teacher'
                  ? 'person'
                  : item.type === 'subject'
                  ? 'book'
                  : 'document-text'
              }
              size={24}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.resultContent}>
          <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle && (
            <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.subtitle}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
      </ScaleButton>
    </FadeIn>
  );

  const renderHistoryItem = ({ item }: { item: SearchHistory }) => (
    <View style={[styles.historyItem, { backgroundColor: colors.surface }]}>
      <TouchableOpacity
        style={styles.historyContent}
        onPress={() => handleHistoryPress(item)}
        activeOpacity={0.7}
      >
        <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.historyText, { color: colors.text }]}>
          {item.query}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleRemoveHistory(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const renderSuggestion = ({ item }: { item: SearchSuggestion }) => (
    <TouchableOpacity
      style={[styles.suggestionItem, { backgroundColor: colors.surface }]}
      onPress={() => handleSuggestionPress(item)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={item.type === 'recent' ? 'time-outline' : 'search'}
        size={18}
        color={colors.textSecondary}
      />
      <Text style={[styles.suggestionText, { color: colors.text }]}>
        {item.text}
      </Text>
    </TouchableOpacity>
  );

  const renderSearchSkeletons = () => (
    <View style={styles.listContent}>
      {[0, 1, 2, 3].map(item => (
        <View
          key={item}
          style={[styles.resultItem, styles.skeletonItem, { backgroundColor: colors.surface }]}
        >
          <LoadingSkeleton width={48} height={48} borderRadius={24} />
          <View style={styles.skeletonTextBlock}>
            <LoadingSkeleton width="72%" height={18} />
            <LoadingSkeleton width="48%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.sm]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setShowSuggestions(true)}
          autoFocus
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map(renderCategoryChip)}
      </ScrollView>

      {/* Content */}
      {showSuggestions && query.length < 2 ? (
        // Recent Searches
        <View style={styles.content}>
          {history.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('search.recentSearches')}
                </Text>
                <TouchableOpacity onPress={handleClearHistory}>
                  <Text style={[styles.clearText, { color: colors.primary }]}>
                    {t('search.clearAll')}
                  </Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={history}
                renderItem={renderHistoryItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
              />
            </>
          )}
        </View>
      ) : showSuggestions && suggestions.length > 0 ? (
        // Suggestions
        <FlatList
          data={suggestions}
          renderItem={renderSuggestion}
          keyExtractor={(item, index) => `${item.text}-${index}`}
          contentContainerStyle={styles.listContent}
        />
      ) : loading ? (
        renderSearchSkeletons()
      ) : results.length > 0 ? (
        // Results
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.listContent}
        />
      ) : query.length >= 2 ? (
        // No Results
        <EmptyState
          icon="search-outline"
          title={t('search.noResults')}
          description={t('search.noResultsDesc', { query })}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    paddingVertical: spacing.xs,
  },
  categoriesContainer: {
    marginBottom: spacing.md,
    maxHeight: 50,
  },
  categoriesContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  content: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  clearText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  skeletonItem: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  skeletonTextBlock: {
    flex: 1,
    gap: spacing.sm,
  },
  resultIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  resultContent: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  resultSubtitle: {
    fontSize: typography.fontSizes.sm,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  historyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyText: {
    fontSize: typography.fontSizes.md,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  suggestionText: {
    fontSize: typography.fontSizes.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
