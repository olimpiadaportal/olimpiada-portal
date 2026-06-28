// ============================================
// SUBJECT & TOPIC TYPES
// ============================================
// Purpose: TypeScript types for subject and topic management
// Created: November 17, 2025
// ============================================

// ============================================
// SUBJECT TYPES
// ============================================

export interface Subject {
  id: string;
  name_en: string;
  name_az: string;
  name_ru?: string | null;
  // DEPRECATED: category, coefficient, max_points are now managed at exam_group_subjects level
  // These fields exist for backward compatibility but should not be used for new features
  category?: 'first_stage' | 'second_stage' | 'none' | null;
  coefficient?: number | null;
  max_points?: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface SubjectWithStats extends Subject {
  topic_count: number;
  question_count: number;
}

export interface CreateSubjectParams {
  name_en: string;
  name_az: string;
  // DEPRECATED: These fields are optional and managed at exam level
  category?: 'first_stage' | 'second_stage' | null;
  coefficient?: number | null;
  max_points?: number | null;
}

export interface UpdateSubjectParams {
  id: string;
  name_en?: string;
  name_az?: string;
  // DEPRECATED: These fields are optional and managed at exam level
  category?: 'first_stage' | 'second_stage' | null;
  coefficient?: number | null;
  max_points?: number | null;
}

// ============================================
// TOPIC TYPES
// ============================================

export interface Topic {
  id: string;
  subject_id: string;
  topic_name: string;
  topic_name_az: string | null;
  topic_name_ru: string | null;
  description: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicWithStats extends Topic {
  question_count: number;
  subtopic_count: number;
}

export interface CreateTopicParams {
  subject_id: string;
  topic_name: string;
  topic_name_az?: string;
  topic_name_ru?: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order?: number;
}

export interface UpdateTopicParams {
  id: string;
  topic_name?: string;
  topic_name_az?: string;
  topic_name_ru?: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order?: number;
  is_active?: boolean;
}

export interface TopicOrder {
  id: string;
  display_order: number;
}

// ============================================
// SUBTOPIC TYPES
// ============================================

export interface Subtopic {
  id: string;
  topic_id: string;
  subject_id: string;
  subtopic_name: string;
  description: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubtopicWithStats extends Subtopic {
  question_count: number;
  /** Populated by get_subtopics_by_subject (flat list queries) */
  topic_name?: string;
}

export interface CreateSubtopicParams {
  topic_id: string;
  subtopic_name: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order?: number;
}

export interface UpdateSubtopicParams {
  id: string;
  subtopic_name?: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order?: number;
  is_active?: boolean;
}

export interface SubtopicOrder {
  id: string;
  display_order: number;
}

// ============================================
// FILTER TYPES
// ============================================

export interface SubjectFilters {
  // DEPRECATED: category filter no longer relevant
  category?: 'first_stage' | 'second_stage' | 'all' | 'none';
  is_active?: boolean;
  search?: string;
}

export interface TopicFilters {
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | 'all';
  is_active?: boolean;
  search?: string;
}

export interface SubtopicFilters {
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | 'all';
  is_active?: boolean;
  search?: string;
}

// ============================================
// SERVICE RESPONSE TYPES
// ============================================

export interface SubjectServiceResponse<T = any> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface TopicServiceResponse<T = any> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface SubtopicServiceResponse<T = any> {
  success: boolean;
  data: T | null;
  error: string | null;
}
