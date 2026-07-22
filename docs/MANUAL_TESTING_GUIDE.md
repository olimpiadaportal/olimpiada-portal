# Manual Testing Guide — OlympIQ (Investor Review Round 2)

Tests **everything implemented** across the **Admin Panel** (:3001) and **Web App** (:3000) —
parent, child/student, and public site. Mobile is future-only (not in this build).

**How to report a bug:** app + page/URL + what you did + what you expected + what happened
(screenshot / browser console error if possible). I'll fix and you re-test.

> **Trilingual:** every screen has a language switcher. Test **az / en / ru**. If an en/ru
> translation is ever missing, you should see the **Azerbaijani** text (fallback), never a raw key.

---

## 0. One-time setup

### 0.1 Env files (no secrets in git)
Create `admin-panel/.env.local` **and** `web-app/.env.local` with your **dev/staging** Supabase
values (Supabase Dashboard → Project Settings → API):
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** (never `NEXT_PUBLIC_`). Both apps need it.
- `NEXT_PUBLIC_SITE_URL` (web-app) is the base for email-confirmation / password-reset links.

### 0.2 Email verification toggle (decide before testing parents)
Parent registration now uses Supabase **sign-up with email confirmation**.
- **To TEST verification:** Supabase Dashboard → Authentication → **Providers/Email → enable
  "Confirm email"**, and set up SMTP (or use Supabase's built-in test email). Add
  `http://localhost:3000/auth/callback` under Auth → URL Configuration → Redirect URLs.
- **To skip it for faster testing:** leave "Confirm email" OFF → sign-up logs the parent straight
  in. (Both modes are supported by the code.)

### 0.3 Run
```bash
cd admin-panel && npm install && npm run dev   # http://localhost:3001
cd web-app     && npm install && npm run dev   # http://localhost:3000
```

### 0.4 Bootstrap the first Administrator (one-time)
1. Supabase → Authentication → Users → **Add user** → email+password → **Auto Confirm**.
2. Supabase → SQL Editor (dev/staging), replace the email:
   ```sql
   update public.profiles set status='active' where email='admin@olimpiada.test';
   insert into public.profile_roles (profile_id, role_id)
   select p.id, r.id from public.profiles p, public.roles r
   where p.email='admin@olimpiada.test' and r.code='administrator' on conflict do nothing;
   ```

---

## 1. Admin Panel (http://localhost:3001)

### 1.1 Login & shell
- `/login` → sign in. **Expect:** dashboard; sidebar groups: Overview, Taxonomy, Content config,
  Content (Questions, News), **Operations (Accounts, Audit, Settings)**. Switch language → labels change.

### 1.2 Taxonomy — note the removals
- **Manage → Subjects / Question types / Olympiad types:** there is **NO "Code" field** anymore — you
  enter only the name; the code is generated automatically in the background. Add a Subject (e.g.
  "Məntiq") → it saves.
- The status dropdown shows **Public / Private** (not Active/Inactive).
- **There is NO "Difficulty levels"** item in the sidebar (difficulty was removed platform-wide).
- Add a **Topic** (Manage → Topics): subject + name + optional **Order** (controls list order; leave 0
  if you don't care) → save. Add a **Subtopic**.

### 1.3 Questions — single create
- **Questions → New question:** Subject + Grade + Type (**no Difficulty field**) + body + 2–3 options,
  tick one correct → Save. On the edit page move it to **Published** (Submit→Approve→Publish; as Admin
  you can do all). Make **~5 published single/multiple-choice** questions for one subject (e.g.
  Riyaziyyat) so practice has content.

### 1.4 Questions — BULK import (BY NAME, no codes)
- **Questions → Bulk import:** the **"Field values"** panel lists your real **subject / type /
  olympiad_type NAMES** (not codes). Click **Download template** — note it uses `"subject":"Riyaziyyat"`,
  `"type":"Single choice"` (names), **no difficulty**.
- Edit the JSON (real subject name, a grade, a couple of questions with az body + options) → **Import**.
- **Expect:** result shows **Imported / Failed** with per-row errors; History gets a row; new questions
  appear as drafts → publish a few. A row with an unknown subject name is reported failed while valid
  rows still import.

### 1.5 Questions — bulk actions
- On **Questions**, tick rows → toolbar: **status dropdown → Apply** (bulk lifecycle), **Assign topic**
  (subject→topic→subtopic), **Delete** (admin, with confirm). **Expect:** selected rows update.

### 1.6 News (Administrator only) — slug optional + cover image
- **News → New article:** fill **az** Title + Body; **leave the slug/URL blank** → Save. **Expect:** it
  saves (slug auto-generated from the title).
- On the edit page: **upload a cover image** (News-media). **Expect:** the image uploads and shows a
  preview; you can remove/replace it. Then **Publish**.
- **Expect (public, §2):** the published article shows the **cover image** on `/news` and `/news/<slug>`.

### 1.7 Olympiad packages (Administrator only) — no code + PRIVATE bulk pool
- **Olympiad → New package:** there is **NO "Code" field** (auto-generated). Set Subject, optional grade,
  Price, **Status = Public**, az Title → Save.
- On the edit page: use **Bulk upload** to add this package's **private** questions (download the
  template, fill az body+options, import). **Expect:** a live "private questions: N" count; these
  questions are **NOT** in the general Questions list (verify: they don't appear under §1.3 Questions).

### 1.8 Operations — Accounts / Audit / Settings (new)
- **Accounts:** lists parents and their children (name, **8-digit ID**, access status). For a child,
  use **Reset password** (admin) → set a new password → **Expect:** success; the child can log in with it.
- **Audit:** recent `audit_logs` (when / actor / entity / action / severity / result), admin-only.
- **Settings:** toggle a **feature flag** → it persists; edit a setting value.

---

## 2. Public Website (http://localhost:3000)

- **Nav shows ONLY: Pricing, About, FAQ, Contact** (subjects/olympiad-prep/news are off the public nav by
  design). Visit each; switch language. **Expect:** trilingual content; pricing mentions per-subject,
  7-day trial, sibling discount.
- Visit `/news` (direct URL) → your **published** article appears **with its cover image** → open
  `/news/<slug>` → title + body + header image. Draft/archived must NOT appear.

---

## 3. Parent App (http://localhost:3000)

### 3.1 Register (First / Last / Email / Password only)
- `/register`: **First name, Last name, Email, Password (≥8)** — those four fields only. Submit.
- **If "Confirm email" is ON:** you land on **/verify-email** → open the email → click the link →
  `/auth/callback` → **/dashboard**. Logging in before confirming shows a "verify your email" message.
- **If OFF:** you're logged straight into **/dashboard** (empty "My children").

### 3.2 Login / Forgot password
- `/login` shows a **Student** card (→ `/child-login`) and a **Parent** login (email).
- **Forgot password?** → enter email → "if registered, a link was sent". Open the link →
  `/reset-password` → set a new password → logged in.

### 3.3 Add a child → **ID is "pending" until you subscribe**
- Dashboard → **Add child**: First/Last + **Grade dropdown** + **City dropdown** (incl. "Other" → free
  text) + **School** (datalist/free) + a child **password (≥8)**. Submit.
- **Expect:** the child appears with **"ID pending — choose a plan"** (NO 8-digit ID yet). Add a **second
  child** too (for the sibling discount later).

### 3.4 Subscribe (subjects-first, subtotal, discount) → **ID revealed**
- Child card → **Manage / Subjects**. **Expect (top of page):** a **Subjects** section with
  **checkboxes** (each shows a price). Tick subjects → a **subtotal** appears. Choose **weekly / monthly /
  yearly** → the **total recalculates**. For the **2nd** child you should see a **sibling discount −15%**
  (3rd+ would be −20%) reflected in the total. **Start the 7-day trial / confirm.**
- **Expect:** on success the child's **8-digit ID is revealed** and the card now shows it + a **Trial**
  pill. (The child can only log in **after** this step.)

### 3.5 Edit subjects later
- Open the same child's subscribe page again → it now shows **Manage subjects**: **add** a subject or
  **remove** one from the live subscription. **Expect:** the list updates.

### 3.6 Child management + account deletion
- On a child card: **Reset password** (inline form) and **Delete child** (confirm). 
- Bottom of dashboard: **Delete account** (confirm) → removes the parent **and** their children.

---

## 4. Child / Student App (http://localhost:3000) — "Arena" design

### 4.1 Student login
- `/login` → **Student** tab (or `/child-login`): enter the **8-digit ID** + the password you set
  (the ID field is numeric — **no "@" error**). **Expect:** you land on **/child** (dark "Arena" home).
  Wrong ID/password → one generic error; many wrong tries → temporary lockout.

### 4.2 Arena home
- **Expect:** Arena nav (brand, streak chip), a hero with a **rank panel** (shows `—` until ranking data
  exists — nothing fake) + **real mini-stats**, "Today's rounds" per **subscribed subject** (→ Practice),
  and **subject-strength** bars. A child with **no active subscription** sees a locked/empty state.

### 4.3 Practice (random 25, no difficulty)
- Click a subject's **Başla/Practice**. **Expect:** a one-question-at-a-time round (up to 25, randomly
  chosen — **never asks for difficulty**), A/B/C/D options → **Submit** → a **score X / N**. (If "no
  questions", publish more for that subject in §1.3/1.4.)

### 4.4 Olympiad (private pool)
- First, as **parent**: child → **Olympiads** → **Buy** a package (shows **Owned**; no charge taken).
- As **child**: olympiads → **Start** → **Expect:** the attempt is drawn from that package's **private**
  questions (the ones you bulk-uploaded in §1.7), not the general pool → answer → score.

### 4.5 Leaderboard + wallpaper
- **Leaderboard:** a read-only rank table with filter chips (Country active; others visual) and your own
  highlighted row (real self-stats; no fabricated users).
- **Wallpaper:** pick a swatch (Profil/settings) → background changes and persists on reload.

### 4.6 Back to parent → Progress
- Parent → child → **Progress** → **Expect:** the child's graded attempts (subject · Practice/Olympiad ·
  score · date).

---

## 5. Cross-cutting checks
- **Language:** switch az/en/ru on several screens — nothing falls back to raw keys; missing en/ru content
  shows **Azerbaijani**.
- **Login separation:** a student ID never gets the "@" email error (Student path uses an ID field).
- **No codes anywhere:** you never typed a "code" — subjects/types/olympiad and bulk import all use names.
- **No difficulty anywhere:** no difficulty field on questions, no difficulty in templates, none in the
  child quiz.
- **Security (by design):** children can't see prices/payments or other children's data; only the parent
  pays; correctness is never shown before grading.

---

## 6. Known NOT-built yet (by design — won't work; documented)
- **Real payment charge / webhook** — subscriptions & olympiad "purchases" grant access with **no money
  taken** (trial/lifetime). *(Deferred to end.)*
- **Failed-charge auto-block + trial/subscription auto-expiry** *(deferred).* 
- **Admin subscription/payment monitoring** *(deferred; account monitoring IS built).* 
- **Leaderboard ranking across users, in-app notifications, achievements/streaks engine, advanced
  analytics** *(close-future; a read-only self leaderboard + streak chip already ship).* 
- **Vercel deployment**, **Mobile app** *(future).* 

> **Production database (when you build it):** there is currently only the dev/staging Supabase project.
> To build production, run the **canonical** SQL files in `supabase/sql/` in order — `001`→`012`, then
> `014`, `015`, `016`, then `013` last. Do **not** run the `supabase/sql/migrations/` files on a fresh
> production DB (they are already backported into the canonical files). Enable the `pg_cron` extension in
> the Supabase Dashboard before `016`. Full procedure: `supabase/README_RUN_ORDER.md` →
> "First-Time Production Database Build".

If anything in §1–§5 doesn't match its **Expect**, report it and I'll fix it.

---

# Round 3 changes — what to test (2026-06-29)

> **Prerequisite (one-time):** apply the Round-3 DB migration to **dev/staging**, then re-run validation:
> ```bash
> psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/migrations/2026_06_29_017_cities_schools_grade_promotion.sql
> psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/013_validation_queries.sql   # expect 25/25 PASS
> ```
> This seeds 15 Azerbaijani **cities**, makes schools require a city, adds the `graduated` flag + `advance_student_grades()` RPC, and extends Add-Child. (A full from-zero rebuild already passed 25/25.)

## R1. Light / Dark theme (whole platform)
- Top bar has a **sun/moon toggle** next to the language switcher. Default is **dark**. Toggle → the **public site, parent dashboard, and child Arena** all switch between dark/light; reload → your choice persists (localStorage). **Expect:** text stays readable in both modes, no text-on-same-color, inputs show visible placeholders + focus rings.

## R2. Public website
- **Footer** sits at the bottom of the viewport even on short pages (e.g. Contact). 
- **Pricing:** three plan cards (Weekly/Monthly/Yearly) with **placeholder prices** (≈2 / ≈6 / ≈50 AZN per subject) + **savings badges** (~25% / ~30%), a "most popular" accent on Monthly, and callout boxes for the **7-day trial**, **sibling discount** (−15% / −20%), and a **"prices are placeholders"** disclaimer — not a plain bullet list.
- **About:** several sections of real content (mission / what we offer / who it's for / trust) — switch az/en/ru, all read naturally.
- **FAQ:** each question is **collapsible** (click to expand/collapse) — 10 Q&As.
- **Contact:** an embedded **Google Map** of the Government House of Baku + an info card (address, support email).
- **News** now appears in the **header nav** and footer.
- **Russian:** on Pricing the period labels read **Еженедельно / Ежемесячно / Ежегодно** (not bare nouns).

## R3. Auth (login / register)
- Every **password field** has a **show/hide eye** toggle (web *and* admin) — login, register, reset, child login, admin login, admin account-create / child-reset.
- Inputs have **visible placeholder text** and clear focus rings in both themes; layout looks consistent.
- **Register** with an email that already exists → **"this email is already registered"** (not a generic failure).
- **Login** with an unknown email → **"no account found"**; correct email + wrong password → **"incorrect password"**.

## R4. Add-Child WIZARD + demo payment (the big one)
- Parent dashboard → **Add child**. **Expect a step wizard** (Info → Subjects → Plan → Payment → Done), not a single form.
  1. **Info:** First/Last + **City dropdown** → **School dropdown** (only shows schools for the chosen city; disabled until a city is picked) → **Grade dropdown**, + child password (with eye toggle). **All required** — try Next with a blank field → inline error, stays on step.
  2. **Subjects:** checkboxes with prices; ≥1 required.
  3. **Plan:** Weekly/Monthly/Yearly → a live **subtotal / discount / total** (2nd child shows the sibling discount).
  4. **Payment:** a clearly-labeled **DEMO** checkout ("no real charge"); cosmetic card fields; **Pay** → 
  5. **Done:** reveals the child's **8-digit ID**. 
- **Regression check (the reported bug):** completing the wizard **must NOT bounce you to /login**, and the child **must be saved** + appear on the dashboard with its ID. (If a parent isn't fully set up you'd see an in-form error instead of a silent logout.)

## R5. Admin panel
- **Settings** (`/settings`): clean cards, **no raw keys** (compare to the old screenshot) — feature flags toggle, JSON settings save.
- **Accounts** (`/accounts`): **full CRUD** — **Create parent** (email+password+name), **Edit** parent (name + active/suspended), **Reset** a child password, **Delete** child, **Delete** parent (typed-confirm). (Requires `SUPABASE_SERVICE_ROLE_KEY`; without it the CRUD controls hide behind a banner.)
- **Cities** (`/cities`) + **Schools** (`/schools`): manage cities; create a school → **City is mandatory**; the school list shows its city. Deleting a city that still has schools → friendly error (not a crash).
- **News edit:** Save / Publish / Unpublish / Archive / **Delete** buttons are now at the **TOP** action bar.
- **Questions list:** more compact/readable (hover rows, tidy pills).
- **Session:** being logged in no longer bounces you to **/unauthorized**; you're only signed out after **~30 min of inactivity** (then redirected to /login). Status text reads **Public / Private** (not Active/Inactive).

## R6. Parent & Student panels
- **Compact** "OlympIQ" brand top-left (both panels).
- **Profile section** (parent dashboard + child Arena): **avatar upload** (pick an image ≤2 MB → it shows; initials fallback otherwise), **change password** (child: must differ from the 8-digit ID), parent also has **delete account** + logout.
- **Parent dashboard** shows the **information carousel** (5 numbered slides, prev/next + dots) and a **latest-News** panel.
- **Child Arena** shows a **News** panel too.
- **Parent shell** has **Contact + FAQ** links.

## R7. Question types (admin)
- New question, pick a type and try to save a bad config:
  - **Single choice** with 0 or 2+ correct → rejected ("exactly one correct").
  - **Multiple choice** with 0 correct → rejected ("at least one correct").
  - **True/False** → exactly two options, mark one correct.
- Per-type **hint text** shows near the options. (The child quiz already grades each type correctly.)

If anything here doesn't match its **Expect**, tell me which **R#** + what you saw, and I'll fix it.

---

# Round 4 changes — what to test (2026-07-01)

> **Prerequisites (do these first, or fixes will look absent):**
> 1. Apply the Round-4 migration to dev/staging, then re-validate:
>    ```bash
>    psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/migrations/2026_07_01_018_news_view_count.sql
>    psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/013_validation_queries.sql   # expect 26/26 PASS
>    ```
> 2. **Restart both dev servers** and **log in again in each app** — the session cookie was renamed per-app (`sb-olimpiada-web` / `sb-olimpiada-admin`), so old sessions are ignored once.

## S1. Blocking bugs (verify fixed)
- **Add-Child now works:** parent → Add child → complete the wizard (city → school → grade → subjects → plan → demo pay) → **the 8-digit ID is revealed** and the child appears on Home. (No more "Child account could not be created.")
- **No more constant logout:** keep the **admin** open and use it for several minutes while the web-app is also open — you should **not** get logged out (each app has its own cookie now). Admin only signs you out after **30 min idle**.
- **Password eye** is vertically centered in every password field (Add-Child, login, admin).
- **Admin status** reads **"Hər kəsə açıq" / "Gizli"** in AZ.

## S2. Admin
- **Audit log** (`/audit`): perform account actions (create/edit/delete parent, reset child password) → they now **appear** in the log (previously silently dropped), timestamps in **Baku time**.
- **Cities** (`/cities`): no **Country Code** field; creating a city needs only name + status.
- **Add News** (`/news/new`): after saving the article you get a **featured-image upload** step, then "Continue to editing".
- **Settings** (`/settings`): friendly **feature-flag** names + descriptions with On/Off switches; **system settings** show proper inputs (email field, Yes/No, locale select, locale checkboxes) with an "Advanced (raw value)" disclosure — no raw JSON walls.

## S3. Landing (public) — test in **Light mode** (toggle in the navbar)
- **Navbar:** the theme toggle + a **language dropdown** live in the nav (top-right). Language dropdown switches az/en/ru.
- **Light theme** now has depth — cards have shadows/borders and stand out (not flat).
- **Home:** **stat cards** (Tests/Olympiads/Students/Success rate — illustrative) + an **About Us** section with illustrations.
- **Pricing:** three plans **side-by-side**.
- **FAQ:** each question has a **down-chevron** that rotates on expand.
- **Contact:** the address card and the map are the **same size**.
- **News:** sort chips **Latest / Oldest / Most viewed** + **pagination** (prev/next); each item shows a **views** badge; opening an article increments its view count.

## S4. Parent panel
- **Nav** (no "OlympIQ" wordmark): **Home · Analytics · Subscription · FAQ · Contact** + a round **profile icon** far right → opens a **drawer** with **Account** (avatar/change-password/delete/logout), **Language**, **Theme**.
- **FAQ/Contact** from the parent nav stay **inside the parent app** (no jump to the public/landing site).
- **Home:** first the **information carousel** (now working — one slide, arrows + dots), then **My children** with the **Add child** button on the **right**.
- **Analytics** page shows real metrics (children, active subscriptions, attempts, avg score).
- **Subscription** page: modern **cards** per child + **Cancel subscription** → a dialog asks **why** + shows **what you'll lose** before confirming.

## S5. Student (ARENA) panel
- The **theme toggle + language dropdown** are in the ARENA top nav; the wordmark is gone (just "ARENA").

If anything here doesn't match its **Expect**, tell me the **S#** + what you saw, and I'll fix it. And re-drop the **"Energetic" landing design image** when you can — I built the light-mode polish to your written description and will align it to the image.

---

# Round 5 changes — what to test (2026-07-01)

> **No DB or terminal work needed** — no SQL changed this round (the wallpaper backend already existed). Just **restart both dev servers** so the new code loads (no re-login needed this time — cookie names unchanged).

## T1. Rebrand → OlympIQ
- Everywhere the brand appears (landing header/footer, login/register, student header, admin sidebar/login, browser tab titles) now reads **OlympIQ** — no more "OlympIQ" / "OLIMP·ARENA".
- **But** the olympiad *feature* wording is intentionally kept: "Olimpiada Hazırlığı" / "Olympiad preparation" / nav "Olimpiada hazırlığı" etc. stay (that's the competition word, not the brand).

## T2. Energetic LIGHT theme (toggle to Light in the navbar)
- In **Light** mode the app is now purple (`#7c3aed`) + orange (`#ff8a00`) on a cream background, rounded (22px) cards with soft purple shadows, Trebuchet font, gradient logo mark + gradient stat numbers + a purple→orange hero. It should feel energetic, not flat.
- **Dark** mode should look exactly as before (unchanged).

## T3. Profile pages + drawers (parent & student)
- **Parent:** the round profile icon (top-right) opens a **drawer** with **My profile** (button), Language, Theme, Log out. Clicking **My profile** → a full-width **/profile** page (avatar upload, change password, delete account) — no longer cramped inside the drawer.
- **Student:** same pattern now exists — a profile drawer (avatar → drawer with My profile / Language / Theme / Log out) → **/child/profile** page (avatar, change password, wallpaper). The student **home page no longer shows the profile panel**.

## T4. Wallpapers (admin set + student reset)
- **Admin → Wallpapers** (`/wallpapers`): add a solid color; **upload an image wallpaper** (≤3 MB); activate/archive.
- **Student → /child/profile → wallpaper:** the image wallpapers you uploaded now **show as photo swatches** (not a flat dark box); pick one → the ARENA background becomes that photo (with a readability scrim). A **"Default"** swatch **resets** to the theme default (follows light/dark).

## T5. Admin settings toggles
- The feature-flag + Yes/No switches now **physically slide** (the knob glides left↔right) and flip **instantly** on click.
- **Gating actually works now** (previously the toggles saved but did nothing):
  - Turn **"Public news page" (news_public) OFF** → visit the public **/news** → it shows "News is currently unavailable." Turn it back ON → the list returns.
  - Turn **"Public leaderboard names" OFF** → the student **leaderboard** anonymizes other students (e.g. "Student ####"); your own row stays yours. ON → real names.
  - *(Note: launch_promo / olympiad_module / payments / notifications_email toggles slide + save but their gates aren't wired yet — see deferred.)*

## T6. News image + design
- Open **/news** — the cover images now load **immediately** (no more blank-then-pop; they're resized/webp via next/image). The list is now a **card grid** (cover or placeholder + title + short excerpt + date + views). Open an article → a cleaner detail page (meta row with date + views, better typography).

If anything here doesn't match its **Expect**, tell me the **T#** + what you saw and I'll fix it.

---

# Round 6 — what to re-test (U1–U8)

> Restart the web dev server first (`Ctrl-C` → `npm run dev` in `web-app/`), and the admin panel too.

## U1. Student navigation = parent navigation (drawer bug fixed)
- Log in as a student. The top bar is now the **same structure as the parent's**: logo dot + Home, Tasks, Leaderboard on the left, streak + round profile icon on the right (dark arena colors).
- The page must **not extend to the right** anymore, and clicking the profile icon must slide in the **drawer from the right edge** with visible content (My profile / Language / Theme / Log out). Log out from it.
- The active tab now follows the page you're on (it used to always highlight the first tab).

## U2. Spacing pass
- Student **/child/profile** and parent **/profile**: the avatar / name / upload / change-password blocks have clear vertical breathing room (no card-in-card cramping).
- Buttons across the app (Save, Cancel, Change password, upload, plan buttons) hold their text with comfortable padding — no text touching borders.

## U3. Language settings now GATE the web-app
- Admin → Settings → Localization: **Supported languages** currently has **Russian unchecked** (your earlier test!). Open the web-app → the language dropdown (public navbar + parent/student drawers) offers **only AZ + EN**, and if your browser still had `ru` selected the UI falls back to the default language.
- Re-check Russian in admin → the web-app offers all three again.

## U4. Hydration console error — gone
- Open the web-app home with DevTools console: the `data-theme` hydration error no longer appears.

## U5. Feature-flag gates (all six now wired)
- **payments** is currently **OFF** on dev: parent → child → Subjects/subscribe shows "Payments are temporarily paused…" instead of the form; olympiad Buy buttons hidden; subject add/remove blocked. Turn payments ON in admin Settings before testing the subscribe flow.
- **launch_promo** is currently OFF: the public /pricing page hides the trial promo line. Turn ON → line returns.
- **olympiad_module** OFF → student "Tasks" tab disappears, olympiad pages show a notice, public /olympiad-preparation 404s, parent dashboard hides the Olympiads button. (Currently ON.)
- **news_public** / **leaderboard names** — as in T5.
- **notifications_email** — gate helper exists for the future email sender; nothing sends email yet (honest note).

## U6. Admin Settings redesign (UniPrep-style)
- Admin → Settings: tabbed layout (**General / Localization / Features**) with grouped cards, per-field Save buttons, descriptions under labels, and **no raw JSON editors anywhere**.
- General tab: **Maintenance mode** (asks for confirmation; turning it ON makes the whole web-app show a maintenance notice — try it, then turn it off), trilingual maintenance message, support email + phone (phone appears on the public Contact page when set), social links (appear in the public site footer when set).

## U7. News likes + "Most liked"
- Open a news article **while logged in** (parent or student): a ♥ like button sits next to the views counter — click to like/unlike (instant). Logged out → just a ♥ counter.
- /news list: cards show ♥ counts and the toolbar has a **"Most liked"** sort.

## U8. Grade promotion is scheduled (pg_cron)
- Nothing to click — the dev DB now has a pg_cron job `olympiq_advance_student_grades` running `advance_student_grades()` every **September 1, 03:00 UTC**. (Verified present on dev.)

If anything here doesn't match, tell me the **U#** + what you saw.

---

# Round 7 — what to re-test (V1–V5)

> Restart both dev servers first. Also run `npm install` in BOTH `web-app/` and `admin-panel/` once (dependency security overrides changed the lockfiles).

## V1. Brand mark spacing
- Parent + student top bars: the logo dot now sits in a fixed slot with clear space (10px) before the "Home" label, vertically centered. (The slot is ready for the real logo file — when you share it, it drops in without layout changes.)

## V2. Views no longer inflate from likes
- Open a news article logged in, spam the ♥ like button: the like count toggles instantly, but **views do not increase**. Views now count **once per browser session per article** (a fresh tab session = +1). What you saw before was every like click re-rendering the article and each re-render counting as a "view" — kept likes, fixed views.

## V3. Security headers (both apps)
- DevTools → Network → click the document request → Response Headers: you should see `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.
- Sanity: the Google Maps box on /contact still loads; Light/Dark toggle still works; student area fonts still load; images/avatars/wallpapers still display; admin panel pages all render. **If anything visual broke, it's most likely the new CSP — tell me what + the console error.**

## V4. Auth hardening (web-app)
- Parent login: after ~10 rapid failed attempts for the same email you get "Too many attempts…" for a while (per app instance). Register/forgot-password are similarly throttled.
- Avatar upload: renaming a `.exe`/`.txt` to `.png` and uploading now fails with the file-type error (bytes are checked, not the name).
- Subscription/practice errors no longer show raw database text — generic message instead.

## V5. Admin panel hardening
- Idle logout is now enforced server-side: leave the admin idle >30 min → the next click/refresh lands on the login page (previously only a browser timer).
- Admin login failures show one generic "invalid credentials" message.
- News/Olympiad/Wallpaper/Settings changes now appear in the Audit log page.

If anything here doesn't match, tell me the **V#** + what you saw.

---

# Round 8 — what to re-test (W1–W12)

> Restart both dev servers first.

## W1. Pricing page (public)
- /pricing is now a SaaS pricing page: centered title + one-line subtitle, three EQUAL-HEIGHT cards (Weekly ≈2 / Monthly ≈6 / Yearly ≈50 AZN — unchanged), Monthly has a "Most popular" badge + stronger purple CTA, each card has 3 benefits with check icons and a CTA to /register. Below: the sibling-discount info box (icon + auto-apply text, no promo code) and a small muted sample-prices note. Check light AND dark, and AZ/EN/RU (no overflow).

## W2. About page (public)
- /about: gradient hero with an illustration + fact chips, then alternating illustration/text story blocks (studying, family dashboard, olympiad prep, progress, safety), then a 2×2 card grid (Mission / What we offer / Who it is for / Trust & Transparency). All inline SVG (no external images). Mobile: stacks cleanly.

## W3. FAQ chevrons (landing + parent)
- FAQ items now show ONE chevron, vertically centered on the right, rotating on open/close. The small extra caret above it is gone (both /faq and parent Help → FAQ).

## W4. Font (ə/Ə test)
- The whole site now uses Arial. Check these render cleanly everywhere (headings, buttons, FAQ, pricing, nav): ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ — especially "ə" on the landing light theme and in the student panel.

## W5. Carousel
- Parent dashboard carousel now shows 2 FULL cards on desktop, 1 on mobile — never a half-cut card; equal heights; arrows/dots aligned; smooth sliding.

## W6. Analytics (progress merged in)
- "Uşaqlarım" child cards no longer have a progress button (only manage/subscribe, olympiads, reset password, delete). Old progress URLs redirect to /analytics.
- /analytics: 4 real stat cards on top; below — child selector (if 2+ children), 4 subject tabs (inactive subjects disabled with a lock + "Subscribe to unlock…"; the single active subject auto-opens), then the demo dashboard: KPI tiles, weekly bar chart, accuracy trend, topic table, mistakes-by-topic table. **Dashboard numbers are DEMO data for now** (owner-approved) — they vary per child/subject but are static.

## W7. Subscription page
- /subscription: [Plans | Billing | Invoices] tabs smooth-scroll on the same page. Plans reuse the public pricing cards with "Current plan" on the child's real interval + selected subjects + computed total + Manage/Add subjects buttons. Billing + Invoices sections are DEMO (next billing 29/01/2026, MasterCard ****8475, 2 invoice rows) — only "Cancel subscription" is real.

## W8. Parent profile
- /profile is a structured account-settings page: identity header (avatar + name + email + photo actions + "JPG or PNG, maximum 2 MB."), Account information, Security (change password), Danger zone (delete), Session (log out). Everything aligned, consistent buttons.

## W9. Account drawers (parent + student)
- Sections: Account / Language / Appearance / Session. "Profilim" row has ONE arrow + a user icon. Language = [AZ][EN][RU] segmented buttons on desktop (selected highlighted; disabled languages hidden), dropdown on mobile. Appearance = [Light][Dark] side-by-side with the active one clearly marked. Log out sits under Session.

## W10. Student light mode + Olympiads tab
- Student panel in LIGHT mode now matches the landing light style (white cards, purple accents, cream background); DARK mode unchanged.
- Student nav tab is now "Olimpiadalar" with two sections: "Keçirilməsi planlaşdırılan olimpiadalar" (cards with cover/status/date/subject + "Ətraflı" opening a detail modal ending with "Bu olimpiadaya qatılmaq üçün valideyninizdən paketi almağı xahiş edin.") and "Olimpiadalarım" (owned packages; empty-state kept).
- Admin → Olimpiada package form now has a cover-image upload + an "Event date & time" field; set both on a package and confirm the student card shows them.

## W11. Student profile + backgrounds
- /child/profile: identity header (avatar, name, 8-digit ID), photo actions + helper text, Security (password). No delete/email/olympiads button.
- Background selector is now a template gallery with 6 new playful presets (Sürət yarışı, Kosmos, Okean, Cəngəllik, Şirniyyat, Gecə yarışı) + the color/photo ones; selected template clearly highlighted; picking one changes the dashboard background.

## W12. Student logout
- Log out from the student drawer → lands on the LANDING page (/), not /child-login.

If anything here doesn't match, tell me the **W#** + what you saw.

---

# Round 9 — what to re-test (X1–X9)

> Restart both dev servers first.

## X1. Landing language selector
- The language button in the public navbar shows ONE chevron (rotates when the menu opens).

## X2. Parent home child cards
- "Uşağı sil" is now a proper outlined danger button matching the row; clicking it opens a styled confirmation dialog (not the browser popup). The reset-password inline input is styled like other inputs.

## X3. Avatars
- Upload a parent and a student photo: the navbar circle and every profile avatar clip the image into a perfect circle (no square corners poking out).

## X4. Modals (shared component)
- Student → Olimpiadalar → "Ətraflı": opens a centered modal (was broken/clipped); closes on outside click, Escape, and ×; page scroll locks while open.
- Parent: subscription Cancel flow, Delete account, and Delete child all use the same modal style now.

## X5. Analytics is REAL now (+ 5 boxes)
- /analytics: the top 4 metric cards stay; the dashboard below now shows REAL numbers computed from the child's graded attempts (new DB functions) — child/subject selection updates the URL. The "Orta dəqiqlik" tile is gone: exactly **5** KPI boxes fill the row evenly. With no practice data you get a friendly "no data yet" panel — no fake numbers anywhere. To see it live: have the student complete a practice test, then reload analytics.
- Admin → Dashboard: new "Platform overview" section (children, parents, active 7d, attempts 30d, accuracy 30d, published questions, active subscriptions + signup/attempt trends). Content-manager logins simply don't see the section.

## X6. Parent "Olimpiadalar" menu (new)
- New nav item between Analitika and Abunəlik. Pick a child (segmented selector) → package cards show cover, chips, date, question count and the ADMIN-defined price → "Buy" opens the shared modal → confirm → success state, card flips to "owned", and the package appears in that student's "Olimpiadalarım". Already-owned packages show a disabled owned pill. Payment is MOCK (single seam ready for the real provider). With `payments` flag OFF the buy buttons hide.

## X7. Admin Questions upgrades
- /questions now has: lifecycle stat cards (Total/Draft/In review/Published/Archived — clickable filters), a debounced text search, cascading Subject→Topic→Subtopic + Type/Grade/Status filters, server-side pagination (25/50/100 with a numbered pager + "Showing X–Y of N"), and per-row quick lifecycle buttons (approve/publish/etc. without opening the question). Bulk toolbar/import all still work.

## X8. Admin Wallpapers — fixed (root cause found)
- Your earlier saves ("blue", "test") WERE saved — a duplicate database relationship made the list query fail silently, so they never displayed. That's fixed at the DB level (migration 022) + the code now surfaces list errors and shows explicit "Saved ✓" / error feedback on both the color form and image upload. Your old test rows will now appear — archive them if unwanted.

## X9. Student background templates ← admin
- Student → Profile → backgrounds: the gallery is fully driven by Admin → Wallpapers (colors, images, and the playful presets). Add a new color/image in admin → it appears in the student gallery immediately (active ones only).

If anything here doesn't match, tell me the **X#** + what you saw.

---

# Round 10 — what to re-test (Y1–Y13)

> Restart both dev servers first.

## Y1. Content Manager least privilege
- Log in as a content manager: sidebar shows only Dashboard + Questions (+ the "Tezliklə" Daily Tasks placeholder). Direct URLs to /news, /olympiad, /wallpapers, /settings, /accounts, /audit, /cities, /schools, /manage/* redirect to Unauthorized. Questions: CM can create/edit/submit but NOT approve/publish/delete (admin-only). A full module-by-module matrix is recorded in STATUS.md.

## Y2. Admin filters (7 sections)
- News, Olimpiada paketləri, Subjects/Topics/Subtopics (Manage), Cities, Schools: each list now has a filter bar — status select + debounced name/title search; Topics adds a Subject filter; Subtopics adds Subject→Topic cascade; Schools adds a City filter. Filters live in the URL (shareable) and are validated server-side.

## Y3. Schools data
- Schools list now contains **312 verified Bakı schools** (310 numbered + the Sports Lyceum №1 and the Bülbül music school), seeded from the official Bakı Education Department list (source URL documented in migration 024). Numbers absent from the official list (2, 6, 11, 15, 16, 20, 40…) are intentionally NOT present. The two old sample rows (№6/№20) remain untouched (legacy references) — archive them if desired. Other cities: deliberately not seeded until an official list is available (documented decision).
- Add-Child wizard: the School dropdown for Bakı now offers the full list.

## Y4. Olympiad Packages table
- /olympiad: rows are level (no crooked borders), price/status/actions never wrap, and the table scrolls horizontally on narrow screens.

## Y5. Accounts search
- /accounts: search box filters parents by name or email at query level (children shown for matches).

## Y6. Audit log
- /audit: Action and Entity columns show human-readable trilingual labels (e.g. "Divar kağızı yaradıldı" instead of admin.wallpaper.create). Only Admin/Content-Manager actions appear — general user/system rows are excluded IN THE QUERY. An entity filter select on top.

## Y7. Settings save buttons
- /settings: each field now reads top-to-bottom — label, input, help text, then the Save button under the field (right-aligned). No more buttons floating above inputs.

## Y8. Social icons
- Set Facebook/Instagram/YouTube/TikTok URLs in Settings → General → Social links: the public footer shows round platform ICONS (hover = purple; screen readers announce the platform name).

## Y9. News images
- Public /news (and panel news): covers paint with a soft shimmer instead of an empty box; the first page loads eagerly; revisits are instant (optimized variants now cached 31 days).

## Y10. Panel news
- Parent nav has "Xəbərlər" → /dashboard/news (stays inside the parent shell); the dashboard "View all" goes there too. Student nav has "Xəbərlər" → /child/news inside the arena shell. Articles, sorting, pagination, views and ♥ likes all work inside both panels.

## Y11. Admin "Tezliklə"
- The Upcoming group now lists only: Gündəlik tapşırıqlar (visible to Admin + CM), Subscriptions, Payments. "Tests & Daily Tasks" is renamed/reduced; the redundant Tests half is gone.

## Y12. "Baxışlar" removed
- The Reviews/Baxışlar placeholder is gone from the sidebar — the review queue lives in Questions (In-review stat card + status filter).

## Y13. Leaderboard flag
- Settings → Features → Leaderboard OFF → the student "Reytinq" tab disappears and the direct URL shows "ranking is currently unavailable — disabled by an administrator" (trilingual). ON → tab + page return.

If anything here doesn't match, tell me the **Y#** + what you saw.

---

# Round 11 — payment modes, giveaway, phone, stickers, multi-child billing (Z1–Z14)

Test with BOTH apps running (`web-app` :3000, `admin-panel` :3001) against dev. The three payment-mode flags live in Admin → Settings → Features → "Payment mode".

## Z1. Payment-mode exclusivity (Settings → Features)
- The trio (Automatic payments / Demo Payments / Giveaway Period) sits in its own "Payment mode" card with an exclusivity note.
- Turn Demo Payments ON → Automatic payments visibly flips OFF after the toggle settles. Turn Giveaway ON → Demo flips OFF. Turn Automatic ON → Giveaway flips OFF. All three can be OFF together.
- The duration-days input under Giveaway saves integers 1–730 only (try 0 and 9999 → rejected).
- With Giveaway ON: a read-only line shows the start time and computed end (Asia/Baku); re-saving another flag does NOT restart the giveaway clock.

## Z2. Demo Payments mode (parent)
- Settings → Demo Payments ON. Parent → Subscription → a child with a plan → "Manage subjects": all subjects show as checkboxes with per-interval prices; active ones carry an "Aktiv" chip; note "price per 1 subject" visible.
- CHECK an extra subject → Save → a clearly-labeled DEMO payment sheet opens FIRST showing base / sibling discount / total from the server quote. Cancel → nothing changes (subject still locked). Confirm → subject unlocks; dashboard/analytics reflect it.
- UNCHECK a subject (keep ≥1) → Save applies directly (no payment sheet); price re-computed. The last remaining subject cannot be unchecked.

## Z3. Giveaway Period (parent + child)
- Settings → Giveaway ON (e.g. 7 days). Both parent panel and student arena show the celebratory countdown banner (days/hours/minutes ticking; gradient; trilingual).
- Parent: Subscription page shows the free notice + "Pulsuz" chips instead of subscribe CTAs; olympiad buy buttons become "free during giveaway" chips; dashboard child pills read "Pulsuz kampaniya".
- Add-Child during giveaway: wizard = 2 steps (Info → Done), no plan/payment, the 8-digit ID is revealed immediately with the celebration note.
- Child: arena unlocked without a subscription; ALL actively-priced subjects appear for practice; active-catalog olympiads playable with a free chip; a practice round completes end-to-end.
- Expiry: set duration to 1 day, then (dev-only) backdate `giveaway.started_at` by 2 days via SQL → banner disappears, child without a subscription is locked again, normal payment rules resume. (No job needed — checks are evaluated live.)

## Z4. Payments fully OFF
- All three flags OFF → subscribe page shows the payments-paused notice; wizard = Info → notice (child created, ID pending); hand-crafted POSTs to subscribe/add-subject fail server-side.

## Z5. Parent registration phone
- /register shows a country selector (default 🇦🇿 +994, all countries searchable in the list) + required number field. Submitting empty/short/letters → blocked with the trilingual error. Valid number → account created; Profile shows the phone read-only. DB stores E.164 (`+994501234567`).

## Z6. Add-Child wizard visuals
- The whole wizard is horizontally centered on desktop/tablet/mobile.
- The password eye sits vertically centered in the input (also check /login and /register — the fix is global for `.form` fields).
- Step 3 shows three plan CARDS (Weekly/Monthly/Yearly) with a "Most Popular" badge on Monthly, selected-state highlight, live totals; selection updates the quote below.

## Z7. Admin create-child with payment bypass (Accounts)
- Admin → Accounts → "Create child": pick a parent (filter box works), names + password + grade; "Grant free access" ON reveals interval + subjects + optional days. Create → the 8-digit ID is shown; the child appears under that parent with ACTIVE access and the granted subjects; NO payment anywhere. Audit log shows "Child account created" + "Free access granted to child".
- With grant OFF → child is created ID-pending (parent subscribes later).
- Normal parent flows still require the payment step (bypass is admin-only).

## Z8. Subscription page multi-child
- Parent with 2+ children: selector tabs at the top; the active child is highlighted; Plans/Billing/Invoices below show ONLY that child's data; switching tabs (and refreshing) keeps the right child; `?child=` with a foreign/invalid id safely falls back to the first child.
- Buy/manage for child X → child Y's view is unchanged.

## Z9. Analytics subject unlocking
- For each child, only subjects covered by THAT child's live subscription are selectable; others show a lock + "subscribe to unlock" linking to that child's subscribe page. Hand-editing `?subject=` to a locked subject does not render its data.
- During giveaway (or for an admin-granted child) the relevant subjects unlock automatically.

## Z10. Sibling discount sanity
- 2nd child's quote/payment sheet shows −15%, 3rd child −20% (1st child none) — in the wizard, in Manage subjects, and on totals. Amounts always come from the server quote.

## Z11. Character stickers — admin (Stickers replaces Wallpapers)
- Nav shows "Stickers"; /wallpapers is gone. Create a theme (e.g. "Ben 10") → starts disabled. Upload stickers: only PNG/WebP accepted (try a JPG → rejected before upload); previews render on a transparency-friendly backdrop.
- **Enabling with <6 images fails** with the friendly "needs at least 6" message; the count hint shows "{n}/6"; at 6+ it enables. Deleting an image that would drop an ENABLED theme below 6 is blocked; disable first → delete works. Theme delete needs the typed theme name. All actions appear in the Audit log.

## Z12. Character stickers — child (exactly 6, side gutters, hover wiggle)
- Child → Profile: the old background-templates section is GONE; "Personaj stikerləri" shows enabled themes as cards (name + sample collage) plus an "off" card. Selecting persists across refresh/re-login.
- On a **desktop-width** window (≥1280px), an active theme shows **exactly 6 UNIQUE** stickers — **3 down the left gutter, 3 down the right** — in a **triangular/staggered** pattern (top & bottom hug the outer edge; the middle one sits a bit closer to the content; never a straight vertical line). All 6 are different images; a theme with more than 6 shows a stable random 6.
- **No overlap ever — including on hover:** stickers stay in the empty side margins and never cover cards/text/buttons/nav (the placement reserves room for the hover scale-up + tilt + shadow, so even a hovered sticker keeps ~15px clear of content). Content clicks are unaffected. Resize narrower → stickers shrink; below ~1280px (tablet/phone widths where the 1100px content fills the screen) they hide entirely — verify **no horizontal scrollbar** appears at any width.
- **Hover** a sticker (desktop) → quick playful wiggle + slight scale-up, then it settles. With OS "reduce motion" on, the float/wiggle stop (only a tiny hover scale remains).
- The "off" card removes stickers. Disabling a theme in admin makes its decorations stop rendering for children who had it selected.

## Z13. Landing "What sets us apart"
- The section spans full width with a centered heading + accent bar; 4 cards desktop / 2 tablet / 1 mobile with generous spacing, subtle shadows, hover lift; same texts/icons as before; both themes look right.

## Z14. Regression sweep
- Login/child-login/reset flows unchanged; arena background = plain theme (no leftover wallpaper), light + dark both fine; cancel-subscription flow still works during any payment mode.

If anything here doesn't match, tell me the **Z#** + what you saw.

---

# Round 11 — owner fix pass (ZF1–ZF6)

## ZF1. Giveaway countdown — live seconds
- With a giveaway active (Admin → Settings → Giveaway ON), the countdown banner in BOTH the parent panel and the student arena now shows **days · hours · minutes · seconds** and the seconds tick every second (hours/minutes/seconds are 2-digit padded so nothing jitters). Trilingual unit labels.

## ZF2. Giveaway on the public site
- While the giveaway is active, open the **landing page while logged out** — the celebratory countdown banner appears at the top (and on other public pages). Turn the giveaway off → it disappears.

## ZF3. Phone country selector (register)
- On /register the country control is now COMPACT: it shows just the code (e.g. "AZ +994"), no long country name. Click it → a searchable list opens (type "aze" or "994" to filter); pick a country → the trigger updates and focus returns to the number field. Escape / click-outside closes it. Submitting still requires a valid number and stores E.164 (`+994…`).

## ZF4. Demo-payment CVC no longer overflows
- Add-Child → (demo/real payment mode) → the payment step: the **CVC** box sits fully inside the card next to Expiry on desktop and mobile — no part of it spills past the card edge.

## ZF5. Analytics subject tabs show the child's real plan
- Parent → Analytics → Detailed progress. For a child with an active subscription, the **Subject** tabs now show that child's REAL subscribed subjects (e.g. İnformatika, Azərbaycan dili) as selectable — matching what "Manage subjects"/subscribe shows. Subjects the child isn't subscribed to appear locked with a "subscribe to unlock" link. Switch children → the subjects update per child. (Previously subjects outside a hardcoded math/science/logic/english set were dropped, so some children showed no subjects at all.)

## ZF6. Stickers a bit bigger
- On a ≥1280px window with an active sticker theme, the 6 side stickers are noticeably larger than before but still tasteful — and STILL never overlap content (even on hover) and cause no horizontal scroll.

## ZF7. Phone selector alignment + no bleed-through
- On /register the country code control (`AZ +994`) is the SAME height and top-aligned with the number input. Opening it → the dropdown is fully OPAQUE (the password field / buttons / footer below no longer show through it) and sits above those sections.

## ZF8. Profile avatar is a circle
- Parent profile and child profile: an uploaded photo renders as a perfect CIRCLE (cropped to fill), never a stretched oval — regardless of the photo's aspect ratio.

## ZF9. Editable full name in both profiles
- Parent → Profile → Account information → "Name" row has an **Edit** button → shows a full-name field → Save updates it (persists after refresh; the header name updates too).
- Child → Profile → Account information → **Edit** → First name + Last name fields → Save updates the child's name (persists). A child can only edit their OWN name.

---
# Round 12 — owner update pass (2026-07-05)

## AA1. Private schools + numeric school ordering
- **Admin → Schools:** the list now shows a **Type** column (Private/Public badge). Private schools appear **at the top**; below them public schools sort by number **1, 2, 3, … 10, 11** (NOT "10" before "2"), unnumbered schools last. The new **Type** filter (All / Private / Public) works alongside the city/status/name filters and pagination.
- **Admin → Schools → Add / Edit:** a **Private school** checkbox. Add a school named like "Bakı 12 nömrəli tam orta məktəb" → it slots into the numeric order automatically. Mark one Private → it jumps to the top group.
- **Web → Parent → Add child → city step:** pick Bakı → the **school** dropdown shows a **Private schools** group first (Dünya Məktəbi, Landau, …), then a **Public schools** group ordered numerically. Other cities with no private schools show a flat numeric list.

## AA2. Admin "Site Content & Design"
- **Admin → (Operations) → Site Content & Design** (Administrator only — hidden for a Content Manager).
- **Design → Typography:** change the base **font size** (13–22) and **font family** (whitelisted AZ-safe options) → Save → the **web-app** (public/parent) light+dark text updates; a **Clear** returns to the default. **Colours:** change Accent / Background / Text / Surface → the **web-app light mode** re-skins; **dark mode does NOT change** (owner's frozen reference). Clear a colour → default returns. Invalid values are rejected.
- **Content:** edit e.g. `home.heroTitle` (az/en/ru) → Save (status pill flips **Default → Custom**) → the public home page shows your text in that language; other keys keep their built-in text. Blank a locale → it falls back to the built-in string. (v1 overrides apply to SERVER-rendered text.)
- Every save writes an **audit row** (`admin.site_content.update` / settings update).

## AA3. 5 child-friendly light-mode palettes
- **Web → Child → Profile:** next to **Character stickers** there's a **Color palette (light mode)** section with 6 swatch cards (Default + Sky / Pink&Purple / Mint / Orange&Cream / Rainbow).
- In **light mode**, click a palette → the whole student panel re-skins (backgrounds, buttons, tabs, cards, selected states) and the choice is **saved** (log out + back in → still applied). Text stays readable (white on the accent buttons).
- Switch to **dark mode** (drawer) → palettes have **no effect** (dark is unchanged). Default card → back to the standard purple look.

## AA4. Rename OlimpIQ → OlympIQ
- Brand now reads **OlympIQ** everywhere user-facing: browser tab titles (web + admin), public header/footer, login/admin headers, "OlympIQ in numbers" section, metadata. No "OlimpIQ" (with i) remains.
- Nothing functional should break from the rename (sessions, news view counts, grade-promotion cron still work). Feature names like "Olimpiada Hazırlığı" are unchanged (that's the Azerbaijani word for "olympiad").

If anything here doesn't match, tell me the **AA#** (or **ZF#/Z#**) + what you saw.

---
# Round 12 — pass 2 (2026-07-05)

## BB1. Admin Add-Child — live parent search
- **Admin → Accounts → Create child**: the parent field is now a **search box**. Type part of a parent's **name, email, or phone** → matching parents appear live (debounced) with their **contact + child count**. No match → "No parent found". Pick one → it's selected (Clear to reset).

## BB2. Admin Add-Child — City + School
- Same form now has **City** and **School** (both required). Pick a city → the school dropdown enables and lists **Private schools** first, then Public, in numeric order. Create the child → it saves with that city/school (and, if you left "Grant free access" on, still reveals the 8-digit ID).

## BB3. Admin → Free Access (new)
- **Admin → Free Access** (Administrator only): create an interval — search a **parent**, optionally pick **one specific child** (default = all their children), set **Start** and **End** (End must be after Start), optional note → **Create**. It appears in the list with a status pill (**Scheduled / Active / Expired**). **Deactivate** ends it early. Every create/deactivate writes an audit row.

## BB4. Free access — parent sees everything free + countdown
- Create an **Active** interval for a test parent (start in the past, end in a few days). Log in as that **parent**:
  - A **countdown banner** ("Free access — ends in …") shows at the top of the parent pages, ticking live.
  - **Subscription** page shows the **free** notice (no paid CTAs / prices as free).
  - Trying to subscribe/add a subject shows the "free right now" message (no charge, no paid record).

## BB5. Free access — child can use everything free
- Log in as that parent's **child** (8-digit ID): the dashboard shows **access granted**, all subjects are practicable, and starting a practice/olympiad works — **without any paid subscription**.

## BB6. Free access — expiry is automatic
- Set the interval's **End** to a moment in the near future (or Deactivate it). After it passes: the parent countdown disappears, prices return to normal paid state, and the child reverts to their real subscription state — **no admin action needed** (lazy expiry).

## BB7. Website Content (text-only CMS) + rename
- **Admin → Website Content**: pick a **Section** (Landing / Student / Parent), then a **Menu** → edit that menu's trilingual texts → **Save** (status flips Default → Custom). Open the matching **web-app** page → your text shows in that language; blank a locale → the built-in text returns. There is **no** font/colour/design editor anymore (removed).
- **Rename**: the browser tab + headers read **OlympIQ**; package.json names are `olympiq-*`. Feature names like "Olimpiada Hazırlığı" are unchanged (AZ word). Nothing functional should break.

## BB8. Free Access page = the whole create→schedule flow (Round 12.1)
- **Admin → Free Access** now has **four sections on one page**: **Create parent** → **Create child** → **Schedule free access** → **Scheduled intervals**.
  - **Create parent** (same form that used to live in Accounts): fill first/last/email/password → create. Immediately type that parent's name in the **Create child** or **Schedule** search boxes → they're found (live DB search, no reload needed).
  - **Create child**: search the parent (name/email/phone, debounced, loading/empty states), City → School cascade (private-first, numeric), password, optional grade/comped grant → create → 8-digit ID revealed.
  - **Schedule free access**: unchanged (BB3) — parent search, optional specific child, Start/End, note.
- **Admin → Accounts** no longer has any **Create parent / Create child** buttons — it is list/manage only (search, edit name/status, reset child password, delete). Everything else there still works.

If anything here doesn't match, tell me the **BB#** + what you saw.

---
# Round 13 — audit remediation + Test Engine (2026-07-06)

## CC1. Audit fixes you can SEE
- **Admin idle logout is real now**: leave the admin panel untouched ~31 minutes → next click bounces you to login (the middleware had never been registered before this round).
- **Admin → Accounts** is paginated (20 parents/page, prev/next keep your search).
- **Admin login** throttles after ~10 rapid wrong passwords ("too many attempts").
- **Web**: prices on `/pricing` and the parent **Subscription → Plans** tab now come from the DB (`subjects_pricing`, seeded 1/3/30 AZN — change a price in admin → the pages follow within a minute). The public nav/footer now link **Olimpiada Hazırlığı** (`/olympiad-preparation`).
- **Parent dashboard**: a child covered by a free-access window shows the **free** pill (not "expired"). The child **Olimpiadalar** tab during a giveaway/free window can actually START free packages (this was broken by a DB typo — never worked before). Packages whose event date passed show **Held** and can't be bought.
- **Add-Child during a free window**: the wizard skips payment (like the giveaway) and the subscribe page offers **Activate login ID** — the child gets their 8-digit ID without any paid plan.

## CC2. Subscription lifecycle (now enforced)
- A **trial actually ends**: trials/paid periods past their end date lose access (checked live at every practice/test start + an hourly cleanup job syncs the dashboard pills).
- **Cancel** keeps access until the paid period ends, then it really ends.
- **Re-subscribe after cancel/expiry → NO second free trial** (the plan starts as a paid period immediately — demo payment).
- Double-clicking subscribe can no longer create two plans (DB-enforced: one live plan per child).

## CC3. Child TEST ENGINE (the big new feature)
- Child app → new **Sınaq** tab: subject cards (locked ones show the subscribe hint), recent test history, and a **Continue test** card if one is running.
- Pick a subject → **topic/subtopic picker** (tri-state checkboxes; selecting nothing = whole subject) → **instructions** (25 questions / 25 minutes, rules) → tick **"I understand"** → Start.
- **Player**: live countdown (orange ≤5 min, red ≤1 min), question **palette** (answered/flagged/unanswered, click to jump), prev/next, **flag for review**, autosave every 30 s. **Refresh the page mid-test** → you land back in the same test with your answers and the clock still running from the server deadline (resume). Starting a "new" test while one runs resumes it instead.
- **Submit** (confirm shows unanswered count) → **Results**: score + percent + per-topic bars → **Review**: every question with your answer (green/red), the correct answer marked, and the explanation.
- **Cancel** (confirm) → counts for nothing; the attempt shows as *canceled* in history. Letting the clock hit 0 auto-submits; an abandoned tab gets expired server-side within ~20 minutes.
- Anti-cheat you can verify: view-source/network during a test never contains `is_correct`; answers appear in the review payload only AFTER grading.

## CC4. MCQ-only question management (admin)
- **Questions → New**: the type dropdown offers only **Multiple choice**; the form renders **exactly 5 option rows** (no add/remove) and the correct-checkboxes behave like radios (exactly 1). Try saving with 2 correct or an empty option → clear error.
- **Bulk import** (questions + olympiad pool): the downloadable template now has 5 options / 1 correct; a rules note sits by the upload. A row with 4 options is rejected with a per-row error.
- **New sidebar page: Question types** — list with status pill + rules summary ("5 options / 1 correct"); edit name/status/options-required/correct-required (code is locked); deleting a type that has questions is blocked ("deactivate instead"). Other seed types (single choice, true/false…) sit **inactive** until you enable + configure them.

If anything here doesn't match, tell me the **CC#** + what you saw.

---

# Round 13.1 — pre-commit owner changes (2026-07-06)

## DD1. Bulk Upload is now a modal (questions + olympiad pool)
- **Admin → Questions**: the toolbar's **Bulk import** opens a MODAL (the `/questions/import` page is gone).
  **Subject and Grade are mandatory dropdowns** — the upload button stays disabled until both are
  chosen and a JSON file is selected. The downloaded template no longer contains `subject` /
  `grade_level` per question (your modal selection applies to the whole batch; old-format files still
  import — the modal's choice wins).
- Pick a file with a bad row (4 options, or 2 marked correct) → the modal lists **per-row problems**
  BEFORE uploading and blocks submit until the file is fixed. A clean 5-option/1-correct file imports,
  the modal reports total/успешно/failed, and the questions list refreshes without a reload.
- **Admin → Olympiad → edit package**: the private-pool import is the same modal; **Subject shows
  read-only from the package**, **Grade is a mandatory dropdown**, same validation + template shape.

## DD2. New question = modal (no page navigation)
- **Admin → Questions → New question** opens the FULL creation form in a modal (the `/questions/new`
  page is gone): all fields, taxonomy dropdowns, exactly-5 options with radio-like correct marking, same
  errors. On save the modal closes and the new question appears in the list **without a page reload**.
  Images are still added on the question's edit page (hint inside the modal says so).

## DD3. Olympiad packages are purchase-only in EVERY mode
- **Free access / trial / giveaway now cover SUBJECTS only.** With an active free-access interval or
  giveaway window: the child **Olimpiadalar** tab no longer lists non-owned packages as playable (no
  free chips) — planned packages show as cards with the "ask your parent" note; only PURCHASED
  packages are startable. Subjects/tests remain free as before (unchanged).
- **Buying during a giveaway now WORKS** (it used to be blocked with an "it's free right now" note):
  parent → Olimpiadalar catalog and the per-child page show the normal buy button in real/demo/giveaway
  modes; only payments **off** hides it. The public `/olympiad-preparation` page is REMOVED — check the
  public site nav + footer have no link and the URL 404s.
- DB proof (optional): a child calling the start RPC on a non-purchased package gets
  `olympiad: no active purchase` even mid-giveaway; validation checks #37/#42 assert the free-window
  helpers are absent from the olympiad guard (49/49 PASS).

If anything here doesn't match, tell me the **DD#** + what you saw.

---

# Round 14 — Leaderboard (2026-07-06)

> Prereq: turn the **leaderboard** feature flag ON (Admin → Settings). Points only start
> accumulating from NOW (they come from newly graded attempts — old attempts don't backfill).

## EE1. Child earns points + streak (the engine)
- As a child, finish a **topic test** (Sınaq) or a practice round → open the **Liderlər** tab:
  your points appear on the Points board (This month + All time), and the **streak flame shows 1**
  (also in the header chip — it now shows the real consecutive-day streak, not the old day count).
- Points math: 10 × difficulty weight per correct answer (easy 1 / medium 2 / hard 3), olympiad
  attempts ×1.5 and uncapped; practice+tests together cap at 150/subject/day (grinding stops adding).
- Re-submitting/regrading the same attempt NEVER adds points twice. Doing nothing for a full local
  day puts the streak **at risk** ("~N h left"); missing it resets to 0 on next view.

## EE2. Child board UX
- Tabs **Points | Streak**; scope chips **Qlobal | Fənn | Sinif | Şəhər | Məktəb** — a chip only
  shows if the child actually has that grade/city/school set; several subjects → subject chip row.
- Top-50 list: medals for 1–3, your row highlighted "· Siz". Turn **leaderboard.public_display_names
  OFF** (Admin → Settings) → other children become "Şagird •1234" while you still see your own name.
- **Your rank** card shows `#rank / total` for the selected board/scope/period (and an encouraging
  line when you're not ranked yet). Streak board is global-only (no scope/period chips).

## EE3. Admin management
- **Admin → Leaderboard** (Administrator only — a Content Manager must NOT see the nav entry, and
  the URL must bounce them): boards viewer with board/scope/period filters + scope pickers
  (subjects/grades/cities/schools), top-100 table.
- **Points formula** editors (per-correct 1–1000, daily cap 0–100000, olympiad multiplier 0.1–10) —
  out-of-range values are rejected server-side; every save writes an audit row.
- **Close season now** (confirm) → current month archived to snapshots + month points zeroed,
  all-time kept. **Hard reset** (double confirm w/ checkbox) → everything zeroed (ledger + streaks).
  Both appear in the Audit log as "Leaderboard reset (season/hard)".

If anything here doesn't match, tell me the **EE#** + what you saw.

---

# Round 15 — MCQ=4, statuses, leaderboard visibility, seasons, Free-Access wizard (2026-07-07)

## FF1. MCQ = 4 options + strict bulk-import errors
- **Admin → Questions → New**: the type is Multiple choice and the form shows **exactly 4** answer
  rows (was 5), one correct. There is **no "Source"** field anymore.
- **Bulk import** (Questions toolbar, and Olympiad → edit package → import): upload a file whose rows
  break the schema and confirm the modal now shows a **specific reason per row** in your language —
  e.g. "Row 3: exactly 4 options required (got 5)", "Row 5: exactly 1 correct answer required",
  "Row 7: missing Azerbaijani text", "unknown question type" — **not** the old generic "row could not
  be imported". A clean 4-option file imports; the template you download has 4 options and no Source.
- **Admin → Question types → Multiple choice**: the **"Exact number of answer options"** field is gone
  (it's a fixed rule now); the rule summary reads "4 answer options / 1 correct".

## FF2. Three statuses only (In review / Published / Rejected) + working bulk actions
- **Questions**: a new/imported question is **In review**. Select several → bulk action **Publish**
  (or Reject) → they move, and a **banner reports "N updated, M skipped"** (previously the bulk action
  silently did nothing). Row quick-actions and the status filter show only the 3 statuses. Draft /
  Approved / Archived are gone.
- **News** follows the same 3 statuses (In review → Publish / Reject; a published article can be sent
  back To review or Rejected). Public news still shows only Published items.

## FF3. Leaderboard is visible
- As a **child**: the **Reytinq/Rank** tab now appears in the arena nav, and the **home tab** shows a
  compact leaderboard card (this-month rank + points + 🔥 streak, "See full leaderboard →").
- As a **parent**: each child's **dashboard** card shows a rank/points/streak chip, and **Analytics**
  shows a per-child leaderboard panel (rank this month + all-time, points, current + best streak).
  *(The whole thing is behind the `leaderboard` flag, now ON by default; turning it off in Settings
  hides all of it.)*

## FF4. Admin Season management (CRUD)
- **Admin → Leaderboard → Seasons**: **New season** (name + start + end) → it appears with a status
  pill (upcoming/active/ended/closed). **View standings** shows live rankings from the points ledger.
  **Edit** works while open; **Close** freezes the standings (edit disabled after); **Reopen** clears
  the freeze; **Delete** removes it. Every action shows up in the Audit log. The separate "reset this
  month's board" + hard-reset controls are unchanged.

## FF5. Free Access = a guided Parent → Child → Schedule wizard
- **Admin → Free Access** is now ONE sequential flow, not three stacked forms:
  - **Step 1 Parent**: create a new parent OR pick an existing one. Until a parent is chosen, Step 2
    is locked.
  - **Step 2 Child**: create a new child (the parent is **locked** to your Step-1 choice — no parent
    search), OR pick an existing child **of that parent**, OR choose "all children of this parent".
    Until this is set, Step 3 is locked.
  - **Step 3 Schedule**: pick start/end (+ note) → schedule the free-access window for the chosen
    parent/child. Success lets you "Schedule another" or "Start over".
  - The scheduled-intervals table (with Deactivate) still shows below.
- Verify you **cannot** reach the child or schedule steps without completing the previous one, and that
  the existing-child list only ever contains children of the selected parent.

If anything here doesn't match, tell me the **FF#** + what you saw.

---

# Round 16 — Notifications (2026-07-07)

> The in-app center is ON (`notifications` flag). Email + push are OFF by design
> (no SMTP provider / no mobile app yet) — the inbox works fully without them.

## GG1. Child + parent in-app inbox
- A **bell** appears in the parent header and the child arena header (next to 🔥),
  with an unread badge. Click it → dropdown of the latest notifications; "See all"
  opens `/notifications` (parent) or `/child/notifications` (child).
- Full page: filter by category, click a notification → it marks read and deep-links
  (e.g. an "attempt graded" one opens that result). "Mark all read" clears the badge;
  delete removes a row. Honest empty state when there's nothing.
- **Realtime**: with two tabs open (or after an event), a new notification appears
  **without refresh** with a toast. (If your Supabase project didn't have the
  `notifications` table in the `supabase_realtime` publication, migration 043 adds
  it — a refresh always shows new rows regardless.)

## GG2. Events that create notifications (do the action, then check the bell)
- **Buy an olympiad package** for a child → the **child** gets "package purchased"
  and the **parent** gets one too (deep-links to the olympiad pages).
- **Finish a test** as a child → the child gets "your result is ready" with the
  score, linking to the result page.
- **Cancel a subscription** as a parent → the parent gets "subscription canceled".
- *(Time/payment-driven ones — trial ending, charge failed, giveaway ending — are
  intentionally not wired yet; they'll light up when the payment provider + daily
  scanners land, using the same producer.)*

## GG3. Preferences (parent manages the family)
- Parent **/profile** → Notifications section: in-app / email / push toggles for the
  parent AND a row per child. Toggle a child's email off → it's saved
  (email/push only take effect once those channels are enabled globally). The child
  arena has no preferences editor (parents manage them).

## GG4. Admin — compose, history, templates, settings
- **Admin → Notifications** (Administrator only — a Content Manager must not see the
  nav item or reach the page):
  - **Compose**: pick an audience (all parents / all children / a specific parent /
    children by subject / one person) → a **live recipient count** shows; type a
    title + body (or load a template), optionally schedule, preview, Send. The
    targeted users get it in their inbox. The send appears in the **Audit log**.
  - **History**: your broadcasts with status + delivered/total.
  - **Templates**: the trilingual per-event templates (edit/create/delete).
  - **Settings**: retention (days + max per user) and the channel master switches
    (`notifications`, `notifications_email`, `notifications_push`).
- **Publish a news article** → all parents and all children receive a "new article"
  notification linking to it. (Publishing never breaks if the notify fails.)

If anything here doesn't match, tell me the **GG#** + what you saw.

---

# Round 17 — notification/test/profile fixes + admin editing (2026-07-08)

## HH1. Notifications actually persist now
- Open a notification → it's read → **refresh / navigate away and back → still read** (previously it went unread again). Mark-all-read clears the badge and stays cleared after refresh. **Delete → refresh → still gone.** The bell badge count is correct after a refresh.
- A notification **with no link** (e.g. an admin announcement) → clicking opens a **detail modal** with the full content (title, formatted body, category, time) instead of doing nothing. Bold/italic/links in an admin message render correctly.

## HH2. Scheduled notifications + multi-parent send (admin)
- **Admin → Notifications**: the **"Individual person"** audience is gone. The push channel now reads **"Mobil tətbiq"**. The message box has a **B / I / Link** toolbar with a live preview.
- **Specific parents**: search and add **several** parents (chips, each removable); the recipient count updates as you add/remove. Send → all selected parents receive it.
- **Schedule** a notification a couple minutes out → it now **sends when the time arrives** (the dispatch cron was fixed; on dev it runs every 5 min). Any already-overdue scheduled one was flushed.

## HH3. Test player
- In a running test, the mark-for-review control is now a **bookmark/Save** icon (fills when saved); labels read **Save / Unsave / Saved**. The header shows **Fənn: … · Mövzu: …** (subject + topic, from the real test data). The palette numbers are **centered** in their circles (check single- and double-digit), and the legend sits cleanly (no "Current Question" wrapping to a second line). Check it on a narrow phone width too.

## HH4. Test results filter
- Finish a test → **Review**: filter tabs **All · Correct · Wrong · Skipped** (with counts) at the top filter the question list.

## HH5. Profiles + account editing
- **Child profile**: a read-only Grade / City / School section (the child can see but not edit it).
- **Parent dashboard → a child card → "Edit info"**: edit the child's name, grade, city→school, class; the 8-digit ID + internal id are shown read-only. Save persists.
- **Admin → Accounts**: edit a **parent** (name, phone, email, status) and a **child** (name, grade, city→school, class); internal IDs are read-only; both are audited.

## HH6. Today's Round Start
- Child home → **Today's Round → Start** on a subject → it now **opens the test page for that subject** (`/child/test/<subject>`) instead of bouncing back to the home screen.

---

# Stage M1 — Mobile foundation, admin control plane & authentication (2026-07-09)

Prereq: `cd mobile-app && cp .env.example .env` and fill `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the DEV project's values from `web-app/.env.local` — the same URL and **anon** key, never the service key) + `EXPO_PUBLIC_BFF_URL=http://<your-PC-LAN-IP>:3000` (localhost won't reach a phone — use the LAN IP and run `npm run dev` in web-app). Then `npm install && npx expo start` and open the QR in **Expo Go** on a phone (same Wi-Fi).

## M1-1. Admin panel — Mobile App section
- Admin panel → sidebar **Operations → Mobile App** (Admin-only; a Content Manager must not see it).
- Two cards (iOS / Android): edit **Latest version**, **Minimum version**, toggle **Force update**, set a store URL (must be https://), and the trilingual update message → Save → "Saved." and the updated-at time changes.
- Audit log shows a `mobile_app_versions` update row.

## M1-2. Boot + admin control plane
- Launch the app → OlympIQ splash → Welcome screen (brand mark, tagline, Login / Student sign-in / Register buttons).
- Admin → Settings → set `platform.maintenance_mode` to `true` → background + reopen the mobile app → the full-screen **maintenance** notice (with your trilingual message) appears. Set back to `false` → app returns after a foreground refresh.
- Admin → Mobile App → set the **Minimum version** for your platform to `9.9.9` + enable **Force update** → foreground the app → the **update-required** dead-end (store button appears only when a store URL is set). Revert (min `1.0.0`, force off).

## M1-3. Parent auth end-to-end
- Welcome → **Register**: fill names, email, password, and the phone field (compact `AZ +994` trigger opens a searchable country list) → submit → you land on the parent tab bar (Home/Analytics/Olympiads/Subscription/News — placeholder bodies "coming in the next stage"). If email confirmation is ON in Supabase you instead get the check-your-inbox notice (expected).
- Header avatar (round button) → the account sheet: Language AZ/EN/RU segmented (whole UI switches instantly), Light/Dark theme, **Log out**.
- Log in again from Welcome → Login (Parent tab) with the same credentials → parent tabs. A wrong password shows the generic invalid-credentials message.

## M1-4. Child auth end-to-end (via the BFF)
- Login → **Student** tab → enter a real child's 8-digit ID (grouped `1234 5678` display) + the parent password → the **arena-dark student tab bar** (Arena/Tests/Olympiads/Ranking/News).
- Admin → Settings: turn the `leaderboard` flag **off** → foreground the app → the **Ranking tab disappears** (same for `olympiad_module` → Olympiads tab). Turn back on → tabs return.
- 8+ wrong child passwords in 15 min → the generic lockout message (no hint whether the ID exists).

## M1-5. Language + CMS reach mobile
- Admin → Website Content: change a landing text that also exists in the app (or check after M2 when content screens exist) — mobile fetches overrides per locale at boot/foreground with no release.
- Change the language from the account sheet → every visible string switches az/en/ru; Azerbaijani letters (ə Ğ ş Ç ü İ) render correctly everywhere.

## M1-6. Deep links (dev)
- With the app open in Expo Go, `npx uri-scheme open "olympiq:///child" --android` (or iOS) → signed in as a student it opens the arena; signed out it goes to Login and **replays into the arena after the child signs in**; signed in as a PARENT it stays put (role mismatch).

If anything here doesn't match, tell me the **M1-#** + what you saw.

---

# Round 18 — owner queue: admin Questions/Olympiad, analytics states, olympiad timed tests, leaderboard, profile fixes (2026-07-11)

## II1. Admin → Questions table
- Columns are now: checkbox · Subject · Grade · Language · **Topic** · Question text · Status · Actions — no "Question Type" column anywhere; a question without a topic shows "—".
- The "All types" filter is gone; subject → topic → subtopic cascade, grade/status filters, search, paging, stat cards, bulk toolbar all still work.

## II2. Admin → Olympiad packages: create WITH questions
- **New Package** now contains the bulk-upload section inline. Template download + file upload stay disabled until Subject and Grade are chosen (Grade is now required).
- The bulk section asks for NO subject/grade — uploaded rows inherit the package's. Old template files that still carry subject/grade are accepted, but those values are ignored.
- Try submitting with no file → blocked: "Paket yaratmaq üçün ən azı bir sual əlavə edilməlidir."
- Upload a valid file → package is created and you land on its edit page with the pool count. A file where every row is invalid → **nothing is created** (per-row errors listed). Mixed file → package created "N imported, M skipped" + errors.
- Both forms now have **Müddət (dəqiqə)** (5–240, default 25) — this is the child's countdown for that package.

## II3. Question-pool separation (the leak)
- Admin → Questions: package-pool questions no longer appear (one legacy leaked question was repaired by migration 049). Opening a pool question's edit URL directly bounces back to the list with a notice.
- Bulk select/status/delete/assign-topic can no longer touch pool questions even with forged ids.
- Package A's pool never shows Package B's or the general bank's questions, and vice versa; regular tests draw only general-bank questions, olympiad attempts only the package pool (DB check #58 pins these filters permanently).

## II4. Student profile grade label
- Child → Profile → School information shows "**5-ci sinif**" style (1-ci, 3-cü, 6-cı, 9-cu, 10-cu…) — never "5 — 5. sinif". The same clean label appears in the parent edit-child and add-child grade dropdowns.

## II5. Parent → Edit child info (save bug)
- Change any field(s) → Save: the form **keeps the values**, shows "Saxlanılır…" then the success note, and a page refresh shows the persisted data (root cause: name inputs never posted + the form auto-reset).
- Change City → the school list reloads for that city; the old school clears only if it doesn't belong to the new city. Missing required fields show per-field errors and nothing is lost.

## II6. Analytics: skipped ≠ wrong
- Parent → Analytics: six cards now, including **Buraxılmış cavablar**. A test with 2 wrong + 20 skipped shows Wrong 2, Skipped 20 (not 22 wrong).
- Accuracy uses only ANSWERED questions (3 correct of 5 answered = 60%, even with 20 skipped); the trend chart and strongest/weakest topics follow the same rule; switching children never mixes data.

## II7. Olympiad tests = real timed tests
- Child → Olympiads → Start on a purchased package now opens the SAME test player as regular tests: countdown (from the package's duration), question palette with answered/current/flagged states, prev/next, bookmark, autosave.
- Refresh mid-attempt → timer and answers survive (server deadline). Finish → confirm modal with unanswered count; results page → review with All/Correct/Wrong/Skipped filters; back-links go to Olympiads.
- A live olympiad attempt shows a "continue" card on the Olympiads page; time running out auto-submits; a closed attempt can't be reopened for editing.

## II8. Student leaderboard
- Rows show **"Firstname L."** (e.g. "Ruslan Z.") — no more "Şagird •1234"; your own row keeps "Siz" + highlight.
- Points boards show City · School · Grade columns (desktop) or a compact context line under the name (mobile); grade renders "5-ci sinif" style.
- The **Fənn** scope now opens a single-select dropdown with ALL active subjects (not just the child's) and never shows a blank board — an unknown/missing selection falls back to the first subject. Switching scopes clears the subject selection.

If anything here doesn't match, tell me the **II#** + what you saw.

---

# Stage M2 — Mobile public surface & complete parent panel (2026-07-11)

Prereq: same setup as M1 (`mobile-app/.env` + Expo Go + `npm run dev` in web-app — the BFF must run for add-child/subscribe/purchase/profile actions). Payment-mode note: mobile follows the admin flags — **demo/giveaway/free flows run fully in the app; in `real` mode money actions show "managed from the family's web account"** (adopted default — tell me if you want it different).

## M2-1. Public surface
- Welcome now has Pricing / About / FAQ / Contact chips (+ News when `news_public` is on) and shows the giveaway countdown while a giveaway runs.
- Pricing: weekly/monthly/yearly switcher with per-subject prices from the DB, the "per 1 subject" note, trial + sibling-discount callouts.
- Contact: email/phone open mail/dialer; social links (only those set in admin Settings) open externally.
- News: list + article with covers, view counter bumps once per session; turning `news_public` off hides the public news entry (in-app news stays).

## M2-2. Parent Home
- Children cards: name, grade ("5-ci sinif" format), school, mono 8-digit ID (or "ID pending"), access pill, leaderboard chip (rank·points·🔥) when the flag is on; Add-Child button; onboarding carousel; pull-to-refresh.
- Giveaway or free-access countdown banner shows at top when a window is active.

## M2-3. Add-Child wizard (test per mode by flipping admin flags)
- **demo**: Info → Subjects → Plan cards (live server quote incl. sibling discount, Most Popular) → demo-pay sheet → Done with the big 8-digit ID.
- **giveaway / free-access**: Info → Done with an instant ID (no payment step).
- **real**: Info → child created, "choose the plan on the web" note, no money CTAs. **off**: Info → Done, payments-off notice.
- City→School cascade filters schools by city (private schools first); all fields validate; values never clear on errors.

## M2-4. Subscription center
- Child selector chips; Plans tab shows the live subscription (status/interval/period end/total/subjects); Billing + Invoices are clearly-labeled DEMO sections (web parity).
- Manage subjects: enabled in demo/giveaway/free (additions open the demo-pay sheet first — payment-first), read-only note in real mode; min 1 subject enforced.
- Cancel flow: reason → warning → confirm; shows "access until period end".

## M2-5. Olympiads (parent)
- Catalog cards with cover, subject/grade, question count + duration, event date, price; "Owned" pill per selected child; detail sheet.
- Buy runs in demo AND giveaway modes (packages are always paid — web parity); real mode shows the web-only note.

## M2-6. Analytics
- Child chips → 6 KPI tiles incl. **Skipped answers** (never merged into wrong), weekly bars, accuracy trend (answered-based), topic strengths, mistakes; leaderboard panel behind the flag; honest empty state for a child with no graded attempts.

## M2-7. Notifications + Profile
- Header bell (live unread badge) on every parent tab → inbox: category chips, unread dots, mark-all-read; tap follows the notification's link or opens a detail sheet (rich-text bodies render bold/italic/safe links); delete from the sheet. Send yourself one from admin → Notifications and watch it arrive live.
- Profile: identity card (avatar display; upload marked "coming soon" — no picker dependency yet), change password, notification preferences for self + each child (switches persist), FAQ/Contact rows, danger zone with double-confirm delete.
- Edit child (from a Home card): controlled form, city→school cascade, read-only 8-digit ID, optional child-password reset; values never clear; saved data survives refresh.

If anything doesn't match, tell me the **M2-#** + what you saw.

---

# ROUND 19 (2026-07-11) — ten fixes across web-app + admin

## JJ1. Parent header never wraps
- Turn the notifications flag ON (8 nav items) and open the parent panel with a free-access countdown active: the bell + avatar stay on the SAME row as the menu at every width.
- Narrow to ~500px: nav links scroll horizontally (no visible scrollbar, swipe/trackpad works); icons never drop to a second line.
- Repeat in the student arena header (streak pill + bell + avatar) in light and dark.

## JJ2. Child-Login page removed
- `/child-login` → 404. `/login` opens on the Parent tab; `/login?tab=student` opens on the Student tab; garbage `?tab=` values fall back to Parent.
- Student login via the /login Student tab (8-digit ID + parent password) works exactly as before.
- Logged-out visit to `/child/test` redirects to `/login?tab=student`.

## JJ3. Olympiad purchase — no more crash
- As a parent (works with admin-granted free access too), buy an olympiad package: the success tick shows INSIDE the modal, the card flips to "Alınıb" — no "Maximum update depth exceeded" error, no refresh needed.
- Buy a second package right after — same clean flow; re-opening the dialog for an owned package stays consistent.

## JJ4. Buy button is just "Buy"
- Olympiad cards show **Al / Buy / Купить** (no child name on the button); the child picked in the selector above still receives the purchase (confirm in the modal's "Child" row).

## JJ5. Notification read-state is synchronized
- Open `/notifications`, then mark ONE item read from the bell dropdown → the page row loses its unread style and the badge decrements instantly (no refresh).
- Mark read from the page → bell dropdown + badge update instantly. "Mark all read" from the bell → page fully read, badge gone; refresh → persists.
- Repeat as a student (bell + /child/notifications). New incoming notification bumps both surfaces live.

## JJ6. Page-specific skeletons (no blank screens)
- DevTools → Network → Slow 3G (or slow server). Navigate Parent: Home → Analytics → Olimpiadalar → Subscription → News → article → FAQ → Profile → Add-Child: EACH page shows its own layout-matched skeleton under the real header — never a blank page or a lone spinner, and content replaces it without visible jumping.
- Student: `/child` → Tests → subject setup → runner (top-bar + question card + palette skeleton) → result/review, Olympiads, Leaderboard, News, Profile. Public: home, pricing (plan-card grid), news.
- Check one parent + one arena page in light AND dark (and a child palette); with OS "reduce motion" the shimmer becomes a calm pulse.

## JJ7. Olympiads and Exams fully separated (topics too)
- Bulk-upload questions into an olympiad package using brand-new topic/subtopic names → those names must NOT appear in: admin Questions filters, the New-question/Edit forms, the bulk "assign topic" modal, Manage → Topics/Subtopics, or the student test-start picker.
- Opening `/manage/topics/<olympiad-topic-id>/edit` directly → 404. Exam taxonomy CRUD, question tagging, and exam bulk upload keep working unchanged (new exam topics appear normally).
- Legacy leaked topics were auto-moved to the olympiad scope by migration 050 (8 moved on dev; 1 mixed-use topic legitimately stays visible because real exam questions use it).

## JJ8. Mandatory topic/subtopic + leave-test confirmation
- Test setup: Start is disabled until Topic AND Subtopic are chosen; clicking anyway shows the trilingual warning and highlights the missing select; changing Topic resets Subtopic; a topic with no subtopics may start on its own (muted note explains).
- NOTE (behavior change): a subject with no topics at all can no longer be started "whole-subject" — topics must exist.
- During a running test OR olympiad: clicking any top-nav item/logo shows "Are you sure you want to leave the test?" — Continue stays, Leave navigates; browser Back shows the same dialog; refresh/close-tab falls to the native browser prompt. Prev/Next/flag/palette/Submit/Cancel never trigger it.

## JJ9. Correct active tab + wording per session type
- Start an olympiad → the **Olimpiadalar** tab is highlighted in the runner, result, and review pages; the runner header and result title say "Olimpiada". A normal exam highlights the Exams tab and says "Sınaq".
- Known minor: on a hard refresh of an olympiad run URL the correct highlight applies right after hydration (a brief first-frame fallback is expected).

## JJ10. Analytics: Subjects vs Olympiads separated
- `/analytics` defaults to **Fənlər** — numbers now EXCLUDE olympiad attempts entirely (compare a child who did olympiads: subject totals shrink accordingly).
- Switch to **Olimpiadalar**: subject chips disappear; KPIs/charts/topics cover olympiad attempts only; a "Results by package" table lists each package (attempts/correct/wrong/skipped/accuracy). Child with no olympiad attempts → friendly empty state.
- Mode survives refresh via the URL (`?mode=olympiads&child=…`); no package name ever appears among subject chips.

If anything doesn't match, tell me the **JJ-#** + what you saw.

---

# STAGE M3 (2026-07-11) — mobile student arena (Expo SDK 54)

> Note: the app now runs Expo SDK **54** (matches the Expo Go you install from the stores). If you had an older checkout, run `npm install` in `mobile-app/` once. Start as usual: `npx expo start` in `mobile-app` + `npm run dev` in `web-app` (BFF; LAN IP in `.env`).

## M3-1. Arena shell, palette + streak
- Log in as a student (8-digit ID + parent password): 5 arena tabs (Arena/Tests/Olympiads/Ranking/News); Olympiads/Ranking disappear when their admin flags are off.
- Header shows the 🔥 streak chip + bell + avatar. Play no round for a day → the chip turns red (at-risk) and the home shows the warning line.
- Pick a palette in the student profile (e.g. bubblegum) and switch to light theme → header/tab bar/panels re-skin live; dark theme stays the frozen dark arena.

## M3-2. Arena home + access states
- Active/trialing (or free-window) child: hero with the child's name, "Start a round" CTA → Tests tab, ministats (points/accuracy/rounds), flag-gated leaderboard quick-look, per-subject Go rows, recent rounds, strengths, news panel (article opens in-tab; view counts once per session).
- Child with no coverage: locked card with the correct trilingual status text; no test CTAs.
- Pull-to-refresh updates everything.

## M3-3. Test engine — the big one
- Tests tab lists ONLY covered subjects (turn on giveaway/free-access → all actively-priced subjects appear).
- Setup: Topic mandatory → Subtopic mandatory (resets when Topic changes; topic with no subtopics starts alone with a muted note; Start disabled until selection + consent; pressing anyway shows the warning + red highlight). Olympiad-scoped topics must never appear.
- Runner: countdown (amber ≤5:00, red ≤1:00), answer/flag → autosave chip (~30s + on navigation), palette below the card, submit confirm shows the unanswered count.
- Kill the app mid-attempt → reopen → Continue card resumes the SAME attempt with saved answers/flags and server-correct remaining time.
- Android hardware back / any back mid-attempt → "leave the test?" dialog (Stay keeps everything; runner's own controls never trigger it).
- Let the timer hit 0:00 → auto-submit → result. Skip one question on purpose → it lands in **Skipped**, never Wrong; per-topic bars render.
- Review: All/Correct/Wrong/Skipped tabs with matching counts, original question numbers, green/red option tags, explanations.

## M3-4. Olympiads (student)
- Planned cards (cover, chips, date, questions+duration) with a detail sheet carrying the "ask your parent" note — no price CTA anywhere for children.
- On an OWNED package: Start → the SAME runner with "Olimpiada" title + package label; leave mid-attempt → Continue card; result/review exit to the Olympiads tab with olympiad wording.

## M3-5. Ranking
- Points|Streak boards, month|all-time; scope chips only for what the child has (grade/city/school + subject over ALL active subjects, single-select, clamped default).
- Rows show "Firstname L." + city/school/grade (grade as "5-ci sinif" style); top-3 medals; self-row highlighted; sticky my-rank card matches; streak card shows at-risk urgency.

## M3-6. Student profile
- Avatar: pick from gallery (>2MB → size error; non-image → type error; server re-checks bytes), remove works; web /child/profile shows the same photo.
- Name edit (both fields required) updates the identity card + arena greeting; password change rejects the 8-digit ID and <8 chars; new password logs in.
- Read-only school info (grade/city/school), mono 8-digit ID, sticker THEME picker + palette picker persist across restart and match the web.

## M3-7. Parent avatar picker (M2 leftover closed)
- Parent profile: upload/change/remove avatar now works from the app (was "coming soon"); everything else on the screen unchanged.

If anything doesn't match, tell me the **M3-#** + what you saw.

---

# ROUND 20 (2026-07-12) — daily rounds, districts, terms, 5 options, leaderboards everywhere

> DB note: migrations 052–062 are applied on dev; from-zero rebuild = 64/64 PASS. The old daily-task tables are gone (replaced by the new daily-rounds engine).

## KK1. Olympiad packages — any question count, editable duration
- Create a package with e.g. 35 questions (bulk import during creation): a child attempt contains ALL 35 — no 25 cap; runner countdown = the package's `duration_minutes`.
- Edit the package: duration is editable in create AND edit; hints say attempts include all published questions.

## KK2. Subject tests are untimed practice
- Student → a subject's "Məşq et" (setup → start): runner shows the "∞ Vaxt limiti yoxdur" pill + "Məşq" badge — no countdown, no auto-submit; you can leave and resume any time (24h auto-abandon).
- Finish it → NO points/streak change (check the Ranking tab before/after). Olympiads still show a live countdown.

## KK3. Parent nav — Notifications only via the bell
- Parent menu shows no Notifications tab (bell stays; its "see all" opens the page; unread counts work).

## KK4. Student leaderboard overhaul
- Columns: Sıra | İştirakçı | Şəhər | Rayon | Məktəb | Sinif | Xal; ranks are plain numbers (no medals anywhere).
- Top 50 scrolls INSIDE the table container with a sticky header (page height fixed).
- A Baku child sees the "Rayon" scope chip → district chips; forged `?district=<uuid>` clamps safely.
- "Sizin yeriniz" shows `#rank / total`; a filter the child isn't in shows the honest "not on this board" state.

## KK5. Daily rounds (THE big one)
- Tests tab = three sections: **Bugünün raundları** / **Dünənin raundları** / **Son raundlar**.
- Start a today-round: timed 25:00, 25 questions, "Reytinqə təsir edir" badge; finish → card flips to "Bu gün iştirak etmisən" + score; a second start (even via a second tab / direct POST) → friendly "already attempted" note (DB-enforced).
- Two students of the SAME grade get the SAME 25 questions in the same order; a different grade gets a different round.
- Points/streak increase ONLY from this rated round (and olympiads).
- Tomorrow: yesterday's round appears under "Dünənin raundları" with the notice "Bu testlər yalnız təkrar üçündür və nəticələr reytinq cədvəlinə təsir etmir." — replay it twice (unlimited), untimed, zero points; editing/deleting bank questions after generation does NOT change the stored round (snapshot).
- Subject with too few eligible questions → friendly "round not ready" note; admin sees the gap in the readiness panel (KK13).

## KK6. Schools ↔ districts (admin + data)
- Admin → Rayonlar: Baku's 12 official rayons listed; create/edit/delete works (deleting one with schools warns/refuses safely). Gəncə correctly has none (rayons abolished 2022).
- Schools form: City=Bakı → mandatory Rayon dropdown (only Baku rayons); other cities → no district field; city change resets it.
- Schools list: District column + filters; the "Rayon gözləyən məktəblər: 7" pill lists the 7 unmatched schools (313/320 were auto-assigned from the official BŞTİ directory) — assign them manually via edit.
- Leaderboard rows show the district that comes from the student's SCHOOL; changing a school's rayon updates the board.

## KK7. Terms (Rüb)
- Admin Topics/Subtopics: "Sıra" is gone; required Rüb dropdown (1-ci…4-cü rüb); lists show a Rüb column ("Baxılmalı" badge for legacy NULL) + term filter; subtopic inherits its topic's term.
- Settings → "Cari tədris ili / rüb": set year + term; term drives daily-round pools cumulatively (Term 2 rounds mix Term 1+2; never future terms).
- Legacy items without a term are EXCLUDED from daily rounds until reviewed.

## KK8. Parent leaderboard page
- Parent menu → "Reytinq cədvəli": same board as the student page (all filters incl. Rayon, top-50 internal scroll, numeric ranks).
- "Övladlarınızın mövqeyi": one card per child with `#rank / total` + xal under the ACTIVE filters; a child outside the filter shows "Bu filtr üzrə reytinqdə iştirak etmir" (never a fake 0); no children → friendly add-child card.

## KK9. Exactly 5 answer options (A–E)
- Question form: fixed 5 rows, no add/remove, one radio-correct; saving with an empty option is rejected.
- Bulk templates (general + olympiad) require 5 options / 1 correct — a 4-option row errors per-row.
- The 127 old 4-option questions (26 general + 101 olympiad on dev) were demoted to "Baxılır" and are EXCLUDED from all new tests; the "E variantı çatışmır" chip lists them — add option E, republish, they leave the list. Old attempt reviews still render fine.

## KK10. News — image on create
- News → create: pick a cover in the same form → ONE submission creates the article with the image (no create-then-edit dance); creating without an image still works.

## KK11. Notification audiences
- Composer order: Bütün istifadəçilər → Bütün valideynlər → Bütün uşaqlar → Olimpiada paketlərini alanlar → Müəyyən valideyn → Fənnə görə uşaqlar.
- "Olimpiada paketlərini alanlar" → searchable multi-select of ACTIVE packages + live unique-recipient count (+ zero-recipient warning); recipients = purchasing parents + their entitled children, ONE notification each even with multiple packages; history detail shows the package names.
- "Bütün istifadəçilər" reaches every parent+student exactly once.

## KK12. Maintenance mode in ~5 seconds
- Flip maintenance ON in admin Settings → navigate the web-app: splash appears within ~0–5s; flip OFF → an open splash auto-exits within ~4–8s (it polls every 4s). Admin panel never locks itself out.

## KK13. New question flow (admin)
- "Yeni sual": no Sual növü / Olimpiada növü fields; Topic+Subtopic mandatory (cascading, exam-scoped); Rüb read-only from the topic (legacy topic → forced 1–4 pick that also upgrades the topic); optional "Sual şəkli" upload with preview/remove — question + image save in ONE submission.
- Student side: the image renders between the question text and options (tap to zoom) in the runner and review.
- Questions page: Rüb column, "Needs option E" + "Needs term" chips with live counts, and the collapsed "Günlük raund hazırlığı" panel (subject × grade eligible/25, red cells = gaps).

## KK14. Landing page public leaderboard
- Logged OUT on `/`: right under the hero — "Ümumi Reytinq Cədvəli": top-10, names ONLY as "Şagird XXXX" (last 4 ID digits), columns incl. Rayon, numeric ranks, first ~5 rows visible + internal scroll with sticky header; dark+light themes; empty state degrades gracefully. No real names/ids anywhere in the network response.

## KK15. Olympiad edit — no more bulk upload
- An existing package's edit page has NO "Toplu idxal" section (questions upload only during creation); direct API attempts are rejected with the friendly creation-only message; existing questions and the rest of the edit page (duration/price/status/cover/archive) unchanged.

## KK16. Site typography (Sayt şrifti)
- Admin → Sayt məzmunu → "Sayt şrifti": searchable 20-font library — every option previews the Azerbaijani alphabet (ə Ə ğ Ğ ş Ş …); pick e.g. Mulish + sizes → live preview → Save.
- Web-app (within ~60s): global font + sizes change everywhere (Arial fallback keeps ə safe); deleting the setting restores today's look exactly; only ONE Google Fonts stylesheet loads.
- Per-field: set a CMS entry's "Şrift ölçüsü" to 28px → that text renders at 28px (responsive clamp on mobile).

If anything doesn't match, tell me the **KK-#** + what you saw.

---

# Round 21 (2026-07-13) — olympiad question CRUD, real counts, Start/Practice fixes, dashboard, add-child district, unified Locations

## LL1. React console error ("cleaning up async info…") — NO code change
- That error comes from the **React DevTools browser extension** (`installHook.js`), is dev-only and can never occur in production (the hook isn't injected there). Fix on your machine: update the React Developer Tools extension (or test in an incognito window without it). Our React 19.2.7 is newer than the affected versions in the upstream report — no bump helps.

## LL2. Olympiad package question management (admin)
- Open any package → edit page: a **question list** shows every pool question (text excerpt, options count with a warn pill when ≠5, image dot, status, updated) with search; the header count is the REAL row count.
- **Add**: "Yeni sual" → modal: subject/grade fixed from the package, optional olympiad-scoped topic/subtopic, trilingual body/prompt/explanation (az required), fixed 5 options A–E with one correct radio, optional image — all in ONE submission; the list refreshes without a page reload.
- **Edit**: prefills everything (incl. per-language texts + image); legacy 4-option questions gain option E on save; saving keeps historical reviews intact (option ids are stable).
- **Delete**: confirm dialog; a question that was EVER answered is refused with the trilingual "has attempt history — archive it instead" message; **Archive/Restore** row actions cover that case (archived questions drop out of future attempts; history stays readable).
- Bulk upload stays creation-only; Content Managers still see none of this.

## LL3. Real question counts everywhere (was "25 Questions")
- Parent Olympiads page + detail modal, and the child Olympiads tab: every card shows the **actual published pool count** (your 50-question package shows 50). Counts follow creates/edits/deletes/archives automatically. A package with an empty pool shows 0.

## LL4. Student Tests page — Start/Practice
- Practice works again out of the box: the Round-20 demotion was rolled back, so the legacy 4-option questions are published and drawable (25 general + 100 olympiad on dev).
- Start (rated daily round): a subject whose round CAN'T generate now shows a muted **"Bugünkü raund hələ hazır deyil"** state instead of bouncing to an error banner. Ready subjects start immediately. NOTE: a round still needs ≥25 published questions **with a term assigned and 5 options** for that subject×grade (shared grade-less questions now count too) — the admin "Günlük raund hazırlığı" panel shows exactly what's missing; assign terms/option E to light subjects up.
- Practice stays available regardless of round readiness; if a subject truly has no drawable published questions, the accurate "no questions yet" message appears.

## LL5. Student dashboard redesign
- GONE: "Bugünkü raundlar" and "Son xəbərlər" (news keeps its own tab; the real rounds UI lives on the Tests page).
- Layout: welcome + country-rank row → stats ticker → **monthly ranking | subject performance** side by side → "Son raundlar" full-width. No empty containers, responsive at tablet/mobile widths, dark+light.
- The country-rank card now shows your child's REAL all-time global rank (or an honest "—/not ranked" for a new child).

## LL6. Add Child / Edit Child — District (rayon)
- City with rayons (Bakı): a mandatory **Rayon** select appears between City and School; disabled until a city is picked; picking a rayon filters the school list (schools still awaiting rayon assignment stay selectable at the bottom); changing city resets rayon+school. Submit without a rayon → "Rayonu seçin." (client AND server enforce it — the RPC rejects it too).
- City without rayons: no district field at all; everything else unchanged.
- Edit Child: saved city → rayon → school preselected; changing the school to another rayon updates consistently (the DB guard refuses contradictions).
- Existing children were backfilled from their school's rayon automatically.

## LL7. Admin "Yerlər" — unified location management
- The sidebar's Cities/Districts/Schools entries are replaced by ONE **Yerlər** item; the old URLs redirect.
- Three columns: Şəhərlər → selected city's Rayonlar → selected rayon's Məktəblər. Each column: search, live counts, add button, edit/delete per row, proper empty states. A city without rayons lists its schools directly; a rayon-city also shows a **"Rayon təyin edilməyib"** review entry with the live count (the 7 pending Baku schools live there).
- Create/edit open in modals and the lists refresh WITHOUT a full page reload; selection survives refresh (it's in the URL).
- **Delete previews impact**: city → how many rayons would cascade + schools that BLOCK the delete (button disabled when blocked) + enrolled students; rayon → schools that would return to the review list; school → how many students get detached. All existing validations (rayon required for rayon-cities, school-number derivation, duplicate names) still enforced.
- Narrow screens: the columns stack.

## LL8. Data safety guard (regression check)
- Anywhere in the admin (general Questions page included): deleting a question that any attempt ever answered is refused with the friendly message — archive is the path. Deleting a never-answered question still works.

If anything doesn't match, tell me the **LL-#** + what you saw.

---

# Round 22 (2026-07-14) — admin edit modal + wide table · mobile crash fix · FULL mobile redesign (M3.2). Mobile checks = Android/Expo Go.

## MM1. Admin: question edit is a modal + full-width table
- Questions page: click Edit on any row → a MODAL opens (no page navigation), prefilled with everything (languages, options, Rüb, status, image); save → list refreshes without reload; lifecycle transitions + delete live in the modal (deleting an answered question still shows the friendly "archive instead" message). No React "unique key" warning in the console. Old bookmark URL `/questions/<id>/edit` redirects to /questions.
- At full screen the page now breathes (~1560px): the question-text column is wider, action buttons never clip or wrap; a narrow window still gets a horizontal scroll inside the table.

## MM2. Mobile: the navigation crash is gone
- Log in on the phone → tap ANY tab, the bell, and the profile/avatar button, then open Notifications on both roles: no "cannot add postgres_changes callbacks…" Render Error anywhere. A new notification arriving while two screens are open updates the badge live.

## MM3. Mobile: onboarding shows ONCE per install
- Fresh install (or clear the app's data in Android settings): 3 swipeable slides with dots, "Keç" skip, final slide = login/register CTAs + info links.
- Kill + reopen the app signed-out: you land on LOGIN, not the slides. Log out: LOGIN again. The "OlympIQ haqqında" link on Login replays the slides manually.

## MM4. Mobile: the new design system (overall pass)
- Custom tab bar on both roles (active tab = soft pill + filled icon + label; purple accent for parents, arena lime for students); lucide icons everywhere (no more emoji glyphs except the 🔥 streak); avatars show initials on a personal pastel (no more "•"); pressed buttons subtly scale; cards have consistent radii/soft shadows.
- Check light AND dark themes, and all 5 student palettes (profile → palette picker — swatches must match the applied palette exactly since they now derive from the same tokens).

## MM5. Mobile parent surfaces
- Home: greeting header ("Salam, {ad}") with bell+avatar; child cards with initials-avatar, mono ID chip, color-coded access pill; Add-Child appears as a gradient hero card when you have no children.
- Olympiads: covers with a dark bottom scrim, REAL question counts (your 50-question package says 50), gradient buy CTA in the detail sheet.
- Subscription: active plan has a gradient border; demo Billing/Invoices keep demo content but match the new look.
- Notifications (both roles): grouped by day (Bu gün / Dünən / date), unread rows bolder with an accent dot, "mark all read" appears only when something is unread.

## MM6. Mobile: Add-Child district (rayon)
- Pick Bakı → a mandatory Rayon select appears between City and School; it filters the school list (unassigned schools still listed); changing city resets it; submitting without it is blocked with "Rayonu seçin." A city without rayons shows no district field. Child edit preselects the saved rayon. (Server enforces all of it — the same rules as web.)

## MM7. Mobile student arena home
- New layout: hero (welcome + Start CTA) → rank panel with a gradient ring around your REAL all-time country rank ("—" + honest note when unranked) → stats → monthly quick-look → subject strengths → recent rounds. The old today's-rounds list and news panel are GONE from home (they live on the Tests/News tabs).

## MM8. Mobile ranking
- Numeric ranks only — no medals. New "Rayon" scope chip (only when the child's school/profile has one). Rows show initials-avatars + city · rayon · school · grade context; your own row highlighted; my-rank card sticky at the bottom.

## MM9. Mobile tests tab — the big functional check
- Subject cards: ready → gradient Start; already played today → attempted pill + score; round not generatable → muted "raund hazır deyil" pill. Practice stays available on every card.
- **Start now launches the RATED daily round directly** (25 questions, 25-minute timer, rated badge in the runner). Playing it twice is blocked (card flips to attempted).
- **Practice is UNTIMED now**: the runner shows an ∞ "limitsiz" pill instead of a countdown, never auto-submits, and an abandoned practice attempt can be resumed later. The setup screen no longer promises a 25-minute timer for practice.

## MM10. Mobile runner/result/review visuals
- Runner: thin progress bar under the top bar, letter-chip options (A–E), timer pulses red under 60s (rated rounds), lucide bookmark, modernized palette grid. Resume/autosave/leave-guard behavior unchanged.
- Result: animated score ring + %, correct/wrong/skipped chips (skipped is its own bucket), topic bars.
- Review: All/Correct/Wrong/Skipped chips with counts, verdict-colored question cards, ✓/✗ option markers.

If anything doesn't match, tell me the **MM-#** + what you saw.

---

# Stage M3.1 (2026-07-16) — mobile parity tail. Checks on Android/Expo Go.

## NN1. Previous-day round replays (student, Tests tab)
- Between today's subject cards and the history list: a "Previous Day's Rounds" section with the practice-only notice (replays never affect the leaderboard) and one Replay row per subject.
- A subject whose round existed YESTERDAY: Replay opens the runner as UNTIMED practice (∞ pill + practice badge), same 25 questions as yesterday's round, repeatable any number of times; the result never changes points/streak/ranking.
- A subject with NO round yesterday: an inline "yesterday's round doesn't exist" note appears on that row — no crash, no navigation.

## NN2. Question images in the mobile runner and review
- A question with an image (create one via admin if needed): the image renders between the question text and the options, in the runner AND in the review; tap → full-screen dark viewer, tap anywhere / X / Android back closes it.
- Image-less questions render exactly as before; a broken image hides silently.

## NN3. Maintenance mode reaches the phone fast (admin-controlled)
- With the app OPEN in the foreground: flip maintenance ON in admin Settings → the maintenance screen appears within ~30 s (or instantly on re-foreground). Flip it OFF → the app exits maintenance within ~5–10 s on its own (it polls fast while the gate is up). Backgrounded app does not poll (battery-safe).

## NN4. iOS pass (when you get a device)
- Repeat NN1–NN3 plus a smoke of MM3–MM10 on iPhone; everything was built iOS-correct (safe areas, shadows, modals) but is untested on hardware.

If anything doesn't match, tell me the **NN-#** + what you saw.

---

# Stage M4 (2026-07-16) — push, app-lock, launch pack + the two Android-test hotfixes. Checks on Android/Expo Go unless noted.

## OO1. HOTFIX — student login works from a physical phone
- Prereq: the web-app dev server is running on the PC (`npm run dev` in `web-app/`) and the phone is on the SAME Wi-Fi network. Restart the Expo dev server after pulling this change (the fix is in the compiled env module).
- Student login (8-digit ID + parent password) now succeeds from the phone; registration from the phone works too. Parent login keeps working as before.
- If it still fails: open `http://<PC-LAN-IP>:3000` in the phone's browser — if that doesn't load, Windows Firewall is blocking Node.js (allow it for private networks) or the phone is on a different network.

## OO2. HOTFIX — notification filter chips
- Notifications screen (parent AND student): the Hamısı / Elanlar / Olimpiadalar filters are now compact pill chips in one horizontal row (44px tall), not giant columns. The list starts right below them.

## OO3. Biometric app-lock (opt-in)
- Avatar → account sheet: a new SECURITY section with an "App lock" switch between APPEARANCE and SESSION. On a phone without fingerprint/PIN enrolled the switch is disabled with a hint.
- Turning it ON asks for your fingerprint/PIN first; turning it OFF asks again (can't be disabled by someone else).
- With lock ON: background the app for over a minute (or kill + reopen) → a branded lock screen covers the app; fingerprint/PIN unlocks it exactly where you left off; Android back does NOT bypass it; "Log out" on the lock screen works as an escape. A fresh login never lands on the lock screen.

## OO4. Push notifications — Expo Go expectation vs real test
- **In Expo Go on Android, receiving push is NOT possible** (Expo removed it in SDK 53+) — the app detects Expo Go and silently skips token registration; nothing breaks. In-app toasts/inbox/badge keep working via Realtime.
- The REAL push test needs, in order: 1) `eas init` run once in `mobile-app/` (Expo account), 2) an Android development build (`eas build --profile development --platform android`) installed on the phone, 3) `EXPO_ACCESS_TOKEN` set in `web-app/.env.local`, 4) admin Settings → **notifications_push** flag ON, 5) the processor triggered (locally: `POST /api/notifications/process` with the `x-processor-key` header — exact steps in `mobile-app/markdowns/RELEASE_RUNBOOK.md` §4).
- Then: admin composer → send an announcement with the "Mobil tətbiq" channel → the phone shows it (app closed or backgrounded); tapping it opens the right screen; a student session never opens parent-only targets.
- Flag-off regression: with **notifications_push OFF**, a fresh login must create ZERO rows in `push_tokens` (Supabase table editor).

## OO5. Web/admin regression (quick)
- Web app still builds/works (the only web change is the notification processor + push sender — invisible in the UI).
- Admin Settings: the **notifications_push** flag toggle and the Mobile App version page work as before (they now actually drive mobile push + the force-update gate).

If anything doesn't match, tell me the **OO-#** + what you saw.

---

# Round 24 (2026-07-16) — notification tap-routing, live ticker, rating card, in-app info pages. Android/Expo Go + web.

## PP1. Notification taps land on the RIGHT screen (mobile)
- Parent inbox: tap an "Olimpiada paketi alındı" notification → the **Olympiads tab** (was: Home). Tap a subscription-cancel notification → Subscription tab.
- Student inbox: tap an olympiad-purchase notification → student **Olympiads tab**; tap a graded-round notification → the actual **result screen** for that attempt (was: Tests tab).
- A news-publish notification (publish any news in admin) → opens the actual **article** for both parent and student (was: bounced to Home).
- Plain admin-composer announcements (no link) still open the detail sheet — unchanged and correct.

## PP2. Student home — live ticker + rating card
- The CANLI stats line now **scrolls continuously** (calm, seamless loop, same feel as the web arena); CANLI and BU GÜN stay highlighted. With Android "Remove animations" (accessibility) ON, it renders static — no motion.
- The REYTINQ card labels never truncate ("SERIYA · REKORD 0" wraps instead of "REKO…") — check in az/en/ru.

## PP3. In-app info pages (mobile)
- Avatar → account sheet: new INFO section — About, FAQ, Contact (both roles) + **Pricing (parent only — students never see it, even via links)**. Each opens the page with a working back arrow returning into the app.
- Parent profile's FAQ and Contact rows now actually open those pages (they used to bounce to Home).
- The welcome/login/register screens still bounce signed-in users to their home — only the info pages opened up.

## PP4. In-app info pages (web parity)
- Parent panel: **About** in the footer (Home / About / FAQ / Contact); /help/about matches the public About (admin Site-Content edits apply). Parent /help/contact now shows the real admin-configured support email/phone.
- Child arena: profile drawer gains About / FAQ / Contact rows (arena-themed pages, no pricing anywhere in the child panel).

If anything doesn't match, tell me the **PP-#** + what you saw.

---

# Round 25 (2026-07-17) — in-app news article routes (mobile).

## QQ1. News articles open inside the app shell
- Signed-in student: tap a news notification (or deep link to /news/some-slug) → the article opens INSIDE the student shell (arena background, themed header, native back returns into the app).
- Signed-in parent: same → article opens in the parent shell.
- The news TABS' own in-list reading experience is unchanged; signed-out users still see the public article page.

If anything doesn't match, tell me the **QQ-#** + what you saw.

---

# Round 26 (2026-07-17) — audit-findings close: graded notifications everywhere, parent leaderboard on mobile, Subjects page, admin pricing editor.

## RR1. "Graded" notification now fires from EVERY platform
- Submit a test from the MOBILE app (any kind: topic test, rated round, replay, olympiad) → the student's inbox gets "Nəticə hazırdır" with a working link to that result (web already did this; now it comes from the database, so both platforms behave identically).
- Submit one from the web → still exactly ONE notification (no duplicates).

## RR2. Parent full leaderboard (mobile)
- Parent app: Analytics tab → "view full leaderboard" action on the leaderboard panel (or tap the rank row on a child card on Home) → a full top-50 board with points|streak, month|all-time, and global/subject/grade/city/rayon/school scopes — same numbers as the web parent /leaderboard.
- With 2+ children: child chips pick whose position card is shown; a child outside the current filter says so instead of showing nothing.

## RR3. Subjects catalog (mobile)
- Account sheet → INFO → Subjects (both roles), and a Subjects link card on the Pricing screen → the four-subject catalog page matching the web /subjects. Welcome/login remain untouched (minimal).

## RR4. Admin subject-price editor
- Admin panel (Administrator only — content managers must NOT see it): Operations → Pricing → table of active subjects × week/month/year AZN prices; edit a cell → save → the public pricing pages (web + mobile) show the new price; an audit row is written. Try an invalid value (0, negative, 3+ decimals, >10000) → rejected.
- Note shown in UI: checkout always reprices server-side; existing subscriptions unaffected until change/renewal.

## RR5. Web cleanup regression
- Web child area works as before; the old hidden /child/practice/[id] route is gone (it had no entry points).

If anything doesn't match, tell me the **RR-#** + what you saw.

---

# Round 27 (2026-07-18) — INVESTOR round 2: copy, Services, olympiad sales windows, child avatars, WhatsApp.

## SS1. Investor copy (web + mobile pick up automatically)
- /faq: the 10 Q&As match the investor document (az); EN/RU read naturally.
- /register: subtitle "Övladınızı əlavə etmək və idarə etmək üçün valideyn kimi qeydiyyatdan keçin."
- /subjects: lead "Övladınıza lazım olan fənləri seçin. İstənilən vaxt yenilərini əlavə edə bilərsiniz."

## SS2. Services rename + routes
- Nav/footer say **Xidmətlər / Services / Услуги** (web + mobile); the page lives at **/services**; typing **/pricing** redirects there (old links keep working). Admin's internal Pricing module (subscription prices) is unrelated and unchanged.

## SS3. Olympiad sales windows (admin-controlled, server-enforced)
- Admin → Olympiad package edit: new "sale start" and "sale end" datetime fields (Baku time), end must be after start; the list + edit header show the derived state (Scheduled / Active / Expired / Archived) and the edit page states exactly when the package is publicly purchasable.
- Set a sale end in the past on a test package → it disappears from the landing/services lists and from non-buyer catalogs (web + mobile) but STAYS in admin; buying it via the app is impossible (server rejects with "satış müddəti bitib").
- A family that ALREADY bought it still sees it, still opens attempts, results, everything (lifetime access).

## SS4. Landing + Services active-packages section
- Landing page and /services (web) and the mobile services screen show "Aktiv olimpiada paketləri" cards (name, subject, grade, price, sales-until/event date, question count, CTA) — from the database, only currently-on-sale packages; a localized empty state when none.

## SS5. Add-Child photo / preset avatar
- Add-Child (web + mobile): choose Default (initials) / Oğlan / Qız / upload a photo (png/jpeg/webp ≤2MB; preview, replace, remove). Edit-Child can change it later; switching preset↔photo replaces cleanly.
- The avatar shows on parent child cards, the edit screen, the child's own header/profile (web + mobile) and as a small avatar in admin accounts. Leaderboards stay initials-only (no child photos anywhere public).
- Privacy: photos are in a PRIVATE bucket — a signed-in parent can only ever load their own children's photos.

## SS6. WhatsApp contact (admin-configured)
- Admin → Settings → Support: new WhatsApp field (empty = hidden). Set a number → the web Contact page and mobile Contact screen show a WhatsApp row opening wa.me. BLOCKER: no real investor-approved number yet — the field stays empty until you have one.

If anything doesn't match, tell me the **SS-#** + what you saw.

---

# Round 28 (2026-07-19) — admin-controlled address, landing top-6 + see-all, audit-log coverage & filtering.

## TT1. Address is admin-controlled (web + mobile, dynamic)
- Admin → Settings → Support: a new **Address** field (seeded with the current office address). Edit it → the web Contact page (/contact, /help/contact, /child/help/contact) and the mobile Contact screen show the new address (web caches ~60s; mobile within the config refetch window).
- Clear the field → the address block disappears entirely on both (same as the WhatsApp row).

## TT2. Landing shows the latest 6 + "see all"
- Seed 7+ active on-sale olympiad packages → the landing page shows only **6** cards + a "Hamısına bax / See all / Смотреть все" link → opens **/olympiad-packages** listing ALL active packages. With ≤6 packages the link is hidden. The /services page still lists all packages (no cap).

## TT3. Olympiad sales-window end-to-end (carried from Round 27 — please test now)
- Admin → Olympiad → edit a test package: set a **sale end** in the past (Baku time). Then:
  - It disappears from the landing, /services, /olympiad-packages, and the mobile services screen (for anyone who hasn't bought it).
  - A parent who did NOT buy it cannot purchase it (server rejects with "satış müddəti bitib").
  - A family that ALREADY bought it still sees it in "My Olympiads" and can still open attempts/results (lifetime access).
- Admin still sees it in the package list with an **Expired** chip.

## TT4. Audit log covers the important actions + is filterable
- Admin → Audit: the page now defaults to ALL activity (not just staff). Do a few actions and confirm rows appear with details:
  - Register a parent, add a child, subscribe, cancel a subscription, buy an olympiad, edit a subject price, flip a feature flag, change a setting.
  - Each row has a **"Show details"** expander showing what changed ("field: old → new" for edits; "created:"/"removed:" for inserts/deletes; metadata for app actions). Any password/token/secret-like field renders as ••• (never shown).
- Filters (combine, with "clear all"): entity, action, severity, success, actor-scope (All / Staff / Users & system), date from/to, and a target-id search. Prev/Next pages 50 at a time.
- Money-trail check: a NEW subscription and a NEW payment row now produce audit entries (previously only status changes were logged).

If anything doesn't match, tell me the **TT-#** + what you saw.

---

# Round 29 (2026-07-19) — admin-controlled map, dormant notifications wired, admin notification bell.

## UU1. Contact map follows the admin address / precise pin
- Admin → Settings → Support: a new "map location" field under Address. Leave it EMPTY → the /contact map (web) shows the admin-set Address. Set precise coordinates (e.g. `40.3719,49.8371`) → the map pins exactly there.
- Web /contact, /help/contact, /child/help/contact all update. Mobile Contact screen: the address row is now tappable → opens the same location in the phone's Google Maps.

## UU2. Student achievement notifications (auto)
- **Streak milestone:** when a student's daily-round streak reaches 3/7/14/30/60/100 days, they get a "Seriya davam edir 🔥" notification (once per milestone per day; never spammed).
- **Personal best:** when a student beats their previous best score on a RATED daily round (not their first-ever attempt), they get a "Yeni rekord!" notification. Both link to the leaderboard.
- These fire automatically on grading (web + mobile submissions both, since it's a DB trigger).

## UU3. Subscription-expiry + giveaway notifications (scheduled)
- **Subject expiring:** a daily job notifies a parent ~3 days before a child's subscription lapses ("Abunə bitmək üzrədir"). Once per billing period.
- **Giveaway ending:** during an active giveaway, a daily job warns all parents in the final 2 days.
- These run via pg_cron (already enabled on dev). To see one immediately without waiting for the schedule, an admin can run in Supabase SQL editor: `select public.notify_expiring_subscriptions();` — it creates the due notifications now (idempotent, safe to re-run).

## UU4. Admin notification bell (NEW)
- Log in as an administrator: a bell icon in the top bar with an unread badge. It shows operational alerts — **new parent registration**, **new olympiad purchase**, **new subscription** — as they happen. Clicking an alert jumps to the relevant admin page (Accounts / Olympiad). "See all" opens the new **Alerts** page (mark read / delete).
- Test: register a new parent (or buy an olympiad) on the web app, then check the admin bell — a new alert appears within ~60s (or on opening the bell).

If anything doesn't match, tell me the **UU-#** + what you saw.

---

# Round 30 (2026-07-19) — fix the admin notification leak + rescope admin notifications.

## VV1. Admin bell no longer shows other people's notifications (the bug)
- Log in as an administrator: the bell / Alerts page now shows ONLY notifications addressed to YOU. The student "result ready", parent "olympiad bought", etc. that leaked in before are GONE. Right now the bell may be empty/near-empty — that's correct; admins only get admin-directed notifications.
- Nothing you click should 404 anymore.

## VV2. Admins send notifications to admins (or content managers)
- Admin → Notifications → Compose: the audience list now includes **Administrators** and **Content managers**. Send one to Administrators → every admin (including you) receives it in the bell. This is the intended admin-to-admin channel; these are private to that audience (a content manager never sees an admin-only send).

## VV3. Content managers are notified when their package goes live
- As a content manager (or admin) who CREATED an olympiad package: when that package's status becomes active (published), the creator gets a "Paket dərc olundu" notification naming the package, linking to the Olympiad admin page. Once per package.

## VV4. (Reverted) no more auto ecosystem alerts to admins
- Admins are NO LONGER auto-notified of every new parent / purchase / subscription (that was the R29 noise). Those counts are better shown on a dashboard (a future feature) — flagged in STATUS.

If anything doesn't match, tell me the **VV-#** + what you saw.

---

# Round 31 (2026-07-20) — Daily Tasks removed, navigation width fixed, Admin Subscriptions section.

## WW1. Daily Tasks is gone from the Admin Panel
- Admin sidebar: the greyed-out "Daily tasks / Gündəlik tapşırıqlar" item under "Coming soon" is gone. Only "Payments" remains there.
- **The automated system still works:** a student can still start today's rated round (questions are generated automatically on first request). Admin → Questions still shows the **daily-round readiness** grid (eligible questions per subject × grade) — that's the admin view of the automated engine and is intentionally kept.

## WW2. Parent navigation no longer scrolls sideways
- Log in as a parent on a normal desktop window: the whole nav (Home, Analytics, Leaderboard, Olympiads, Subscription, News, FAQ, Contact) fits without any horizontal scrolling. FAQ/Contact now use short labels ("FAQ", "Əlaqə") instead of the long page titles.
- Narrow the window: links **wrap onto a second row** instead of scrolling sideways; the bell + avatar stay pinned on the right and never drop to their own line. No page-level horizontal scrollbar at any width.
- Check in AZ / EN / RU (AZ and RU labels are the longest).

## WW3. Student navigation
- Log in as a student: same behaviour on the arena header (it shares the same nav component) — no sideways scrolling, wraps when narrow.
- Mobile app is unaffected (it uses a native bottom tab bar) — all parent/student destinations remain reachable there.

## WW4. Admin Subscriptions section (NEW)
- Admin sidebar → **Operations → Subscriptions** (Administrators only; a Content Manager must not see or reach it).
- **List:** child, parent, subjects, interval, status, amount, source badge, trial/period dates. Filters: search (child/parent), status, interval, source, date range. 25 per page with Prev/Next.
- **Detail:** open a row → full billing block, subjects, sibling-discount rank/percent, trial window, and a "Payment transaction" card that explicitly says there is **no real provider transaction** (demo/comped) — it must never look like a settled payment.
- **Demo controls** (each asks for confirmation, each writes an audit entry): Activate / Extend (+days) / Cancel / Expire. Only the actions valid for that row's status are shown.
  - Cancel keeps access until the period end; Expire revokes access immediately (the child's access status flips to expired).
  - Try an invalid one (e.g. Activate on a canceled row — the button shouldn't even appear): the server rejects invalid transitions regardless.
- Check Admin → Audit afterwards: your actions appear as `admin.subscription.activate/cancel/expire/extend` with before→after status.

## WW5. Payments untouched
- Admin sidebar → "Coming soon" still shows **Payments** exactly as before (greyed placeholder). Nothing about it changed.

If anything doesn't match, tell me the **WW-#** + what you saw.
