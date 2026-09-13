-- Migration: 2026_09_11_174_shared_child_deletion_safety.sql
-- Purpose: make it SAFE for a child to have more than one adult on the account,
--          BEFORE any second link can be minted. Three deletion paths and one
--          raw-PostgREST hole currently destroy a shared child, and a departing
--          creator currently nulls the ownership that makes a child purchasable.
-- Environment first applied: staging and production, 2026-09-12.
-- Related root SQL file(s): 007_subscriptions_payments_coupons.sql,
--   011_indexes_constraints_functions_triggers.sql, 013_validation_queries.sql
-- Backport status: completed (007 four FK declarations, 011 functions/triggers,
--   013 checks 130 + 131 -- same round)
-- Destructive change: NO ROWS ARE DELETED OR REWRITTEN. Four foreign keys change
--   action (cascade -> set null) and four columns lose NOT NULL. Nothing is read
--   into or out of a table.
-- Rollback notes: see the DOWN block at the foot of this file. HONEST LIMIT,
--   stated rather than implied: the FK change is reversible in SHAPE but NOT IN
--   DATA. Once a parent has actually been deleted, the four owner columns hold
--   NULLs that a re-applied NOT NULL cannot accept, and the rows those NULLs
--   replaced would previously have been CASCADE-DELETED -- so "rolling back"
--   after a real deletion means deciding what to do with financial history that
--   only exists because this migration ran. Roll the FKs back before a parent is
--   deleted, or not at all.
-- =============================================================================
-- 2026_09_11_174 -- A SECOND ADULT IS UNSAFE TO MINT UNTIL THIS LANDS.
--
-- THE SHAPE OF THE PROBLEM. `parent_student_links` is already a many-to-many
-- table and the schema has always permitted two rows for one child. Nothing has
-- ever created the second one, so every deletion path in this codebase was
-- written against an assumption the schema does not enforce: that a child has
-- exactly one adult, and that adult's departure is the child's departure.
--
-- FOUR SEPARATE WAYS THAT ASSUMPTION KILLS A SHARED CHILD:
--
--   (a) web-app/src/lib/auth/parentCore.ts deleteParentAccountCore deleted the
--       CHILD auth users FIRST and the parent LAST. The protective BEFORE DELETE
--       trigger on public.parents therefore fired on an EMPTY set -- every child
--       was already gone by the time the rule that protects shared children got
--       to run. The trigger was not bypassed; it was starved.
--
--   (b) admin-panel/src/lib/admin/accounts.ts deleteParent did the same thing,
--       in the same order, for the same reason.
--
--   (c) THE RAW HOLE, and the one no application fix can close. `students_write`
--       (010) is FOR ALL -- which includes DELETE -- scoped to
--       created_by_parent_profile_id; `authenticated` holds the table grant; and
--       there was NO BEFORE DELETE trigger on public.students at all. A creating
--       parent could therefore `DELETE FROM students` with their own JWT and
--       destroy a child a second adult still depends on, bypassing every code
--       path and every trigger in this file. The same call is ALREADY wrong for
--       an unshared child: deleting the students row leaves profiles and
--       auth.users untouched, which is precisely the stranded
--       c<8-digit-id>@children.invalid login migration 167 exists to prevent.
--
--   (d) THE QUIET ONE. `students.created_by_parent_profile_id` is ON DELETE SET
--       NULL (002:132). When the creator leaves a child who survives, that column
--       goes NULL -- and NULL is not a co-parent, it is nobody. Every purchase
--       surface keys off it, so the surviving family keeps their child and loses
--       the ability to ever pay for them again. Worse, `child_subscriptions`
--       .owner_parent_profile_id was NOT NULL ON DELETE CASCADE, so the live
--       subscription row itself -- and the sibling_discounts and
--       subscription_changes rows hanging off it -- were deleted outright.
--
-- WHAT THIS MIGRATION INSTALLS, in the order the file applies it:
--
--   1. public.parent_claimed_children(parent) -- every child this parent has a
--      claim on (they created it, OR they hold an ACTIVE link to it).
--   2. public.parent_children_to_delete(parent) -- the claimed children with no
--      OTHER active link. ONE definition of "which children die with this
--      parent", so the trigger and all three application paths cannot disagree.
--      They cannot disagree because they now all read THIS FUNCTION.
--   3. public.promote_surviving_co_parent(parent) -- for every claimed child who
--      SURVIVES, hand the account to the longest-standing surviving co-parent:
--      students.created_by_parent_profile_id and any child_subscriptions the
--      departing parent owned. This is (d)'s fix and it must run BEFORE the
--      parent row disappears, which is why it lives in a BEFORE DELETE trigger.
--   4. fn_cascade_delete_parent_children rewritten to call 2 and 3.
--   5. trg_student_shared_delete_guard -- BEFORE DELETE on public.students,
--      closing (c).
--   6. checkout_sessions / sibling_discounts / free_trials / iap_purchase_intents
--      owner FKs moved to nullable ON DELETE SET NULL, so a parent's departure
--      stops destroying the record of money that was taken.
--
-- WHY 'active' AND NOT "any link". The old cascade trigger kept a child alive if
-- ANY other link row existed, whatever its status. Under the invite flow being
-- built that is a trap: a PENDING invite confers nothing -- is_parent_linked_to_
-- student() (002) requires status = 'active', and so does every one of the ~20
-- SELECT policies that read it -- so a child kept alive by a pending link that is
-- never approved is exactly the orphaned, still-loginable account migration 098
-- was written to abolish. The rule here is ACTIVE links only, in all three
-- functions and in the students guard, so "who keeps the child alive" and "who
-- can see the child" are the same set.
--
-- WHY SECURITY DEFINER ON THE STUDENTS GUARD, AND WHY IT IS NOT DECORATION.
-- The guard counts rows in parent_student_links. Under a client token that count
-- is RLS-FILTERED (psl_select shows a parent only their OWN links), so an
-- invoker-rights guard would count 1 for a child with four adults and wave the
-- delete through -- an under-count is the exact failure the guard exists to
-- prevent. SECURITY DEFINER makes the count the true one. The cost is that
-- current_user inside the function is the OWNER, not the caller, so the
-- "no client token may delete a students row at all" half of the guard cannot
-- use current_user the way protect_student_progress_cols (011) does. It uses
-- auth.uid() instead: a user-scoped JWT always carries `sub`, the service-role
-- key's JWT does not, and GoTrue's own connection sets no request.jwt.claims at
-- all -- so `auth.uid() is not null` is precisely "a person's token issued this".
--
-- SAFE TO RE-RUN. Every statement is create-or-replace, drop-then-create, or
-- guarded by a catalogue lookup. No data is read, written or deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. parent_claimed_children -- every child this parent has a claim on.
--
-- The union is deliberately wider than "children I created": a co-parent holds
-- an active link and no authorship, and the deletion rules must see them too.
-- `c.child <> p_parent` is inherited from the 098 original: a profile can in
-- principle appear in both roles, and a self-reference would make a parent their
-- own child in the delete set.
-- -----------------------------------------------------------------------------
create or replace function public.parent_claimed_children(p_parent uuid)
returns table (child_profile_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct c.child
    from (
      select s.profile_id as child
        from public.students s
       where s.created_by_parent_profile_id = p_parent
      union
      select l.student_profile_id as child
        from public.parent_student_links l
       where l.parent_profile_id = p_parent
         and l.status = 'active'
    ) c
   where c.child is not null
     and c.child <> p_parent;
$$;

comment on function public.parent_claimed_children(uuid) is
  'Migration 174: every child a parent has a claim on -- they created it OR they '
  'hold an ACTIVE parent_student_links row for it. The input set for '
  'parent_children_to_delete and promote_surviving_co_parent; never a decision '
  'on its own.';

-- -----------------------------------------------------------------------------
-- 2. parent_children_to_delete -- THE one rule. A claimed child dies with this
--    parent only if no OTHER adult holds an active link to them.
--
-- Everything that deletes a parent reads this: fn_cascade_delete_parent_children
-- below, deleteParentAccountCore (web), deleteParent (admin panel). They used to
-- each carry their own `created_by_parent_profile_id = ?` query, which is how
-- (a) and (b) became possible to write without anyone noticing.
-- -----------------------------------------------------------------------------
create or replace function public.parent_children_to_delete(p_parent uuid)
returns table (child_profile_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.child_profile_id
    from public.parent_claimed_children(p_parent) as c
   where not exists (
     select 1
       from public.parent_student_links l2
      where l2.student_profile_id = c.child_profile_id
        and l2.parent_profile_id <> p_parent
        and l2.status = 'active'
   );
$$;

comment on function public.parent_children_to_delete(uuid) is
  'Migration 174: the children that must be deleted along with this parent -- '
  'claimed by them and held by nobody else (no OTHER ACTIVE link). The single '
  'definition read by the parents BEFORE DELETE trigger and by both application '
  'deletion paths, so the three can no longer disagree about who dies.';

-- -----------------------------------------------------------------------------
-- 3. promote_surviving_co_parent -- the departing creator hands the account on.
--
-- The owner's rule: the CREATOR stays the financial owner permanently, with ONE
-- automatic exception -- if the creator deletes their account and a co-parent
-- survives, the LONGEST-STANDING active link is promoted to creator. That is
-- `order by l.created_at asc`; `l.id asc` is only a determinism tie-break for
-- two links written in the same transaction.
--
-- TWO COLUMNS MOVE, AND BOTH HAVE TO.
--   students.created_by_parent_profile_id -- ON DELETE SET NULL, so without this
--     the surviving family keeps a child nobody owns and nobody can buy for.
--   child_subscriptions.owner_parent_profile_id -- NOT NULL ON DELETE CASCADE,
--     so without this the child's live subscription row is DELETED outright,
--     taking its subscription_changes and sibling_discounts with it. This column
--     is deliberately NOT moved to SET NULL like the four history tables below:
--     a subscription is an ACCESS record for a child who still exists and still
--     needs it, not a receipt, and a NULL owner would be a subscription no
--     surface can renew, change or cancel. It must be handed to a real person.
--
-- ALL of the child's subscription rows move, not only the live one. A cancelled
-- row left behind would be CASCADE-DELETED seconds later by the very delete this
-- function is running ahead of, taking the change history with it -- and for a
-- child who is still here, keeping that history under the new owner is strictly
-- better than deleting it to preserve a tidier record of who once paid.
--
-- The students UPDATE cannot trip trg_protect_student_progress (011): that guard
-- only refuses when current_user is anon/authenticated, and inside this
-- SECURITY DEFINER function current_user is the owner. It cannot trip
-- trg_student_district_guard either -- that trigger is UPDATE OF
-- city_district_id, school_id, district_id, none of which this touches.
-- -----------------------------------------------------------------------------
-- Migration 174: financial ownership changes update FUTURE quotes/invoices only.
-- Past payments, signed checkout intents and subscription_changes are immutable.
create or replace function public.sibling_rank(p_owner uuid, p_student uuid)
returns integer language sql stable security definer set search_path = public, pg_temp
as $fn$
  select (count(distinct cs.student_profile_id) + 1)::integer
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = p_owner
    and cs.student_profile_id <> p_student
    and cs.status in ('trialing', 'active', 'past_due');
$fn$;
create or replace function public.sibling_discount_percent(p_rank integer)
returns numeric language sql immutable set search_path = public, pg_temp
as $fn$ select case when p_rank <= 1 then 0 when p_rank = 2 then 10 else 15 end::numeric; $fn$;
revoke all on function public.sibling_rank(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sibling_rank(uuid,uuid) to service_role;
revoke all on function public.sibling_discount_percent(integer) from public, anon, authenticated;
grant execute on function public.sibling_discount_percent(integer) to service_role;

create or replace function public.refresh_household_sibling_discounts(p_owner uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare r record; v_pct numeric;
begin
  for r in select cs.id, cs.student_profile_id, cs.sibling_discount_percent
    from public.child_subscriptions cs
    where cs.owner_parent_profile_id = p_owner
      and cs.status in ('trialing', 'active', 'past_due')
    order by cs.id for update
  loop
    v_pct := public.sibling_discount_percent(public.sibling_rank(p_owner,r.student_profile_id));
    if v_pct is distinct from r.sibling_discount_percent then
      update public.child_subscriptions set sibling_discount_percent=v_pct, updated_at=now()
        where id=r.id;
      -- The existing period trigger remains the sole writer of invoice totals.
      update public.subscription_subjects set currency=currency where child_subscription_id=r.id;
      insert into public.audit_logs(action,target_table,target_id,before_json,after_json)
      values('child.sharing.discount_recomputed','child_subscriptions',r.id,
        jsonb_build_object('discount_percent',r.sibling_discount_percent),
        jsonb_build_object('discount_percent',v_pct));
    end if;
  end loop;
end;
$fn$;
revoke all on function public.refresh_household_sibling_discounts(uuid) from public, anon, authenticated;
grant execute on function public.refresh_household_sibling_discounts(uuid) to service_role;

create or replace function public.promote_surviving_co_parent(p_parent uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_child uuid;
  v_heir  uuid;
  v_count integer := 0;
  v_heirs uuid[] := array[]::uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('olympiq-child-links',0));
  if p_parent is null then
    return 0;
  end if;

  -- SURVIVORS = CLAIMED minus TO-DELETE, derived from the two functions above
  -- rather than re-stated. A second copy of the predicate here is exactly how
  -- the trigger and the app paths drifted apart in the first place.
  for v_child in
    select c.child_profile_id from public.parent_claimed_children(p_parent) as c
    except
    select d.child_profile_id from public.parent_children_to_delete(p_parent) as d
  loop
    v_heir := null;

    select l.parent_profile_id
      into v_heir
      from public.parent_student_links l
     where l.student_profile_id = v_child
       and l.parent_profile_id <> p_parent
       and l.status = 'active'
     order by l.created_at asc, l.id asc
     limit 1;

    -- Unreachable by construction (a survivor is a child with another active
    -- link, which is what this query looks for), so a NULL here means the set
    -- moved under us. Skipping is the only safe answer: writing NULL into
    -- created_by_parent_profile_id is the very outcome this function prevents.
    if v_heir is null then
      continue;
    end if;

    update public.students s
       set created_by_parent_profile_id = v_heir,
           updated_at = now()
     where s.profile_id = v_child
       and s.created_by_parent_profile_id is distinct from v_heir;

    update public.child_subscriptions cs
       set owner_parent_profile_id = v_heir,
           updated_at = now()
     where cs.student_profile_id = v_child
       and cs.owner_parent_profile_id = p_parent;

    v_heirs := array_append(v_heirs,v_heir);
    insert into public.audit_logs(action,target_table,target_id,before_json,after_json)
    values('child.sharing.creator_promoted','students',v_child,
      jsonb_build_object('creator',p_parent),jsonb_build_object('creator',v_heir));
    v_count := v_count + 1;
  end loop;

  -- Recompute after ALL children moved, so no household sees an intermediate tier.
  perform public.refresh_household_sibling_discounts(p_parent);
  for v_heir in select distinct x from unnest(v_heirs) x order by x loop
    perform public.refresh_household_sibling_discounts(v_heir);
  end loop;
  return v_count;
end;
$fn$;

comment on function public.promote_surviving_co_parent(uuid) is
  'Migration 174: before a parent row disappears, hands every SURVIVING claimed '
  'child to the longest-standing other active link -- students.'
  'created_by_parent_profile_id and any child_subscriptions the departing parent '
  'owned. Without it created_by goes NULL (ON DELETE SET NULL) and the shared '
  'child becomes permanently unpurchasable, while the live subscription row is '
  'CASCADE-DELETED. Returns the number of children promoted.';

-- -----------------------------------------------------------------------------
-- 4. fn_cascade_delete_parent_children -- 098 + 167, now reading the shared rule
--    and promoting first.
--
-- WHAT CHANGED FROM 167, and nothing else did:
--   * the inlined "which children die" query is replaced by
--     public.parent_children_to_delete(old.profile_id);
--   * public.promote_surviving_co_parent(old.profile_id) runs before any delete.
--
-- ORDER, deliberately. The delete set is computed FIRST, from the pre-promotion
-- state, so it is the same set the application paths read a moment earlier over
-- PostgREST; promotion runs SECOND, and touches only children that are NOT in
-- that set; the deletes run LAST. The two sets are disjoint by construction, so
-- the order cannot change the outcome -- it is fixed anyway, because a reader
-- comparing this trigger against the app paths should not have to prove that.
--
-- STILL BEFORE DELETE, not AFTER: the link rows are cascaded away by this very
-- delete, so an AFTER trigger would run with the evidence already gone -- and
-- the promotion would have nothing left to promote.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cascade_delete_parent_children()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_children uuid[];
  v_stranded int;
begin
  perform pg_advisory_xact_lock(hashtextextended('olympiq-child-links',0));
  -- Migration 174: ONE shared rule, not a fourth copy of the predicate.
  select coalesce(array_agg(d.child_profile_id), '{}')
    into v_children
    from public.parent_children_to_delete(old.profile_id) as d;

  -- Migration 174: the surviving children change hands BEFORE the parent row
  -- (and with it students.created_by_parent_profile_id, ON DELETE SET NULL)
  -- disappears. Never after -- there is no "after" inside a BEFORE trigger that
  -- still has the old parent to read.
  perform public.promote_surviving_co_parent(old.profile_id);

  if array_length(v_children, 1) is null then
    return old;
  end if;

  -- Preferred path: the auth user cascades profiles -> students ->
  -- child_credentials -> links, and leaves nothing in auth.users either.
  -- Best-effort: if the owning role ever loses rights here, an exception would
  -- abort the parent's deletion entirely. The public-schema delete below is the
  -- guarantee.
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

  -- Migration 167. Before the guarantee below, refuse if any child's auth user
  -- survived the attempt above.
  --
  -- The guarantee used to run unconditionally, and that is what manufactured
  -- orphans: the FK runs auth.users -> profiles and NOT the reverse, so
  -- deleting the profile while the auth user lives leaves the login perfectly
  -- intact. GoTrue authenticates c<8-digit-id>@children.invalid against
  -- auth.users alone and never consults profiles, so the result is a working
  -- credential with no account behind it. Production accumulated 14 of them,
  -- 9 with a non-null last_sign_in_at, before anyone noticed.
  --
  -- Refusing means the parent's deletion fails loudly and recoverably. That is
  -- the better half of the trade: a loud failure is fixed in minutes, a silent
  -- orphan went unnoticed for two months.
  select count(*)
    into v_stranded
    from public.profiles p
   where p.id = any(v_children)
     and p.auth_user_id is not null
     and exists (select 1 from auth.users u where u.id = p.auth_user_id);

  if v_stranded > 0 then
    raise exception
      'cascade_delete_would_strand_% child login(s); parent % not deleted',
      v_stranded, old.profile_id
      using errcode = 'raise_exception';
  end if;

  -- The guarantee, unchanged in purpose: children that never had an auth user
  -- (half-finished provisioning). Anything WITH an auth user has already gone
  -- via the cascade above, or we refused.
  delete from public.profiles p where p.id = any(v_children);

  return old;
end;
$fn$;

comment on function public.fn_cascade_delete_parent_children() is
  'Migration 098, hardened by 167, made co-parent-safe by 174: PROMOTES every '
  'surviving shared child to the longest-standing other active link, then '
  'deletes only the children public.parent_children_to_delete() names -- those '
  'no other adult holds an active link to. REFUSES rather than deleting a child '
  'profile whose auth user survived, which strands a working '
  'c<id>@children.invalid login with no account behind it.';

drop trigger if exists trg_parents_cascade_children on public.parents;
create trigger trg_parents_cascade_children
  before delete on public.parents
  for each row
  execute function public.fn_cascade_delete_parent_children();

-- -----------------------------------------------------------------------------
-- 5. trg_student_shared_delete_guard -- the row-level hole, closed.
--
-- TWO INDEPENDENT REFUSALS, and they are not the same rule said twice:
--
--   (i) A child with MORE THAN ONE active link is not deletable by any route,
--       by any role, ever. Removing a person's child because the other adult
--       asked is not a deletion this system may perform silently; the other
--       adults are unlinked first, which is a visible act with an audit trail,
--       and only then does the child become deletable. Note the count is of
--       links INCLUDING the departing one, so `> 1` is "somebody else is still
--       here" -- the parents cascade, which only ever deletes children with no
--       other active link, always sees exactly 1 and passes.
--
--  (ii) NO client token may delete a students row at all, shared or not. There
--       is no application path that does this -- every one of them deletes the
--       AUTH USER and lets auth.users -> profiles -> students cascade -- and a
--       direct row delete leaves profiles and auth.users standing, which is the
--       stranded-login bug of migration 167 reintroduced through a different
--       door. students_write (010) is FOR ALL and grants DELETE to the creating
--       parent; this is what stops that grant meaning anything.
--
-- auth.uid() rather than current_user: see the header. Inside SECURITY DEFINER
-- current_user is the owner, so it cannot see who called.
-- -----------------------------------------------------------------------------
create or replace function public.fn_student_shared_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_active int;
begin
  select count(*)
    into v_active
    from public.parent_student_links l
   where l.student_profile_id = old.profile_id
     and l.status = 'active';

  if v_active > 1 then
    raise exception
      'student % has % active parent links; unlink the other adults first',
      old.profile_id, v_active
      using errcode = 'check_violation', hint = 'shared_child_delete';
  end if;

  if auth.uid() is not null then
    raise exception
      'student % is not deletable with a user token; delete the auth user',
      old.profile_id
      using errcode = 'insufficient_privilege', hint = 'student_row_delete_forbidden';
  end if;

  return old;
end;
$fn$;

comment on function public.fn_student_shared_delete_guard() is
  'Migration 174: BEFORE DELETE on students. Refuses to delete a child who still '
  'has more than one ACTIVE parent link (unlink the other adults first), and '
  'refuses any students-row delete issued with a user-scoped token at all -- '
  'students_write is FOR ALL, so the creating parent held DELETE, and a row '
  'delete strands the child''s auth.users login exactly as migration 167 '
  'describes. SECURITY DEFINER because the link count must not be RLS-filtered.';

drop trigger if exists trg_student_shared_delete_guard on public.students;
create trigger trg_student_shared_delete_guard
  before delete on public.students
  for each row
  execute function public.fn_student_shared_delete_guard();

-- -----------------------------------------------------------------------------
-- 6. Grants. Explicit on every new function -- Supabase's default privileges are
--    grantor-scoped and hand EXECUTE to anon/authenticated on whatever the
--    migration role creates, so `revoke ... from public` alone is not enough.
--
-- service_role only. The two application deletion paths call
-- parent_children_to_delete over PostgREST with the service key; nothing else
-- has any business asking who dies with whom, and parent_claimed_children in
-- particular would otherwise let any signed-in parent enumerate another
-- family's children by profile id.
-- -----------------------------------------------------------------------------
revoke all on function public.parent_claimed_children(uuid) from public, anon, authenticated;
grant execute on function public.parent_claimed_children(uuid) to service_role;

revoke all on function public.parent_children_to_delete(uuid) from public, anon, authenticated;
grant execute on function public.parent_children_to_delete(uuid) to service_role;

revoke all on function public.promote_surviving_co_parent(uuid) from public, anon, authenticated;
grant execute on function public.promote_surviving_co_parent(uuid) to service_role;

-- Trigger functions need no EXECUTE grant to fire; revoking keeps them off the
-- PostgREST RPC surface, where a bare `returns trigger` call is a 500 at best.
revoke all on function public.fn_cascade_delete_parent_children() from public, anon, authenticated;
revoke all on function public.fn_student_shared_delete_guard() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. FINANCIAL HISTORY SURVIVES THE PERSON. Four owner FKs move from
--    NOT NULL ON DELETE CASCADE to NULLABLE ON DELETE SET NULL.
--
--    checkout_sessions      -- the record of an authorised basket and its money
--    sibling_discounts      -- the audit of a discount that was actually applied
--    free_trials            -- the once-per-child trial ledger
--    iap_purchase_intents   -- THE appAccountToken, and the only row that ties an
--                              Apple transaction id back to a child for a refund
--
--    Each already carries a nullable ON DELETE SET NULL student_profile_id for
--    exactly this reason, stated in 007: "deleting a child must not delete the
--    record of money that was taken". The owner column simply never received the
--    same treatment, so deleting the PARENT did what deleting the child could
--    not. iap_purchase_intents is the sharpest case: its own comment promises
--    that a surviving row "still carries the parent, the product and the
--    transaction id -- which is what support needs to refund", and CASCADE meant
--    there was no surviving row.
--
--    NOT child_subscriptions: see promote_surviving_co_parent above. A live
--    subscription is an access record for a child who is still here and must be
--    handed to a person, not nulled.
--
--    The constraint is re-created under the name an inline declaration would
--    produce (<table>_<column>_fkey) so a from-zero build of the backported 007
--    and a live database that ran this migration carry the SAME name.
-- -----------------------------------------------------------------------------
do $$
declare
  v_tbl text;
  v_con text;
  v_tables text[] := array[
    'checkout_sessions',
    'sibling_discounts',
    'free_trials',
    'iap_purchase_intents'
  ];
begin
  foreach v_tbl in array v_tables loop
    if to_regclass('public.' || v_tbl) is null then
      raise notice 'migration 174: public.% is absent, skipped', v_tbl;
      continue;
    end if;

    -- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
    execute format(
      'alter table public.%I alter column owner_parent_profile_id drop not null',
      v_tbl);

    v_con := null;
    select c.conname
      into v_con
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
     where c.conrelid = format('public.%I', v_tbl)::regclass
       and c.contype = 'f'
       and c.confrelid = 'public.profiles'::regclass
       and array_length(c.conkey, 1) = 1
       and a.attname = 'owner_parent_profile_id'
       -- confdeltype 'n' is SET NULL ('a' NO ACTION, 'c' CASCADE, 'r' RESTRICT,
       -- 'd' SET DEFAULT). An already-SET NULL constraint is skipped, which is
       -- what makes re-running this file free.
       and c.confdeltype is distinct from 'n';

    if v_con is not null then
      execute format('alter table public.%I drop constraint %I', v_tbl, v_con);
      execute format(
        'alter table public.%I add constraint %I foreign key (owner_parent_profile_id) '
        || 'references public.profiles (id) on delete set null',
        v_tbl, v_tbl || '_owner_parent_profile_id_fkey');
      raise notice 'migration 174: %.owner_parent_profile_id -> on delete set null', v_tbl;
    end if;
  end loop;
end
$$;

comment on column public.checkout_sessions.owner_parent_profile_id is
  'Migration 174: NULLABLE, ON DELETE SET NULL. Deleting the parent must not '
  'delete the record of money that was taken -- the same rule this table already '
  'applied to student_profile_id. Required at creation time by the endpoint.';

comment on column public.sibling_discounts.owner_parent_profile_id is
  'Migration 174: NULLABLE, ON DELETE SET NULL -- the audit of a discount that '
  'was actually applied outlives the person it was applied for.';

comment on column public.free_trials.owner_parent_profile_id is
  'Migration 174: NULLABLE, ON DELETE SET NULL. The trial ledger is per CHILD '
  '(uq_free_trials_student); the owner column records who activated it and must '
  'not take the ledger row with them.';

comment on column public.iap_purchase_intents.owner_parent_profile_id is
  'Migration 174: NULLABLE, ON DELETE SET NULL. This row is the only link from '
  'an Apple transaction id back to a family; CASCADE meant a refund request '
  'after an account deletion had nothing to resolve.';

-- -----------------------------------------------------------------------------
-- Repair the existing trigger before the new SET NULL path can be used.
create or replace function public.fn_checkout_intent_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.intent_kind is null then
    return new;                      -- no intent: nothing to protect
  end if;

  if new.intent_kind             is distinct from old.intent_kind
     or new.intent_items         is distinct from old.intent_items
     or new.intent_delta         is distinct from old.intent_delta
     or new.amount               is distinct from old.amount
     or new.currency             is distinct from old.currency
     or new.kind                 is distinct from old.kind
     or new.provider             is distinct from old.provider
     or new.provider_session_id  is distinct from old.provider_session_id
     or new.expires_at           is distinct from old.expires_at
     or (new.owner_parent_profile_id is distinct from old.owner_parent_profile_id
         and new.owner_parent_profile_id is not null)
     or (new.student_profile_id is distinct from old.student_profile_id
         and new.student_profile_id is not null)
  then
    raise exception 'checkout: the intent and its price are frozen once opened'
      using errcode = 'check_violation', hint = 'checkout_intent_frozen';
  end if;

  if old.redeemed_at is not null
     and (new.redeemed_at is null
          -- delivered_items is written EXACTLY ONCE, by the statement that
          -- stamps redeemed_at. After that it is the record a reversal revokes
          -- from, so an UPDATE that moved it would let a refund take back a
          -- subject some other payment paid for -- the mirror of the defect
          -- the column exists to close.
          or new.delivered_items is distinct from old.delivered_items
          or (old.redemption_status = 'applied'
              and new.redemption_status is distinct from old.redemption_status))
  then
    raise exception 'checkout: a decided redemption cannot be undone'
      using errcode = 'check_violation', hint = 'checkout_redemption_decided';
  end if;

  return new;
end;
$$;

comment on function public.fn_checkout_intent_immutable() is
  'Migration 125/127. Freezes the signed intent (child, basket, DELTA, amount, '
  'currency, order, expiry, owner), forbids un-deciding a redemption, and pins '
  'delivered_items once written -- it is what a reversal takes back, so moving '
  'it would let a refund revoke a subject another payment paid for. Three '
  'one-way exceptions: the FK cascade may NULL student_profile_id or owner_parent_profile_id, and an '
  'operator may move a needs_review to applied.';

-- CREATE OR REPLACE preserves the previous ACL. Restate the intended boundary
-- here so this migration is safe even when an environment has drifted.
revoke all on function public.fn_checkout_intent_immutable() from public, anon, authenticated;
grant execute on function public.fn_checkout_intent_immutable() to service_role;

-- 8. Prove it took. Catalogue reads only -- no table is touched.
-- -----------------------------------------------------------------------------
do $$
declare
  v_missing text := '';
  v_tbl text;
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.students'::regclass
       and tgname = 'trg_student_shared_delete_guard'
       and not tgisinternal
       -- tgtype bits: 1 = ROW, 2 = BEFORE, 8 = DELETE.
       and (tgtype & 1) = 1
       and (tgtype & 2) = 2
       and (tgtype & 8) = 8
  ) then
    v_missing := v_missing || ' trg_student_shared_delete_guard';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.parents'::regclass
       and tgname = 'trg_parents_cascade_children'
       and not tgisinternal
  ) then
    v_missing := v_missing || ' trg_parents_cascade_children';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'parent_children_to_delete'
  ) then
    v_missing := v_missing || ' parent_children_to_delete';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'promote_surviving_co_parent'
  ) then
    v_missing := v_missing || ' promote_surviving_co_parent';
  end if;

  -- The cascade trigger must READ the shared rule and PROMOTE. A body that
  -- silently lost either call is the exact regression this migration exists to
  -- make impossible, and it would still look installed.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_cascade_delete_parent_children'
       and position('parent_children_to_delete' in p.prosrc) > 0
       and position('promote_surviving_co_parent' in p.prosrc) > 0
  ) then
    v_missing := v_missing || ' cascade_trigger_body';
  end if;

  foreach v_tbl in array array['checkout_sessions','sibling_discounts','free_trials','iap_purchase_intents'] loop
    if to_regclass('public.' || v_tbl) is null then
      continue;
    end if;
    if not exists (
      select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.conrelid = format('public.%I', v_tbl)::regclass
         and c.contype = 'f'
         and c.confrelid = 'public.profiles'::regclass
         and a.attname = 'owner_parent_profile_id'
         and c.confdeltype = 'n'
         and a.attnotnull = false
    ) then
      v_missing := v_missing || ' ' || v_tbl || '.owner_fk';
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'migration 174 did not take:%', v_missing;
  end if;

  raise notice 'migration 174: shared-child deletion safety installed.';
