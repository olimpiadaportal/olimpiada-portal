/**
 * Prompt Management Service
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Handles CRUD operations for AI prompts with versioning support
 */

import { supabaseAdmin } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface AIPrompt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  system_prompt: string | null;
  user_prompt_template: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  version: number;
  is_active: boolean;
  parent_id: string | null;
  tags: string[] | null;
  variables: Record<string, string> | null;
  example_input: Record<string, any> | null;
  example_output: string | null;
  usage_count: number;
  success_count: number;
  avg_quality_score: number | null;
  avg_latency_ms: number | null;
  avg_cost_usd: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  last_used_at: string | null;
}

export interface CreatePromptInput {
  name: string;
  description?: string;
  category: string;
  system_prompt?: string;
  user_prompt_template: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  tags?: string[];
  variables?: Record<string, string>;
  example_input?: Record<string, any>;
  example_output?: string;
}

export interface UpdatePromptInput {
  description?: string;
  system_prompt?: string;
  user_prompt_template?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  is_active?: boolean;
  tags?: string[];
  variables?: Record<string, string>;
  example_input?: Record<string, any>;
  example_output?: string;
}

export interface PromptFilters {
  category?: string;
  is_active?: boolean;
  search?: string;
  tags?: string[];
}

export interface PromptStats {
  total_prompts: number;
  active_prompts: number;
  categories: number;
  total_usage: number;
  avg_quality: number;
  by_category: Array<{
    category: string;
    count: number;
    usage: number;
  }>;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get all prompts with optional filtering
 */
export async function getPrompts(
  filters?: PromptFilters
): Promise<{ success: boolean; data?: AIPrompt[]; error?: string }> {
  try {
    let query = supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters?.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    if (filters?.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching prompts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt[] };
  } catch (error) {
    console.error('Error in getPrompts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get a single prompt by ID
 */
export async function getPromptById(
  id: string
): Promise<{ success: boolean; data?: AIPrompt; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching prompt:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt };
  } catch (error) {
    console.error('Error in getPromptById:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get prompt by name (latest active version)
 */
export async function getPromptByName(
  name: string
): Promise<{ success: boolean; data?: AIPrompt; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('name', name)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching prompt by name:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt };
  } catch (error) {
    console.error('Error in getPromptByName:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get version history for a prompt
 */
export async function getPromptVersions(
  name: string
): Promise<{ success: boolean; data?: AIPrompt[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('name', name)
      .order('version', { ascending: false });

    if (error) {
      console.error('Error fetching prompt versions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt[] };
  } catch (error) {
    console.error('Error in getPromptVersions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a new prompt
 */
export async function createPrompt(
  input: CreatePromptInput,
  userId?: string
): Promise<{ success: boolean; data?: AIPrompt; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .insert({
        ...input,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating prompt:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt };
  } catch (error) {
    console.error('Error in createPrompt:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update an existing prompt
 */
export async function updatePrompt(
  id: string,
  input: UpdatePromptInput,
  userId?: string
): Promise<{ success: boolean; data?: AIPrompt; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .update({
        ...input,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating prompt:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt };
  } catch (error) {
    console.error('Error in updatePrompt:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a new version of an existing prompt
 */
export async function createPromptVersion(
  parentId: string,
  input: UpdatePromptInput,
  userId?: string
): Promise<{ success: boolean; data?: AIPrompt; error?: string }> {
  try {
    // Get parent prompt
    const parentResult = await getPromptById(parentId);
    if (!parentResult.success || !parentResult.data) {
      return { success: false, error: 'Parent prompt not found' };
    }

    const parent = parentResult.data;

    // Deactivate old version
    await supabaseAdmin
      .from('ai_prompts')
      .update({ is_active: false })
      .eq('id', parentId);

    // Create new version
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .insert({
        name: parent.name,
        description: input.description ?? parent.description,
        category: parent.category,
        system_prompt: input.system_prompt ?? parent.system_prompt,
        user_prompt_template: input.user_prompt_template ?? parent.user_prompt_template,
        model: input.model ?? parent.model,
        temperature: input.temperature ?? parent.temperature,
        max_tokens: input.max_tokens ?? parent.max_tokens,
        top_p: input.top_p ?? parent.top_p,
        frequency_penalty: input.frequency_penalty ?? parent.frequency_penalty,
        presence_penalty: input.presence_penalty ?? parent.presence_penalty,
        tags: input.tags ?? parent.tags,
        variables: input.variables ?? parent.variables,
        example_input: input.example_input ?? parent.example_input,
        example_output: input.example_output ?? parent.example_output,
        version: parent.version + 1,
        parent_id: parentId,
        is_active: true,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating prompt version:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AIPrompt };
  } catch (error) {
    console.error('Error in createPromptVersion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a prompt (soft delete by deactivating)
 */
export async function deletePrompt(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('ai_prompts')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting prompt:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deletePrompt:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get prompt statistics
 */
export async function getPromptStats(): Promise<{
  success: boolean;
  data?: PromptStats;
  error?: string;
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*');

    if (error) {
      console.error('Error fetching prompt stats:', error);
      return { success: false, error: error.message };
    }

    const prompts = data as AIPrompt[];

    // Calculate avg quality from prompts first
    let avgQuality = 0;
    const promptsWithQuality = prompts.filter((p) => p.avg_quality_score !== null && p.avg_quality_score > 0);
    
    if (promptsWithQuality.length > 0) {
      avgQuality = promptsWithQuality.reduce((sum, p) => sum + (p.avg_quality_score || 0), 0) / promptsWithQuality.length;
    } else {
      // Fallback: Calculate directly from ai_usage_logs if prompts don't have quality scores yet
      const { data: logsData } = await supabaseAdmin
        .from('ai_usage_logs')
        .select('quality_score')
        .eq('feature_type', 'prompt_testing')
        .not('quality_score', 'is', null);
      
      if (logsData && logsData.length > 0) {
        avgQuality = logsData.reduce((sum, log) => sum + (log.quality_score || 0), 0) / logsData.length;
      }
    }

    // Calculate statistics
    const stats: PromptStats = {
      total_prompts: prompts.length,
      active_prompts: prompts.filter((p) => p.is_active).length,
      categories: new Set(prompts.map((p) => p.category)).size,
      total_usage: prompts.reduce((sum, p) => sum + (p.usage_count || 0), 0),
      avg_quality: avgQuality,
      by_category: [],
    };

    // Group by category
    const categoryMap = new Map<
      string,
      { count: number; usage: number }
    >();

    prompts.forEach((prompt) => {
      const existing = categoryMap.get(prompt.category) || {
        count: 0,
        usage: 0,
      };
      categoryMap.set(prompt.category, {
        count: existing.count + 1,
        usage: existing.usage + (prompt.usage_count || 0),
      });
    });

    stats.by_category = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        count: data.count,
        usage: data.usage,
      })
    );

    return { success: true, data: stats };
  } catch (error) {
    console.error('Error in getPromptStats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update prompt usage statistics
 */
export async function updatePromptUsage(
  promptId: string,
  success: boolean,
  qualityScore?: number,
  latencyMs?: number,
  costUsd?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current prompt
    const result = await getPromptById(promptId);
    if (!result.success || !result.data) {
      return { success: false, error: 'Prompt not found' };
    }

    const prompt = result.data;

    // Calculate new averages
    const newUsageCount = prompt.usage_count + 1;
    const newSuccessCount = prompt.success_count + (success ? 1 : 0);

    let newAvgQuality = prompt.avg_quality_score;
    if (qualityScore !== undefined) {
      newAvgQuality =
        ((prompt.avg_quality_score || 0) * prompt.usage_count + qualityScore) /
        newUsageCount;
    }

    let newAvgLatency = prompt.avg_latency_ms;
    if (latencyMs !== undefined) {
      newAvgLatency =
        ((prompt.avg_latency_ms || 0) * prompt.usage_count + latencyMs) /
        newUsageCount;
    }

    let newAvgCost = prompt.avg_cost_usd;
    if (costUsd !== undefined) {
      newAvgCost =
        ((prompt.avg_cost_usd || 0) * prompt.usage_count + costUsd) /
        newUsageCount;
    }

    // Update prompt
    const { error } = await supabaseAdmin
      .from('ai_prompts')
      .update({
        usage_count: newUsageCount,
        success_count: newSuccessCount,
        avg_quality_score: newAvgQuality,
        avg_latency_ms: newAvgLatency,
        avg_cost_usd: newAvgCost,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', promptId);

    if (error) {
      console.error('Error updating prompt usage:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in updatePromptUsage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
