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

Supabase variables: `{{ .ConfirmationURL }}` (the action link), `{{ .SiteURL }}`, `{{ .Email }}`.

### 6.1 "Confirm signup"

**Subject:** `OlympIQ — e-poçtunuzu təsdiqləyin / Confirm your email / Подтвердите e-mail`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2430;line-height:1.6">
  <h2 style="color:#7c3aed;margin:0 0 12px">OlympIQ</h2>

  <p><strong>Salam!</strong></p>
  <p>OlympIQ-də valideyn hesabı yaratdığınız üçün təşəkkür edirik. Hesabınızı aktivləşdirmək üçün aşağıdakı düyməni klikləyin.</p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">E-poçtu təsdiqlə</a>
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
    <a href="{{ .ConfirmationURL }}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Şifrəni yenilə</a>
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

Same structure. Azerbaijani body: *"Hesabınızın e-poçt ünvanını dəyişmək üçün sorğu aldıq. Təsdiqləmək üçün aşağıdakı düyməni klikləyin."* — button label **"Yeni e-poçtu təsdiqlə"**. English: *"We received a request to change your account email. Click the button above to confirm."* Russian: *"Мы получили запрос на смену e-mail. Нажмите кнопку выше для подтверждения."*

> The app currently has **no in-app email-change action** — email is fixed at registration — so this template is only a safety net if you change an address from the Supabase dashboard.

---

## 7. Verify it all works

1. Register a brand-new parent on `https://olympiq.ai/register` with a real inbox.
2. The confirmation email arrives, in the right language block, from `noreply@olympiq.ai`.
3. Clicking the button lands on `https://olympiq.ai/...` and the account becomes usable.
4. Sign out, use "forgot password", confirm that email arrives too and the reset completes.
5. In Brevo → **Transactional → Logs**, both sends show as *delivered*.

If mail lands in spam: DNS authentication has not propagated (step 1), or SPF was added as a second record instead of merged.

---

## Known limitations

- **Free tier: 300 emails/day**, and Brevo appends its own branding to the footer. Upgrade before launch if that matters commercially.
- **One template per email type, all languages stacked.** Per-recipient language requires a Supabase auth hook (a server-side function that renders the mail itself) — worth doing later if the stacked format looks cluttered to users.
- The password-reset link opens the **website**, which renders the full site header including the pricing nav item. That is an open App Store anti-steering item tracked in `STATUS.md`.
