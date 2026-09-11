# Sentry setup — org, three projects, DSNs, first event

Owner-facing runbook. All three apps already contain the Sentry SDK and are
**inert**: each one sends nothing until it is given a DSN. Nothing has ever been
sent from this product.

Do the steps in order. **Steps 1–5 are irreversible or must happen BEFORE a DSN
is live** — read the box at the top of each. Steps 6–9 are the wiring. Step 10 is
the proof.

> **The one-line version of the trap in this runbook:** setting the DSN in Vercel
> is *not enough*. The Content-Security-Policy that allows the browser to talk to
> Sentry is computed **at build time** from the DSN, so a deployment built without
> one blocks every browser event while the SDK still reports itself as running.
> Set the variable, **then redeploy**. See step 8.

---

## ⛔ Before a DSN exists — the five things that cannot be fixed afterwards

| # | Thing | Why it is a "before" |
|---|---|---|
| 1 | **EU data region** | Chosen when the ORGANISATION is created, and **not changeable afterwards** — moving regions means a new organisation and new DSNs. The privacy policy states "servers in the EU region" in az/en/ru (A7 / B7 / C7). Getting this wrong makes a published legal document false. |
| 2 | **Three separate projects** | A DSN belongs to a project. Merging the three apps into one project later means re-issuing DSNs and redeploying everything. |
| 3 | **Prevent Storing of IP Addresses** | Organisation-level setting. The SDKs already withhold the IP from the payload, but Sentry's ingest sees the connection like any server does, so it can store one unless this is on. The policy row now discloses the IP **and states that this setting is on** — so turning it on is what makes that sentence true. |
| 4 | **Spike protection + per-project rate limits** | The free plan is **5,000 error occurrences a month, org-wide, and it cannot be topped up**. One bad afternoon with no limits empties the month for all three apps. |
| 5 | **Data-safety declarations** | Play *Data safety* and App Store *App Privacy* must carry the crash/diagnostics types **before the build carrying a live DSN is submitted**. Inventory: `docs/STORE_LISTING_COPY.md` §8.1 and `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2.6. |

---

## 1. Create the organisation — **pick EU, and check it twice**

[sentry.io](https://sentry.io) → **Get started / Sign up**.

| Field | What to enter |
|---|---|
| Organisation name | `OlympIQ` |
| **Data region** | **European Union (EU)**. This is a radio button on the signup screen. |
| Plan | **Developer (free)** — 5,000 errors/month. |

**Verify before going further.** After signing in, **Settings → General** must
show the region as EU. Every DSN the org issues will contain
`.ingest.de.sentry.io` (EU) rather than `.ingest.us.sentry.io` (US) — that host
substring is the real proof, and it is what you will paste into Vercel in step 8.

> If the region is wrong: **delete the organisation and start again now.** There
> is no migration, and a US-region DSN would make the published privacy policy a
> false statement in three languages.

## 2. Turn off IP storage — organisation-wide

**Settings → Security & Privacy → Data Scrubbing → "Prevent Storing of IP
Addresses" → ON.**

Leave the rest of that page at its defaults; the scrubbing this product relies on
happens in our own code before anything leaves the device, not here.

While on that page, also confirm **"Require Data Scrubber" is ON** (Sentry's
default) — it is a second net under ours, and costs nothing.

## 3. Turn on spike protection

**Settings → Subscription → Usage & Spend → Spike Protection → enable it for all
projects.** This is what stops a runaway loop consuming the month before anyone
notices.

## 4. Create the three projects

**Projects → Create Project.** Make all three; do not reuse one.

| Project name (slug) | Platform to choose | Which app |
|---|---|---|
| `olympiq-web` | **Next.js** | `web-app/` — the parent and student website |
| `olympiq-admin` | **Next.js** | `admin-panel/` — the internal admin panel |
| `olympiq-mobile` | **React Native** | `mobile-app/` — the iOS and Android app |

Sentry shows a DSN at the end of each wizard. **Copy each one into your password
manager, labelled with the project.** They are write-only ingest URLs, not
credentials — but they must still never be typed into a file in this repository.
Skip every "add this code to your app" instruction the wizard shows: all three
apps are already instrumented.

## 5. Set a per-project rate limit

**For each project: Settings → Projects → the project → Client Keys (DSN) → the
key's Rate Limit → Configure.**

The apps already cap themselves per browser tab, per server instance and per app
launch. This is the hard ceiling above that, and it is what enforces the split of
the org-wide 5,000/month:

| Project | Rate limit to set | Monthly share it protects |
|---|---|---|
| `olympiq-web` | **80 events per hour** | ~2,400/month — the families are in this app |
| `olympiq-mobile` | **35 events per hour** | ~1,000/month — 12 closed testers today |
| `olympiq-admin` | **20 events per hour** | ~600/month — one operator at a keyboard |

The remaining ~1,000/month is deliberate headroom for a real incident. The
arithmetic and the reasoning are in `web-app/src/lib/observability/sentryBudget.ts`
and `mobile-app/src/lib/sentryQuota.ts`.

---

## 6. Where each variable is set — the exact names

Three apps, three DSNs, three different places. **The names differ by app and the
prefixes are load-bearing** (`NEXT_PUBLIC_` / `EXPO_PUBLIC_` are what put the
value in the client bundle, which is correct for a write-only DSN and wrong for
everything else in this table).

### `web-app/` — set in **Vercel → the web project → Settings → Environment Variables**

| Variable | Value | Environments | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | the `olympiq-web` DSN | Production **and** Preview | No — public by design |
| `SENTRY_ORG` | the org slug from step 1 | Production, Preview | No |
| `SENTRY_PROJECT` | `olympiq-web` | Production, Preview | No |
| `SENTRY_AUTH_TOKEN` | a token from step 7 | Production, Preview | **Yes — mark it sensitive** |

### `admin-panel/` — set in **Vercel → the admin project → Settings → Environment Variables**

| Variable | Value | Environments | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | the `olympiq-admin` DSN — **a different value from the web app's** | Production, Preview | No |
| `SENTRY_ORG` | the org slug | Production, Preview | No |
| `SENTRY_PROJECT` | `olympiq-admin` | Production, Preview | No |
| `SENTRY_AUTH_TOKEN` | the same token as above, or its own | Production, Preview | **Yes** |

### `mobile-app/` — set in **Expo → the project → Environment Variables** (or `eas env:create`)

| Variable | Value | Visible to | Secret? |
|---|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | the `olympiq-mobile` DSN | build profiles **preview** and **production** | No — plain, not secret |
| `SENTRY_ORG` | the org slug | preview, production | No |
| `SENTRY_PROJECT` | `olympiq-mobile` | preview, production | No |
| `SENTRY_AUTH_TOKEN` | a token from step 7 | preview, production | **Yes — create it as an EAS SECRET** |

**Do not add the DSN to the `development` profile.** Development builds and Expo
Go send nothing by design (`__DEV__` disables the SDK), and giving them a DSN
would only spend the allowance on debugging sessions.

### Local machines

Only if you want to test locally: `web-app/.env.local`, `admin-panel/.env.local`,
`mobile-app/.env` — all three are untracked. **Nothing in this table ever goes
into a file that Git tracks.** Note that even with a local DSN the two Next apps
still send nothing: they are gated on `VERCEL_ENV`, which only Vercel sets.

## 7. Source-map upload tokens (optional, but this is what makes a stack trace readable)

**Settings → Developer Settings → Auth Tokens → Create New Token.** Scope it to
**`project:releases`** and nothing more. Without it, builds still succeed and
events still arrive — the stack traces just point at minified code.

Mobile note: `SENTRY_DISABLE_AUTO_UPLOAD: "true"` is set on all three EAS build
profiles in `mobile-app/eas.json` so that a build with no Sentry credentials
cannot fail. Remove it from `preview`/`production` only once the token above
exists.

## 8. ⚠ REDEPLOY — the step that is easy to skip and silently breaks everything

**The Sentry ingest origin in the Content-Security-Policy is derived from the DSN
at BUILD time** (`web-app/next.config.mjs`, `admin-panel/next.config.mjs` — the
`connect-src` entry). A deployment that was built without a DSN carries a CSP
with **no Sentry origin at all**. Setting `NEXT_PUBLIC_SENTRY_DSN` in the Vercel
dashboard afterwards does not rewrite that header.

The symptom is deliberately nasty: the SDK initialises, reports itself as
enabled, and **every browser event is blocked by the browser** with only a CSP
violation in the console. Server-side events still arrive, so the project looks
half-alive.

**So, after setting the variables: Vercel → Deployments → the latest production
deployment → Redeploy.** Do it for the web project and the admin project. Untick
"Use existing Build Cache" if offered.

The build log of a correct deploy no longer prints the
`[sentry] NO NEXT_PUBLIC_SENTRY_DSN AT BUILD TIME` warning. If you still see that
banner, the variable was not visible to the build.

Mobile has the same shape of rule for a different reason: `EXPO_PUBLIC_*` values
are inlined into the JS bundle at build time, so **a new EAS build is required** —
setting the variable does not reach an existing binary, and an OTA update only
reaches builds with the same `runtimeVersion`.

## 9. What is on, and what stays off

Do not enable these from a Sentry onboarding banner. Each is off in code, for a
reason recorded beside it.

| Feature | State | Why |
|---|---|---|
| **Session Replay** | Off, and unreachable | It records the DOM — on this product that is a video of a child's name, school and 8-digit login ID. No filter can unmake that after the fact. |
| **Tracing / Performance** | Off, and stripped from the bundle | Not needed to answer "what broke", and it would spend the quota on healthy requests. |
| **Sentry Logs** | Off | It forwards console output, which is exactly what the breadcrumb filter drops. |
| **Release health / sessions** | Off | Play Console vitals and App Store Connect already report crash-free rates. |
| **Screenshots / view hierarchy** | Off | A photograph of a child's dashboard. |
| **`Sentry.setUser()`** | **Never called, in any app** | It is the one call that defeats every privacy option above — Sentry's own documentation says the PII controls apply only to data the SDK sends by default, not to data explicitly set. |

## 10. First event — prove it end to end

For each project in turn:

1. Trigger something harmless that throws on a production deployment.
2. Watch **Issues** in that project. The event should arrive within a minute.
3. Open it and check all four:
   - **No IP address** on the event (`user.ip_address` absent, and the org
     setting from step 2 means Sentry stored none either);
   - **no `user` section at all** — no id, no email, no username;
   - **no request body, no cookies, no headers, no query string**;
   - the **environment** tag says `production` (or `preview`), never
     `development`.

If any of those four is wrong, **stop and report it** rather than leaving the
apps live with a DSN: the privacy policy in three languages asserts all four.

---

## Two review rules no setting can enforce

These are not configuration. Both are code-review rules, and both are the way the
disclosure gets falsified without anyone touching a Sentry setting.

1. **Never interpolate a child's name, school or city into an Error message.** A
   name is an ordinary word — no filter finds it, in any language. If an error
   needs to identify a record, use an internal id and look it up in the database.
2. **Never call `Sentry.setUser()`, in any app.** Not even with a UUID: our
   profile ids join straight to a named child. If correlation is ever genuinely
   needed, mint a per-install random value that maps to nothing.

## Related

- Privacy policy (the published disclosure these settings must keep true):
  `docs/PRIVACY_POLICY.md` — sections A7 / B7 / C7, and the "What we never do"
  bullet in A1 / B1 / C1.
- Store declarations owed before submission: `docs/STORE_LISTING_COPY.md` §8.1,
  `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2.6.
- The quota arithmetic: `web-app/src/lib/observability/sentryBudget.ts`,
  `mobile-app/src/lib/sentryQuota.ts`.
