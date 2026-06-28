// ============================================
// AI GENERATE QUESTIONS - PRODUCTION VERSION
// With robust JSON parsing and retry logic
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

// Quality Scoring Utility (Stage 5.5)
function calculateQualityScore(params: {
  status: string;
  latency_ms: number;
  cost_usd: number;
  error_message?: string | null;
  total_tokens?: number;
}): { quality_score: number; flagged_for_review: boolean; review_status: string | null } {
  let score = 0;
  
  // Success status (30%)
  if (params.status === 'success') score += 0.30;
  
  // Low latency (20%)
  if (params.latency_ms < 2000) score += 0.20;
  else if (params.latency_ms < 5000) score += 0.10;
  
  // Reasonable cost (20%)
  if (params.cost_usd < 0.01) score += 0.20;
  else if (params.cost_usd < 0.05) score += 0.10;
  
  // No errors (30%)
  if (!params.error_message) score += 0.30;
  
  score = Math.max(0, Math.min(1, score));
  const flagged_for_review = score < 0.50;
  
  return {
    quality_score: Number(score.toFixed(2)),
    flagged_for_review,
    review_status: flagged_for_review ? 'pending' : null,
  };
}

// Helper function to fix common JSON issues
function fixMalformedJSON(content: string): string {
  try {
    // Remove markdown code blocks
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Detect if it's an array or object
    const trimmed = content.trim();
    const isArray = trimmed.startsWith('[') || trimmed.indexOf('[') < trimmed.indexOf('{');
    
    if (isArray) {
      // Handle JSON array
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        content = content.substring(arrayStart, arrayEnd + 1);
      } else if (arrayStart !== -1) {
        // Array started but not properly closed - try to fix
        content = content.substring(arrayStart);
        
        // Check if we have incomplete JSON (truncated response)
        // Find the last complete object
        const lastCompleteObject = findLastCompleteObject(content);
        if (lastCompleteObject !== -1) {
          content = content.substring(0, lastCompleteObject + 1) + ']';
          console.log('🔧 Fixed truncated array by closing at last complete object');
        } else {
          // Try to close the array anyway
          if (!content.endsWith(']')) {
            // Check if last char is a comma, remove it
            content = content.replace(/,\s*$/, '');
            content += ']';
          }
        }
      }
    } else {
      // Handle single JSON object
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        content = content.substring(jsonStart, jsonEnd + 1);
      }
    }
    
    // Fix unterminated strings by finding and closing them
    const quoteCount = (content.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      const lastQuoteIndex = content.lastIndexOf('"');
      const afterLastQuote = content.substring(lastQuoteIndex + 1);
      
      if (!afterLastQuote.includes('"') && afterLastQuote.trim().length > 0) {
        const nextSpecialChar = afterLastQuote.search(/[,}\]]/);
        if (nextSpecialChar !== -1) {
          content = content.substring(0, lastQuoteIndex + 1 + nextSpecialChar) + 
                   '"' + 
                   content.substring(lastQuoteIndex + 1 + nextSpecialChar);
        } else {
          content += '"';
        }
      }
    }
    
    return content;
  } catch (error) {
    console.error('Error fixing JSON:', error);
    return content;
  }
}

// Helper to find the position of the last complete JSON object in an array
function findLastCompleteObject(content: string): number {
  let braceCount = 0;
  let lastCompleteEnd = -1;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        lastCompleteEnd = i;
      }
    }
  }
  
  return lastCompleteEnd;
}

