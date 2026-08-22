-- =============================================================================
-- 2026_08_22_131 — A CHILD COULD UNLOCK THEIR OWN PAID ACCESS.
--
-- Found by a documentation-vs-code audit and then CONFIRMED EMPIRICALLY against
-- staging, acting as a real signed-in child (JWT claims set, role authenticated,
-- RLS live):
--
--     access_status:   locked -> active     *** PAYWALL BYPASS ***
--     child_unique_id: WRITABLE by the child
--     grade_id:        WRITABLE by the child
--     points_all_time: refused (already guarded)
--
-- `students_write` is a ROW policy: it lets a child update THEIR OWN ROW, and
-- RLS has no column granularity. So every column on that row was writable with
-- the child's own token — through PostgREST, which Supabase exposes publicly.
-- The exploit is a single PATCH, and the attacker is a teenager who read a
-- tutorial, not a security researcher.
--
-- WHAT EACH ONE COSTS:
--   * access_status  — the paywall. A locked or expired child sets 'active' and
--                      the platform believes them. Payments are OFF today, which
--                      is the only reason this has cost nothing yet.
--   * child_unique_id— the SERVER-ISSUED 8-digit login id, which is unique and
--                      collision-safe precisely because the server issues it.
--                      A child rewriting it can break their own login or collide
--                      with another family's.
--   * grade_id       — decides which olympiad pool an attempt draws from and
--                      which leaderboard bracket the child competes in. Setting
--                      it to an easier grade is undetectable cheating.
--   * school_id / district_id / city_district_id — the leaderboard's school and
--                      rayon context, and the DB guard that keeps the rayon
--                      consistent with the school only fires on what is written.
--   * graduated, created_by_parent_profile_id — promotion state and OWNERSHIP.
--
-- THE FIX EXTENDS THE GUARD THAT ALREADY EXISTS rather than adding a second
-- mechanism. `protect_student_progress_cols()` was written for exactly this
-- reason — its own comment says "students_write is a ROW policy (child/parent
-- can update their own row), so the cached score/streak columns need their own
-- guard" — and it stopped at the score columns. The author had the right idea
-- and drew the line in the wrong place; one list, one trigger, one place to look.
--
-- WHY THIS BREAKS NOTHING. Every legitimate write to these columns goes through
-- the SERVICE-ROLE client, where `current_user` is not 'anon'/'authenticated' and
-- the guard does not fire: parentCore (edit child), childAvatarCore (avatar),
-- subscriptionCore (access_status -> expired), create_child_account,
-- advance_student_grades, recompute_child_access. The ONLY columns a client
-- token writes on students are `palette`, `theme_pref`, `first_name` and
-- `last_name` — verified by reading every `.from("students").update(` call site
-- in web-app/src — and none of them is on the list below.
--
-- NAMES ARE NOT ENOUGH, so the migration ends by re-running the actual attack as
-- a child and asserting it now fails.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

