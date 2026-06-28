export type SearchCategory = 'all' | 'teachers' | 'subjects' | 'exams';

export interface SearchResult {
  id: string;
  type: 'teacher' | 'subject' | 'exam';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
}

export interface TeacherSearchResult extends SearchResult {
  type: 'teacher';
  rating: number;
  hourlyRate: number;
  specializations: string[];
  city: string;
}

export interface SubjectSearchResult extends SearchResult {
  type: 'subject';
  teacherCount: number;
  examCount: number;
}

export interface ExamSearchResult extends SearchResult {
  type: 'exam';
  subject: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SearchFilters {
  category?: SearchCategory;
  minRating?: number;
  maxPrice?: number;
  city?: string;
  subject?: string;
}

export interface SearchHistory {
  id: string;
  query: string;
  category: SearchCategory;
  timestamp: Date;
}

export interface SearchSuggestion {
  text: string;
  type: 'recent' | 'popular' | 'autocomplete';
}
