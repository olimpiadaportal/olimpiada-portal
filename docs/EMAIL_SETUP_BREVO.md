# Email setup — Brevo SMTP + Supabase Auth templates

Owner-facing runbook. Do the steps in order; step 5 is the one that locks people out if done early.

---

## 1. Brevo → add the domain

**Settings (⚙ top-right) → Senders, Domains & Dedicated IPs → Domains → Add a domain.**

| Field | What to enter |
|---|---|
| Domain name | `olympiq.ai` — the bare apex. **Not** `www.olympiq.ai`, not `https://…`, not `mail.olympiq.ai`. |
| Setup method | **Manual / "I'll add the records myself"** (the automatic option only works for registrars Brevo integrates with; Namecheap is not one). |
| Branded subdomain | Optional. Skip it for now — it rewrites tracking links to `mail.olympiq.ai` and is only useful for marketing campaigns. Authentication emails do not need it, and skipping it means fewer DNS records to get wrong. |

Brevo then shows records to add at Namecheap → **Domain List → olympiq.ai → Advanced DNS**.

### The records

Brevo generates the exact values — copy them from your screen, not from here. They are of these shapes:

**Use the record TYPE Brevo shows on screen — do not assume.** Verified 2026-07-31: Brevo's current flow issues **CNAME** records for DKIM (the same delegated-key pattern SendGrid uses), not TXT. Getting the type wrong makes the record invisible to verification.

| Brevo record | Type | Host | Notes |
|---|---|---|---|
| brevo-code | **TXT** | as shown | Ownership proof. |
| DKIM 1 | **CNAME** | as shown | Delegated signing key. |
| DKIM 2 | **CNAME** | as shown | Second signing key (rotation). |
| DMARC | **TXT** | `_dmarc` | `v=DMARC1; p=none;` is a safe start. |

If Brevo's UI ever disagrees with this table, **Brevo wins** — it generates values against your specific account and its UI changes faster than this doc.

**Namecheap specifics:** Host is the prefix only (`brevo._domainkey`), never the full domain. Drop any trailing dot Brevo shows. TTL Automatic.

### ⚠ SPF — ONLY if Brevo actually asks for it

**Verified 2026-07-31: Brevo's current flow asks for `brevo-code`, two DKIM records and DMARC — and NO SPF record.** In that case do nothing here: leave the existing Namecheap forwarding SPF record untouched.

Read the rest of this box only if a future Brevo screen does list an SPF record.

You already have this record, for Namecheap's email forwarding:

```
v=spf1 include:spf.efwd.registrar-servers.com ~all
```

**A domain may have only ONE SPF record.** Adding a second makes *both* fail and your mail lands in spam. Do not add Brevo's SPF as a new record — **edit the existing one** to include both:

```
v=spf1 include:spf.efwd.registrar-servers.com include:spf.brevo.com ~all
```

(Keep `~all` at the end; it must be last.)

Then press **Verify / Authenticate** in Brevo. DNS usually propagates in 15–30 minutes.

---

## 2. Brevo → get the SMTP credentials

**Settings (⚙) → SMTP & API → SMTP tab.**

You need:
- **SMTP server:** `smtp-relay.brevo.com`
- **Port:** `587`
- **Login:** the address shown there (usually your account email)
- **Password:** click **Generate a new SMTP key**. This is the *SMTP key*, **not** your Brevo account password and **not** an API v3 key.

Copy the key immediately — Brevo shows it once.

---

## 3. Brevo → add the sender address

**Settings (⚙) → Senders, Domains & Dedicated IPs → Senders → Add a sender.**

- Name: `OlympIQ`
- Email: `noreply@olympiq.ai`

The address must be on the domain you authenticated in step 1. It does not need a real mailbox to *send*, but replies will bounce — so if you want parents to be able to reply, use an address that forwards (Namecheap email forwarding already handles this).

---

## 4. Supabase → point Auth at Brevo

**Supabase Dashboard → Project Settings → Authentication → SMTP Settings → Enable Custom SMTP.**

| Field | Value |
|---|---|
| Sender email | `noreply@olympiq.ai` |
| Sender name | `OlympIQ` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | your Brevo SMTP login |
| Password | the Brevo **SMTP key** |
| Minimum interval between emails | leave default |

Save. **Then send a test** — trigger a password reset for your own account from the website and confirm the mail arrives. Check the spam folder; if it landed there, DNS authentication (step 1) has not fully propagated.

Also set **Authentication → URL Configuration**:
- Site URL: `https://olympiq.ai`
- Redirect URLs: `https://olympiq.ai/auth/callback` and `https://olympiq.ai/**`

---

## 5. LAST — turn on email confirmation

**Authentication → Providers → Email → "Confirm email" → ON.**

**Do this only after step 4's test email actually arrived.** Enabling it while SMTP is broken means every new registration is stranded: the account exists but can never be verified, and there is no way for the user to self-recover.

Today confirmation is OFF, which is why registration signs a parent in immediately. Turning it on changes that flow — the app already has the "check your inbox" screen built and dormant, and it activates automatically.

