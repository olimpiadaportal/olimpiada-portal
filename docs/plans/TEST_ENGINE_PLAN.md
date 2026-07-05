# TEST-TAKING ENGINE — Implementation Plan

Status: PLAN (not yet implemented).
Reference studied: UniPrep exam + practice players (`side/`). We PORT the *UX patterns and server-authoritative security posture*, and we explicitly FIX UniPrep's two real security gaps (client-side `correct_answer` leak, client-only timer). No code copied.

---

## 1. Goal

A professional, secure test-taking flow so students actually *use* the questions admins create:

**Choose subject → topic(s) → subtopic(s) → instructions → timed test player → submit/cancel → results + review.**

The player must have: a timer, question palette + prev/next, flag-for-review, autosave, proper cancel (counts nothing), state preservation/resume, and server-authoritative grading. Built web-first but designed so the mobile app renders the same flow.

## 2. Current state (what we already have)

Working, security-hardened **attempt engine** (reuse it):
- Tables: `test_attempts` (`kind` practice/olympiad/daily/test, `status`, server-set `score`/`max_score`, `started_at`/`submitted_at`/`graded_at`, `subject_id`), `test_attempt_answers` (`selected_option_ids`, server-set `is_correct`/`points_awarded`, `time_spent_ms`, `UNIQUE(attempt_id,question_id)`).
- RPCs (`011`): `start_practice_attempt(subject_id, count=25)` draws 25 random published objective questions server-side; `get_practice_attempt` returns questions+options **with `is_correct` stripped** (the crucial anti-cheat we already do right); `grade_practice_attempt(attempt_id, answers)` auto-grades exact-set-match server-side and writes the authoritative score; `start_olympiad_attempt` reuses the same three for purchased packages. Column-level grants + `SECURITY DEFINER` grading + `010` RLS make scores non-forgeable.
- Client: `PracticeRunner.tsx` (one-question-at-a-time stepper, submits all answers at the end), `childActions.ts` `startPractice`/`gradePractice`, `.arena-*` design system, trilingual `practice.*`/`arena.quiz*`.
- Taxonomy: `subjects` → `topics` (subject+grade) → `subtopics` (`003`). Questions carry `subject_id`, `topic_id`, `subtopic_id`, `grade_id`, `difficulty`, lifecycle `status`, `question_explanations` (per-locale explanations — powers the review screen).

**Gaps vs a full test page:** no topic/subtopic selection (subject-only), no timer, no explicit cancel/abandon, no question palette/jump, no mid-attempt persistence (refresh loses answers), no results/history archive or answer-review screen.

## 3. Security posture (what we keep, what we fix)

**Keep (already correct):** questions delivered via `SECURITY DEFINER` RPC **without answer keys**; grading server-side only; owner-scoped RLS on attempts/answers; server-random question draw.

