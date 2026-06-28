import { createClient } from '@/utils/supabase/client';

export interface StudyTip {
  id: string;
  category: 'motivation' | 'technique' | 'health' | 'time-management';
  tip_text: string;
  icon: string;
  is_active: boolean;
  created_at: string;
}

export interface StudyTipInput {
  category: 'motivation' | 'technique' | 'health' | 'time-management';
  tip_text: string;
  icon: string;
  is_active?: boolean;
}

export interface StudyTipsStats {
  total: number;
  active: number;
  inactive: number;
  byCategory: {
    motivation: number;
    technique: number;
    health: number;
    'time-management': number;
  };
}

class StudyTipsService {
  private supabase = createClient();

  /**
   * Get all study tips with optional filters
   */
  async getStudyTips(filters?: {
    category?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<StudyTip[]> {
    let query = this.supabase
      .from('daily_study_tips')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.search) {
      query = query.ilike('tip_text', `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching study tips:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get a single study tip by ID
   */
  async getStudyTipById(id: string): Promise<StudyTip | null> {
    const { data, error } = await this.supabase
      .from('daily_study_tips')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching study tip:', error);
      throw error;
    }

    return data;
  }

  /**
   * Create a new study tip
   */
  async createStudyTip(input: StudyTipInput): Promise<StudyTip> {
    const { data, error } = await this.supabase
      .from('daily_study_tips')
      .insert({
        category: input.category,
        tip_text: input.tip_text,
        icon: input.icon,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating study tip:', error);
      throw error;
    }

    return data;
  }

  /**
   * Update an existing study tip
   */
  async updateStudyTip(id: string, input: Partial<StudyTipInput>): Promise<StudyTip> {
    const { data, error } = await this.supabase
      .from('daily_study_tips')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating study tip:', error);
      throw error;
    }

    return data;
  }

  /**
   * Delete a study tip
   */
  async deleteStudyTip(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('daily_study_tips')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting study tip:', error);
      throw error;
    }
  }

  /**
   * Toggle the active status of a study tip
   */
  async toggleStudyTipStatus(id: string, isActive: boolean): Promise<StudyTip> {
    return this.updateStudyTip(id, { is_active: isActive });
  }

  /**
   * Get statistics about study tips
   */
  async getStats(): Promise<StudyTipsStats> {
    const { data, error } = await this.supabase
      .from('daily_study_tips')
      .select('category, is_active');

    if (error) {
      console.error('Error fetching study tips stats:', error);
      throw error;
    }

    const tips = data || [];
    const stats: StudyTipsStats = {
      total: tips.length,
      active: tips.filter(t => t.is_active).length,
      inactive: tips.filter(t => !t.is_active).length,
      byCategory: {
        motivation: tips.filter(t => t.category === 'motivation').length,
        technique: tips.filter(t => t.category === 'technique').length,
        health: tips.filter(t => t.category === 'health').length,
        'time-management': tips.filter(t => t.category === 'time-management').length,
      },
    };

    return stats;
  }

  /**
   * Bulk toggle active status
   */
  async bulkToggleStatus(ids: string[], isActive: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('daily_study_tips')
      .update({ is_active: isActive })
      .in('id', ids);

    if (error) {
      console.error('Error bulk updating study tips:', error);
      throw error;
    }
  }

  /**
   * Bulk delete study tips
   */
  async bulkDelete(ids: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('daily_study_tips')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Error bulk deleting study tips:', error);
      throw error;
    }
  }
}

export const studyTipsService = new StudyTipsService();