create or replace function public.protect_student_progress_cols()
returns trigger
language plpgsql
as $$
begin
  -- The guard applies to CLIENT TOKENS only. Every legitimate writer of these
  -- columns uses the service-role client and is unaffected.
  if current_user in ('anon', 'authenticated') then
    -- 1. Cached leaderboard/progress columns (original scope, unchanged).
    if (   new.points_all_time  is distinct from old.points_all_time
        or new.points_month     is distinct from old.points_month
        or new.points_month_key is distinct from old.points_month_key
        or new.last_points_at   is distinct from old.last_points_at
        or new.current_streak   is distinct from old.current_streak
        or new.best_streak      is distinct from old.best_streak
        or new.last_active_date is distinct from old.last_active_date
        or new.streak_tz        is distinct from old.streak_tz
        or new.pct_num_month    is distinct from old.pct_num_month
        or new.pct_den_month    is distinct from old.pct_den_month
        or new.pct_num_all      is distinct from old.pct_num_all
        or new.pct_den_all      is distinct from old.pct_den_all
        or new.lb_correct_month is distinct from old.lb_correct_month
        or new.lb_correct_all   is distinct from old.lb_correct_all
        or new.lb_presented_month is distinct from old.lb_presented_month
        or new.lb_presented_all   is distinct from old.lb_presented_all
        or new.lb_attempts_month  is distinct from old.lb_attempts_month
        or new.lb_attempts_all    is distinct from old.lb_attempts_all
    ) then
      raise exception 'students: leaderboard columns are server-managed'
        using errcode = 'check_violation';
    end if;

    -- 2. MIGRATION 131 — ACCESS AND IDENTITY. The paywall, the server-issued
    --    login id, and the ownership/context that decides what a child may see
    --    and whom they compete against.
    if (   new.access_status is distinct from old.access_status
        or new.child_unique_id is distinct from old.child_unique_id
        or new.created_by_parent_profile_id is distinct from old.created_by_parent_profile_id
        or new.graduated is distinct from old.graduated
    ) then
      raise exception 'students: access and identity columns are server-managed'
        using errcode = 'check_violation', hint = 'server_owned_column';
    end if;

    -- 3. MIGRATION 131 — ACADEMIC CONTEXT. A parent changes a child's grade or
    --    school through the Edit-Child action, which runs service-role; nothing
    --    legitimate writes these with a client token.
    if (   new.grade_id is distinct from old.grade_id
        or new.school_id is distinct from old.school_id
        or new.district_id is distinct from old.district_id
        or new.city_district_id is distinct from old.city_district_id
        or new.class_grade is distinct from old.class_grade
        or new.school_name is distinct from old.school_name
        or new.city is distinct from old.city
        or new.birth_year_optional is distinct from old.birth_year_optional
    ) then
      raise exception 'students: academic context is server-managed'
        using errcode = 'check_violation', hint = 'server_owned_column';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_student_progress on public.students;
create trigger trg_protect_student_progress
  before update on public.students
  for each row execute function public.protect_student_progress_cols();

-- -----------------------------------------------------------------------------
-- VERIFICATION — re-run the actual attack, as a child, and require it to fail.
--
-- Asserting on the function TEXT would only prove the words are there. This
-- creates a locked child, becomes them, and tries the paywall bypass.
-- -----------------------------------------------------------------------------
do $$
declare
  v_auth   uuid := gen_random_uuid();
  v_prof   uuid;
  v_state  text;
  v_blocked boolean;
begin
  insert into auth.users (id, email) values (v_auth, 'guard131@olympiq.invalid');
  select id into v_prof from public.profiles where auth_user_id = v_auth;
  if v_prof is null then
    insert into public.profiles (auth_user_id, display_name, status)
    values (v_auth, 'guard131 probe', 'active') returning id into v_prof;
  end if;
  insert into public.students (profile_id, first_name, last_name, access_status)
  values (v_prof, 'Guard', 'Probe', 'locked');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);

  -- THE ATTACK. `set local role` is what makes current_user 'authenticated';
  -- without it we would be testing nothing at all.
  set local role authenticated;

  v_blocked := false;
  begin
    update public.students set access_status = 'active' where profile_id = v_prof;
  exception when check_violation then
    v_blocked := true;
  end;

  reset role;
  select access_status::text into v_state from public.students where profile_id = v_prof;

  if not v_blocked or v_state <> 'locked' then
    raise exception '131: THE PAYWALL BYPASS IS STILL OPEN (blocked=%, status=%)', v_blocked, v_state;
  end if;

  -- And the legitimate write must still work.
  set local role authenticated;
  begin
    update public.students set theme_pref = 'light' where profile_id = v_prof;
  exception when others then
    reset role;
    raise exception '131: the guard also blocked a LEGITIMATE child write (theme_pref): %', sqlerrm;
  end;
  reset role;

  -- Clean up the probe; this migration must leave no rows behind.
  delete from public.students where profile_id = v_prof;
  delete from public.profiles where id = v_prof;
  delete from auth.users where id = v_auth;

  raise notice '131: paywall bypass closed, legitimate writes still work';
end $$;

commit;
