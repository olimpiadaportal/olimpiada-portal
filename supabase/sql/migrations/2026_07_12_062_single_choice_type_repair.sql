-- =============================================================================
-- 2026_07_12_062_single_choice_type_repair.sql
-- Data repair (found during the Round-20 backport validation): dev's
-- question_types held ONE active row coded 'multiple_choice' (options_required
-- 4) and NO 'single_choice' row — while the admin code and the bulk-import
-- default resolve code='single_choice'. Migration 055's rule update therefore
-- matched nothing on dev (its self-verify compared NULL <> 5, which is not
-- true — sneaky). The canonical 012 seed already produces the correct state on
-- fresh builds; this migration converges EXISTING databases:
--   * if single_choice is missing, the existing MCQ row is RE-CODED to
--     single_choice IN PLACE (id preserved — every questions.type_id FK stays
--     valid) and set to 5 options / 1 correct;
--   * otherwise single_choice is normalized to active/5/1;
--   * every OTHER question type is deactivated (MCQ-only platform, 5 options).
-- Backport: none needed (012 seed already correct). Validation: 013 #49/#63.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

do $$
declare
  v_sc uuid;
  v_mc uuid;
begin
  select id into v_sc from public.question_types where code = 'single_choice';
  select id into v_mc from public.question_types where code = 'multiple_choice';

  if v_sc is null and v_mc is not null then
    update public.question_types
       set code = 'single_choice',
           options_required = 5, correct_required = 1,
           status = 'active', updated_at = now()
     where id = v_mc;
    raise notice 'repair: re-coded the multiple_choice row to single_choice in place (FKs preserved).';
  elsif v_sc is not null then
    update public.question_types
       set options_required = 5, correct_required = 1,
           status = 'active', updated_at = now()
     where id = v_sc
       and (options_required is distinct from 5
         or correct_required is distinct from 1
         or status <> 'active');
    raise notice 'repair: normalized the existing single_choice row to active/5/1.';
  else
    insert into public.question_types (code, name, options_required, correct_required, status)
    values ('single_choice', 'Test (bir düzgün cavab)', 5, 1, 'active');
    raise notice 'repair: inserted the single_choice row (5 options / 1 correct).';
  end if;

  -- MCQ-only platform: no other type may stay active.
  update public.question_types
     set status = 'inactive', updated_at = now()
   where code <> 'single_choice' and status = 'active';
end $$;

-- ---- self-verify (NULL-proof this time) -----------------------------------------
do $$
declare v_req int; v_corr int; v_status text; v_other int;
begin
  select options_required, correct_required, status::text
    into v_req, v_corr, v_status
  from public.question_types where code = 'single_choice';
  if v_req is distinct from 5 or v_corr is distinct from 1 or v_status is distinct from 'active' then
    raise exception 'single_choice not active/5/1 (got %/%/%)', v_req, v_corr, v_status;
  end if;
  select count(*) into v_other
  from public.question_types where code <> 'single_choice' and status = 'active';
  if v_other > 0 then
    raise exception '% non-single_choice type(s) still active', v_other;
  end if;
  raise notice 'single_choice repair self-verify PASS';
end $$;

commit;
