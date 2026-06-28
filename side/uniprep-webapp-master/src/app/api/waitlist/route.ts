import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface WaitlistRpcResponse {
  success: boolean
  message?: string
  error?: string
  id?: string
  retry_after?: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, source, locale, metadata } = body

    // Get client IP from headers
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwardedFor?.split(',')[0]?.trim() || realIp || null

    const supabase = await createClient()

    // Call the RPC function with IP for rate limiting
    // Using type assertion since the function isn't in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('join_waitlist', {
      p_email: email?.trim() || '',
      p_name: name?.trim() || null,
      p_source: source || 'landing_page',
      p_locale: locale || 'az',
      p_metadata: metadata || {},
      p_ip_address: ip
    }) as { data: WaitlistRpcResponse | null; error: Error | null }

    if (error) {
      console.error('Waitlist RPC error:', error)
      return NextResponse.json(
        { success: false, error: 'server_error', message: error.message },
        { status: 500 }
      )
    }

    // Handle rate limiting response
    if (data && !data.success && data.error === 'rate_limited') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'rate_limited',
          message: 'Too many attempts. Please try again later.',
          retry_after: data.retry_after || 3600
        },
        { status: 429 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Waitlist API error:', error)
    return NextResponse.json(
      { success: false, error: 'server_error' },
      { status: 500 }
    )
  }
}
