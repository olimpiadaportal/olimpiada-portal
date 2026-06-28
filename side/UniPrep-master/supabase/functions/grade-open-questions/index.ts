// ============================================
// GRADE OPEN QUESTIONS - AI Grading Edge Function
// Grades written_open and codable_open questions using DeepSeek AI
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sanitizeUserInput, checkRateLimit, safeErrorResponse, rateLimitResponse } from '../_shared/security.ts';

// MEDIUM-08: Dynamic CORS with origin allowlist
const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'https://uni-prep-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];
function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface GradingRequest {
  attempt_id: string;
  answers: {
    answer_id: string;
    question_id: string;
    text_answer: string;
    image_url?: string;
  }[];
}

interface GradingResult {
  answer_id: string;
  question_id: string;
  score: number;
  explanation: string;
  feedback: string;
  matched_keywords?: string[];
  missing_concepts?: string[];
}

// Helper function to fix common JSON issues from AI responses
function fixMalformedJSON(content: string): string {
  try {
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonStart = content.indexOf('{');
    let jsonEnd = content.lastIndexOf('}');
    
    // If no closing brace found, try to complete the JSON
    if (jsonStart !== -1 && jsonEnd === -1) {
      // Truncated response - try to extract score at minimum
      const scoreMatch = content.match(/"score"\s*:\s*(\d+)/);
      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        // Try to extract partial explanation if available
        const explanationMatch = content.match(/"explanation"\s*:\s*"([^"]*)/);
        const partialExplanation = explanationMatch ? explanationMatch[1] : '';
        return JSON.stringify({
          score: score,
          explanation: partialExplanation || 'Cavabınız qiymətləndirildi. Ətraflı izahat üçün müəlliminizlə əlaqə saxlayın.',
          feedback: score >= 7 ? 'Yaxşı cavab!' : 'Cavabınızı yenidən nəzərdən keçirin.',
          matched_keywords: [],
          missing_concepts: [],
        });
      }
      // Can't extract anything useful - give neutral score
      return '{"score": 5, "explanation": "Cavabınız qiymətləndirildi. Ətraflı izahat üçün müəlliminizlə əlaqə saxlayın.", "feedback": "Qiymətləndirmə tamamlandı.", "matched_keywords": [], "missing_concepts": []}';
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
    
    return content;
  } catch {
    return '{"score": 5, "explanation": "Xəta baş verdi.", "feedback": "JSON emalı zamanı xəta.", "matched_keywords": [], "missing_concepts": []}';
  }
}

