# OlympIQ Mobile — Release & Operations Runbook (M4)

Prepared 2026-07-16. Operational procedures for building, shipping, updating, gating
and firefighting the mobile app. Companion doc: `STORE_LAUNCH_PACK.md` (submission
package). Secrets are referenced by NAME only — values live in EAS/Vercel/local env.

---

## 1. Environments & builds (master plan §18)

| Profile | Distribution | Channel | Backend |
|---|---|---|---|
| `development` | dev client, internal | development | dev Supabase + local BFF |
| `preview` | internal (APK/TestFlight internal) | preview | dev/staging Supabase |
| `production` | stores | production | prod Supabase + prod BFF |

Commands (run in `mobile-app/`):

```powershell
# one-time project link (owner Expo account) — writes extra.eas.projectId
eas init

# development build (REQUIRED to test push on Android — Expo Go can't receive remote push on SDK 53+)
eas build --profile development --platform android

# stage-close internal build
eas build --profile preview --platform all

# release
eas build --profile production --platform all
eas submit --platform ios
eas submit --platform android
```

Per-profile env (EAS → project → Environment variables): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BFF_URL`. Production values point at the
production stack ONLY; the service-role key never exists in mobile env in any form.

Release gate (before every production build — master plan §19/§21): `tsc --noEmit` 0 ·
`expo lint` clean · jest green · `npm audit` 0 · budgets sanity (§15) · flags flip-test
(payment trio, olympiad_module, leaderboard, notifications, notifications_push,
maintenance, force-update) · deep-link matrix · trilingual spot-grid · store metadata
current (`STORE_LAUNCH_PACK.md`).

## 2. Staged rollout

- **Play**: release to Closed testing → promote to Production with **staged rollout
  10% → 25% → 50% → 100%**, advancing only after 24h with no crash/ANR regression.
- **App Store**: enable **Phased Release** (7-day automatic ramp); pause from App
  Store Connect on any incident.
- Watch during rollout: store vitals dashboards (crash/ANR), Supabase logs for BFF
  error spikes, `notification_deliveries` failure ratio (see §4).

## 3. OTA updates (expo-updates, signed)

- JS-only fixes/copy/theme → `eas update --channel production` (signed; runtime pinned
  by `runtimeVersion: appVersion`, so an OTA can never cross a native-module boundary).
- Anything touching native modules, permissions, or the Expo SDK → store release.
- EVERY published OTA gets a STATUS.md line (date, channel, what changed).
- **Rollback = republish the previous update** on the same channel:
  `eas update:republish --channel production --group <previous-group-id>`
  (find the group id with `eas update:list --channel production`).

## 4. Push notifications — operations

Pipeline (contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`): engine creates `push`
delivery rows (only when the `notifications_push` flag is ON and the recipient's
`push_enabled` pref allows) → the web processor `POST/GET /api/notifications/process`
claims batches and sends via the Expo Push API → app routes taps through the
deep-link allowlist.

**Enable (in order):**
1. Set `EXPO_ACCESS_TOKEN` on the web-app deployment (Expo account → Access tokens).
2. Ensure a processor trigger exists (§4.1).
3. Flip **notifications_push** ON in admin → Settings → Feature flags.
4. Verify: admin composer → "Mobil tətbiq" channel → send to a test parent → device
   receives it; `notification_deliveries` row becomes `sent` with a provider ref.

**Disable (kill switch):** flip `notifications_push` OFF in admin Settings — the
engine stops creating push deliveries immediately, and the app stops registering
tokens (flag-gated). No deploy needed.

### 4.1 Processor trigger

> **The `web-app/vercel.json` cron was REMOVED (2026-07-19).** It scheduled the
> processor every 5 minutes, which the Vercel **Hobby** plan rejects (Hobby caps
> crons at once-per-day) — so every web-app deployment FAILED at config
> validation until the file was deleted. Re-add it ONLY on a Vercel **Pro** plan.
> Until then, use the external-cron option below (this costs nothing today because
> push/email are dormant — the processor has nothing to send yet).

- **External cron (recommended on Hobby, works today):** any scheduler (e.g. a
  free cron-job.org job, or pg_cron+pg_net once the prod DB exists) POSTs to
  `/api/notifications/process` with header `x-processor-key: $NOTIFICATIONS_PROCESSOR_KEY`.
- **Vercel cron (Pro plan only):** re-create `web-app/vercel.json` with
  `{"crons":[{"path":"/api/notifications/process","schedule":"*/5 * * * *"}]}` and
  set `CRON_SECRET` in Vercel — the route's GET handler accepts the cron's
  `Authorization: Bearer ${CRON_SECRET}`.
- Local/dev: run the POST manually with the header against `http://localhost:3000`.

### 4.2 Token hygiene (automatic)

`DeviceNotRegistered` tickets invalidate the token immediately (`is_valid=false`);
other per-token errors increment `failure_count` and invalidate at 5; successful
sends reset the counter. Logout deletes the device's own token row. No manual
cleanup is expected; if needed, invalid rows are visible via
`select platform, count(*) from push_tokens group by 1, is_valid`.

### 4.3 Testing matrix

- Android + **development build**: full remote push (Expo Go on Android CANNOT
  receive remote push since SDK 53 — the app detects Expo Go and skips registration).
- iOS: Expo Go still receives Expo push in dev; production uses APNs via EAS creds.
- Flag OFF regression: with `notifications_push` OFF, a fresh login must create ZERO
  `push_tokens` rows.

## 5. Version force-gate runbook (admin → Mobile App)

The admin **Mobile App** page edits `mobile_app_versions` (per platform: min /
latest / force / store_url / trilingual message), served to devices via
`get_mobile_config()`; the app blocks with `ForceUpdateScreen` when
`force = true AND app version < min`.

- **Soft nudge:** raise `latest_version` only — the app can show update-available UI
  without blocking.
- **Force upgrade (e.g. security fix):** set `min_version` to the first safe version,
  `force_update = true`, fill `store_url` + the trilingual message. Devices below min
  are blocked at next config fetch (≤30s foregrounded).
- **Roll back a bad gate:** set `force_update = false` (or lower `min_version`).
- Never force-gate above the version currently live in the stores.

## 6. Incident playbook

| Incident | First response | Then |
|---|---|---|
| Bad JS shipped via OTA | `eas update:republish` previous group (§3) — minutes to recover | root-cause, fix, new OTA |
| Bad native build in stores | Halt staged rollout / pause Phased Release; if harmful, force-gate min_version to the last good version (§5) | expedited store review with the fix |
| Push storm / wrong content sent | Flip `notifications_push` OFF (kill switch, §4) | fix template/composer input; re-enable |
| Backend outage / bad deploy | Admin Settings → maintenance ON (app shows MaintenanceScreen ≤30s, exits ≤10s after OFF) | fix, flip OFF |
| Compromised token/secret | Rotate the affected secret (EAS env / Vercel env / Supabase anon key rotation), OTA/redeploy as needed | audit usage window |
| Store policy strike | Respond via the console with `STORE_LAUNCH_PACK.md` §3/§4 posture docs | owner decision on scope changes |

Escalation owner: the project owner (single-operator project). All incidents get a
STATUS.md entry (what, impact, fix, prevention).

## 7. Backlog intake (mobile-only polish)

Post-launch mobile requests enter `docs/PRODUCT_COMPLETION_BACKLOG.md` tagged
`[mobile]`, triaged owner-first; OTA-eligible fixes ship on the weekly OTA train,
native changes batch into the next store release. Standing candidates: Expo receipts
(second-phase push confirmation), notification action buttons, screenshot privacy
overlay, certificate pinning (documented post-launch option, §13).
