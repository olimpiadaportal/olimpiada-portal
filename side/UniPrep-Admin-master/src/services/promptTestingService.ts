/**
 * Prompt Testing Service
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Handles prompt testing with AI APIs and result comparison
 */

import { AIPrompt } from './promptService';

// ============================================
// Types
// ============================================

export interface TestInput {
  [key: string]: string | number | boolean;
}

export interface TestResult {
  success: boolean;
  response?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  latency?: number;
  error?: string;
  timestamp: string;
}

export interface ComparisonResult {
  promptA: {
    prompt: AIPrompt;
    result: TestResult;
  };
  promptB: {
    prompt: AIPrompt;
    result: TestResult;
  };
  comparison: {
    latencyDiff: number;
    costDiff: number;
    tokenDiff: number;
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Replace template variables in prompt with actual values
 */
function replaceVariables(template: string, variables: TestInput): string {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value));
  });
  
  return result;
}

/**
 * Calculate cost based on model and tokens
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Pricing per 1K tokens (as of 2024)
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

// ============================================
// Service Functions
// ============================================

/**
 * Test a prompt with given inputs using real AI API
 */
export async function testPrompt(
  prompt: AIPrompt,
  testInput: TestInput
): Promise<TestResult> {
  try {
    // Replace variables in prompts
    const systemPrompt = prompt.system_prompt
      ? replaceVariables(prompt.system_prompt, testInput)
      : undefined;
    const userPrompt = replaceVariables(prompt.user_prompt_template, testInput);

    // Call real AI API
    const response = await fetch('/api/ai/test-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        model: prompt.model,
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
        topP: prompt.top_p,
        frequencyPenalty: prompt.frequency_penalty,
        presencePenalty: prompt.presence_penalty,
        promptId: prompt.id,
        promptName: prompt.name,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `API error: ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      response: data.response,
      tokens: data.tokens,
      cost: data.cost,
      latency: data.latency,
      timestamp: data.timestamp,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Compare two prompts with the same input
 */
export async function comparePrompts(
  promptA: AIPrompt,
  promptB: AIPrompt,
  testInput: TestInput
): Promise<ComparisonResult> {
  // Run both tests in parallel
  const [resultA, resultB] = await Promise.all([
    testPrompt(promptA, testInput),
    testPrompt(promptB, testInput),
  ]);

  // Calculate differences
  const latencyDiff = (resultA.latency || 0) - (resultB.latency || 0);
  const costDiff = (resultA.cost || 0) - (resultB.cost || 0);
  const tokenDiff = (resultA.tokens?.total || 0) - (resultB.tokens?.total || 0);

  return {
    promptA: {
      prompt: promptA,
      result: resultA,
    },
    promptB: {
      prompt: promptB,
      result: resultB,
    },
    comparison: {
      latencyDiff,
      costDiff,
      tokenDiff,
    },
  };
}

/**
 * Run A/B test with multiple inputs
 */
export async function runABTest(
  promptA: AIPrompt,
  promptB: AIPrompt,
  testInputs: TestInput[]
): Promise<{
  results: ComparisonResult[];
  summary: {
    avgLatencyA: number;
    avgLatencyB: number;
    avgCostA: number;
    avgCostB: number;
    avgTokensA: number;
    avgTokensB: number;
    winner: 'A' | 'B' | 'tie';
  };
}> {
  // Run all comparisons
  const results = await Promise.all(
    testInputs.map(input => comparePrompts(promptA, promptB, input))
  );

  // Calculate averages
  const avgLatencyA =
    results.reduce((sum, r) => sum + (r.promptA.result.latency || 0), 0) /
    results.length;
  const avgLatencyB =
    results.reduce((sum, r) => sum + (r.promptB.result.latency || 0), 0) /
    results.length;
  const avgCostA =
    results.reduce((sum, r) => sum + (r.promptA.result.cost || 0), 0) /
    results.length;
  const avgCostB =
    results.reduce((sum, r) => sum + (r.promptB.result.cost || 0), 0) /
    results.length;
  const avgTokensA =
    results.reduce((sum, r) => sum + (r.promptA.result.tokens?.total || 0), 0) /
    results.length;
  const avgTokensB =
    results.reduce((sum, r) => sum + (r.promptB.result.tokens?.total || 0), 0) /
    results.length;

  // Determine winner (based on cost and latency)
  const scoreA = avgCostA + avgLatencyA / 1000; // Normalize latency to seconds
  const scoreB = avgCostB + avgLatencyB / 1000;
  const winner = scoreA < scoreB ? 'A' : scoreB < scoreA ? 'B' : 'tie';

  return {
    results,
    summary: {
      avgLatencyA,
      avgLatencyB,
      avgCostA,
      avgCostB,
      avgTokensA,
      avgTokensB,
      winner,
    },
  };
}

/**
 * Validate test input against prompt variables
 */
export function validateTestInput(
  prompt: AIPrompt,
  testInput: TestInput
): { valid: boolean; missingVariables: string[]; extraVariables: string[] } {
  const promptVariables = prompt.variables ? Object.keys(prompt.variables) : [];
  const inputVariables = Object.keys(testInput);

  const missingVariables = promptVariables.filter(
    v => !inputVariables.includes(v)
  );
  const extraVariables = inputVariables.filter(
    v => !promptVariables.includes(v)
  );

  return {
    valid: missingVariables.length === 0,
    missingVariables,
    extraVariables,
  };
}

/**
 * Extract variables from prompt template
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}