**Fix vs UniPrep (their real gaps):**
1. **Never ship `correct_answer` to the client during an attempt** — we already don't; keep it that way (UniPrep leaks it).
2. **Server-authoritative timer** — stamp `started_at` + persist a server `deadline_at` on the attempt; the client countdown is UX only; the submit/grade RPC **rejects or clamps** answers past `deadline_at` (UniPrep's timer is client-only and over-time submissions are accepted).
3. **Server-created attempts** — attempt rows are created only by the start RPC (sets `started_at`, `deadline_at`, drawn `question_ids`); clients can't fabricate them.
4. **Single open attempt + server expiry** — enforce at most one `in_progress` attempt per child per test-scope; a pg_cron/RPC expires stale `in_progress` attempts → `expired` (don't rely on client cleanup like UniPrep).
5. **Access gating first** — the start RPC authorizes access (active subscription for the subject, or giveaway/admin-grant; purchase for olympiad) before drawing questions ("authorize first").

## 4. Data model changes (migration `0XX_test_engine_topics.sql`)

Extend `test_attempts` (additive, non-destructive):
```
alter table public.test_attempts add column
  question_ids uuid[] not null default '{}',   -- the fixed drawn set (re-gradable, stable on resume)
  deadline_at  timestamptz,                     -- server deadline = started_at + duration
  duration_seconds int,                         -- chosen by scope/config, not the client
  topic_ids    uuid[] not null default '{}',    -- selected scope (for results breakdown)
  subtopic_ids uuid[] not null default '{}',
  canceled_at  timestamptz;                     -- explicit cancel (distinct from expired)
```
`attempt_status` enum already has the needed states; add `'canceled'`/`'expired'` if absent (additive). Reuse `test_attempt_answers` as-is for MCQ (no written/AI-graded types — out of scope).

## 5. New / extended RPCs (all `SECURITY DEFINER`, ownership + access checked first)

- **`start_topic_test_attempt(p_subject_id, p_topic_ids uuid[], p_subtopic_ids uuid[], p_count int)`** — authorize access → validate the topic/subtopic ids belong to the subject → draw `p_count` random published objective questions scoped to them (fallback to subject-wide if a scope is empty) → INSERT the attempt with `question_ids`, `started_at=now()`, `duration_seconds` (from config per count, e.g. 60s/question), `deadline_at`, `topic_ids`/`subtopic_ids` → return `attempt_id`. Refuse if a live `in_progress` attempt already exists (return it for resume, or block per policy).
- **`get_test_attempt(p_attempt_id, p_locale)`** — reuse/extend `get_practice_attempt`: returns the fixed `question_ids` set (questions + options, **no `is_correct`**) + `status` + `deadline_at` + any saved answers (for resume). Owner-checked.
- **`save_test_answers(p_attempt_id, p_answers jsonb)`** — idempotent batch upsert into `test_attempt_answers` (`onConflict attempt_id,question_id`); allowed only while `status='in_progress'` AND `now() <= deadline_at`; records `time_spent_ms`, `is_marked`(flag). Owner-checked. (Autosave target.)
- **`submit_test_attempt(p_attempt_id, p_answers jsonb)`** — merge final answers (respecting `deadline_at`: answers saved after the deadline are ignored/clamped), then grade server-side (reuse `grade_practice_attempt` logic), set `status='graded'`, `submitted_at`, `score`. Idempotent (if already graded, return the result). This is also where **leaderboard points + streak** hook in (see LEADERBOARD_PLAN §5–6).
- **`cancel_test_attempt(p_attempt_id)`** — owner-checked; set `status='canceled'`, `canceled_at`; a canceled attempt **counts for nothing** (no score, no points, no streak). Optionally delete its `test_attempt_answers`.
- **`expire_stale_test_attempts()`** — service-role/cron: `in_progress` past `deadline_at + grace` → `status='expired'` (no score/points). Scheduled via pg_cron.

## 6. Student flow & UI (web-first, mobile-parity)

New route group `child/test/*` (arena-scoped), reusing `.arena-*`:
1. **Choose subject** (`child/test`) — the child's active subjects (from subscription / giveaway), cards with progress. *(Locked subjects show a subscribe hint, like Analytics.)*
2. **Choose topic/subtopic** — a tri-state topic → nested subtopic picker (port UniPrep's `TopicSelectionModal` UX: Select-All / Skip-Selection→random / partial). Count fixed by config (e.g. 10 or 25), not user-chosen (matches our "no user difficulty/count" rule).
3. **Instructions gate** — title, subject/topics, question count, duration, rules, scoring legend, and an **"I understand" checkbox** that enables **Start** (port UniPrep's consent gate).
4. **Timed player** — port the good UniPrep UX: countdown with color warnings (≤10 min orange, ≤5 min red) driven off the **server `deadline_at`**; question **palette** (answered/flagged/unanswered/current, click-to-jump); **prev/next**; **flag-for-review**; **autosave every 30s** + on nav via `save_test_answers`; **submit** (confirm dialog) and **cancel/abandon** (confirm → `cancel_test_attempt`, nothing counts); browser back/refresh guards.
5. **Grading → Results** — big score, per-topic/subtopic breakdown (we have the mapping), time taken, honest states.
6. **Review** — per-question correct/incorrect/skipped with the correct option and the localized **explanation** (`question_explanations`) — delivered by a **post-submission** RPC (answer keys are safe to reveal only after grading).

## 7. State preservation / resume (recommended: TRUE resume)

Recommendation (better than UniPrep's deliberate no-resume): the attempt is durable (fixed `question_ids` + saved answers + server `deadline_at`). On re-entry to an `in_progress` attempt, `get_test_attempt` rehydrates the questions, the saved answers, and the **remaining time computed from `deadline_at`** — so a refresh loses at most one autosave interval and never restarts the clock. Cancel is the only way to discard. (Owner may instead choose "one sitting, no resume, forfeit on leave" — §9 Q3.)

## 8. Attempt policy & anti-cheat summary

- **Practice/topic tests:** unlimited attempts, each a fresh random draw; best/last recorded; per-day points cap (LEADERBOARD_PLAN) prevents grinding.
- **Olympiad attempts:** governed by the existing purchase/lifetime rules; attempt policy per package (confirm).
- Server-authoritative everything: draw, timer/deadline, grading, single-open-attempt, expiry. No answer keys pre-submission. Difficulty auto-mixed server-side.

## 9. Owner decisions (resolve when we start this plan)

1. **Question count & duration** per test (fixed 10? 25? duration = N seconds/question?), and whether count is per-subject configurable in admin settings.
2. **Attempt policy** for topic tests: unlimited (recommended) vs cooldown vs cap; does a re-attempt re-draw?
3. **Resume vs no-resume** (recommend resume); if no-resume, does leaving forfeit?
4. **Daily-task path:** the `daily_task_packages` schema exists — do we also build admin-curated daily tests (fixed sets) now, or only taxonomy-scoped random tests? (Daily tasks also feed streak per LEADERBOARD_PLAN.)
5. **Option shuffling** per attempt (needs server-side correct-option remap so grading stays server-side) — ship or skip?
6. **Results depth:** per-topic breakdown + review-with-explanations (recommended) — confirm scope.

## 10. Staged implementation

- **T0 — DB**: attempt-table columns + the 6 RPCs + expiry cron; backports + `013` checks; smoke-test the full lifecycle (start→save→submit→grade→review; cancel counts nothing; late answers clamped; single-open enforced) inside a rolled-back transaction; from-zero rebuild.
- **T1 — Player UI**: subject→topic→subtopic selection + instructions gate + timed player (timer/palette/flag/autosave/submit/cancel + guards), trilingual, `.arena-*`.
- **T2 — Results + review**: score + per-topic breakdown + post-submission review with explanations + attempt history.
- **T3 — Integration**: wire graded attempts into LEADERBOARD_PLAN (points + streak); parent Analytics already reads `get_child_subject_dashboard`; mobile parity (same RPCs behind the mobile Arena test tab).

Each stage: typecheck+build, dev migration + backport + `013`, non-destructive from-zero rebuild, trilingual, STATUS + MANUAL_TESTING_GUIDE updates.
