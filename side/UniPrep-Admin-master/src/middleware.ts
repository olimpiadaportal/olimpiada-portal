import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  // API routes that need special handling (authenticated via API key)
  const apiKeyRoutes = ['/api/notifications/processor'];
  const isApiKeyRoute = apiKeyRoutes.some(route => pathname.startsWith(route));
  
  if (isApiKeyRoute) {
    return NextResponse.next(); // Let the route handler validate API key
  }

  // Skip middleware for public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Update session and get response with refreshed cookies
  return await updateSession(request);
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
