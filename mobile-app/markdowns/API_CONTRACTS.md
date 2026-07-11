# Mobile BFF — API contracts (`/api/mobile/v1/*`, hosted by web-app)

Documented as built, one section per endpoint (master plan §7.3). Conventions
for EVERY endpoint: Bearer/Supabase-session-free unless stated (auth endpoints
mint the session); request/response bodies are JSON; success = `{ok:true,
data}`; failure = `{error:"<i18nKey>", retryable:boolean}` (the app translates
the key locally — raw server text never renders); `Cache-Control: no-store`;
only POST is exported (anything else 405s); oversized or non-JSON bodies fall
through to normal validation errors. The BFF wraps the SAME audited web service
functions — validation, rate limits, lockouts and generic-error discipline are
identical to the web.

## POST /api/mobile/v1/auth/child-login  (added M1)

Child sign-in: 8-digit ID + parent-set password → session tokens. Server-side:
per-IP throttle (`mchildlogin`, sha256(ip), 20/15min) → format validation → DB
lockout gate (`is_child_login_locked`, ≥8 fails/15min) → bare token-mode
`signInWithPassword` against the synthetic email → `record_child_login_attempt`
(always). Body cap 2048 bytes.

Request: `{"child_id":"12345678","password":"..."}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"access_token","refresh_token","expires_in","expires_at","token_type","user_id","role":"student"}}` |
| 400 | `{"error":"auth.child.err.idFormat"\|"auth.child.err.passwordRequired","retryable":false}` |
| 401 | `{"error":"auth.child.err.invalidCredentials","retryable":false}` — generic, no ID/password disambiguation |
| 423 | `{"error":"auth.child.err.locked","retryable":false}` — DB lockout |
| 429 | `{"error":"auth.child.err.locked","retryable":true}` — per-IP throttle |
| 503/500 | `{"error":"auth.child.err.serverError","retryable":true}` |

Client: `supabase.auth.setSession({access_token, refresh_token})` then resolve
the role server-side (`has_role`).

## POST /api/mobile/v1/auth/register  (added M1)

Parent registration (parity with the web `registerParent` action): validation
order required→email→phone→password with the same regexes/caps (E.164 phone
mandatory), SHARED rate-limit bucket `register` (email, 5/15min — web + mobile
share one budget), `signUp` (email-confirmation aware) → `setup_parent` RPC →
error-tolerant phone persist. Body cap 4096 bytes.

Request: `{"first_name","last_name","email","password","phone"}` (phone = E.164)

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{...tokens...,"role":"parent"}}` — project has email confirmation OFF |
| 200 | `{"ok":true,"data":{"verify_email":true}}` — confirmation required; the app shows the check-inbox notice |
| 400 | `{"error":"parent.err.required"\|"parent.err.email"\|"parent.err.phone"\|"parent.err.password"\|"parent.err.createFailed","retryable":false}` |
| 409 | `{"error":"parent.err.emailExists","retryable":false}` |
| 429 | `{"error":"parent.err.tooMany","retryable":true}` |
| 503/500 | `{"error":"parent.err.createFailed","retryable":true}` |

## Planned (M2 — not yet built)

`/children` · `/children/:id/quote|subscribe|subjects|activate-free|edit|reset-password`
· `/subscriptions/:id/cancel` · `/olympiads/:pkg/purchase` (Idempotency-Key)
· `/profile/avatar` · `/account/delete`. Each gets a section here when built.
