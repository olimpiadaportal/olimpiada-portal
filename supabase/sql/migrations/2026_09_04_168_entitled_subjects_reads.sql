-- ===========================================================================
-- MIGRATION 168 — "which subjects has this child actually been GRANTED"
--
-- WHY THIS EXISTS. An Apple in-app purchase writes exactly one row, into
-- public.entitlements (grantEntitlement.ts -> entitlement_grant), and nothing
-- else. has_subject_access() reads that row, so the ATTEMPT ENGINES honour a
-- purchase immediately — but every SCREEN reads something else:
--
--   mobile arena gate      students.access_status, my_free_access_active, my_free_trial
--   mobile subject list    live child_subscriptions rows, + the free-window merge
--   parent purchase panel  live child_subscriptions rows (coveredSubjectIds)
--
-- None of those three consult entitlements, so a paid child could play a
-- subject the app refused to show them. It went unnoticed because the giveaway
-- window makes every screen say "unlocked" regardless.
--
-- The gate half already had its answer: my_accessible_subjects() has existed
-- since migration 124 and is exactly right for it. It had simply never been
-- called by any client. This migration adds only the half that was genuinely
-- missing.
--
-- WHY NOT REUSE my_accessible_subjects() FOR THE PURCHASE PANEL. Two reasons,
-- both fatal:
--
--   1. IT IS CALLER-SCOPED TO current_profile_id(), which on the purchase
--      screens is the PARENT. It would answer about the wrong person.
--   2. IT INCLUDES THE GIVEAWAY. has_subject_access() returns true for EVERY
--      subject while a giveaway runs, so during a promo the panel would decide
--      the child already owns all 21 products and offer nothing at all. That is
--      precisely the "reviewer sees no purchase button" failure this work
--      exists to prevent.
--
-- So the panel needs the narrower question — what has this child been GRANTED,
-- provider-agnostically — and that is what these two functions answer. A
-- giveaway is borrowed, not owned, and must never suppress an offer.
--
-- The entitlement predicate below is copied verbatim from has_subject_access()
-- so the two can never disagree about what "live" means.
-- ===========================================================================

-- One child's live subject grants. Takes an ARBITRARY student id, so it
-- restates the entitlements reader set itself: this is a definer function and
-- RLS does not apply inside it. Same shape and same failure posture as
-- child_free_trial(uuid), deliberately — the clients merge the two lists side
-- by side and a second shape would invite a second set of bugs.
create or replace function public.child_entitled_subjects(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.current_profile_id();
begin
  -- Fails CLOSED to an empty list. A hiccup must never suppress a purchase
  -- offer, because the cost of that is a parent who cannot buy and a reviewer
  -- who reports the in-app purchase as missing.
  if v_me is null or p_student is null then
    return '[]'::jsonb;
  end if;

  -- The same reader set as the entitlements RLS policy and as
  -- child_free_trial: the child themselves, a linked parent, the parent who
  -- created them, an admin, or subscriptions.manage.
  if not (
    p_student = v_me
    or public.is_parent_linked_to_student(p_student)
    or exists (select 1 from public.students s
               where s.profile_id = p_student
                 and s.created_by_parent_profile_id = v_me)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  ) then
    return '[]'::jsonb;
  end if;

  -- ck_entitlement_bounded makes a NULL ends_at unrepresentable for a SUBJECT
  -- grant ("forever" is a package shape), so there is no `ends_at is null` arm
  -- here — exactly as in has_subject_access().
  --
  -- EXPIRY IS DERIVED. No job flips a status when the clock passes ends_at, so
  -- there is no window in which access and the screen disagree.
  return coalesce((
    select jsonb_agg(distinct jsonb_build_object(
             'id',   s.id,
             'code', s.code,
             'name', s.name))
    from public.entitlements e
    join public.subjects s on s.id = e.subject_id
    where e.student_profile_id = p_student
      and e.scope       = 'subject'
      -- BORROWED ACCESS IS NOT OWNERSHIP, and a trial is borrowed. Unlike the
      -- giveaway and the admin free-access window — which this function avoids
      -- simply by never calling them — a trial DOES write real entitlement rows
      -- (activate_free_trial -> entitlement_grant(..., 'trial', ...)), so it
      -- would otherwise arrive through this very query and suppress the offer
      -- for exactly the subjects the family is trying. That is the 24 hours the
      -- trial exists to convert, with no way to buy. Trial everything and the
      -- panel renders nothing at all.
      -- The database already draws this line: activate_free_trial's own
      -- "already covered" guard excludes source = 'trial' for the same reason.
      -- has_subject_access() deliberately does NOT filter it — a trial really is
      -- access to PLAY. This function answers a different question: what has
      -- been BOUGHT, and therefore must not be sold twice.
      and e.source     <> 'trial'
      and e.revoked_at is null
      and e.starts_at  <= now()
      and e.ends_at     > now()
  ), '[]'::jsonb);
end;
$$;

comment on function public.child_entitled_subjects(uuid) is
  'Migration 168: the subjects one child holds a LIVE entitlement for, whatever '
  'granted it (abb_web, apple_iap, google_play, giveaway-as-a-row, manual, '
  'school_license). Deliberately EXCLUDES the giveaway window and admin '
  'free-access intervals: those are borrowed access, and letting them suppress '
  'a purchase offer is how a reviewer ends up with no buy button. For "may this '
  'child PLAY this subject", use has_subject_access / my_accessible_subjects '
  'instead. Caller-scoped, fails closed to [].';

revoke all on function public.child_entitled_subjects(uuid) from public, anon;
grant execute on function public.child_entitled_subjects(uuid) to authenticated, service_role;


-- The signed-in child's own grants. Delegates so the two can never disagree.
create or replace function public.my_entitled_subjects()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.child_entitled_subjects(public.current_profile_id());
$$;

comment on function public.my_entitled_subjects() is
  'Migration 168: the signed-in child''s own live subject entitlements. '
  'Delegates to child_entitled_subjects so the two can never disagree.';

revoke all on function public.my_entitled_subjects() from public, anon;
grant execute on function public.my_entitled_subjects() to authenticated, service_role;