end
$$;

-- =============================================================================
-- DOWN (documented, deliberately not executed)
--
-- 1. Drop the students guard -- this is the only irreversible-in-CONSEQUENCE
--    step, because it reopens the raw row-delete hole:
--      drop trigger if exists trg_student_shared_delete_guard on public.students;
--      drop function if exists public.fn_student_shared_delete_guard();
--
-- 2. Restore the 167 cascade body verbatim from
--    supabase/sql/migrations/2026_09_02_167_orphaned_auth_users.sql (it inlines
--    its own "which children die" query), then:
--      drop function if exists public.promote_surviving_co_parent(uuid);
--      drop function if exists public.parent_children_to_delete(uuid);
--      drop function if exists public.parent_claimed_children(uuid);
--    and revert the two application paths, which now call the RPC.
--
-- 3. The four foreign keys, per table:
--      alter table public.<t> drop constraint <t>_owner_parent_profile_id_fkey;
--      alter table public.<t> alter column owner_parent_profile_id set not null;
--      alter table public.<t> add constraint <t>_owner_parent_profile_id_fkey
--        foreign key (owner_parent_profile_id) references public.profiles (id)
--        on delete cascade;
--
--    REVERSIBLE IN SHAPE, NOT IN DATA -- said once more because it is the part
--    that bites. Step 3's `set not null` FAILS on any row whose owner has since
--    been deleted, and those rows exist only because this migration stopped them
--    being cascaded away. Rolling back after a real parent deletion is therefore
--    not a schema operation: somebody has to decide whether that financial
--    history is deleted (restoring the old behaviour retroactively) or
--    re-pointed. Roll back before a parent is deleted, or not at all.
-- =============================================================================