---

## 6. Email templates (Supabase → Authentication → Emails)

Supabase sends **one template per email type for all users** — it cannot pick a language per recipient without custom auth hooks. So each template below is **Azerbaijani first** (the default locale and the majority of users), with English and Russian underneath, separated by a rule. Every recipient can read the one that applies to them.

### ⚠ Never use `{{ .ConfirmationURL }}` — it cannot work for the mobile app

**Changed 2026-08-04. If a template still contains `{{ .ConfirmationURL }}`, replace it.**

`{{ .ConfirmationURL }}` routes the click through Supabase's own endpoint:

```
{SUPABASE_URL}/auth/v1/verify?token=<hash>&type=signup&redirect_to=<our page>
```

GoTrue verifies the token there and then redirects back to us — but **what it appends
depends on the flow the sign-up used**, and our two apps sign up differently:

| Sign-up path | Client | GoTrue appends | Result |
|---|---|---|---|
| web-app registration | `@supabase/ssr` → PKCE | `?code=…` | Works **only in the browser that submitted the form** — exchanging the code needs the `code_verifier` cookie written at sign-up. A phone, a second browser, or cleared cookies fails. |
| mobile app (via the BFF) | bare `supabase-js`, `persistSession: false` | `#access_token=…` | **Never works.** That is a URL *fragment*; browsers do not send it to the server, so no route handler can read it — the link always failed. |

The fix is to skip `/auth/v1/verify` entirely: link to **our own** `/auth/confirm` with
`{{ .TokenHash }}` and let the app verify the OTP itself. `verifyOtp({ token_hash, type })`
is flow-agnostic, so one link works for a web sign-up and a mobile one alike.

The old `/auth/callback` path still resolves links already sitting in inboxes.

Supabase variables used below: `{{ .TokenHash }}` (the one-time token), `{{ .SiteURL }}`,
`{{ .Email }}`.

> **`{{ .SiteURL }}` must be `https://olympiq.ai`** — set it in
> **Authentication → URL Configuration → Site URL** (step 4). If it is still
> `http://localhost:3000`, every link in every email points at the user's own machine.

### 6.1 "Confirm signup"

**Subject:** `OlympIQ — e-poçtunuzu təsdiqləyin / Confirm your email / Подтвердите e-mail`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2430;line-height:1.6">
  <h2 style="color:#7c3aed;margin:0 0 12px">OlympIQ</h2>

  <p><strong>Salam!</strong></p>
  <p>OlympIQ-də valideyn hesabı yaratdığınız üçün təşəkkür edirik. Hesabınızı aktivləşdirmək üçün aşağıdakı düyməni klikləyin.</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">E-poçtu təsdiqlə</a>
  </p>
  <p style="font-size:13px;color:#6b7280">Bu hesabı siz yaratmamısınızsa, bu məktubu nəzərə almayın.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Hello!</strong></p>
  <p>Thanks for creating a parent account on OlympIQ. Click the button above to activate your account.</p>
  <p style="font-size:13px;color:#6b7280">If you did not create this account, you can safely ignore this email.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Здравствуйте!</strong></p>
  <p>Спасибо за регистрацию родительского аккаунта в OlympIQ. Нажмите кнопку выше, чтобы активировать аккаунт.</p>
  <p style="font-size:13px;color:#6b7280">Если вы не создавали этот аккаунт, просто проигнорируйте это письмо.</p>

  <p style="font-size:12px;color:#9ca3af;margin-top:28px">olympiq.ai</p>
</div>
```

### 6.2 "Reset Password"

**Subject:** `OlympIQ — şifrənin bərpası / Reset your password / Сброс пароля`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2430;line-height:1.6">
  <h2 style="color:#7c3aed;margin:0 0 12px">OlympIQ</h2>

  <p><strong>Salam!</strong></p>
  <p>Hesabınızın şifrəsini yeniləmək üçün sorğu aldıq. Yeni şifrə təyin etmək üçün aşağıdakı düyməni klikləyin.</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Şifrəni yenilə</a>
  </p>
  <p style="font-size:13px;color:#6b7280">Bu sorğunu siz göndərməmisinizsə, heç bir əməliyyat tələb olunmur — şifrəniz dəyişməyəcək.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Hello!</strong></p>
  <p>We received a request to reset your password. Click the button above to choose a new one.</p>
  <p style="font-size:13px;color:#6b7280">If you did not request this, no action is needed — your password will not change.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Здравствуйте!</strong></p>
  <p>Мы получили запрос на сброс пароля. Нажмите кнопку выше, чтобы задать новый пароль.</p>
  <p style="font-size:13px;color:#6b7280">Если вы не отправляли запрос, ничего делать не нужно — пароль не изменится.</p>

  <p style="font-size:12px;color:#9ca3af;margin-top:28px">olympiq.ai</p>
</div>
```

### 6.3 "Change Email Address"

