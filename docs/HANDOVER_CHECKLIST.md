# Handover Checklist

Everything the investor's team needs to take over OlympIQ. This file lists
NAMES and LOCATIONS only — never paste a secret value here.

Handover rule: the git repository carries the code; secrets travel separately
(the `secrets/` folder copied by hand or through a password manager, and the
env vars re-entered or transferred in each dashboard). A key that went through
git can never be taken back.

## 1. Code and files

- [ ] GitHub repository — transfer ownership or add the new team as admins.
- [ ] `secrets/` folder (git-ignored, copy by hand) — see `secrets/README.md`.
- [ ] Local env files (git-ignored, copy by hand or rebuild from Vercel):
  `web-app/.env.local`, `admin-panel/.env.local`, `mobile-app/.env`.
- [ ] `docs/investor/` identity/banking files are git-ignored on purpose — they
  are the investor's own documents; hand back, do not re-share.

## 2. Accounts and dashboards

| Service | What it runs | Handover action |
|---|---|---|
| Vercel | web-app (olympiq.ai) and admin-panel projects + their env vars | transfer projects / invite team |
| Supabase | production DB (`eu-west-1`) and **OlympIQ Staging** | transfer org or invite as owner |
| Expo / EAS (`olimpiadaplatforms-team`) | builds, OTA updates, iOS/Android signing credentials | add as owner; never re-run `eas init` |
| Google Play Console | Android app `ai.olympiq.app` | already in the investor's account after the transfer |
| Google Cloud | Play service account + RTDN Pub/Sub (created after the transfer) | in the investor's account |
| Apple Developer / App Store Connect | iOS app + 21 IAP products | moves to the investor's account (runbook Part 2) |
| AzeriCard / ABB | web payment rail (AZN) | merchant agreement is the investor's |
| Brevo | transactional email | transfer account or invite |
| Sentry | error monitoring | transfer org or invite |
| Domain `olympiq.ai` + DNS | site, email | registrar: _fill in_ |
| Mailbox `support@olympiq.ai` | public support contact | provider: _fill in_ |

## 3. Environment variables (names only)

**web-app (Vercel + `web-app/.env.local`)**
Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` ·
Email: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
`BUG_REPORT_NOTIFY_EMAIL`, `BUG_REPORT_IP_SALT` · `ADMIN_PANEL_URL` ·
AzeriCard: `AZERICARD_TERMINAL`, `AZERICARD_GATEWAY_URL`, `AZERICARD_TOKEN_URL`,
`AZERICARD_MERCHANT_URL`, `AZERICARD_MERCHANT_NAME`, `AZERICARD_CURRENCY`,
`AZERICARD_COUNTRY`, `AZERICARD_PRIVATE_KEY_B64`, `AZERICARD_MPI_PUBLIC_KEY_B64`,
`AZERICARD_BACKREF_URL`, `AZERICARD_TEST_TOKEN`,
`AZERICARD_STATUS_MAC_INCLUDES_TRAN_TRTYPE` ·
Jobs: `PAYMENTS_RECONCILE_KEY`, `NOTIFICATIONS_PROCESSOR_KEY` ·
Apple: `APPLE_IAP_BUNDLE_ID`, `APPLE_IAP_APP_APPLE_ID`, `APPLE_IAP_ISSUER_ID`,
`APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_ROOT_CERTIFICATES`,
`APPLE_IAP_SANDBOX_GRANTS` ·
Google Play (after the transfer): `GOOGLE_PLAY_PACKAGE_NAME`,
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_RTDN_AUDIENCE`,
`GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` ·
Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`

**admin-panel (Vercel + `admin-panel/.env.local`)**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_STORE_CONNECT_ISSUER_ID`,
`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`,
`APP_STORE_CONNECT_APP_ID`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`,
`GOOGLE_PLAY_PACKAGE_NAME`, `NEXT_PUBLIC_SENTRY_DSN`

**mobile-app (`mobile-app/.env` + EAS)**
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_BFF_URL`, `EXPO_PUBLIC_SENTRY_DSN`

**Developer shell (not in any file)**
`OLIMPIADA_PROD_DB_URL` (production), `OLIMPIADA_STAGING_DB_URL` (staging) —
read `CLAUDE.md` before using either.

## 4. Docs the new team should read first

`CLAUDE.md`, `STATUS.md`, `docs/DEVELOPER_SETUP.md`,
`docs/DATABASE_ENVIRONMENTS.md`, `docs/STORE_PAYMENTS_COMPLIANCE.md`,
`docs/STORE_ACCOUNT_TRANSFER_RUNBOOK.md`, `CHANGELOG.md`.
