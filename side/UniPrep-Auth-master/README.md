# UniPrep Auth

A dedicated authentication service for UniPrep mobile app, handling email verification and password reset flows.

## 🚀 Features

- **Email Verification** (`/auth/confirm`) - Handles email confirmation links from Supabase
- **Password Reset** (`/auth/reset-password`) - Allows users to reset their password via web form

## 📦 Setup

### 1. Install Dependencies

```bash
cd UniPrep-Auth
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_NAME=UniPrep
NEXT_PUBLIC_APP_SCHEME=uniprep
```

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3001`

## 🌐 Deployment to Vercel

### Option A: Deploy as Separate Project (Recommended)

1. **Create a new Vercel project:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New" → "Project"
   - Import the `UniPrep-Auth` folder from your repository

2. **Configure environment variables in Vercel:**
   - Go to Project Settings → Environment Variables
   - Add the same variables from `.env.local`

3. **Set up custom domain:**
   - Go to Project Settings → Domains
   - Add `auth.uniprep.app` (or your preferred subdomain)
   - Follow Vercel's instructions to configure DNS

### Option B: Deploy as Part of Monorepo

If your repository contains multiple projects:

1. In Vercel, set the "Root Directory" to `UniPrep-Auth`
2. Configure the same environment variables
3. Set up the subdomain as above

## 🔧 Supabase Configuration

Update your Supabase project settings to use the new auth URLs:

### Email Templates

Go to **Authentication → Email Templates** in Supabase Dashboard:

1. **Confirm signup** template:
   - Change the confirmation URL to:
   ```
   https://auth.uniprep.app/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

2. **Reset password** template:
   - Change the reset URL to:
   ```
   https://auth.uniprep.app/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery
   ```

### Redirect URLs

Go to **Authentication → URL Configuration**:

1. Add `https://auth.uniprep.app` to **Site URL** or **Redirect URLs**
2. Add `uniprep://` to **Redirect URLs** (for deep linking back to app)

## 📱 Mobile App Configuration

Update the mobile app's `authService.ts` to use the new URLs:

```typescript
// Email verification redirect
emailRedirectTo: 'https://auth.uniprep.app/auth/confirm'

// Password reset redirect  
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'https://auth.uniprep.app/auth/reset-password'
})
```

## 🔗 URL Structure

| Route | Purpose |
|-------|---------|
| `/` | Redirects to `/auth/confirm` |
| `/auth/confirm` | Email verification page |
| `/auth/reset-password` | Password reset form |

## 🎨 Customization

- **Colors:** Edit `tailwind.config.js` to change the primary color
- **Logo:** Replace the SVG in the page components
- **App Name:** Set `NEXT_PUBLIC_APP_NAME` environment variable

## 📝 Notes

- All lint errors before `npm install` are expected (missing dependencies)
- The `@tailwind` warnings in CSS are normal for Tailwind projects
- After deployment, test both email verification and password reset flows