// Attempt to recover valid JSON from truncated/malformed content
function attemptJSONRecovery(content: string): string | null {
  try {
    // Find the array start
    const arrayStart = content.indexOf('[');
    if (arrayStart === -1) return null;
    
    // Extract from array start
    let jsonContent = content.substring(arrayStart);
    
    // Find the last complete object
    const lastComplete = findLastCompleteObject(jsonContent);
    
    if (lastComplete === -1) {
      console.log('⚠️ No complete objects found in content');
      return null;
    }
    
    // Build valid array with complete objects only
    const validContent = jsonContent.substring(0, lastComplete + 1);
    
    // Close the array properly
    let result = validContent.trim();
    if (!result.endsWith(']')) {
      // Remove trailing comma if present
      result = result.replace(/,\s*$/, '');
      result += ']';
    }
    
    // Verify it starts with [
    if (!result.startsWith('[')) {
      result = '[' + result;
    }
    
    // Quick validation - try to parse
    JSON.parse(result);
    
    console.log(`🔧 Recovered ${(result.match(/\{/g) || []).length} complete objects`);
    return result;
  } catch (error) {
    console.error('JSON recovery failed:', error);
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('🚀 AI Generate Questions request received');

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('❌ Authentication failed');
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please log in to generate questions',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    console.log('✅ User authenticated:', user.id);

    // Get student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (studentError) {
      console.error('❌ Database error:', studentError);
      throw studentError;
    }

    if (!student) {
      return new Response(JSON.stringify({
        error: 'NotFound',
        message: 'Student record not found',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    console.log('✅ Student found:', student.id);

    // Rate limit: 10 question generation requests per hour per user
    const rateCheck = await checkRateLimit(supabase, user.id, 'question_generation', 10, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders);
    }

    // Parse request body
    const body = await req.json();
    
    if (!body.subjectId) {
      return new Response(JSON.stringify({
        error: 'BadRequest',
        message: 'Missing required field: subjectId',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const questionCount = Math.min(body.questionCount || 15, 25); // Cap at 25
    const isFirstSession = body.isFirstSession || false;
    const difficultyMix = body.difficultyMix || '30% easy, 50% medium, 20% hard';
    const difficultyPreference = body.difficultyPreference || 'adaptive';
    // Sanitize topic strings from client
    const selectedTopics = (body.selectedTopics || []).map((t: string) => sanitizeUserInput(String(t), 100));

    // Get subject name
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('name_en')
      .eq('id', body.subjectId)
      .single();

    if (subjectError || !subject) {
      throw new Error('Subject not found');
    }

    const subjectName = subject.name_en;
    console.log(`📚 Subject: ${subjectName}`);
    console.log(`🎯 Session type: ${isFirstSession ? 'First Session (Diagnostic)' : 'Personalized'}`);
    console.log(`🎯 Difficulty preference: ${difficultyPreference}`);
    console.log(`📝 Selected topics from user: ${selectedTopics.length > 0 ? selectedTopics.join(', ') : 'None (AI will decide)'}`);

    // Determine topics to use - prioritize user-selected topics
    let topicsToUse: string[] = [];
    
    if (selectedTopics.length > 0) {
      // User explicitly selected topics - use them
      topicsToUse = selectedTopics;
      console.log(`✅ Using user-selected topics: ${topicsToUse.join(', ')}`);
    } else if (isFirstSession) {
      // First session: balanced coverage
      topicsToUse = [];
      console.log(`📝 First session - balanced topic coverage for diagnostic assessment`);
    } else if (body.weakTopics && body.weakTopics.length > 0) {
      // Use weak topics from adaptive learning
      topicsToUse = body.weakTopics;
      console.log(`🎯 Using weak topics from adaptive learning: ${topicsToUse.join(', ')}`);
    } else {
      // Fallback for non-first sessions without topics
      topicsToUse = [];
      console.log(`📝 No topics specified - AI will provide balanced coverage`);
    }

    console.log(`📊 Difficulty mix: ${difficultyMix}`);
    // Use the requested question count directly
    // DeepSeek can handle 15 questions but may be slow (30-50 seconds)
    const actualQuestionCount = questionCount;
    console.log(`📝 Requesting ${actualQuestionCount} questions...`);

    // Call DeepSeek API with retry logic
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY')!;
    // Use deepseek-chat for better reliability and JSON formatting
    const model = 'deepseek-chat';

    // Build adaptive system prompt based on session type and user preferences
    let distributionText = '';
    let topicInstruction = '';
    
    if (topicsToUse.length > 0) {
      // User selected specific topics OR adaptive learning identified weak topics
      topicInstruction = `MÖVZU TƏLƏBİ (ÇOX VACİB):
Sualları YALNIZ bu mövzulardan yarat: ${topicsToUse.join(', ')}
- Hər mövzudan təxminən bərabər sayda sual olmalıdır
- Bu mövzulardan KƏNAR sual YARATMA!`;
      
      distributionText = `DISTRIBUTION:
- Questions MUST be from these specific topics: ${topicsToUse.join(', ')}
- Distribute questions equally across selected topics
- Difficulty mix: ${difficultyMix}
- Goal: Master the selected topics thoroughly`;
    } else if (isFirstSession) {
      // First session: Diagnostic - balanced coverage
      distributionText = `DISTRIBUTION:
- Balanced topic coverage across all ${subjectName} areas
- Difficulty mix: ${difficultyMix}
- Goal: Assess baseline knowledge to identify weak areas`;
    } else {
      // No specific topics: General balanced practice
      distributionText = `DISTRIBUTION:
- Balanced ${subjectName} knowledge coverage across various topics
- Difficulty mix: ${difficultyMix}
- Goal: Maintain and improve overall performance`;
    }

    // Generate a random seed for variety
    const randomSeed = Math.floor(Math.random() * 10000);
    const timestamp = Date.now();
    
    const systemPrompt = `Siz ${subjectName} müəllimisisiniz. DİM standartlarına uyğun ${actualQuestionCount} sual yaradın.

MÜTLƏQ Azərbaycan dilində. JSON massiv formatında qaytar.

${topicInstruction}

ÇƏTİNLİK:
- easy: Sadə tərif, fakt, 1 addım hesablama
- medium: Tətbiq, 2-3 addım hesablama, formul
- hard: Mürəkkəb, 4+ addım, çox konsepsiya

${distributionText}

JSON STRUKTURU (hər sual üçün):
{"questionText":"sual","optionA":"A","optionB":"B","optionC":"C","optionD":"D","optionE":"E","correctAnswer":"A/B/C/D/E","difficulty":"easy/medium/hard","topic":"mövzu","explanation":"izahat"}

Seed: ${randomSeed}`;

    const userPrompt = `Generate ${actualQuestionCount} ${subjectName} questions in valid JSON array format. Return ONLY the JSON array, no other text.`;

    let questions: any[] = [];
    let retryCount = 0;
    const maxRetries = 2;
    let aiData: any = null; // Capture for logging

    while (retryCount <= maxRetries) {
      try {
        console.log(`🤖 Calling DeepSeek API (attempt ${retryCount + 1}/${maxRetries + 1})...`);
        console.log(`📝 Requesting ${actualQuestionCount} questions`);

        // Create AbortController for timeout (55 seconds - leave 5s buffer for Edge Function 60s limit)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7, // Slightly lower for faster, more consistent responses
            max_tokens: 4500, // Sufficient for 15 questions with explanations
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('❌ DeepSeek API error:', {
            status: aiResponse.status,
            statusText: aiResponse.statusText,
            error: errorText,
          });
          throw new Error(`DeepSeek API error: ${aiResponse.status} - ${errorText}`);
        }

        aiData = await aiResponse.json();
        let aiContent = aiData.choices[0].message.content;

        console.log('✅ AI response received');
        console.log('📄 Raw content preview:', aiContent.substring(0, 300));

        // Try to fix common JSON issues
        const fixedContent = fixMalformedJSON(aiContent);
        
        if (fixedContent !== aiContent) {
          console.log('🔧 Applied JSON fixes');
        }

        // Parse response
        try {
          // First attempt: direct parse
          let parsed;
          try {
            parsed = JSON.parse(fixedContent);
          } catch (directParseError) {
            // Second attempt: try to extract valid JSON array
            console.log('🔧 Direct parse failed, attempting recovery...');
            
            // Try to find and parse just the array portion
            const recoveredContent = attemptJSONRecovery(fixedContent);
            if (recoveredContent) {
              parsed = JSON.parse(recoveredContent);
              console.log('✅ JSON recovery successful');
            } else {
              throw directParseError;
            }
          }
          
          questions = Array.isArray(parsed) ? parsed : [parsed];
          
          // Validate we got questions
          if (questions.length === 0) {
            throw new Error('No questions in response');
          }
          
          console.log(`✅ Successfully parsed ${questions.length} questions`);
          break; // Success! Exit retry loop
          
        } catch (parseError) {
          console.error('❌ Failed to parse JSON:', parseError);
          console.error('Raw content:', fixedContent.substring(0, 500));
          
          if (retryCount < maxRetries) {
            console.log(`⚠️ Retrying... (${retryCount + 1}/${maxRetries})`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            continue;
          } else {
            throw new Error('Failed to generate valid questions after retries');
          }
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          console.log(`⚠️ Error occurred, retrying... (${retryCount + 1}/${maxRetries})`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          throw error;
        }
      }
    }

    // Validate and clean questions
    questions = questions
      .filter((q: any) => 
        q.questionText &&
        q.optionA && q.optionB && q.optionC && q.optionD && q.optionE &&
        q.correctAnswer &&
        ['A', 'B', 'C', 'D', 'E'].includes(q.correctAnswer)
      )
      .map((q: any) => ({
        questionText: String(q.questionText).substring(0, 500),
        optionA: String(q.optionA).substring(0, 200),
        optionB: String(q.optionB).substring(0, 200),
        optionC: String(q.optionC).substring(0, 200),
        optionD: String(q.optionD).substring(0, 200),
        optionE: String(q.optionE).substring(0, 200),
        correctAnswer: q.correctAnswer,
        difficulty: q.difficulty || 'medium',
        topic: String(q.topic || 'General').substring(0, 50),
        explanation: String(q.explanation || 'No explanation provided').substring(0, 500),
      }));

    // Handle insufficient questions gracefully
    if (questions.length === 0) {
      console.error(`❌ No valid questions generated`);
      throw new Error('No valid questions could be generated. Please try again.');
    }

    // If we got fewer questions than requested, log warning but continue
    if (questions.length < actualQuestionCount) {
      console.warn(`⚠️ Generated ${questions.length}/${actualQuestionCount} questions (partial success)`);
      
      // If we have less than 50% of requested, try one more time to supplement
      if (questions.length < actualQuestionCount * 0.5 && retryCount < maxRetries) {
        console.log(`🔄 Attempting to generate ${actualQuestionCount - questions.length} more questions...`);
        
        try {
          const supplementNeeded = actualQuestionCount - questions.length;
          const supplementPrompt = `Generate ${supplementNeeded} MORE unique ${subjectName} questions. These must be DIFFERENT from any previous questions. Return ONLY a valid JSON array.`;
          
          const supplementController = new AbortController();
          const supplementTimeoutId = setTimeout(() => supplementController.abort(), 30000);
          
          const supplementResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: supplementPrompt },
              ],
              temperature: 0.9, // Higher temperature for more variety
              max_tokens: 2500,
            }),
            signal: supplementController.signal,
          });
          
          clearTimeout(supplementTimeoutId);
          
          if (supplementResponse.ok) {
            const supplementData = await supplementResponse.json();
            const supplementContent = supplementData.choices[0].message.content;
            const fixedSupplementContent = fixMalformedJSON(supplementContent);
            
            try {
              let supplementParsed;
              try {
                supplementParsed = JSON.parse(fixedSupplementContent);
              } catch {
                const recovered = attemptJSONRecovery(fixedSupplementContent);
                if (recovered) supplementParsed = JSON.parse(recovered);
              }
              
              if (supplementParsed) {
                const supplementQuestions = (Array.isArray(supplementParsed) ? supplementParsed : [supplementParsed])
                  .filter((q: any) => 
                    q.questionText &&
                    q.optionA && q.optionB && q.optionC && q.optionD && q.optionE &&
                    q.correctAnswer &&
                    ['A', 'B', 'C', 'D', 'E'].includes(q.correctAnswer)
                  )
                  .map((q: any) => ({
                    questionText: String(q.questionText).substring(0, 500),
                    optionA: String(q.optionA).substring(0, 200),
                    optionB: String(q.optionB).substring(0, 200),
                    optionC: String(q.optionC).substring(0, 200),
                    optionD: String(q.optionD).substring(0, 200),
                    optionE: String(q.optionE).substring(0, 200),
                    correctAnswer: q.correctAnswer,
                    difficulty: q.difficulty || 'medium',
                    topic: String(q.topic || 'General').substring(0, 50),
                    explanation: String(q.explanation || 'No explanation provided').substring(0, 500),
                  }));
                
                if (supplementQuestions.length > 0) {
                  questions = [...questions, ...supplementQuestions].slice(0, actualQuestionCount);
                  console.log(`✅ Supplemented to ${questions.length} questions`);
                }
              }
            } catch (supplementParseError) {
              console.warn('⚠️ Failed to parse supplement questions, continuing with original set');
            }
          }
        } catch (supplementError) {
          console.warn('⚠️ Supplement request failed, continuing with original set:', supplementError);
        }
      }
    }

    // Final validation - accept any number of questions >= 1
    console.log(`✅ Final question count: ${questions.length}/${actualQuestionCount}`);

    // Save to database with cache expiration (3 days)
    // Log if we're returning fewer questions than requested
    if (questions.length < actualQuestionCount) {
      console.warn(`⚠️ Returning ${questions.length} questions instead of ${actualQuestionCount} requested`);
    }

    const cacheExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: session, error: sessionError } = await supabase
      .from('competitive_sessions')
      .insert({
        student_id: student.id,
        subject_id: body.subjectId,
        subject_name: subjectName,
        questions_data: questions,
        total_questions: questions.length,
        weak_topics: topicsToUse,
        cache_expires_at: cacheExpiresAt,
      })
      .select('id')
      .maybeSingle();

    if (sessionError) {
      console.error('❌ Failed to save session:', sessionError);
      throw sessionError;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Session created: ${session.id}`);
    console.log(`⏱️ Total time: ${(duration / 1000).toFixed(2)}s`);

    // Log AI usage (Stage 5.5)
    try {
      const promptTokens = aiData?.usage?.prompt_tokens || 0;
      const completionTokens = aiData?.usage?.completion_tokens || 0;
      const totalTokens = aiData?.usage?.total_tokens || 0;
      
      // Deepseek pricing: $0.14/1M input, $0.28/1M output
      const inputCost = (promptTokens / 1_000_000) * 0.14;
      const outputCost = (completionTokens / 1_000_000) * 0.28;
      const totalCost = inputCost + outputCost;

      const requestId = `questions_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const { error: logError } = await supabase.from('ai_usage_logs').insert({
        request_id: requestId,
        user_id: user.id,
        feature_type: 'question_generation',
        provider: 'deepseek',
        model: model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: totalCost,
        latency_ms: duration,
        status: 'success',
        request_metadata: {
          subject_id: body.subjectId,
          subject_name: subjectName,
          requested_count: questionCount,
          weak_topics_count: topicsToUse?.length || 0,
        },
        response_metadata: {
          generated_count: questions.length,
          retry_count: retryCount,
        },
      });
      
      if (logError) {
        console.error('⚠️ Failed to log AI usage:', logError);
        console.error('Log error details:', JSON.stringify(logError, null, 2));
      } else {
        console.log('✅ AI usage logged successfully');
      }
    } catch (logError) {
      console.error('Failed to log usage (exception):', logError);
    }

    return new Response(JSON.stringify({
      questions,
      sessionId: session.id,
      weakTopics: topicsToUse,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    const duration = Date.now() - startTime;
    console.log(`⏱️ Failed after: ${(duration / 1000).toFixed(2)}s`);

    // Log error (Stage 5.5)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authHeader = req.headers.get('Authorization');
      
      if (authHeader) {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const errorRequestId = `questions_error_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          await supabase.from('ai_usage_logs').insert({
            request_id: errorRequestId,
            user_id: user.id,
            feature_type: 'question_generation',
            provider: 'deepseek',
            model: Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-chat',
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_usd: 0,
            latency_ms: duration,
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            error_code: 'FUNCTION_ERROR',
          });
        }
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return safeErrorResponse(corsHeaders);
  }
});
