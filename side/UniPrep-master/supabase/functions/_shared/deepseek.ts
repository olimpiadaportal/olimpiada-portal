// ============================================
// DEEPSEEK API CLIENT
// ============================================

import { DeepSeekRequest, DeepSeekResponse, DeepSeekMessage } from './types.ts';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export class DeepSeekClient {
  private apiKey: string;
  private modelChat: string;
  private modelReasoner: string;

  constructor() {
    this.apiKey = Deno.env.get('DEEPSEEK_API_KEY') || '';
    this.modelChat = Deno.env.get('DEEPSEEK_MODEL_CHAT') || 'deepseek-chat';
    this.modelReasoner = Deno.env.get('DEEPSEEK_MODEL_REASONER') || 'deepseek-reasoner';

    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is not set');
    }
  }

  /**
   * Call DeepSeek API with the specified model
   */
  async call(
    messages: DeepSeekMessage[],
    useReasoner: boolean = false,
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    } = {}
  ): Promise<DeepSeekResponse> {
    const model = useReasoner ? this.modelReasoner : this.modelChat;

    const request: DeepSeekRequest = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
      top_p: options.top_p ?? 0.95,
    };

    console.log(`🤖 Calling DeepSeek API (model: ${model})...`);
    const startTime = Date.now();

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ DeepSeek API error:', errorData);
        throw new Error(`DeepSeek API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data: DeepSeekResponse = await response.json();
      
      console.log(`✅ DeepSeek API call successful (${processingTime}ms)`);
      console.log(`📊 Tokens used: ${data.usage.total_tokens}`);

      return data;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ DeepSeek API call failed (${processingTime}ms):`, error);
      throw error;
    }
  }

  /**
   * Generate AI insights from student performance data
   * DEPRECATED: Unused. Active prompts live in ai-insights/index.ts
   */
  async generateInsights(performanceData: any): Promise<string> {
    const systemPrompt = `You are an expert educational AI tutor for university entrance exams in Azerbaijan.
Analyze the student's performance data and provide personalized insights and recommendations.

Your response must be a valid JSON array of insights. Each insight should have:
- type: "recommendation", "weak_area", "strength", "study_tip", or "prediction"
- subject_id: UUID of the subject (if applicable)
- title: Short title (max 50 chars)
- content: Detailed explanation (max 200 chars)
- priority: "high", "medium", or "low"

Focus on:
1. Identifying weak areas that need improvement
2. Recognizing strengths to build confidence
3. Providing actionable study recommendations
4. Predicting exam readiness

Be encouraging but honest. Use clear, simple language.`;

    const userPrompt = `Student Performance Data:
${JSON.stringify(performanceData, null, 2)}

Generate 3-5 personalized insights for this student.`;

    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.call(messages, false, {
      temperature: 0.7,
      max_tokens: 1500,
    });

    return response.choices[0].message.content;
  }

  /**
   * Generate explanation for a wrong answer
   * DEPRECATED: Unused. Active prompts live in ai-explain/index.ts
   */
  async explainAnswer(
    questionText: string,
    studentAnswer: string,
    correctAnswer: string,
    subjectName: string,
    optionTexts?: Record<string, string>
  ): Promise<string> {
    const systemPrompt = `You are an expert ${subjectName} tutor for university entrance exams.
Explain why the student's answer is wrong and why the correct answer is right.

Your response must be a valid JSON object with:
- explanation: Clear explanation (3-4 sentences)
- keyPoints: Array of 2-3 key concepts to remember
- studyTip: One actionable study tip
- relatedTopics: Array of related topics to review (optional)

Be clear, encouraging, and educational. Help the student understand the concept, not just memorize the answer.`;

    let userPrompt = `Question: ${questionText}

Student's Answer: ${studentAnswer}
Correct Answer: ${correctAnswer}`;

    if (optionTexts) {
      userPrompt += `\n\nAnswer Options:\n`;
      Object.entries(optionTexts).forEach(([key, value]) => {
        userPrompt += `${key}) ${value}\n`;
      });
    }

    userPrompt += `\n\nExplain why the student's answer is wrong and provide guidance.`;

    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Use reasoner model for complex explanations
    const response = await this.call(messages, true, {
      temperature: 0.6,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  }

  /**
   * Generate adaptive questions for competitive mode
   */
  async generateQuestions(
    subjectName: string,
    weakTopics: string[],
    questionCount: number = 20
  ): Promise<string> {
    const systemPrompt = `You are an expert question generator for ${subjectName} university entrance exams in Azerbaijan.
Generate challenging, realistic exam questions.

Your response must be a valid JSON array of ${questionCount} questions. Each question must have:
- questionText: The question (clear and concise)
- optionA, optionB, optionC, optionD, optionE: Five answer options
- correctAnswer: "A", "B", "C", "D", or "E"
- explanation: Why the correct answer is right (2-3 sentences)
- difficulty: "easy", "medium", or "hard"
- topic: The specific topic covered

Requirements:
- 60% of questions should focus on weak topics: ${weakTopics.join(', ')}
- 40% of questions should cover general ${subjectName} topics
- Mix of difficulty levels (30% easy, 50% medium, 20% hard)
- Questions should be realistic and exam-like
- All options should be plausible
- Explanations should be educational`;

    const userPrompt = `Generate ${questionCount} ${subjectName} questions.
Focus areas (60%): ${weakTopics.join(', ')}
General topics (40%): Cover other important ${subjectName} concepts

Make questions challenging but fair. Ensure variety in topics and difficulty.`;

    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.call(messages, false, {
      temperature: 0.8,
      max_tokens: 4000,
    });

    return response.choices[0].message.content;
  }

  /**
   * Calculate cost of API call
   */
  calculateCost(usage: { prompt_tokens: number; completion_tokens: number }): number {
    // DeepSeek pricing (approximate)
    const INPUT_COST_PER_1K = 0.003;  // $0.003 per 1K tokens
    const OUTPUT_COST_PER_1K = 0.006; // $0.006 per 1K tokens

    const inputCost = (usage.prompt_tokens / 1000) * INPUT_COST_PER_1K;
    const outputCost = (usage.completion_tokens / 1000) * OUTPUT_COST_PER_1K;

    return inputCost + outputCost;
  }
}
