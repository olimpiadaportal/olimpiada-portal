-- =============================================================================
-- 2026_07_26_092_olympiad_attempts_unrated.sql
-- =============================================================================
-- Round 51 (sync audit A1/A2): OLYMPIAD ATTEMPTS STOP CLAIMING is_rated.
--
-- WHAT WAS WRONG
--   Migration 088 made olympiad attempts practice-only where it MATTERS
--   (award_attempt_points returns early: no ledger row, no points, no
--   percentage, no streak, no daily-slot consumption) — but it never touched
--   the FLAG. start_olympiad_attempt kept inserting is_rated = true, a
--   leftover from the pre-088 era when olympiads really did award points.
--   Every UI that renders "rated" from the flag therefore lied on BOTH
--   platforms: the runner showed "Reytinqə təsir edir" on a provably unrated
--   run, and the recent-attempts lists pinned a rated chip on olympiad rows.
--
-- WHAT THIS MIGRATION DOES
--   1. Patches start_olympiad_attempt from its LIVE definition (090's body)
--      with a single-line edit: the attempt row is inserted with
--      is_rated = false.
--   2. Backfills the existing olympiad attempt rows to is_rated = false.
--      Same reasoning the owner approved for 088 PART B: these are demo
--      accounts, and history must agree with the practice-only rule.
--   The web/mobile runners ALSO gate their badge on kind (belt and braces for
--   any row this backfill could miss in another environment).
--
-- Rerun-safe: yes (string patch no-ops once applied; the UPDATE converges).
-- Destructive change: no (a display flag on demo data; scoring never read it —
--   award_attempt_points gates on kind, and olympiad rows write no ledger).
-- Environment first applied: development
-- Related root SQL file(s):
--   supabase/sql/011_indexes_constraints_functions_triggers.sql
--     (start_olympiad_attempt)
--   supabase/sql/013_validation_queries.sql (folded into check #85)
-- Backport status: pending
-- Rollback notes: re-run the 090 CREATE OR REPLACE of start_olympiad_attempt
--   (restores is_rated = true) — the backfill is not meaningfully reversible
--   and does not need to be.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) start_olympiad_attempt: insert is_rated = false.
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_def text;
  v_old text := $frag$
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, true)$frag$;
  v_new text := $frag$
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, false)$frag$;
begin
  v_def := pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure);

  if position(v_new in v_def) > 0 then
    return; -- already patched (rerun)
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'start_olympiad_attempt(): expected insert values not found — review before patching';
  end if;

  execute replace(v_def, v_old, v_new);
end
$patch$;

comment on function public.start_olympiad_attempt(uuid) is
  'Round 49/51: purchase-gated olympiad start. Serves exactly '
  'questions_per_attempt questions from the ENTITLED GRADE''s published pool '
  '(the whole pool when it is smaller), never repeating a question inside an '
  'attempt and never repeating across attempts until that student''s cycle for '
  '(package, grade) is exhausted -- then the cycle resets and a fresh one '
  'starts from the full pool. Rotation is per student, held under a '
  'SELECT ... FOR UPDATE row lock, so concurrent tabs resume one attempt '
  'instead of consuming twice. Attempts are PRACTICE-ONLY (Round 48) and are '
  'created with is_rated = false (Round 51).';


-- -----------------------------------------------------------------------------
-- 2) Backfill: history agrees with the rule.
-- -----------------------------------------------------------------------------
update public.test_attempts
   set is_rated = false, updated_at = now()
 where kind = 'olympiad'
   and is_rated = true;

-- =============================================================================
-- Validation (folded into 013 check #85):
--   position('v_duration, false' in
--     pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
--   and not exists (select 1 from public.test_attempts
--                    where kind = 'olympiad' and is_rated = true)
-- =============================================================================
-- End of 2026_07_26_092_olympiad_attempts_unrated.sql
-- =============================================================================
