// ============================================
// DELETE ACCOUNT - Secure Account Deletion
// Stage 9 - Account Management
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the JWT token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Admin client for user verification and deletion - more reliable than anon client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authenticated user using admin client with token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid or expired token', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`🗑️ Starting account deletion for user: ${userId}`);

    // Parse request body for confirmation
    const { confirmation } = await req.json();
    
    if (confirmation !== 'DELETE') {
      return new Response(
        JSON.stringify({ error: 'Invalid confirmation. Please type DELETE to confirm.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Delete user-related data (cascade should handle most, but let's be explicit)
    console.log('📋 Step 1: Cleaning up user data...');

    // Delete from students table (if student)
    const { error: studentError } = await supabaseAdmin
      .from('students')
      .delete()
      .eq('user_id', userId);
    
    if (studentError) {
      console.log('Note: No student record or error:', studentError.message);
    }

    // Delete from teachers table (if teacher)
    const { error: teacherError } = await supabaseAdmin
      .from('teachers')
      .delete()
      .eq('user_id', userId);
    
    if (teacherError) {
      console.log('Note: No teacher record or error:', teacherError.message);
    }

    // Delete user settings
    const { error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .delete()
      .eq('user_id', userId);
    
    if (settingsError) {
      console.log('Note: No settings record or error:', settingsError.message);
    }

    // Delete daily stats
    const { error: statsError } = await supabaseAdmin
      .from('daily_stats')
      .delete()
      .eq('user_id', userId);
    
    if (statsError) {
      console.log('Note: No daily stats or error:', statsError.message);
    }

    // Delete activity log
    const { error: activityError } = await supabaseAdmin
      .from('activity_log')
      .delete()
      .eq('user_id', userId);
    
    if (activityError) {
      console.log('Note: No activity log or error:', activityError.message);
    }

    // Delete bookmarks
    const { error: bookmarksError } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('user_id', userId);
    
    if (bookmarksError) {
      console.log('Note: No bookmarks or error:', bookmarksError.message);
    }

    // Delete profiles table entry
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);
    
    if (profileError) {
      console.error('Error deleting profile:', profileError);
      // Don't fail here, continue with auth deletion
    }

    // Step 2: Delete the user from auth.users using admin API
    console.log('🔐 Step 2: Deleting auth user...');
    
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete account. Please try again or contact support.',
          details: deleteError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Account deleted successfully for user: ${userId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Account deleted successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
