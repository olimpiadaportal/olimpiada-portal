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

If anything here doesn't match, tell me the **BB#** + what you saw.
