/** @type {import('next').NextConfig} */

// Derive the Supabase host from the public project URL (API/storage calls and
// media previews — question images, news covers, wallpapers, avatars).
function supabaseHost() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) return new URL(url).hostname;
  } catch {
    // ignore malformed / missing URL and fall through to the wildcard
  }
  return "*.supabase.co";
}

const SUPABASE_HOST = supabaseHost();
const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy (Round 7 hardening) — STRICTER than the web-app:
// no iframes, and must NEVER be frameable (frame-ancestors 'none' →
// clickjacking protection for privileged UI). script-src 'unsafe-inline' is
// required by Next.js hydration inline scripts; 'unsafe-eval' is DEV-ONLY
// (react-refresh). Google Fonts (the two explicit origins only, never
// wildcards) is allowed for the Website Content "Sayt şrifti" font previews.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Bulk question import posts its JSON through a Server Action, and Next's
      // DEFAULT body limit is 1 MB — below the 2 MB file cap this app validates
      // and advertises ("Max 2 MB"). A 1.5 MB file was therefore rejected by the
      // platform BEFORE any of our code ran, surfacing as an opaque action
      // failure instead of the app's own "file too large" message: the action's
      // first statement (requirePermission / requireAdmin) is never reached, so
      // nothing logs and nothing validates.
      //
      // Raised to 12 MB because an olympiad package posts EVERY selected grade's
      // file in ONE FormData, and mixed-mode files embed images as base64, which
      // inflates the payload by ~1.37x. The real ceilings stay where they are
      // enforceable and specific: BULK_MAX_FILE_BYTES per file, and the decoded
      // per-image cap in the media ingest path. This value only stops the
      // platform from failing first and silently.
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
