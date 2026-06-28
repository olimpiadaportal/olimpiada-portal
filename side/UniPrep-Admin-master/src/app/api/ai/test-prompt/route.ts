/**
 * API Route: Test AI Prompt
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Calls DeepSeek API to test prompts with real AI responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

interface TestPromptRequest {
  systemPrompt?: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Calculate cost based on model and tokens
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Pricing per 1K tokens
  const pricing: Record<string, { prompt: number; completion: number }> = {
    'deepseek-chat': { prompt: 0.0003, completion: 0.0006 },
    'deepseek-reasoner': { prompt: 0.0014, completion: 0.0028 },
    'gpt-4': { prompt: 0.03, completion: 0.06 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
    'claude-3-opus': { prompt: 0.015, completion: 0.075 },
    'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
  };

  const modelPricing = pricing[model] || pricing['deepseek-chat'];
  
  const promptCost = (promptTokens / 1000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1000) * modelPricing.completion;
  
  return promptCost + completionCost;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Require authenticated admin before any operations
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    // Check AI system configuration FIRST
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Check if AI system is globally enabled
    const { data: globalConfig } = await supabase
      .from('ai_configuration')
      .select('config_value')
      .eq('config_key', 'global_settings')
      .eq('is_active', true)
      .single();

    if (!globalConfig?.config_value?.enabled) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'AI system is currently disabled. Please contact an administrator.',
          disabled: true
        },
        { status: 503 }
      );
    }

    // 2. Check if prompt_testing feature is enabled
    const { data: featureFlags } = await supabase
      .from('ai_configuration')
      .select('config_value')
      .eq('config_key', 'feature_flags')
      .eq('is_active', true)
      .single();

    if (!featureFlags?.config_value?.prompt_testing?.enabled) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Prompt testing feature is currently disabled.',
          disabled: true
        },
        { status: 503 }
      );
    }

    // 3. Check emergency mode
    const { data: emergencyConfig } = await supabase
      .from('ai_configuration')
      .select('config_value')
      .eq('config_key', 'emergency_controls')
      .eq('is_active', true)
      .single();

    if (emergencyConfig?.config_value?.emergency_mode) {
      return NextResponse.json(
        { 
          success: false, 
          error: emergencyConfig.config_value.emergency_message || 'AI services are temporarily unavailable.',
          emergency: true
        },
        { status: 503 }
      );
    }

    // 4. Check rate limits
    const { data: rateLimits } = await supabase
      .from('ai_configuration')
      .select('config_value')
      .eq('config_key', 'rate_limits')
      .eq('is_active', true)
      .single();

    if (rateLimits?.config_value?.enabled) {
      const featureLimit = rateLimits.config_value?.per_feature?.prompt_testing?.requests_per_minute || 10;
      
      // Check recent requests
      const { count } = await supabase
        .from('ai_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('feature_type', 'prompt_testing')
        .gte('created_at', new Date(Date.now() - 60000).toISOString());

      if (count && count >= featureLimit) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Rate limit exceeded. Maximum ${featureLimit} requests per minute for prompt testing.`,
            rateLimited: true,
            retryAfter: 60
          },
          { status: 429 }
        );
      }
    }

    const body: TestPromptRequest & { promptId?: string; promptName?: string } = await request.json();
    const { systemPrompt, userPrompt, model, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, promptId, promptName } = body;

    // Validate required fields
    if (!userPrompt) {
      return NextResponse.json(
        { success: false, error: 'User prompt is required' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'DEEPSEEK_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Prepare messages
    const messages: DeepSeekMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    // Prepare request
    const deepseekRequest: DeepSeekRequest = {
      model: model === 'deepseek-chat' || model === 'deepseek-reasoner' ? model : 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
    };

    // Add optional parameters if provided
    if (frequencyPenalty !== undefined) {
      deepseekRequest.frequency_penalty = frequencyPenalty;
    }
    if (presencePenalty !== undefined) {
      deepseekRequest.presence_penalty = presencePenalty;
    }


    // Call DeepSeek API
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(deepseekRequest),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ DeepSeek API error:', errorData);
      
      return NextResponse.json(
        {
          success: false,
          error: `DeepSeek API error: ${response.status}`,
          details: errorData,
        },
        { status: response.status }
      );
    }

    const data: DeepSeekResponse = await response.json();
    
    // Calculate cost
    const cost = calculateCost(model, data.usage.prompt_tokens, data.usage.completion_tokens);


    // Log usage to database if promptId is provided
    if (promptId) {
      try {
        const requestId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Calculate quality score (0.0 to 1.0)
        let qualityScore = 0;
        
        // Success status (30%)
        qualityScore += 0.30;
        
        // Low latency (20%)
        if (latency < 2000) qualityScore += 0.20;
        else if (latency < 5000) qualityScore += 0.10;
        
        // Reasonable cost (20%)
        if (cost < 0.01) qualityScore += 0.20;
        else if (cost < 0.05) qualityScore += 0.10;
        
        // No errors (30%)
        qualityScore += 0.30;
        
        qualityScore = Math.max(0, Math.min(1, qualityScore));
        const flaggedForReview = qualityScore < 0.50;
        
        await supabase.from('ai_usage_logs').insert({
          request_id: requestId,
          feature_type: 'prompt_testing',
          provider: 'deepseek',
          model: model,
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          cost_usd: cost,
          latency_ms: latency,
          status: 'success',
          quality_score: Number(qualityScore.toFixed(2)),
          flagged_for_review: flaggedForReview,
          review_status: flaggedForReview ? 'pending' : null,
          request_metadata: {
            prompt_id: promptId,
            prompt_name: promptName,
            test_mode: true,
          },
        });
        
        // Update prompt usage count and stats
        await supabase.rpc('increment_prompt_usage', { prompt_id: promptId });
        await supabase.rpc('update_prompt_stats', { prompt_id: promptId });
        
      } catch (logError) {
        console.error('⚠️ Failed to log usage:', logError);
        // Don't fail the request if logging fails
      }
    }

    // Return response
    return NextResponse.json({
      success: true,
      response: data.choices[0].message.content,
      tokens: {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      },
      cost,
      latency,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`❌ Prompt test failed (${latency}ms):`, error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