-- Exact rollback for the repaired checkout function (before any 174 data changes):
-- create or replace function public.fn_checkout_intent_immutable()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- begin
--   if old.intent_kind is null then
--     return new;                      -- no intent: nothing to protect
--   end if;
-- 
--   if new.intent_kind             is distinct from old.intent_kind
--      or new.intent_items         is distinct from old.intent_items
--      or new.intent_delta         is distinct from old.intent_delta
--      or new.amount               is distinct from old.amount
--      or new.currency             is distinct from old.currency
--      or new.kind                 is distinct from old.kind
--      or new.provider             is distinct from old.provider
--      or new.provider_session_id  is distinct from old.provider_session_id
--      or new.expires_at           is distinct from old.expires_at
--      or new.owner_parent_profile_id is distinct from old.owner_parent_profile_id
--      or (new.student_profile_id is distinct from old.student_profile_id
--          and new.student_profile_id is not null)
--   then
--     raise exception 'checkout: the intent and its price are frozen once opened'
--       using errcode = 'check_violation', hint = 'checkout_intent_frozen';
--   end if;
-- 
--   if old.redeemed_at is not null
--      and (new.redeemed_at is null
--           -- delivered_items is written EXACTLY ONCE, by the statement that
--           -- stamps redeemed_at. After that it is the record a reversal revokes
--           -- from, so an UPDATE that moved it would let a refund take back a
--           -- subject some other payment paid for -- the mirror of the defect
--           -- the column exists to close.
--           or new.delivered_items is distinct from old.delivered_items
--           or (old.redemption_status = 'applied'
--               and new.redemption_status is distinct from old.redemption_status))
--   then
--     raise exception 'checkout: a decided redemption cannot be undone'
--       using errcode = 'check_violation', hint = 'checkout_redemption_decided';
--   end if;
-- 
--   return new;
-- end;
-- $$;
-- 
-- comment on function public.fn_checkout_intent_immutable() is
--   'Migration 125/127. Freezes the signed intent (child, basket, DELTA, amount, '
--   'currency, order, expiry, owner), forbids un-deciding a redemption, and pins '
--   'delivered_items once written -- it is what a reversal takes back, so moving '
--   'it would let a refund revoke a subject another payment paid for. Two '
--   'one-way exceptions: the FK cascade may NULL student_profile_id, and an '
--   'operator may move a needs_review to applied.';
