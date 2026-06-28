import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/apiAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_PLATFORMS = new Set(['ios', 'android']);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const dynamic = 'force-dynamic';

function normalizeOptionalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validatePartialPayload(body: any) {
  const payload: Record<string, any> = {};

  if (body.version !== undefined) {
    if (typeof body.version !== 'string' || !VERSION_PATTERN.test(body.version.trim())) {
      return { error: 'Version must use MAJOR.MINOR.PATCH format, for example 1.0.2' };
    }
    payload.version = body.version.trim();
  }

  if (body.build_number !== undefined) {
    const buildNumber = Number(body.build_number);
    if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
      return { error: 'Build number must be a positive integer' };
    }
    payload.build_number = buildNumber;
  }

  if (body.platform !== undefined) {
    if (typeof body.platform !== 'string' || !VALID_PLATFORMS.has(body.platform)) {
      return { error: 'Platform must be ios or android' };
    }
    payload.platform = body.platform;
  }

  if (body.force_update !== undefined) {
    payload.force_update = Boolean(body.force_update);
  }

  for (const field of ['update_message', 'update_message_az', 'update_message_ru']) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
        return { error: 'Update messages cannot be empty' };
      }
      payload[field] = body[field].trim();
    }
  }

  if (body.ios_url !== undefined) {
    payload.ios_url = normalizeOptionalUrl(body.ios_url);
  }

  if (body.android_url !== undefined) {
    payload.android_url = normalizeOptionalUrl(body.android_url);
  }

  if (Object.keys(payload).length === 0) {
    return { error: 'No valid fields were provided' };
  }

  return { payload };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const body = await request.json();
    const validation = validatePartialPayload(body);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('app_versions')
      .update(validation.payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating app version:', error);
      return NextResponse.json({ error: 'Failed to update app version' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('App versions PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const { error } = await supabase
      .from('app_versions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting app version:', error);
      return NextResponse.json({ error: 'Failed to delete app version' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('App versions DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
