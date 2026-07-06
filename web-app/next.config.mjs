/** @type {import('next').NextConfig} */

// Derive the Supabase host from the public project URL so next/image is
// permitted to optimize + resize public-bucket assets (news covers, wallpapers)
// and so the CSP below can allow API/storage calls to exactly our project.
// L5: a missing/malformed NEXT_PUBLIC_SUPABASE_URL is a hard configuration
// error — THROW at config evaluation instead of silently widening the CSP and
// image allow-list to the shared *.supabase.co wildcard (any Supabase project
// would have been allowed).
function supabaseHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (url) return new URL(url).hostname;
  } catch {
    // fall through to the explicit error below
  }
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL must be set to the project URL (e.g. https://xyz.supabase.co) " +
      "before building/starting web-app — the CSP and image allow-list are derived from it.",
  );
}

const SUPABASE_HOST = supabaseHost();
const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy (Round 7 hardening).
// - script-src needs 'unsafe-inline' for Next.js hydration inline scripts and
//   our no-flash theme script; 'unsafe-eval' is DEV-ONLY (react-refresh).
//   (Future hardening: nonce-based CSP via middleware.)
// - style-src 'unsafe-inline' — Next injects inline styles; Google Fonts CSS.
// - fonts: the student area loads JetBrains Mono from Google Fonts.
// - connect-src: Supabase REST/Auth/Storage (+ websocket) only.
// - frame-src: the Google Maps embed on the Contact page.
// - frame-ancestors 'self': the site must not be framed by other origins.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "frame-src https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

// Baseline security headers for every route. HSTS is ignored by browsers over
// plain HTTP (local dev) and takes effect automatically once served via HTTPS.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
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
  // Never expose framework fingerprinting for free.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // R10 (F9): optimized variants (news covers etc.) are immutable uploads —
    // cache them for 31 days so revisits don't re-optimize and covers paint
    // instantly instead of popping in late.
    minimumCacheTTL: 2678400,
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
