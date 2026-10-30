# Store Account Transfer Runbook

Moving OlympIQ (`ai.olympiq.app`) out of the developer's personal store accounts
and into accounts owned by the operator, Kamil Piriyev (individual, mikro
sahibkar — see `CLAUDE.md` → "Who The Seller Is"). Payments must be received in
the operator's name, which is why both apps move.

Never put IDs documents, bank numbers, keys or service-account JSON in this
file, in `STATUS.md` or in git. Keys go into Vercel env vars and EAS secrets only.

---

## Part 1 — Google Play (IN PROGRESS)

### Status

| Step | State |
|---|---|
| Investor's individual Play developer account created + identity/address verified | Done |
| Payments profile "KAMIL PIRIYEV — Individual profile for Play" linked | Done |
| Transfer request submitted from the developer's account (2026-10-30) | Done |
| Transfer accepted in the investor's account (2026-10-30) | Done |
| Google review of the transfer (usually ~2 business days) | **Waiting** |

Notes from the submission, so they are not re-learnt:
- Transfer page: `https://play.google.com/console/developers/app-transfer`
- The transaction ID field only accepted the registration-fee ID **with** its
  `PDS.` prefix, exactly as Google Payments Center shows it.
- Reason: "Other" (app published from the developer's personal account on behalf
  of the business owner). Business relationship: "None of the above".

**While the review is pending:** do not publish releases, edit in-app products,
or cancel the request. Do not create a new app in the investor's account.

### What moves with the app / what does not

Moves: store listing, users/installs, ratings and reviews, statistics, releases
and tracks, app signing key, policy declarations, content rating.

Does NOT move (must be redone below): testing groups/tester lists, user
permissions, API access + service accounts, integrated-service links, earnings
and payout reports (they stay with the old account — Android has had no sales).

### After Google confirms the transfer — do these in order

1. **Check the app landed.** Investor's Play Console → the app is listed, still
   in Production, no policy warnings. Settings → Payments profile shows the
   KAMIL PIRIYEV profile.
2. **Re-invite people.** Users and permissions → invite the developer's Google
   account as Admin so day-to-day work continues.
3. **Service account (purchase verification + price sync).**
   - Google Cloud Console (signed in as the investor's account) → new project →
     enable **Google Play Android Developer API** → create a service account →
     create a JSON key.
   - Play Console → Users and permissions → invite the service account email
     with: View financial data, Manage orders and subscriptions, Manage store
     presence (products/prices).
   - Vercel → **web-app** AND **admin-panel** → set
     `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (whole JSON) and
     `GOOGLE_PLAY_PACKAGE_NAME=ai.olympiq.app` → **Redeploy** both.
4. **Real-time developer notifications (refunds, voided purchases).**
   - Google Cloud → Pub/Sub → create topic → grant
     `google-play-developer-notifications@system.gserviceaccount.com` the
     **Pub/Sub Publisher** role on it.
   - Create a **push** subscription to
     `https://<web-app domain>/api/payments/google/notifications` with
     authentication enabled (a service account of your choice, audience = that
     URL).
   - Vercel web-app → `GOOGLE_PLAY_RTDN_AUDIENCE` (the audience above) and
     `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` (the push service account email) →
     Redeploy.
   - Play Console → Monetization setup → paste the topic name → **Send test
     notification**.
5. **Create the 21 Play products.** From `mobile-app/`:
   `node scripts/create-play-products.mjs` (dry run, read the plan) →
   `node scripts/create-play-products.mjs --apply`.
6. **Prices from the admin panel.** Admin → Subjects → **Sync all store
   prices** → every Google row should read "In sync".
7. **Activate the Android rows** in Admin → `/iap`.
8. **Play Data safety form:** add *Financial info → Purchase history* (collected,
   not shared, required for the purchase). Submit the form BEFORE submitting
   1.17.0.
9. **Testers.** Re-create the internal/closed-testing tester lists if needed
   (`mobile-app/store-assets/TESTER_TELIMATI_AZ.txt`).
10. **Build + release 1.17.0** (Android Play Billing). EAS build Android →
    upload to the investor's Play Console (the old account's EAS submit key no
    longer works; create a new one or upload the .aab manually). Release notes
    in az/en/ru: `mobile-app/store-assets/RELEASE_NOTES_v1.17.0.txt`, built
    from the 1.17.0 `[store]` lines in `CHANGELOG.md`.
11. **Smoke test** a real purchase on Android with a license tester account,
    confirm the entitlement appears for the child, then refund it from the Play
    Console and confirm the refund notification removes the entitlement.

---

## Part 2 — Apple App Store (LATER)

Apple works differently from Google in one important way: **agreements, tax,
banking and API keys belong to the ACCOUNT, not to the app.** The app, its 21
in-app purchase products (same product ids, prices, review status), ratings,
reviews and users move with a transfer; the Paid Apps Agreement, W-8BEN, bank
account and every key do not. They must be set up again in the new account
before the transfer.

### Step A — Prepare the investor's new Apple Developer account

1. Enrol as an **Individual** (USD 99/year) with the investor's own Apple ID
   (two-factor on). Seller name on the App Store will be his legal name — there
   is no way to show "OlympIQ" as the seller on an individual account.
2. App Store Connect → Business: accept the **Free Apps** and **Paid Apps**
   agreements, add the bank account (same EUR account at ABB used now), submit
   **W-8BEN**, complete **Digital Services Act** trader info.
3. Wait until all of the above read **Active**. Apple refuses a transfer while
   either account is "pending" or "changing".

### Step B — Prepare the app in the current account

- No version may be Waiting for Review / In Review / Pending Release.
- IAP products must be Approved / Ready to Submit / Developer Removed from Sale /
  Rejected (all 21 are Approved).
- TestFlight: remove all builds and testers and clear the Test Information
  fields (Apple requires it).
- Download the sales and payment reports you want to keep (they stay with the
  old account).

### Step C — Transfer

- Old account (Account Holder) → App Store Connect → Apps → OlympIQ → App
  Information → **Transfer App** → enter the recipient's Apple ID email and Team
  ID.
- Investor's account (Account Holder) → accept the transfer.
- The app's Apple ID (`6798527831`) and bundle id do not change, so
  `ascAppId` in `mobile-app/eas.json` and `APPLE_IAP_APP_APPLE_ID` stay as they
  are.

### Step D — After the transfer

1. **New App Store Connect API keys** in the investor's account (Users and
   Access → Integrations). Update Vercel and redeploy:
   - admin-panel price sync: `APP_STORE_CONNECT_ISSUER_ID`,
     `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`
   - web-app purchase verification (In-App Purchase key):
     `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`
2. **App Store Server Notifications URL** (App Information) — confirm it still
   points to `/api/payments/apple/notifications`; re-enter it if empty.
3. **EAS credentials** for the new Team: `eas credentials` → iOS → new
   distribution certificate, provisioning profile and **push notification key**
   (push keys are per team; old pushes stop once the old key is revoked).
4. **Re-create Sandbox testers** in the new account (App Review buys in sandbox;
   `APPLE_IAP_SANDBOX_GRANTS` must stay on).
5. Run `node mobile-app/scripts/submission-preflight.mjs`, build a new iOS
   version, submit.
6. Revoke the old API keys and push key in the developer's account.

**Order of operations tip:** if the new Apple account can be ready before the
1.17.0 iOS build, transfer first and build once with the new Team. If not, ship
1.17.0 from the current account and transfer afterwards — nothing is lost either
way, it just means doing the credentials step once more.
