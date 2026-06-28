// Reference Data Service
// Fetches cities, universities, and target groups from database

import { supabase } from './supabase';

export interface University {
  id: string;
  name: string;
  name_az: string;
  name_en: string;
  name_ru: string;
  city?: string;
}

export interface City {
  id: string;
  name: string;
  name_az: string;
  name_en: string;
  name_ru: string;
  region?: string;
}

export interface TargetGroup {
  id: string;
  code: string;
  name_az: string;
  name_en: string;
  name_ru: string;
  description_az?: string;
  description_en?: string;
  description_ru?: string;
}

class ReferenceDataService {
  /**
   * Get all universities
   */
  async getUniversities(): Promise<University[]> {
    try {
      console.log('📚 Fetching universities from database...');
      const { data, error } = await supabase
        .from('universities')
        .select('*')
        .order('name_az');

      if (error) {
        console.error('❌ Error fetching universities:', error);
        throw error;
      }
      
      console.log('✅ Universities fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('Error fetching universities:', error);
      return [];
    }
  }

  /**
   * Get all cities
   */
  async getCities(): Promise<City[]> {
    try {
      console.log('🏙️ Fetching cities from database...');
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .order('name_az');

      if (error) {
        console.error('❌ Error fetching cities:', error);
        throw error;
      }
      
      console.log('✅ Cities fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('Error fetching cities:', error);
      return [];
    }
  }

  /**
   * Get all target groups
   */
  async getTargetGroups(): Promise<TargetGroup[]> {
    try {
      const { data, error } = await supabase
        .from('target_groups')
        .select('*')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching target groups:', error);
      return [];
    }
  }

  /**
   * Search universities by name
   */
  async searchUniversities(query: string): Promise<University[]> {
    try {
      const { data, error } = await supabase
        .from('universities')
        .select('*')
        .eq('is_active', true)
        .or(`name_az.ilike.%${query}%,name_en.ilike.%${query}%,name.ilike.%${query}%`)
        .order('name_az')
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching universities:', error);
      return [];
    }
  }

  /**
   * Search cities by name
   */
  async searchCities(query: string): Promise<City[]> {
    try {
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .eq('is_active', true)
        .or(`name_az.ilike.%${query}%,name_en.ilike.%${query}%,name.ilike.%${query}%`)
        .order('name_az')
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching cities:', error);
      return [];
    }
  }
}

export const referenceDataService = new ReferenceDataService();
