# LEADERBOARD & STREAK — Implementation Plan

Status: PLAN (not yet implemented). Feature-flag: `leaderboard` (already seeded OFF).
Reference studied: UniPrep (`side/`) — points formula, streak engine, board RPCs, admin reset. We PORT the proven *logic and security posture* natively onto our schema; we copy no code.

---

## 1. Goal

Two child-only competitive boards, both **computed server-side and non-manipulable**:
1. **Points board** — a fair, grind-resistant score derived only from *graded* attempts.
2. **Streak board** — consecutive active days, strict timezone-aware rules.

Plus admin management (view, configure, reset/season, gate) and the existing privacy controls. Parents never appear on any board.

## 2. Current state (what we already have)

- Tables exist but are **completely unpopulated**: `leaderboard_periods`, `leaderboard_entries` (`points`, `rank`, `scope_type`, `scope_id`), `leaderboard_snapshots`, `achievements`, `student_achievements` (`supabase/sql/006`). Enums `leaderboard_period_type` + `leaderboard_scope_type` (`001`), NULL-safe scope uniqueness index (`011`), read-all/admin-write RLS (`010`).
- **No points ledger, no streak columns, no writer, no job, no real UI.** The child leaderboard page (`web-app/src/app/child/leaderboard/page.tsx`) shows only a hard-coded self row.
- **Points source of truth** = graded `test_attempts` (`score`/`max_score`, server-set by `grade_practice_attempt`) + `test_attempt_answers` (`is_correct`, `points_awarded`, `time_spent_ms`). Column-hardened against client writes (`010`).
- Already wired: `leaderboard` feature flag (gates nav tab + page) and `leaderboard.public_display_names` system setting (anonymizes non-self rows) in `web-app/src/lib/flags.ts`.
- **Child identity is solved for RPCs:** children have real Supabase auth users; `current_profile_id()` + `has_role('student')` resolve them inside `SECURITY DEFINER` functions (unlike UniPrep, which had to redesign this).

## 3. Anti-manipulation architecture (the core requirement)

Non-negotiable, mirrored from UniPrep's hardened design:

