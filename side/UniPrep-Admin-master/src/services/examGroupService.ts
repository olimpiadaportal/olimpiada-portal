/**
 * Exam Group Service
 * Stage 9.1 - Exam Groups Management
 * 
 * Manages exam groups and their subject configurations
 */

import { supabase } from '@/lib/supabase';

export interface ExamGroup {
  id: string;
  code: string;
  name_en: string;
  name_az: string;
  description: string | null;
  first_stage_max_points: number;
  second_stage_max_points: number;
  has_second_stage: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subjects?: ExamGroupSubject[];
}

export interface ExamGroupSubject {
  id: string;
  exam_group_id: string;
  subject_id: string;
  stage: 'first' | 'second';
  coefficient: number;
  questions_count: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subject?: {
    id: string;
    name_en: string;
    name_az: string;
  };
}

export interface Subject {
  id: string;
  name_en: string;
  name_az: string;
  category: string;
}

export interface CreateExamGroupInput {
  code: string;
  name_en: string;
  name_az: string;
  description?: string;
  first_stage_max_points: number;
  second_stage_max_points: number;
}

export interface UpdateExamGroupInput {
  name_en?: string;
  name_az?: string;
  description?: string;
  first_stage_max_points?: number;
  second_stage_max_points?: number;
  is_active?: boolean;
}

export interface AddSubjectToGroupInput {
  exam_group_id: string;
  subject_id: string;
  stage: 'first' | 'second';
  coefficient: number;
  questions_count: number;
  display_order: number;
}

export interface UpdateGroupSubjectInput {
  coefficient?: number;
  questions_count?: number;
  display_order?: number;
  is_active?: boolean;
}

class ExamGroupService {
  /**
   * Get all exam groups with their subjects
   */
  async getExamGroups(): Promise<{ success: boolean; data?: ExamGroup[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_groups')
        .select(`
          *,
          subjects:exam_group_subjects(
            *,
            subject:subjects(id, name_en, name_az)
          )
        `)
        .order('code');

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Error fetching exam groups:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get single exam group by ID
   */
  async getExamGroup(id: string): Promise<{ success: boolean; data?: ExamGroup; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_groups')
        .select(`
          *,
          subjects:exam_group_subjects(
            *,
            subject:subjects(id, name_en, name_az)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Error fetching exam group:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get exam group by code (I, II, III, IV, V)
   */
  async getExamGroupByCode(code: string): Promise<{ success: boolean; data?: ExamGroup; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_groups')
        .select(`
          *,
          subjects:exam_group_subjects(
            *,
            subject:subjects(id, name_en, name_az)
          )
        `)
        .eq('code', code)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Error fetching exam group by code:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update exam group
   */
  async updateExamGroup(
    id: string, 
    input: UpdateExamGroupInput
  ): Promise<{ success: boolean; data?: ExamGroup; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_groups')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Error updating exam group:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all available subjects
   */
  async getSubjects(): Promise<{ success: boolean; data?: Subject[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az, category')
        .order('name_en');

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Error fetching subjects:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add subject to exam group
   */
  async addSubjectToGroup(
    input: AddSubjectToGroupInput
  ): Promise<{ success: boolean; data?: ExamGroupSubject; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_group_subjects')
        .insert(input)
        .select(`
          *,
          subject:subjects(id, name_en, name_az)
        `)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Error adding subject to group:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update subject in exam group
   */
  async updateGroupSubject(
    id: string,
    input: UpdateGroupSubjectInput
  ): Promise<{ success: boolean; data?: ExamGroupSubject; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('exam_group_subjects')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          subject:subjects(id, name_en, name_az)
        `)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Error updating group subject:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove subject from exam group
   */
  async removeSubjectFromGroup(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('exam_group_subjects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error removing subject from group:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reorder subjects in a group
   */
  async reorderGroupSubjects(
    groupId: string,
    subjectOrders: { id: string; display_order: number }[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Update each subject's display order
      for (const item of subjectOrders) {
        const { error } = await supabase
          .from('exam_group_subjects')
          .update({ display_order: item.display_order })
          .eq('id', item.id)
          .eq('exam_group_id', groupId);

        if (error) throw error;
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error reordering subjects:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get scoring configuration for an exam
   * This is used by the mobile app to calculate scores
   */
  async getScoringConfig(
    groupCode: string,
    examType: 'first_stage' | 'second_stage'
  ): Promise<{ 
    success: boolean; 
    data?: {
      maxPoints: number;
      subjects: {
        subjectId: string;
        subjectName: string;
        coefficient: number;
        questionsCount: number;
        maxPoints: number;
      }[];
    }; 
    error?: string 
  }> {
    try {
      const { data: group, error } = await supabase
        .from('exam_groups')
        .select(`
          *,
          subjects:exam_group_subjects(
            *,
            subject:subjects(id, name_en)
          )
        `)
        .eq('code', groupCode)
        .eq('is_active', true)
        .single();

      if (error) throw error;

      const maxPoints = examType === 'first_stage' 
        ? group.first_stage_max_points 
        : group.second_stage_max_points;

      const activeSubjects = (group.subjects || []).filter((s: any) => s.is_active);
      const totalCoefficient = activeSubjects.reduce(
        (sum: number, s: any) => sum + (examType === 'first_stage' ? 1 : s.coefficient), 
        0
      );

      const subjects = activeSubjects.map((s: any) => {
        const coefficient = examType === 'first_stage' ? 1 : s.coefficient;
        const subjectMaxPoints = Math.round((coefficient / totalCoefficient) * maxPoints);
        
        return {
          subjectId: s.subject_id,
          subjectName: s.subject?.name_en || 'Unknown',
          coefficient,
          questionsCount: s.questions_count,
          maxPoints: subjectMaxPoints,
        };
      });

      return { 
        success: true, 
        data: { maxPoints, subjects } 
      };
    } catch (error: any) {
      console.error('Error getting scoring config:', error);
      return { success: false, error: error.message };
    }
  }
}

export const examGroupService = new ExamGroupService();
