/**
 * Template API - Single template operations
 * Update and delete specific templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables:', { 
        hasUrl: !!supabaseUrl, 
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY 
      });
      return NextResponse.json(
        { error: 'Server configuration error - SUPABASE_SERVICE_ROLE_KEY is required' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    const body = await request.json();
    const { name, type, title, body: templateBody, channels } = body;

    // Extract variables from title and body
    const titleVars = (title?.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.slice(2, -2));
    const bodyVars = (templateBody?.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.slice(2, -2));
    const variables = [...new Set([...titleVars, ...bodyVars])];

    // Build update object - Stage 7 schema only
    const updateData: any = {
      name,
      title,
      body: templateBody,
      channels,
      variables,
      updated_at: new Date().toISOString(),
    };
    
    // Map 'type' to 'category' (Stage 7 schema)
    if (type) {
      updateData.category = type;
    }

    const { data, error } = await supabase
      .from('notification_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in template API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authenticated admin
    const { admin, error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables:', { 
        hasUrl: !!supabaseUrl, 
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY 
      });
      return NextResponse.json(
        { error: 'Server configuration error - SUPABASE_SERVICE_ROLE_KEY is required' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in template API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
