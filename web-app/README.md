# Olimpiada Portal — Web App (Student & Parent)

Next.js (App Router, TypeScript) skeleton for the Student/Parent web app. Shares the
root `supabase/` backend. **No Admin Panel features here.**

## Setup

```bash
cd web-app
cp .env.local.example .env.local   # then fill with your Supabase DEV/STAGING values
npm install
npm run dev                        # http://localhost:3000
```

Get `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase
Dashboard → Project Settings → API. **Never** add the service role key here.

## Scripts

- `npm run dev` — start dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run typecheck` — TypeScript check
- `npm run lint` — lint

## Structure

- `src/lib/env.ts` — client-safe env values + `isSupabaseConfigured`
- `src/lib/supabase/client.ts` — browser client (anon key)
- `src/lib/supabase/server.ts` — server client (cookies)
- `src/lib/supabase/middleware.ts` + `middleware.ts` — session refresh
- `src/app/` — layout, home, `loading`, `error`, `not-found`, `unauthorized`

Business flows (auth UI, dashboards, daily tasks, tests, reports) are added in later
stages. Authorization is enforced server-side and by Supabase RLS — never trust
client role/score/subscription state.
