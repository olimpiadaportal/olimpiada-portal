import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  SearchResult,
  TeacherSearchResult,
  SubjectSearchResult,
  ExamSearchResult,
  SearchCategory,
  SearchFilters,
  SearchHistory,
  SearchSuggestion,
} from '../types/search';
import { TeacherWithDetails } from '../types/teacher';

const SEARCH_HISTORY_KEY = '@uniprep_search_history';
const MAX_HISTORY_ITEMS = 10;

const SUBJECT_SEARCH_ALIASES: Record<string, string[]> = {
  'azerbaijani language': ['azerbaijani', 'azərbaycan dili', 'azerbaycan dili', 'ana dili', 'азербайджанский'],
  mathematics: ['math', 'riyaziyyat', 'matematika', 'математика'],
  physics: ['fizika', 'физика'],
  chemistry: ['kimya', 'химия'],
  biology: ['biologiya', 'биология'],
  geography: ['coğrafiya', 'cografiya', 'география'],
  history: ['tarix', 'история'],
  literature: ['ədəbiyyat', 'edebiyyat', 'литература'],
  'english language': ['english', 'ingilis dili', 'английский'],
  'russian language': ['russian', 'rus dili', 'русский'],
  'foreign language': ['foreign', 'xarici dil', 'иностранный'],
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const formatExamType = (examType?: string): string => {
  if (!examType) return 'Exam';

  return examType
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

class SearchService {
  /**
   * Search across all categories
   */
  async searchAll(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const [teachers, subjects, exams] = await Promise.all([
      this.searchTeachers(query, filters),
      this.searchSubjects(query),
      this.searchExams(query),
    ]);

    // Combine and limit results
    return [
      ...teachers.slice(0, 5),
      ...subjects.slice(0, 5),
      ...exams.slice(0, 5),
    ];
  }

  /**
   * Search teachers by name, bio, or specializations
   */
  async searchTeachers(
    query: string,
    filters?: SearchFilters
  ): Promise<TeacherSearchResult[]> {
    try {
      const searchTerm = query.trim().toLowerCase();

      // First get all teachers with their profiles
      const { data: allTeachers, error: fetchError } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles!inner(
            id,
            full_name,
            avatar_url,
            city
          )
        `)
        .order('rating', { ascending: false });

      if (fetchError) throw fetchError;

      // Filter in JavaScript since Supabase .or() doesn't support nested fields well
      let filtered = (allTeachers || []).filter((teacher: any) => {
        const fullName = teacher.profiles?.full_name?.toLowerCase() || '';
        const bio = teacher.bio?.toLowerCase() || '';
        const specializations = teacher.specializations?.map((s: string) => s.toLowerCase()).join(' ') || '';
        
        return fullName.includes(searchTerm) || 
               bio.includes(searchTerm) || 
               specializations.includes(searchTerm);
      });

      // Apply additional filters
      if (filters?.minRating) {
        filtered = filtered.filter((t: any) => t.rating >= filters.minRating!);
      }
      if (filters?.maxPrice) {
        filtered = filtered.filter((t: any) => t.hourly_rate <= filters.maxPrice!);
      }
      if (filters?.city) {
        filtered = filtered.filter((t: any) => t.profiles?.city === filters.city);
      }

      // Limit results
      filtered = filtered.slice(0, 20);

      return filtered.map((teacher: any) => ({
        id: teacher.id,
        type: 'teacher' as const,
        title: teacher.profiles.full_name,
        subtitle: `${teacher.rating.toFixed(1)} rating • ${teacher.hourly_rate} AZN/hr`,
        imageUrl: teacher.profiles.avatar_url,
        rating: teacher.rating,
        hourlyRate: teacher.hourly_rate,
        specializations: teacher.specializations || [],
        city: teacher.profiles.city,
        metadata: teacher,
      }));
    } catch (error) {
      console.error('Search teachers error:', error);
      return [];
    }
  }

  /**
   * Search subjects from Practice tab
   */
  async searchSubjects(query: string): Promise<SubjectSearchResult[]> {
    try {
      const searchTerm = query.trim().toLowerCase();

      const { data: subjects, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az');

      if (error) throw error;

      const normalizedTerm = normalizeSearchText(searchTerm);
      const filtered = (subjects || []).filter((subject: any) => {
        const englishName = subject.name_en || '';
        const key = englishName.toLowerCase();
        const aliases = SUBJECT_SEARCH_ALIASES[key] || [];
        const searchText = normalizeSearchText([
          englishName,
          subject.name_az,
          ...aliases,
        ].filter(Boolean).join(' '));

        return searchText.includes(normalizedTerm);
      });

      return filtered
        .map((subject: any) => ({
          id: subject.id,
          type: 'subject' as const,
          title: subject.name_en,
          subtitle: 'Practice',
          teacherCount: 0,
          examCount: 0,
          metadata: {
            id: subject.id,
            name_en: subject.name_en,
            name_az: subject.name_az,
          },
        }))
        .slice(0, 10);
    } catch (error) {
      console.error('Search subjects error:', error);
      return [];
    }
  }

  /**
   * Search mock exams
   */
  async searchExams(query: string): Promise<ExamSearchResult[]> {
    try {
      const searchTerm = query.trim().toLowerCase();

      // Search in mock_exams table
      const { data: exams, error } = await supabase
        .from('mock_exams')
        .select('id, title, exam_type, target_group, total_questions');

      if (error) throw error;

      // Filter exams by title
      const filtered = (exams || []).filter((exam: any) =>
        exam.title?.toLowerCase().includes(searchTerm)
      );

      // Convert to results
      return filtered
        .map((exam: any) => ({
          id: exam.id,
          type: 'exam' as const,
          title: exam.title,
          subtitle: `${formatExamType(exam.exam_type)} • ${exam.total_questions} questions`,
          subject: exam.exam_type,
          questionCount: exam.total_questions,
          difficulty: 'medium' as const,
          metadata: exam,
        }))
        .slice(0, 10);
    } catch (error) {
      console.error('Search exams error:', error);
      return [];
    }
  }

  /**
   * Get search suggestions based on query
   */
  async getSuggestions(query: string): Promise<SearchSuggestion[]> {
    if (!query || query.trim().length < 2) {
      // Return recent searches
      const history = await this.getSearchHistory();
      return history.slice(0, 5).map(h => ({
        text: h.query,
        type: 'recent' as const,
      }));
    }

    const suggestions: SearchSuggestion[] = [];

    // Get autocomplete from teachers
    try {
      const { data: teachers } = await supabase
        .from('teachers')
        .select('profiles!inner(full_name)')
        .ilike('profiles.full_name', `%${query}%`)
        .limit(5);

      teachers?.forEach((teacher: any) => {
        suggestions.push({
          text: teacher.profiles.full_name,
          type: 'autocomplete',
        });
      });
    } catch (error) {
      console.error('Get suggestions error:', error);
    }

    return suggestions;
  }

  /**
   * Save search to history
   */
  async saveSearch(query: string, category: SearchCategory = 'all'): Promise<void> {
    try {
      const history = await this.getSearchHistory();
      
      // Remove duplicate if exists
      const filtered = history.filter(h => h.query.toLowerCase() !== query.toLowerCase());
      
      // Add new search at the beginning
      const newHistory: SearchHistory[] = [
        {
          id: Date.now().toString(),
          query: query.trim(),
          category,
          timestamp: new Date(),
        },
        ...filtered,
      ].slice(0, MAX_HISTORY_ITEMS);

      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Save search error:', error);
    }
  }

  /**
   * Get search history
   */
  async getSearchHistory(): Promise<SearchHistory[]> {
    try {
      const data = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (!data) return [];

      const history = JSON.parse(data);
      // Convert timestamp strings back to Date objects
      return history.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
    } catch (error) {
      console.error('Get search history error:', error);
      return [];
    }
  }

  /**
   * Clear search history
   */
  async clearSearchHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.error('Clear search history error:', error);
    }
  }

  /**
   * Remove single item from search history
   */
  async removeSearchHistoryItem(id: string): Promise<void> {
    try {
      const history = await this.getSearchHistory();
      const filtered = history.filter(h => h.id !== id);
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Remove search history item error:', error);
    }
  }

  /**
   * Get popular searches (placeholder - could be from analytics)
   */
  async getPopularSearches(): Promise<string[]> {
    // TODO: Implement with analytics or database tracking
    return [
      'Physics',
      'Mathematics',
      'Chemistry',
      'Biology',
      'English',
    ];
  }
}

export const searchService = new SearchService();