**Subject:** `OlympIQ — yeni e-poçtu təsdiqləyin / Confirm your new email / Подтвердите новый e-mail`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2430;line-height:1.6">
  <h2 style="color:#7c3aed;margin:0 0 12px">OlympIQ</h2>

  <p><strong>Salam!</strong></p>
  <p>Hesabınızın e-poçt ünvanını dəyişmək üçün sorğu aldıq. Təsdiqləmək üçün aşağıdakı düyməni klikləyin.</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Yeni e-poçtu təsdiqlə</a>
  </p>
  <p style="font-size:13px;color:#6b7280">Bu sorğunu siz göndərməmisinizsə, heç bir əməliyyat tələb olunmur — ünvanınız dəyişməyəcək.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Hello!</strong></p>
  <p>We received a request to change your account email. Click the button above to confirm.</p>
  <p style="font-size:13px;color:#6b7280">If you did not request this, no action is needed — your address will not change.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">

  <p><strong>Здравствуйте!</strong></p>
  <p>Мы получили запрос на смену e-mail. Нажмите кнопку выше для подтверждения.</p>
  <p style="font-size:13px;color:#6b7280">Если вы не отправляли запрос, ничего делать не нужно — адрес не изменится.</p>

  <p style="font-size:12px;color:#9ca3af;margin-top:28px">olympiq.ai</p>
</div>
```

> The app has **no in-app email-change action** — email is fixed at registration — so this template only fires if you change an address from the Supabase dashboard. Set it anyway: an unset template falls back to Supabase's English default with a `{{ .ConfirmationURL }}` link, which is the broken shape this whole section exists to remove.

> The app currently has **no in-app email-change action** — email is fixed at registration — so this template is only a safety net if you change an address from the Supabase dashboard.

### 6.4 The `type` values, and why they differ

`/auth/confirm` whitelists the `type` parameter and passes it to `verifyOtp`. Use exactly:

| Template | `type` | Extra |
|---|---|---|
| Confirm signup | `email` | — |
| Reset password | `recovery` | `&next=/reset-password` |
| Change email address | `email_change` | — |
| Magic link (unused) | `magiclink` | — |

`next` is validated server-side and may only be a same-origin **relative** path; anything
else falls back to the dashboard, so it cannot be used as an open redirect.

---

## 7. Verify it all works

1. Register a brand-new parent on `https://olympiq.ai/register` with a real inbox.
2. The confirmation email arrives, in the right language block, from `noreply@olympiq.ai`.
3. Clicking the button lands on `https://olympiq.ai/...` and the account becomes usable.
4. Sign out, use "forgot password", confirm that email arrives too and the reset completes.
5. In Brevo → **Transactional → Logs**, both sends show as *delivered*.

If mail lands in spam: DNS authentication has not propagated (step 1), or SPF was added as a second record instead of merged.

---

## 8. Troubleshooting — "no email arrives at all"

A broken LINK and a missing EMAIL are different faults. §6 fixes the link. If the mail
never arrives, the template is not the cause — work down this list, in order. The first
two are decisive and take a minute each.

**1. Supabase Dashboard → Logs → Auth Logs.** Filter to the moment you registered.
- A row with an SMTP error → Brevo rejected it. Read the message and go to step 3.
- **No row at all** → GoTrue never attempted a send. Go to step 2.

**2. Was the address already registered?** This is the most common cause during testing.
Supabase deliberately does **not** resend a confirmation to an address that already
exists — it returns a *fake success* so an attacker cannot enumerate accounts. Every
retest with the same inbox is therefore silent.
- Check **Authentication → Users** for the address.
- If it is there with `Confirmed at` empty, delete it and register again, or use the
  in-app **resend** flow (`/verify-email`), which is built for exactly this.
- Testing with `you+1@gmail.com`, `you+2@gmail.com`, … gives a fresh account each time
  and all of them land in the same inbox.

**3. Rate limits.** Two separate ones, both silent:
- **Authentication → Rate Limits → "Rate limit for sending emails"** — the per-hour cap.
- **Project Settings → Authentication → SMTP → "Minimum interval between emails"** —
  per address. Rapid retests hit this constantly.

**4. Is custom SMTP actually enabled?** Saving the fields is not the same as flipping
**Enable Custom SMTP** on. With it off, Supabase's built-in sender is used, which is
capped at a handful of messages per hour and only mails project members.

**5. Brevo → Transactional → Logs.** If Supabase logged a successful hand-off but the
mail never arrived, the answer is here — *delivered*, *soft bounce*, *blocked*, or
*spam*. A sender address that is not on an authenticated domain gets blocked outright.

**6. Free-tier quota.** 300 emails/day. The counter is on the Brevo dashboard.

Only after all six come back clean is it worth suspecting the template.

## Known limitations

- **Free tier: 300 emails/day**, and Brevo appends its own branding to the footer. Upgrade before launch if that matters commercially.
- **One template per email type, all languages stacked.** Per-recipient language requires a Supabase auth hook (a server-side function that renders the mail itself) — worth doing later if the stacked format looks cluttered to users.
- The password-reset link opens the **website**, which renders the full site header including the pricing nav item. That is an open App Store anti-steering item tracked in `STATUS.md`.
