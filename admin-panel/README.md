# OlympIQ — Admin Panel (Administrator & Content Manager)

Next.js (App Router, TypeScript) skeleton for the Admin Panel. Shares the root
`supabase/` backend. **No Student/Parent Web App features here.** Runs on port 3001
so it can run alongside the web app (port 3000).

## Setup

```bash
cd admin-panel
cp .env.local.example .env.local   # then fill with your Supabase DEV/STAGING values
npm install
npm run dev                        # http://localhost:3001
```

Get `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase
Dashboard → Project Settings → API. The service role key is **server-only** and is
not used yet (added in a later stage); never prefix it with `NEXT_PUBLIC`.

## Scripts

- `npm run dev` — start dev server (port 3001)
- `npm run build` / `npm run start` — production build / serve
- `npm run typecheck` — TypeScript check
- `npm run lint` — lint

## Structure

- `src/lib/env.ts` — client-safe env values + `isSupabaseConfigured`
- `src/lib/supabase/client.ts` — browser client (anon key)
- `src/lib/supabase/server.ts` — server client (cookies)
- `src/lib/supabase/middleware.ts` + `middleware.ts` — session refresh
- `src/app/` — layout, home, `loading`, `error`, `not-found`, `unauthorized`

Admin login, permission-aware navigation, taxonomy/question management and review
workflows are added in later stages. Every privileged route must be permission-checked
server-side; Content Managers must never reach payments/audit/settings.
