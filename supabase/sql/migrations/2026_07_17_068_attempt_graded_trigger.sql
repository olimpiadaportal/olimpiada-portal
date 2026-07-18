-- ============================================================================
-- Migration: 2026_07_17_068_attempt_graded_trigger.sql
-- Purpose: the "attempt graded" notification was produced ONLY by the web
-- server action (web-app testActions.ts → notifyAttemptGraded), so attempts
-- submitted through any other path — the mobile app calling submit_test_attempt
-- directly, the result page's idempotent submit that actually grades an
-- expired-deadline attempt, or the legacy grade_practice_attempt — never
-- notified. Move the producer INTO the database: a trigger on test_attempts
-- fires on the -> 'graded' transition and writes the notification itself, so
-- EVERY grading path notifies exactly once.
--
-- Web-emitter parity (the contract this trigger mirrors EXACTLY):
--   * recipient   = the attempt's student_profile_id (identical to the web:
--                   submit_test_attempt enforces owner = session profile);
--   * type        = 'attempt_graded', category = 'progress', priority = 5,
--                   channels = {in_app};
--   * title/body  = fixed az copy 'Nəticə hazırdır' /
--                   'Sınağın qiymətləndirildi: <score>/<max>.' (the web stored
--                   az product-default copy, structured values in data_json for
--                   any future locale-aware re-render — same here);
--   * data_json   = {attempt_id, score, max} (numbers, JS-identical via
--                   trim_scale so numeric(8,2) 20.00 renders 20 like Number());
--   * action_url  = '/child/test/result/<attemptId>';
--   * idempotency = 'attempt:<attemptId>' — IDENTICAL to the web key, so
--                   during rollout web + trigger can never double-insert
--                   (create_notification is ON CONFLICT DO NOTHING on the key);
--   * condition   = the web notified on every successful submit with finite
--                   score/max, for ALL attempt kinds the shared player submits
--                   (topic tests, rated daily rounds, untimed replays,
--                   olympiads — submitTest is kind-agnostic). Mirrored: fire on
--                   every -> 'graded' transition with score/max present.
-- Failure-safe: a notification failure must NEVER abort grading (same posture
-- as trg_award_points_on_graded — swallow with a WARNING).
--
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/011_indexes_constraints_functions_triggers.sql
-- Backport status: completed (011 + new 013 check #69)
-- Destructive change: no
-- Rollback notes: drop trigger trg_notify_attempt_graded on public.test_attempts
--                 and function public.notify_attempt_graded_tg(); re-enable the
--                 web emitter call in testActions.ts if rolled back.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Trigger function — DEFINER (notifications insert path is service-only),
--    search_path pinned, exception-swallowing so grading always commits.
-- ----------------------------------------------------------------------------
create or replace function public.notify_attempt_graded_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Web-emitter parity: it only fired when submit returned finite score/max
  -- (grading always sets both in the same UPDATE that flips status; belt and
  -- braces for any exotic path that grades without a score).
  if new.score is null or new.max_score is null then
    return new;
  end if;
  begin
    perform public.create_notification(
      new.student_profile_id,
      'attempt_graded',
      'Nəticə hazırdır',
      'Sınağın qiymətləndirildi: ' || trim_scale(new.score)::text
        || '/' || trim_scale(new.max_score)::text || '.',
      jsonb_build_object(
        'attempt_id', new.id,
        'score', trim_scale(new.score),
        'max', trim_scale(new.max_score)),
      '{in_app}',
      'attempt:' || new.id::text,     -- EXACT web key format: attempt:<attemptId>
      5,
      '/child/test/result/' || new.id::text,
      'progress',
      null);
  exception when others then
    -- The inbox write must never break grading (mirrors award_attempt_points_tg).
    raise warning 'notify_attempt_graded failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
comment on function public.notify_attempt_graded_tg() is
  'DB producer of the attempt_graded notification (migration 068): fires on the '
  '-> graded transition for EVERY grading path (web action, mobile RPC, legacy '
  'practice). Same idempotency key (attempt:<id>) the retired web emitter used, '
  'so a duplicate producer can never double-insert. Failure-safe: warnings only.';

drop trigger if exists trg_notify_attempt_graded on public.test_attempts;
create trigger trg_notify_attempt_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_attempt_graded_tg();

-- ----------------------------------------------------------------------------
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def     text;
  v_student uuid;
  v_att     uuid;
  v_n       record;
begin
  -- 1) Trigger attached to the right table + event, referencing the function.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notify_attempt_graded'
      and tgrelid = 'public.test_attempts'::regclass
      and tgfoid = 'public.notify_attempt_graded_tg()'::regprocedure
  ) then
    raise exception 'trg_notify_attempt_graded missing on public.test_attempts';
  end if;

  -- 2) Definition-level parity markers (idempotency key, type, url, category).
  v_def := pg_get_functiondef('public.notify_attempt_graded_tg()'::regprocedure);
  if position('''attempt:'' || new.id::text' in v_def) = 0
     or position('attempt_graded' in v_def) = 0
     or position('/child/test/result/' in v_def) = 0
     or position('progress' in v_def) = 0
     or position('create_notification' in v_def) = 0 then
    raise exception 'notify_attempt_graded_tg definition lacks web-parity markers';
  end if;

  -- 3) Functional smoke: grade a throwaway attempt for an existing student and
  --    assert the notification row, then unwind everything via the implicit
  --    savepoint of a raised exception. Skipped when no student exists (e.g.
  --    a from-zero environment before any accounts).
  select st.profile_id into v_student
  from public.students st
  where coalesce((select np.in_app_enabled from public.notification_preferences np
                  where np.profile_id = st.profile_id), true)
  limit 1;
  if v_student is null then
    raise notice 'attempt-graded smoke SKIPPED (no student rows in this environment).';
  else
    begin
      insert into public.test_attempts (student_profile_id, kind, status)
      values (v_student, 'test', 'in_progress')
      returning id into v_att;

      update public.test_attempts
         set status = 'graded', score = 1, max_score = 2,
             submitted_at = now(), graded_at = now(), updated_at = now()
       where id = v_att;

      select recipient_profile_id, type, title, body, priority,
             action_url, category, data_json
        into v_n
      from public.notifications
      where idempotency_key = 'attempt:' || v_att::text;

      if v_n.recipient_profile_id is null then
        raise exception 'smoke: graded transition produced no notification row';
      end if;
      if v_n.recipient_profile_id <> v_student
         or v_n.type <> 'attempt_graded'
         or v_n.title <> 'Nəticə hazırdır'
         or v_n.body <> 'Sınağın qiymətləndirildi: 1/2.'
         or v_n.priority <> 5
         or v_n.action_url <> '/child/test/result/' || v_att::text
         or v_n.category <> 'progress'
         or (v_n.data_json ->> 'attempt_id') <> v_att::text
         or (v_n.data_json ->> 'score') <> '1'
         or (v_n.data_json ->> 'max') <> '2' then
        raise exception 'smoke: notification row does not match the web emitter contract (%).', v_n;
      end if;

      -- Unwind the smoke rows (attempt + notification + any award side rows).
      raise exception 'SMOKE_ROLLBACK';
    exception when others then
      if sqlerrm <> 'SMOKE_ROLLBACK' then raise; end if;
    end;

    -- The implicit savepoint must have removed the smoke rows.
    if exists (select 1 from public.test_attempts where id = v_att)
       or exists (select 1 from public.notifications where idempotency_key = 'attempt:' || v_att::text) then
      raise exception 'smoke: rollback failed to unwind the fake attempt';
    end if;
    raise notice 'attempt-graded functional smoke PASS (rows unwound).';
  end if;

  raise notice 'attempt-graded trigger self-verify PASS.';
end $$;

commit;