// Build the grading prompt for AI
function buildGradingPrompt(
  questionText: string,
  gradingRubric: string | null,
  answerKeywords: string[] | null,
  expectedAnswer: string | null,
  studentAnswer: string,
  contextText?: string
): string {
  let prompt = `You are an expert exam grader for educational assessments in Azerbaijan. Grade the student's answer fairly and provide constructive, detailed feedback.

IMPORTANT RULES:
- You must evaluate the answer based on your own knowledge and the provided context
- NEVER mention "expected answer", "sample answer", "reference answer" or similar phrases in your response
- NEVER say things like "the expected answer shows X" or "according to the sample answer"
- Your explanation should be YOUR OWN teaching of the correct answer, as if you are a teacher explaining to a student
- If the student is wrong, explain the correct solution step-by-step using YOUR knowledge

`;

  // Include context text if available (for Situasiya questions)
  if (contextText && contextText.trim()) {
    prompt += `CONTEXT (Situasiya):
${contextText}

`;
  }

  prompt += `QUESTION:
${questionText}

`;

  if (gradingRubric) {
    prompt += `GRADING CRITERIA (use this to determine score):
${gradingRubric}

`;
  }

  // Provide expected answer as internal reference for grading accuracy, but instruct AI not to mention it
  if (expectedAnswer || (answerKeywords && answerKeywords.length > 0)) {
    prompt += `INTERNAL GRADING REFERENCE (use for scoring accuracy, but DO NOT mention this to student):
`;
    if (answerKeywords && answerKeywords.length > 0) {
      prompt += `Key concepts to check: ${answerKeywords.join(', ')}
`;
    }
    if (expectedAnswer) {
      prompt += `Reference solution: ${expectedAnswer}
`;
    }
    prompt += `NOTE: If your calculation differs from the reference, trust YOUR calculation and explain YOUR correct solution.

`;
  }

  prompt += `STUDENT'S ANSWER:
${studentAnswer}

GRADING INSTRUCTIONS:
1. Score 0-3 (WRONG): Student's answer is incorrect or shows fundamental misunderstanding
   - Provide a COMPLETE, DETAILED explanation of the correct answer
   - Show step-by-step solution if it's a calculation
   - Explain the concept clearly as a teacher would
   
2. Score 4-6 (PARTIAL): Student has some understanding but missing key elements
   - Acknowledge what they got right
   - Explain what's missing or incorrect
   - Provide the complete correct answer
   
3. Score 7-10 (CORRECT): Student's answer is mostly or fully correct
   - Provide brief positive feedback
   - Mention minor improvements if any

CRITICAL: 
- Write ALL text in pure Azerbaijani (no English words)
- Be a helpful teacher, not just a grader
- Your explanation should teach the student the correct answer

Respond ONLY with valid JSON (no markdown):
{
  "score": <number 0-10>,
  "explanation": "<YOUR detailed teaching of the correct answer - explain as a teacher would>",
  "feedback": "<specific feedback on what student did right/wrong>",
  "matched_keywords": ["<concept student mentioned correctly>"],
  "missing_concepts": ["<concept student missed>"]
}`;

  return prompt;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!DEEPSEEK_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing required environment variables');
    }

    // Service-role client for DB writes (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Auth client for user verification
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !supabaseAnonKey) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please log in to grade answers',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { attempt_id, answers } = await req.json() as GradingRequest;

    if (!attempt_id || !answers || answers.length === 0) {
      throw new Error('Invalid request: missing attempt_id or answers');
    }

    // Verify ownership via user's JWT client (RLS enforces user_id = auth.uid())
    // This is the same mechanism used by the mobile app to read exam_answers,
    // so if RLS allows it, the user definitely owns this attempt.
    const { data: ownedAttempt, error: ownershipError } = await supabaseAuth
      .from('mock_exam_attempts')
      .select('id')
      .eq('id', attempt_id)
      .single();

    if (ownershipError || !ownedAttempt) {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: 'You do not have permission to grade this attempt',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Rate limit: 20 grading requests per hour
    const rateCheck = await checkRateLimit(supabase, user.id, 'open_question_grading', 20, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders);
    }

    console.log(`📝 Grading ${answers.length} open questions for attempt: ${attempt_id}`);

    const results: GradingResult[] = [];

    for (const answer of answers) {
      try {
        // Fetch question details with context from question_groups
        const { data: question, error: questionError } = await supabase
          .from('questions')
          .select('question_text, question_type, grading_rubric, answer_keywords, expected_answer, group_id, question_groups(context_text)')
          .eq('id', answer.question_id)
          .single();

        if (questionError || !question) {
          console.error(`Failed to fetch question ${answer.question_id}:`, questionError);
          results.push({
            answer_id: answer.answer_id,
            question_id: answer.question_id,
            score: 0,
            explanation: 'Unable to grade - question not found',
            feedback: 'An error occurred while grading this question.',
          });
          continue;
        }

        // Only grade written_open questions (codable_open graded like MCQ in submitExam)
        if (question.question_type !== 'written_open') {
          console.log(`⚠️ Skipping non-written_open question ${answer.question_id}`);
          continue;
        }

        // Get context text from question group (Situasiya)
        const contextText = question.question_groups?.context_text || '';
        
        // Build AI grading prompt with context and sanitized student answer
        const sanitizedAnswer = sanitizeUserInput(answer.text_answer, 2000);
        const prompt = buildGradingPrompt(
          question.question_text,
          question.grading_rubric,
          question.answer_keywords,
          question.expected_answer,
          sanitizedAnswer,
          contextText
        );

        console.log(`🤖 Calling DeepSeek AI for question ${answer.question_id}`);

        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `You are an expert exam grader for Azerbaijan educational assessments. 
CRITICAL RULES:
1. ALWAYS respond with ONLY valid JSON, no markdown, no extra text
2. For wrong answers (score < 7): provide clear, educational explanations (300-600 characters)
3. For correct answers (score >= 7): provide brief positive feedback
4. Keep explanations concise but complete - focus on teaching the correct solution
5. Write ALL text in pure Azerbaijani (no English words)
6. NEVER mention "expected answer" or "reference answer" - teach as a teacher would

Format: {"score": 0-10, "explanation": "...", "feedback": "...", "matched_keywords": [], "missing_concepts": []}`,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`DeepSeek API error: ${aiResponse.status} - ${errorText}`);
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiResult = await aiResponse.json();
        const rawContent = aiResult.choices?.[0]?.message?.content || '';
        const fixedContent = fixMalformedJSON(rawContent);

        let grading;
        try {
          grading = JSON.parse(fixedContent);
        } catch (parseError) {
          console.error('Failed to parse AI response:', rawContent);
          // Try to extract partial content if available
          const scoreMatch = rawContent.match(/"score"\s*:\s*(\d+)/);
          const explanationMatch = rawContent.match(/"explanation"\s*:\s*"([^"]*)/);
          
          if (scoreMatch) {
            const extractedScore = parseInt(scoreMatch[1]);
            const partialExplanation = explanationMatch ? explanationMatch[1] : '';
            grading = {
              score: extractedScore,
              explanation: partialExplanation || 'Cavabınız qiymətləndirildi.',
              feedback: extractedScore >= 7 ? 'Yaxşı cavab!' : 'Cavabınızı yenidən nəzərdən keçirin.',
              matched_keywords: [],
              missing_concepts: [],
            };
          } else {
            // Complete fallback - give neutral score
            grading = {
              score: 5,
              explanation: 'Cavabınız qiymətləndirildi. Ətraflı izahat üçün müəlliminizlə əlaqə saxlayın.',
              feedback: 'Qiymətləndirmə tamamlandı.',
              matched_keywords: [],
              missing_concepts: [],
            };
          }
        }

        const gradeResult: GradingResult = {
          answer_id: answer.answer_id,
          question_id: answer.question_id,
          score: Math.max(0, Math.min(100, grading.score * 10)), // Convert 0-10 to 0-100
          explanation: grading.explanation || 'No explanation available.',
          feedback: grading.feedback || 'No specific feedback available.',
          matched_keywords: grading.matched_keywords || [],
          missing_concepts: grading.missing_concepts || [],
        };

        // Update the exam_answers table with AI grading results
        const { error: updateError } = await supabase
          .from('exam_answers')
          .update({
            ai_score: gradeResult.score,
            ai_explanation: JSON.stringify({
              explanation: gradeResult.explanation,
              feedback: gradeResult.feedback,
              matched_keywords: gradeResult.matched_keywords,
              missing_concepts: gradeResult.missing_concepts,
            }),
            final_score: gradeResult.score, // Can be overridden by manual grading later
          })
          .eq('id', answer.answer_id);

        if (updateError) {
          console.error(`Failed to update answer ${answer.answer_id}:`, updateError);
        }

        results.push(gradeResult);
        console.log(`✅ Graded question ${answer.question_id}: ${gradeResult.score}/100`);

      } catch (answerError) {
        console.error(`Error grading answer ${answer.answer_id}:`, answerError);
        results.push({
          answer_id: answer.answer_id,
          question_id: answer.question_id,
          score: 0,
          explanation: 'An error occurred during grading.',
          feedback: 'Please contact support if this persists.',
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`📊 Grading complete in ${totalTime}ms. Graded ${results.length} questions.`);

    return new Response(
      JSON.stringify({
        success: true,
        attempt_id,
        results,
        grading_time_ms: totalTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Grade open questions error:', error);
    return safeErrorResponse(corsHeaders);
  }
});