1. **All score/streak columns are UNWRITABLE by clients.** They live on new columns/tables whose RLS grants **no client UPDATE** of the protected fields. The only writers are `SECURITY DEFINER` RPCs that re-check ownership (`current_profile_id()`).
2. **Points come only from a graded attempt, scored exactly once.** An append-only ledger row is written by the grading RPC with `UNIQUE(attempt_id)` + `ON CONFLICT DO NOTHING` and a `FOR UPDATE` row lock → replay-safe, no double-scoring.
3. **Only leaderboard-eligible activity earns points** (analogous to UniPrep's `is_official` gate): graded practice + graded olympiad attempts. A per-day, per-subject **anti-grind cap** bounds practice farming.
4. **The board is a live, privacy-filtered, `SECURITY DEFINER` query** — no client aggregation, deterministic tie-breaks, opt-in/anonymized display.
5. **Streak has exactly ONE authoritative writer** and a single ground-truth table; never a trigger + RPC both mutating it (UniPrep's `63_fix_streak_double_write` lesson).

## 4. Data model (new — migration `0XX_leaderboard_engine.sql`)

### 4.1 Points ledger (append-only, the anti-manipulation core)
```
create table public.student_points_ledger (
  id                 uuid pk,
  student_profile_id uuid not null → students(profile_id) on delete cascade,
  attempt_id         uuid not null → test_attempts(id) on delete cascade,
  subject_id         uuid → subjects(id),
  kind               text not null,          -- 'practice' | 'olympiad' | 'daily'
  points             numeric(10,2) not null, -- computed server-side
  breakdown_json     jsonb not null default '{}',   -- {correct, byDifficulty, capApplied}
  created_at         timestamptz not null default now(),
  constraint uq_points_per_attempt unique (attempt_id)   -- each attempt scores at most once
);
```
Aggregate columns cached on `students` for fast board reads (recomputed by the writer, never client-writable):
```
alter table public.students add column
  points_all_time numeric(12,2) not null default 0,
  points_month    numeric(12,2) not null default 0,   -- current period; reset by cron
  points_month_key text,                              -- e.g. '2026-07' to detect period rollover
  last_points_at  timestamptz;
```

### 4.2 Streak (single ground truth + cached state)
```
create table public.student_activity_days (
  student_profile_id uuid not null → students(profile_id) on delete cascade,
  activity_date      date not null,          -- LOCAL date in the child's tz
  is_active          boolean not null default true,
  attempts           int not null default 0,
  primary key (student_profile_id, activity_date)
);
alter table public.students add column
  current_streak int not null default 0,
  best_streak    int not null default 0,
  last_active_date date,
  streak_tz text not null default 'Asia/Baku';   -- per-child day boundary
```

### 4.3 Config (single settings row — avoid UniPrep's dual-config debt)
`system_settings` keys (admin-editable, validated): `leaderboard.points.per_correct` (base, default 10), `leaderboard.points.difficulty_weights` (`{"easy":1,"medium":1.5,"hard":2}`), `leaderboard.points.practice_daily_cap_per_subject` (default 150), `leaderboard.points.olympiad_multiplier` (default 1.5), `leaderboard.period` (`month`|`week`|`all_time`, default `month`), `leaderboard.scopes` (`["global","subject"]`). Weights are config-driven (fix UniPrep's hard-coded weights).

## 5. Points formula (recommended default — confirm in §11)

Computed inside the grading RPC, per graded attempt:
```
raw = per_correct × Σ_over_correct_answers difficulty_weight(question)
if kind = 'olympiad': raw ×= olympiad_multiplier
if kind = 'practice':                      -- anti-grind
    remaining = practice_daily_cap_per_subject − points_from_practice_today(subject)
    awarded = clamp(raw, 0, max(0, remaining))
else awarded = raw
```
Rationale: difficulty-weighted per-correct is intuitive/rewarding for kids ("I earned points"), while the **per-day practice cap + olympiad multiplier + graded-only + idempotent ledger** together defeat grinding and forgery. Difficulty is server-derived (users never choose it — matches our rules). This is simpler than UniPrep's rolling-quality hybrid but keeps the same anti-gaming guarantees; a hybrid "recent quality" model is an alternative (§11 Q1).

## 6. Streak rules (ported, strict)

- A day counts iff `student_activity_days.is_active = true` for that LOCAL date (child's `streak_tz`, default `Asia/Baku`). Opening the app is not activity; **completing a graded attempt or daily task is** (the writer sets it).
- **Single writer** `record_student_activity(p_student, p_kind)` (`SECURITY DEFINER`, ownership-checked): upserts today's `student_activity_days` row; if already active today → no-op on the count; else if yesterday active (walk back consecutive active days) → `current_streak = prior + 1`, else `current_streak = 1`; update `best_streak`, `last_active_date`. Called by the grading RPC (not a table trigger).
- **Lazy expiry on read** `get_streak_status(p_student)`: computes live status `active | at_risk | lost` + `hours_until_loss`; if `lost` and stored `current_streak > 0`, zeroes it. `at_risk` = active yesterday, not yet today (grace until local midnight).
- No freeze/recover in v1 (optional engagement add-on, §11 Q6).

## 7. Board reads (live, secure, deterministic)

`SECURITY DEFINER` RPCs granted to `authenticated`, honoring privacy server-side:
- `get_leaderboard(p_board 'points'|'streak', p_scope 'global'|'subject'|'grade'|'city', p_scope_id uuid, p_period, p_limit=100)` → `ROW_NUMBER()` over eligible children with a **deterministic tie-break** (`points DESC, best_streak DESC, last_points_at ASC, profile_id`), abbreviated display names (`Ali M.`), and `where` honoring `leaderboard.public_display_names` + child-only + non-zero value.
- `get_student_leaderboard_rank(p_student, p_board, p_scope, p_scope_id, p_period)` → `{rank, total, value}` for the "your rank" card (works even if outside top-N).
- Per-subject scope filters children who have that subject active; points_month vs points_all_time chosen by `p_period`.

## 8. Periods, snapshots, automation

- **Points period** = monthly by default. `points_month`/`points_month_key` roll over lazily (writer detects a new month → archives the prior month to `leaderboard_snapshots` + zeroes `points_month`) AND a **pg_cron monthly job** (pattern already in migration `016`) force-rolls at month start for children with no early-month activity. All-time board reads `points_all_time` (never reset).
- **Streak board** = current streak (no period).
- **Snapshots** (`leaderboard_snapshots`) store the top-N of a closed period for history; live board doesn't read them (scale-out option only).

## 9. Admin management (admin-panel)

New Admin-only "Leaderboard" section (permission-gated like News/Olympiad):
- **View** each board/scope (read the same RPCs) with search.
- **Configure** the `system_settings` formula keys (weights/caps/period/scopes) via the existing typed Settings editors — audited.
- **Reset / season**: `admin_reset_leaderboard(p_scope, p_mode 'soft'|'hard'|'seasonal', p_pct)` (`SECURITY DEFINER`, **service_role only**, revoked from authenticated): seasonal archives to `leaderboard_snapshots` then zeroes `points_month`; audited via `writeAuditLog`. Manual button + the monthly cron.
- The `leaderboard` feature flag (kill-switch) + `leaderboard.public_display_names` toggle already exist.

## 10. Web + mobile UI

- **Child web** (`child/leaderboard`): board tabs **Points | Streak**, scope tabs **Global | My subjects | Grade/City** (per `leaderboard.scopes`), top-N list (rank, medal for 1–3, abbreviated name, value), a sticky **"Your rank"** card, streak flame with `hours_until_loss` urgency, honest empty states, trilingual. Reuses `.arena-*` design.
- **Parent**: read-only view of their child's rank inside Analytics (optional).
- **Mobile-ready**: all logic is in RPCs → the mobile app (master plan) calls the same `get_leaderboard`/`get_student_leaderboard_rank` directly (RLS-safe) or via BFF. The Ranking tab is already a reserved seam in the mobile plan §20.

## 11. Owner decisions (resolve when we start this plan)

1. **Points model:** difficulty-weighted per-correct + daily cap (recommended, kid-friendly) vs UniPrep's rolling recent-quality hybrid (harder to grind, less "I earned points today" feel)?
2. **Scopes for v1:** Global + per-subject (recommended); add Grade and City/School now or later?
3. **Streak eligibility:** which activities set `is_active` — graded practice, olympiad attempts, daily tasks? Does a locked/expired (unpaid) child accrue streak/points at all? (Recommendation: only children with active access; giveaway/admin-grant count.)
4. **Period:** monthly reset (recommended) + all-time, or weekly? Keep season archival history?
5. **Privacy/display:** abbreviated names + honor `public_display_names` (recommended) — or parent-controlled opt-in per child?
6. **Freeze/recover streak mechanics:** ship in v1 or defer?
7. **Tie-break rule:** confirm `points DESC, best_streak DESC, earliest-to-reach`.

## 12. Staged implementation

- **L0 — DB engine** (migration + backports + `013` checks): ledger + streak tables/columns + config seeds + the writer RPCs (`award_attempt_points` folded into grading, `record_student_activity`) + board read RPCs + RLS write-protection + monthly pg_cron. Smoke-test: grade an attempt → ledger row + cached points + streak update; verify anon/clients cannot write protected columns; from-zero rebuild green.
- **L1 — Child board UI**: real board + your-rank + streak, trilingual, behind the flag.
- **L2 — Admin management**: view + config + reset/season + audit.
- **L3 — Polish/scale**: snapshots for large boards, achievements (optional), parent view, mobile RPC parity.

Each stage: typecheck+build both apps, dev-apply migration + backport + `013`, non-destructive from-zero rebuild, trilingual, STATUS + MANUAL_TESTING_GUIDE updates.
