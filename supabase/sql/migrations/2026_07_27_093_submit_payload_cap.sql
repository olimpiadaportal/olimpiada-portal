-- =============================================================================
-- 2026_07_27_093_submit_payload_cap.sql
-- =============================================================================
-- Round 51 follow-up: the SERVER-SIDE ANSWER PAYLOAD CAP silently truncated
-- large olympiad attempts. Raise it from 100 to 1000 in both writer RPCs.
--
-- WHAT WAS WRONG
--   public.submit_test_attempt(uuid, jsonb) and public.save_test_answers(uuid,
--   jsonb) both walk the client payload with:
--
--       v_n := v_n + 1;
--       exit when v_n > 100;   -- payload cap
--
--   `exit` is not an error. The loop simply STOPS after the 100th array
--   element and the function carries on: save reports only what it stored,
--   and submit goes straight to grading FROM THE STORED ROWS. Every answer
--   past item 100 is discarded with a 200 OK and no signal of any kind.
--
--   That cap was written when every attempt was a fixed 25-question draw, so
--   100 was 4x headroom and unreachable. Round 51 made an olympiad package's
--   `questions_per_attempt` an admin-set 1..500 field
--   (olympiad_packages_questions_per_attempt_check, verified live), and a
--   single attempt now legitimately carries up to 500 questions. Dev already
--   has attempts with 50. As soon as a package is set above 100, questions
--   101..500 can NEVER be scored: their test_attempt_answers rows keep
--   selected_option_ids = '{}', they grade as wrong, and max_score still
--   counts them — the child is marked down for answers the server threw away.
--
--   This is the DATABASE half of the "my answers were cleared" bug report.
--   The client halves (a 30-item slice, and an autosave that marks-clean more
--   ids than it sends) are fixed separately in web-app/ and mobile-app/.
--
-- HOW THE THREE CAPS COMPOSE AFTER THIS ROUND
--   The clients now CHUNK instead of truncating: they persist a large payload
--   through save_test_answers in batches of 100 and then submit. That makes
--   this raise belt-and-braces for the autosave path — but it is still
--   LOAD-BEARING for submit, because web-app/src/lib/auth/testActions.ts:240
--   deliberately passes the FULL payload (up to 500 items) to
--   submit_test_attempt after a pre-save that is documented as BEST EFFORT
--   (its errors are swallowed, and save_test_answers has no post-deadline
--   grace while submit has 60s). So in exactly the end-of-a-timed-olympiad
--   case where the pre-save is rejected, the submit merge is the ONLY thing
--   standing between the child and a lost answer sheet — and at a cap of 100
--   it would still drop items 101..500. After this migration it does not.
--
--   Invariant to preserve: DB bound (1000) >= largest single-call client
--   payload (500) >= per-call chunk size (100). The database must never be
--   the tightest of the three, because it is the only one whose truncation
--   is completely silent.
--
-- WHAT THIS MIGRATION DOES
--   Patches BOTH functions from their OWN LIVE pg_get_functiondef() output
--   with a single-line string replacement — the same in-place idiom as
--   migrations 088/089/090/092. The several-hundred lines of grading,
--   snapshot and daily-round logic are never retyped, so there is no
--   reconstruction risk. Nothing else about either function changes.
--
--       exit when v_n > 100;   ->   exit when v_n > 1000;
--
-- WHY 1000 AND NOT 500
--   The counter increments for EVERY array element, including the ones the
--   loop then skips (a null/blank question_id, or a duplicate caught by
--   v_seen). A cap of exactly 500 would therefore still truncate a legitimate
--   500-question attempt whenever the client repeats a single id — which the
--   autosave dirty-set path can do. 1000 = 2x the Round-51 ceiling, so every
--   lawful payload fits with full headroom while the loop stays HARD BOUNDED:
--   an abusive body can never make the function do unbounded work, and each
--   iteration is still one indexed UPDATE on (attempt_id, question_id) that
--   no-ops for any question outside the attempt.
--
--   The bound is deliberately kept as a plain constant rather than derived
--   from cardinality(question_ids): it must hold even for a malformed or
--   hostile payload sent against a tiny attempt.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It does not change the deadline + 60s merge window, the idempotent
--   already-graded early return, grading, ownership checks, grants, ACLs,
--   SECURITY DEFINER or search_path. Truncation is the only behaviour fixed.
--
-- Rerun-safe: yes (the patch detects the already-raised text and no-ops; it
--   refuses loudly if the live body does not match what it expects).
-- Destructive change: no (raises a ceiling; no schema, data or grant change,
--   and no previously-accepted payload changes meaning).
-- Environment first applied: development
-- Related root SQL file(s):
--   supabase/sql/011_indexes_constraints_functions_triggers.sql
--     line 3970 (save_test_answers)  and  line 4055 (submit_test_attempt)
--   supabase/sql/013_validation_queries.sql (add check #87 — see footer)
-- Backport status: pending
-- Rollback notes: fully reversible — re-run this file with 1000 and 100
--   swapped, or CREATE OR REPLACE both functions from the canonical 011
--   definitions. No data is written, so nothing needs undoing; attempts
--   graded under the raised cap simply have more of their answers stored.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Raise the payload cap in both writer RPCs, in place.
-- -----------------------------------------------------------------------------
-- The two live bodies differ in indentation and in whether the line carries a
-- trailing comment, so each target gets its own exact old/new pair rather than
-- a loose regexp. An exact full-line match (leading and trailing newline
-- included) guarantees the replacement can only ever hit the cap line.
do $patch$
declare
  v_i       int;
  v_fn      text;
  v_def     text;
  v_targets constant text[] := array[
    'public.submit_test_attempt(uuid,jsonb)',
    'public.save_test_answers(uuid,jsonb)'
  ];
  v_old     constant text[] := array[
    E'\n      exit when v_n > 100;\n',
    E'\n    exit when v_n > 100;  -- payload cap\n'
  ];
  v_new     constant text[] := array[
    E'\n      exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)\n',
    E'\n    exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)\n'
  ];
begin
  for v_i in 1 .. array_length(v_targets, 1) loop
    v_fn := v_targets[v_i];

    if to_regprocedure(v_fn) is null then
      raise exception '% is not present — refusing to patch a database that does not match', v_fn;
    end if;

    v_def := pg_get_functiondef(v_fn::regprocedure);

    if position(v_new[v_i] in v_def) > 0 then
      raise notice 'already raised, skipping: %', v_fn;
      continue;
    end if;

    if position(v_old[v_i] in v_def) = 0 then
      raise exception '%: the expected payload-cap line was not found — review the live body before patching', v_fn;
    end if;

    v_def := replace(v_def, v_old[v_i], v_new[v_i]);

    -- Belt and braces: never execute a definition that still carries the old cap.
    if position(E'v_n > 100;' in v_def) > 0 then
      raise exception '%: old cap survived the replacement — aborting', v_fn;
    end if;

    execute v_def;   -- CREATE OR REPLACE: owner, grants and comments are preserved
    raise notice 'payload cap raised 100 -> 1000: %', v_fn;
  end loop;
end
$patch$;


-- -----------------------------------------------------------------------------
-- 2) Document the bound where the next reader will look for it.
-- -----------------------------------------------------------------------------
comment on function public.submit_test_attempt(uuid, jsonb) is
  'Grades an attempt FROM THE STORED answer rows after optionally merging a '
  'final client payload (only within deadline + 60s). Idempotent: an '
  'already-graded attempt returns its stored result without re-merging. The '
  'payload is walked with a hard bound of 1000 array elements (Round 51: 2x '
  'the 500-question questions_per_attempt ceiling) — raised from 100, which '
  'silently truncated large olympiad attempts. Keep this bound >= the '
  'olympiad_packages.questions_per_attempt ceiling and >= the client-side cap '
  'in web-app and mobile-app, or the lowest of the three truncates.';

