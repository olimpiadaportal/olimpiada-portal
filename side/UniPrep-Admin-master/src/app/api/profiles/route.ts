/**
 * Profiles API
 * Get list of users for notification composer
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Require at least moderator role
  const authResult = await requireAdmin(request, 'moderator');
  if (authResult.error) return authResult.error;

  try {
    
    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error - missing Supabase credentials' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Simplified: Just get profiles without fetching emails from auth
    // This avoids auth.admin issues and is faster
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching profiles:', error);
      return NextResponse.json(
        { error: 'Failed to fetch profiles' },
        { status: 500 }
      );
    }


    // Add placeholder email for display
    const profilesWithEmails = (data || []).map(profile => ({
      ...profile,
      email: `${profile.full_name.toLowerCase().replace(/\s+/g, '.')}@elmly.app`,
    }));

    return NextResponse.json(profilesWithEmails);
  } catch (error) {
    console.error('❌ Error in profiles API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
