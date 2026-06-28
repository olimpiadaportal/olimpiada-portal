import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import DOMPurify from 'isomorphic-dompurify'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
}

export const dynamic = 'force-dynamic'

type PublicLegalDocument = {
  content: string | null
  last_updated: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (!type || !['terms_of_service', 'privacy_policy'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid type. Must be "terms_of_service" or "privacy_policy"' },
      { status: 400 }
    )
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .rpc('get_public_legal_document', { p_type: type })
      .maybeSingle()

    if (error) {
      console.error(`Failed to fetch ${type}:`, error)
      return NextResponse.json(
        { content: null, lastUpdated: null },
        { status: 200, headers: noStoreHeaders }
      )
    }

    const legalDocument = data as PublicLegalDocument | null
    const rawContent = typeof legalDocument?.content === 'string' ? legalDocument.content.trim() : ''
    const content = rawContent ? DOMPurify.sanitize(rawContent) : null

    return NextResponse.json({
      content,
      lastUpdated: legalDocument?.last_updated || null
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error(`Error fetching ${type}:`, error)
    return NextResponse.json(
      { content: null, lastUpdated: null },
      { status: 200, headers: noStoreHeaders }
    )
  }
}