comment on function public.save_test_answers(uuid, jsonb) is
  'Autosave for an in-progress, in-deadline attempt; returns the number of '
  'answer rows written plus remaining_seconds. The payload is walked with a '
  'hard bound of 1000 array elements (Round 51: 2x the 500-question '
  'questions_per_attempt ceiling) — raised from 100, which silently discarded '
  'autosaved answers past item 100. Keep this bound in lockstep with '
  'submit_test_attempt and with the client-side caps.';


-- =============================================================================
-- Validation — add to supabase/sql/013_validation_queries.sql as check #87
-- (the main session backports; this migration does not edit canonical files):
--
--   -- 87) Round 51 (migration 093): the server-side answer PAYLOAD CAP clears
--   --     the 500-question questions_per_attempt ceiling in BOTH writer RPCs,
--   --     and the old 100 cap is gone from both.
--   select '87_answer_payload_cap' as check_name,
--          case when position('v_n > 1000;' in
--                    pg_get_functiondef('public.submit_test_attempt(uuid,jsonb)'::regprocedure)) > 0
--                and position('v_n > 1000;' in
--                    pg_get_functiondef('public.save_test_answers(uuid,jsonb)'::regprocedure)) > 0
--                and position('v_n > 100;' in
--                    pg_get_functiondef('public.submit_test_attempt(uuid,jsonb)'::regprocedure)) = 0
--                and position('v_n > 100;' in
--                    pg_get_functiondef('public.save_test_answers(uuid,jsonb)'::regprocedure)) = 0
--               then 'PASS' else 'FAIL' end as status;
--
-- Proven in dev inside a rolled-back transaction (2026-07-27):
--   * a 500-item submit payload merges all 500 rows and grades 500/500;
--   * a payload whose first 1000 elements are junk stores 0 real answers, and
--     one whose first 999 are junk stores exactly 1 — the bound is exactly
--     1000 elements, off-by-one verified;
--   * an already-graded attempt is still idempotent: a second submit carrying
--     an all-empty payload returns the stored result and wipes nothing.
-- =============================================================================
-- End of 2026_07_27_093_submit_payload_cap.sql
-- =============================================================================
