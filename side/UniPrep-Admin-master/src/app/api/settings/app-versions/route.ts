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

function validateVersionPayload(body: any, partial = false) {
  const payload: Record<string, any> = {};

  if (!partial || body.version !== undefined) {
    if (typeof body.version !== 'string' || !VERSION_PATTERN.test(body.version.trim())) {
      return { error: 'Version must use MAJOR.MINOR.PATCH format, for example 1.0.2' };
    }
    payload.version = body.version.trim();
  }

  if (!partial || body.build_number !== undefined) {
    const buildNumber = Number(body.build_number);
    if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
      return { error: 'Build number must be a positive integer' };
    }
    payload.build_number = buildNumber;
  }

  if (!partial || body.platform !== undefined) {
    if (typeof body.platform !== 'string' || !VALID_PLATFORMS.has(body.platform)) {
      return { error: 'Platform must be ios or android' };
    }
    payload.platform = body.platform;
  }

  if (!partial || body.force_update !== undefined) {
    payload.force_update = Boolean(body.force_update);
  }

  for (const field of ['update_message', 'update_message_az', 'update_message_ru']) {
    if (!partial || body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
        return { error: 'Update messages are required in English, Azerbaijani, and Russian' };
      }
      payload[field] = body[field].trim();
    }
  }

  if (body.ios_url !== undefined) {
    payload.ios_url = normalizeOptionalUrl(body.ios_url);
  } else if (!partial) {
    payload.ios_url = null;
  }

  if (body.android_url !== undefined) {
    payload.android_url = normalizeOptionalUrl(body.android_url);
  } else if (!partial) {
    payload.android_url = null;
  }

  return { payload };
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin(request, 'moderator');
    if (authError) return authError;

    const platform = request.nextUrl.searchParams.get('platform');
    if (platform && !VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    let query = supabase
      .from('app_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching app versions:', error);
      return NextResponse.json({ error: 'Failed to fetch app versions' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('App versions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin(request, 'admin');
    if (authError) return authError;

    const body = await request.json();
    const validation = validateVersionPayload(body);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const payload = validation.payload!;

    const { data: existing, error: existingError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('platform', payload.platform)
      .eq('version', payload.version)
      .eq('build_number', payload.build_number)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking app version duplicate:', existingError);
      return NextResponse.json({ error: 'Failed to validate app version' }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { error: 'This app version and build number already exist for the selected platform' },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('app_versions')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating app version:', error);
      return NextResponse.json({ error: 'Failed to create app version' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('App versions POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
