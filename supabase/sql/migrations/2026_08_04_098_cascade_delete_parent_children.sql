-- 098 — Deleting a parent must not leave orphaned children
--
-- THE BUG
-- -------
-- The FK graph cascades everything EXCEPT the child itself:
--
--     auth.users (parent)  --CASCADE-->  profiles (parent)
--       profiles           --CASCADE-->  parents
--         parents          --CASCADE-->  parent_student_links   (the link dies)
--       students.created_by_parent_profile_id  --SET NULL-->    (the child LIVES)
--
-- So the student's own `profiles` row, `students` row, `child_credentials` and
-- `auth.users` all survive, with no link to anyone. The account is invisible to
-- every parent surface and every admin list that joins through a parent — and
-- it can still sign in, because `child_credentials` is intact.
--
-- Verified on the live database before writing this: BOTH existing students were
-- already in exactly that state (`created_by_parent_profile_id is null`, no row
-- in `parent_student_links`).
--
-- WHY APPLICATION CODE WAS NOT ENOUGH
-- -----------------------------------
-- Both delete paths (admin panel `deleteParent`, web self-serve
-- `deleteParentAccountCore`) already delete children first. They are correct and
-- stay. They simply are not the only way a parent gets deleted: the Supabase
-- dashboard, a psql session, or any future code path all bypass them. A rule
-- that "orphans cannot remain" has to live where deletion actually happens.
--
-- SHARED CHILDREN ARE NOT DELETED
-- -------------------------------
-- `parent_student_links` is many-to-many. A child linked to a second parent is
-- KEPT and merely unlinked from the departing one — deleting a live account
-- because a co-parent left would be far worse than the orphan this fixes.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- 1. The cascade.
--
-- BEFORE DELETE, not AFTER: `parent_student_links` is itself cascaded away by
-- the `parents` delete, so an AFTER trigger would run with the evidence already
-- gone and could only see children found via `created_by_parent_profile_id`.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cascade_delete_parent_children()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_children uuid[];
begin
  -- Children of THIS parent, by either route: the creator column and the link
  -- table. The two can legitimately disagree (a link can be added later, a
  -- creator can be nulled), so the union is what "this parent's children" means.
  select coalesce(array_agg(distinct child), '{}')
    into v_children
  from (
    select s.profile_id as child
      from public.students s
     where s.created_by_parent_profile_id = old.profile_id
    union
    select l.student_profile_id
      from public.parent_student_links l
     where l.parent_profile_id = old.profile_id
  ) q
  -- Never touch a child that another parent still has. `l.parent_profile_id <>
  -- old.profile_id` is what makes this "no OTHER parent", not "no parent".
  where not exists (
    select 1
      from public.parent_student_links l2
     where l2.student_profile_id = q.child
       and l2.parent_profile_id <> old.profile_id
  )
  -- Paranoia: a parent is never their own child, but a self-referential row
  -- would recurse this trigger into the same DELETE. Cheap to exclude.
  and q.child <> old.profile_id;

  if array_length(v_children, 1) is null then
    return old;
  end if;

  -- Preferred: delete the child's AUTH user, which cascades profiles ->
  -- students -> child_credentials -> links in one step and leaves nothing
  -- behind in auth.users either.
  --
  -- Best-effort on purpose. This function is SECURITY DEFINER, but if the owning
  -- role ever loses rights on auth.users, an exception here would abort the
  -- parent's deletion entirely — turning a cleanup into an outage. The
  -- public-schema delete below is the guarantee; this is the tidier path.
  begin
    delete from auth.users u
     where u.id in (
       select p.auth_user_id
         from public.profiles p
        where p.id = any(v_children)
          and p.auth_user_id is not null
     );
  exception
    when insufficient_privilege or undefined_table then
      null;
  end;

  -- The guarantee. Covers children with no auth user at all (half-finished
  -- provisioning) and the case above having been skipped. profiles -> students
  -- -> child_credentials -> parent_student_links all cascade from here.
  delete from public.profiles p where p.id = any(v_children);

  return old;
end;
$fn$;

comment on function public.fn_cascade_delete_parent_children() is
  'Migration 098: deletes a departing parent''s children (profiles + auth users) '
  'so no orphan child account survives, whatever route deleted the parent. '
  'Children still linked to another parent are kept.';

drop trigger if exists trg_parents_cascade_children on public.parents;
create trigger trg_parents_cascade_children
  before delete on public.parents
  for each row
  execute function public.fn_cascade_delete_parent_children();

-- -----------------------------------------------------------------------------
-- 2. Clean up the orphans the old behaviour already created.
--
-- Scope is deliberately narrow: a student with NO creator AND NO parent link is
-- unreachable by construction — no parent surface can list it, no admin screen
-- can reach it through a parent, and nobody can be its owner. It is not "a
-- student we might reattach later"; it is unreferenced.
--
-- Non-destructive to anything else: purchases, attempts and payments belonging
-- to a real family are reachable through a live parent and therefore out of
-- scope by definition.
-- -----------------------------------------------------------------------------
do $cleanup$
declare
  v_orphans uuid[];
  v_n int;
begin
  select coalesce(array_agg(s.profile_id), '{}')
    into v_orphans
  from public.students s
  where s.created_by_parent_profile_id is null
    and not exists (
      select 1 from public.parent_student_links l
       where l.student_profile_id = s.profile_id
    );

  v_n := coalesce(array_length(v_orphans, 1), 0);
  if v_n = 0 then
    raise notice '098: no orphaned students to clean';
    return;
  end if;

  begin
    delete from auth.users u
     where u.id in (
       select p.auth_user_id from public.profiles p
        where p.id = any(v_orphans) and p.auth_user_id is not null
     );
  exception
    when insufficient_privilege or undefined_table then null;
  end;

  delete from public.profiles p where p.id = any(v_orphans);

  raise notice '098: cleaned % orphaned student account(s)', v_n;
end
$cleanup$;

-- -----------------------------------------------------------------------------
-- 3. Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_orphans int;
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_parents_cascade_children'
       and tgrelid = 'public.parents'::regclass
       and not tgisinternal
  ) then
    raise exception '098: trigger trg_parents_cascade_children is not armed';
  end if;

  select count(*) into v_orphans
  from public.students s
  where s.created_by_parent_profile_id is null
    and not exists (
      select 1 from public.parent_student_links l
       where l.student_profile_id = s.profile_id
    );
  if v_orphans <> 0 then
    raise exception '098: % orphaned student(s) still present', v_orphans;
  end if;

  raise notice '098 OK — cascade trigger armed, zero orphaned students remain';
end
$verify$;

commit;
