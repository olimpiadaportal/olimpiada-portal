import { NextRequest, NextResponse } from 'next/server'
import { measureTiming } from './lib/timing'

// C-1: Simple in-memory rate limiter for auth endpoints
// No external dependencies needed — suitable for single-instance deployment
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupStaleEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}

function getRateLimitKey(request: NextRequest): string {
  // Use IP + path as rate limit key
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown'
  return `${ip}:${request.nextUrl.pathname}`
}

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  cleanupStaleEntries()
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return false
  }

  entry.count++
  return entry.count > maxRequests
}

// Rate limit config per path
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/auth/delete-account': { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 min
  '/auth/reset-password': { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 min
  '/auth/confirm': { maxRequests: 20, windowMs: 15 * 60 * 1000 },       // 20 per 15 min
}

export function middleware(request: NextRequest) {
  return measureTiming('auth.middleware', () => {
    const pathname = request.nextUrl.pathname

    // Only rate-limit auth pages
    const limitConfig = RATE_LIMITS[pathname]
    if (limitConfig) {
      const key = getRateLimitKey(request)
      if (isRateLimited(key, limitConfig.maxRequests, limitConfig.windowMs)) {
        return new NextResponse('Too many requests. Please try again later.', {
          status: 429,
          headers: {
            'Retry-After': '900',
            'Content-Type': 'text/plain',
          },
        })
      }
    }

    return NextResponse.next()
  })
}

export const config = {
  matcher: ['/auth/:path*'],
}
