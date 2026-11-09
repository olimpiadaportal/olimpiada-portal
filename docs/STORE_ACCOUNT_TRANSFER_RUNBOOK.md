# Store Account Transfer Runbook

Moving OlympIQ (`ai.olympiq.app`) out of the developer's personal store accounts
and into accounts owned by the operator, Kamil Piriyev (individual, mikro
sahibkar — see `CLAUDE.md` → "Who The Seller Is"). Payments must be received in
the operator's name, which is why both apps move.

Never put IDs documents, bank numbers, keys or service-account JSON in this
file, in `STATUS.md` or in git. Keys go into Vercel env vars and EAS secrets only.

---

## Part 1 — Google Play (TRANSFERRED 2026-11-06, post-transfer setup in progress)

### Status

| Step | State |
|---|---|
| Investor's individual Play developer account created + identity/address verified | Done |
| Payments profile "KAMIL PIRIYEV — Individual profile for Play" linked | Done |
| Transfer request submitted from the developer's account (2026-10-30) | Done |
| Transfer accepted in the investor's account (2026-10-30) | Done |
| Google review of the transfer | Done — completed 2026-11-06 |
| Google paused the transfer (2026-11-05): target account must declare EU trader status | Declare **Trader** in Manage account → Account details → About you, then reply to Google's email |

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

### After the transfer — the Android launch session, in this order

Google only lets in-app products exist once a build that declares the
`com.android.vending.BILLING` permission has been uploaded to a track. The
build in Production (1.16.x) deliberately strips that permission, so the
products cannot be created until 1.17.0 sits on **internal testing**. That is
why the build comes BEFORE the products, and why Production comes LAST.

The trader/ToS change sent for review on 2026-11-06 does not block any of this.

**A. Already done**
1. App landed in the investor's account; payments profile = KAMIL PIRIYEV. ✅
2. Per-app trader status (App content) + ToS `https://olympiq.ai/terms`,
   sent for review 2026-11-06. ✅ (Done in the INVESTOR's account, never in the
   developer's.)

**B. Accounts and access (≈20 min, investor's Google account)** — ✅ steps 5–6 done 2026-11-06 (service account `play-billing@olympiq-play.iam.gserviceaccount.com`, key in `secrets/google/`); 3–4 open.
3. **Payout bank account:** Payments profile → Add payment method → bank
   account in Kamil Piriyev's name (AZN if offered, else the EUR account at
   ABB) → confirm Google's test deposit when it arrives. Does not block sales.
4. **Invite the developer:** Play Console → Users and permissions → invite
   `elmlyapp@gmail.com` as **Admin**.
5. **Service account:** console.cloud.google.com (investor's account) → create
   project `olympiq-play` → APIs & Services → enable **Google Play Android
   Developer API** → IAM → Service accounts → create `play-billing` → Keys →
   Add key → JSON. Save the file as `secrets/google/play-service-account.json`
   (git-ignored) — never email or commit it.
6. **Give it Play access:** Play Console → Users and permissions → Invite new
   users → the service account email → App permissions: OlympIQ → View app
   information, View financial data, Manage orders and subscriptions, Manage
   store presence, Release to testing tracks.

**C. Server (≈15 min)** — ✅ done 2026-11-06: key verified against the Play API, env vars set in both Vercel projects, test RTDN received in `iap_notifications` (android/TEST/test).
7. Vercel → **web-app** and **admin-panel** → Environment Variables
   (Production): `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` = whole JSON file,
   `GOOGLE_PLAY_PACKAGE_NAME` = `ai.olympiq.app`.
8. **Refund notifications (RTDN):** Google Cloud → Pub/Sub → topic
   `play-rtdn` → Permissions → add
   `google-play-developer-notifications@system.gserviceaccount.com` as
   **Pub/Sub Publisher** → Create subscription → **Push** → endpoint
   `https://olympiq.ai/api/payments/google/notifications` → Enable
   authentication → service account `play-billing` → audience = the same URL.
   Vercel web-app: `GOOGLE_PLAY_RTDN_AUDIENCE` = that URL,
   `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` = the `play-billing` email.
   (Until this is set the endpoint answers 503 — checked 2026-11-06.)
9. **Redeploy** web-app and admin-panel. Then Play Console → Monetize →
   Monetization setup → topic `projects/olympiq-play/topics/play-rtdn` → Save →
   **Send test notification**.

**D. Build to internal testing (owner runs EAS)**
10. Play **Data safety** → add *Financial info → Purchase history* (collected,
    not shared, required, for app functionality) → submit. Before 1.17.0.
11. `cd mobile-app && eas build -p android --profile production` → upload the
    `.aab` to **Testing → Internal testing** (not Production). Add the
    developer and investor Gmail accounts as internal testers AND as **License
    testers** (Settings → License testing) so test purchases cost nothing.

**E. Products and prices (Claude runs these once the key file exists)** — ✅ done 2026-11-06: build 13 (1.17.0) live on internal testing; 21 products created and ACTIVE on Play at AZN 2/7/70 (after fixing the regions-version pin, see CHANGELOG); the 21 Android `iap_products` rows activated in one guarded transaction (audited by `trg_audit_iap_products`). The 2 olympiad-package rows stay inactive, as on iOS.
12. From `mobile-app/`, with `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE` pointing at the
    key: `node scripts/create-play-products.mjs` (dry run — expect 21 subject
    products) → `--apply --only ai.olympiq.app.sub.math.week` → check it in Play
    Console → `--apply` for the rest.
13. Admin → Subjects → **Sync all store prices** → every Google row "In sync".
14. Admin → `/iap` → activate the Android rows.

**F. Test, then release** — step 15 ✅ 2026-11-06: license-tester purchase (Azerbaijani, 1 month) → intent consumed, 30-day `google_play` entitlement for the right child, RTDN `ONE_TIME_PRODUCT_PURCHASED → granted`; refund with Remove entitlement → RTDN `VOIDED_PURCHASE → revoked` within a minute, entitlement revoked (`google_voided_purchase`).
15. On a phone with the internal-testing build: buy one week of a subject for a
    test child → access opens → Play Console → Order management → refund → the
    access closes within minutes (RTDN).
16. Promote the same build to **Production** with the Google Play notes from
    `mobile-app/store-assets/RELEASE_NOTES_v1.17.0.txt`. — ✅ sent for review
    2026-11-09 at **100% rollout** (owner's call: payments already proven on
    internal testing). Google's trader/ToS and Data safety reviews passed first.
17. **Admin → Mobile app (version gate)** — only AFTER each store actually
    serves 1.17.0 (Android: production rollout at 100%; iOS: approved and
    released). Set that platform's **latest_version = 1.17.0**; raise
    min_version / force_update only if older builds must stop working. Setting
    it before the store serves the build prompts users to update to a version
    they cannot get. State on 2026-11-06: android latest 1.14.0 (stale — 1.16.x
    is in production), ios latest 1.16.0 with force_update on.
18. iOS 1.17.0: build and submit from the current Apple account with the App
    Store notes from the same file (or after the Apple transfer — Part 2). — ✅
    built with `eas build -p ios --profile production --auto-submit` (Apple
    login declined; stored EAS credentials reused) and submitted for review
    2026-11-09, release set to **manual**. The listing has English and Russian
    pages only (no Azerbaijani); all three notes went into the English page.

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
