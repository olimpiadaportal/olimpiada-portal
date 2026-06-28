'use client';

/**
 * Prompt Tester Modal
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Test prompts with sample inputs and view AI responses
 */

import { useState, useEffect } from 'react';
import { X, Play, Loader2, CheckCircle, XCircle, Clock, DollarSign, Hash } from 'lucide-react';
import { AIPrompt } from '@/services/promptService';
import {
  testPrompt,
  validateTestInput,
  extractVariables,
  type TestInput,
  type TestResult,
} from '@/services/promptTestingService';

interface PromptTesterModalProps {
  prompt: AIPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onTestComplete?: () => void; // Callback to refresh data after test
}

export default function PromptTesterModal({
  prompt,
  isOpen,
  onClose,
  onTestComplete,
}: PromptTesterModalProps) {
  const [testInput, setTestInput] = useState<TestInput>({});
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [variables, setVariables] = useState<string[]>([]);

  // Extract variables from prompt template
  useEffect(() => {
    if (prompt) {
      const extracted = extractVariables(prompt.user_prompt_template);
      setVariables(extracted);
      
      // Initialize test input with example or empty values
      const initialInput: TestInput = {};
      extracted.forEach(variable => {
        if (prompt.example_input && variable in prompt.example_input) {
          initialInput[variable] = prompt.example_input[variable];
        } else {
          initialInput[variable] = '';
        }
      });
      setTestInput(initialInput);
    }
  }, [prompt]);

  const handleTest = async () => {
    if (!prompt) return;

    // Validate input
    const validation = validateTestInput(prompt, testInput);
    if (!validation.valid) {
      alert(`Missing required variables: ${validation.missingVariables.join(', ')}`);
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      const testResult = await testPrompt(prompt, testInput);
      setResult(testResult);
      
      // Call callback to refresh data if test was successful
      if (testResult.success && onTestComplete) {
        // Wait a bit for database to update
        setTimeout(() => {
          onTestComplete();
        }, 500);
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleInputChange = (variable: string, value: string) => {
    setTestInput(prev => ({
      ...prev,
      [variable]: value,
    }));
  };

  if (!isOpen || !prompt) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Test Prompt</h2>
            <p className="text-sm text-gray-600 mt-1">
              {prompt.name} (v{prompt.version})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Prompt Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Prompt Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Model:</span>
                <span className="ml-2 font-medium text-blue-900">{prompt.model}</span>
              </div>
              <div>
                <span className="text-blue-700">Temperature:</span>
                <span className="ml-2 font-medium text-blue-900">{prompt.temperature}</span>
              </div>
              <div>
                <span className="text-blue-700">Max Tokens:</span>
                <span className="ml-2 font-medium text-blue-900">{prompt.max_tokens}</span>
              </div>
              <div>
                <span className="text-blue-700">Top P:</span>
                <span className="ml-2 font-medium text-blue-900">{prompt.top_p}</span>
              </div>
            </div>
          </div>

          {/* Test Inputs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Test Inputs</h3>
            
            {variables.length === 0 ? (
              <div className="text-sm text-gray-500 italic">
                No variables found in prompt template
              </div>
            ) : (
              <div className="space-y-3">
                {variables.map(variable => (
                  <div key={variable}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {variable}
                      {prompt.variables && prompt.variables[variable] && (
                        <span className="ml-2 text-xs text-gray-500">
                          ({prompt.variables[variable]})
                        </span>
                      )}
                    </label>
                    <textarea
                      value={String(testInput[variable] || '')}
                      onChange={(e) => handleInputChange(variable, e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter ${variable}...`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Button */}
          <div className="flex justify-center">
            <button
              onClick={handleTest}
              disabled={testing || variables.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Run Test
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>

              {/* Status */}
              <div
                className={`flex items-center gap-2 p-4 rounded-lg ${
                  result.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                {result.success ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-900">Test Successful</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-900">Test Failed</span>
                  </>
                )}
              </div>

              {/* Metrics */}
              {result.success && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">Latency</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.latency}ms
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm">Cost</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      ${result.cost?.toFixed(4)}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Hash className="w-4 h-4" />
                      <span className="text-sm">Prompt Tokens</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.tokens?.prompt.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Hash className="w-4 h-4" />
                      <span className="text-sm">Completion Tokens</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.tokens?.completion.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Response or Error */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {result.success ? 'AI Response' : 'Error Message'}
                </label>
                <div
                  className={`p-4 rounded-lg font-mono text-sm whitespace-pre-wrap ${
                    result.success
                      ? 'bg-gray-50 border border-gray-200 text-gray-900'
                      : 'bg-red-50 border border-red-200 text-red-900'
                  }`}
                >
                  {result.success ? result.response : result.error}
                </div>
              </div>

              {/* Success Notice */}
              {result.success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-900">
                    <strong>✓ Real AI Response:</strong> This response was generated by DeepSeek AI using your prompt configuration.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
