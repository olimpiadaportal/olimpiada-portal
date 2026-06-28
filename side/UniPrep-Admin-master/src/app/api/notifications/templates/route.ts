/**
 * Templates API
 * CRUD operations for notification templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

// GET - List all templates
export async function GET(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'moderator');
    if (authError) return authError;

    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching templates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    // Map database columns to frontend format (Stage 7 schema)
    const mappedData = (data || []).map(template => ({
      id: template.id,
      name: template.name || 'Unnamed',
      type: template.category || 'general',
      title: template.title || '',
      body: template.body || '',
      channels: template.channels || ['in_app'],
      variables: template.variables || [],
      usage_count: template.usage_count || 0,
      is_active: template.is_active !== false,
      created_at: template.created_at,
      updated_at: template.updated_at,
    }));

    return NextResponse.json(mappedData);
  } catch (error) {
    console.error('Error in templates API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const body = await request.json();
    const { name, type, title, body: templateBody, channels, priority } = body;

    // Validate
    if (!name || !title || !templateBody) {
      return NextResponse.json(
        { error: 'Name, title, and body are required' },
        { status: 400 }
      );
    }

    // Extract variables
    const titleVars = (title.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.slice(2, -2));
    const bodyVars = (templateBody.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.slice(2, -2));
    const variables = [...new Set([...titleVars, ...bodyVars])];

    // Stage 7 schema only (name, category, channels)
    const { data, error } = await supabase
      .from('notification_templates')
      .insert({
        name,
        category: type || 'general',
        title,
        body: templateBody,
        channels: channels || ['in_app'],
        variables,
        usage_count: 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in templates API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
