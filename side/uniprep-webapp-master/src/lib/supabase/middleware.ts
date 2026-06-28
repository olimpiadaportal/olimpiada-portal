import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getElmlyCookieOptions } from './cookie-options'

export async function updateSession(request: NextRequest) {
  // ── Dev bypass activation ──────────────────────────────────────────────────
  // Detects ?dev=TOKEN on any URL. Validates server-side, sets HttpOnly cookie,
  // then redirects to the same URL with the param stripped. Token never travels
  // further than this single middleware pass.
  const devToken = request.nextUrl.searchParams.get('dev')
  const expectedToken = process.env.DEV_BYPASS_TOKEN
  if (expectedToken && devToken) {
    // Constant-time comparison (Edge Runtime doesn't have crypto.timingSafeEqual)
    const a = devToken.padEnd(expectedToken.length, '\0')
    const b = expectedToken.padEnd(devToken.length, '\0')
    let match = a.length === b.length
    for (let i = 0; i < b.length; i++) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) match = false
    }

    if (match) {
      const cleanUrl = request.nextUrl.clone()
      cleanUrl.searchParams.delete('dev')
      const response = NextResponse.redirect(cleanUrl)
      response.cookies.set('elmly_dev_bypass', expectedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })
      return response
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  let supabaseResponse = NextResponse.next({
    request,
  })
  let authCookiesTouched = false
  const cookieOptions = getElmlyCookieOptions(request.nextUrl.hostname)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          authCookiesTouched = true
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (process.env.NODE_ENV === 'development' && authCookiesTouched) {
    console.info('[auth:web] refreshed auth cookies', {
      path: request.nextUrl.pathname,
      hasUser: Boolean(user),
    })
  }

  const redirectWithAuthCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, cookie)
    })
    if (authCookiesTouched) {
      response.headers.set('Cache-Control', 'private, no-store')
    }
    return response
  }

  // Check if webapp auth is enabled via feature flag
  // Uses the SECURITY DEFINER RPC (granted to anon) — direct table queries fail
  // on this route because the visitor is unauthenticated and RLS blocks anon reads.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register')

  if (isAuthRoute) {
    // Dev mode: skip waitlist gate entirely (npm run dev)
    const isDev = process.env.NODE_ENV === 'development'

    // Production: check for dev bypass cookie (set via ?dev=TOKEN on any page)
    const devBypassCookie = request.cookies.get('elmly_dev_bypass')?.value
    const hasValidBypass = expectedToken && devBypassCookie && devBypassCookie === expectedToken

    if (!isDev && !hasValidBypass) {
      try {
        const { data } = await supabase.rpc('get_mobile_app_settings')
        const webappAuthEnabled = !!(data?.feature_flags?.webapp_auth_enabled)

        if (!webappAuthEnabled) {
          const url = request.nextUrl.clone()
          url.pathname = '/'
          return redirectWithAuthCookies(url)
        }
      } catch {
        // If query fails, block auth routes by default (safer for pre-launch)
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return redirectWithAuthCookies(url)
      }
    }
  }

  // Public routes that don't require authentication
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register') ||
    request.nextUrl.pathname.startsWith('/forgot-password') ||
    request.nextUrl.pathname.startsWith('/terms') ||
    request.nextUrl.pathname.startsWith('/privacy') ||
    request.nextUrl.pathname.startsWith('/help') ||
    request.nextUrl.pathname.startsWith('/features') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname === '/'

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return redirectWithAuthCookies(url)
  }

  // Phase 2: Redirect students who haven't completed onboarding
  if (user && !request.nextUrl.pathname.startsWith('/onboarding') && !isPublicRoute) {
    try {
      const { data: student } = await supabase
        .from('students')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()

      if (student && student.onboarding_completed === false) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return redirectWithAuthCookies(url)
      }
    } catch {
      // If query fails, don't block — let user through
    }
  }

  if (authCookiesTouched) {
    supabaseResponse.headers.set('Cache-Control', 'private, no-store')
  }

  return supabaseResponse
}
