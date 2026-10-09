import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROBOTS_TAG_HEADER, robotsTagFor } from "@/lib/indexing";
import { canonicalRedirectFor } from "@/lib/canonicalHost";

export async function middleware(request: NextRequest) {
  // A person who arrives on the production deployment's *.vercel.app alias is
  // sent to the brand domain BEFORE any session work. API, auth-link and
  // non-GET requests are never touched — see lib/canonicalHost.ts.
  const canonical = canonicalRedirectFor(request);
  // 307, not 308: a permanent redirect is cached by the browser indefinitely,
  // so a misconfigured site URL would outlive its own fix. The alias is
  // already noindex (lib/indexing.ts), so there is no link equity to transfer.
  if (canonical) return NextResponse.redirect(canonical, 307);

  const response = await updateSession(request);

  // Non-production deployments (staging, previews, *.vercel.app, localhost)
  // must never be indexed — see src/lib/indexing.ts for why this is keyed on
  // the request host rather than an environment variable. Applied HERE rather
  // than inside updateSession so it covers every one of that function's return
  // paths, including the early one taken before Supabase is configured.
  const robots = robotsTagFor(request.headers.get("host"));
  if (robots) response.headers.set(ROBOTS_TAG_HEADER, robots);

  return response;
}

export const config = {
  // Run on all routes except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
