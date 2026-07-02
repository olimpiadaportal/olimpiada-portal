# Manual Testing Guide — Olimpiada Portal (Investor Review Round 2)

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
- **Compact** "Olimpiada Portal" brand top-left (both panels).
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
- **Nav** (no "Olimpiada Portal" wordmark): **Home · Analytics · Subscription · FAQ · Contact** + a round **profile icon** far right → opens a **drawer** with **Account** (avatar/change-password/delete/logout), **Language**, **Theme**.
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

## T1. Rebrand → OlimpIQ
- Everywhere the brand appears (landing header/footer, login/register, student header, admin sidebar/login, browser tab titles) now reads **OlimpIQ** — no more "Olimpiada Portal" / "OLIMP·ARENA".
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
- Nothing to click — the dev DB now has a pg_cron job `olimpiq_advance_student_grades` running `advance_student_grades()` every **September 1, 03:00 UTC**. (Verified present on dev.)

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
