// NOTE: this app uses the src/ layout, so the middleware file MUST live at
// src/middleware.ts — at the package root Next.js silently never registers it
// (audit finding H9-admin). It refreshes the Supabase session cookie and
// enforces the 30-minute idle logout (see lib/supabase/middleware.ts).
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
