const EMLY_COOKIE_DOMAIN = '.elmly.app'

export const isElmlyHost = (hostname?: string | null) => {
  if (!hostname) return false
  return hostname === 'elmly.app' || hostname.endsWith(EMLY_COOKIE_DOMAIN)
}

export const getElmlyCookieOptions = (hostname?: string | null) =>
  isElmlyHost(hostname)
    ? {
        domain: EMLY_COOKIE_DOMAIN,
        path: '/',
        sameSite: 'lax' as const,
        secure: true,
      }
    : undefined
