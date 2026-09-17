-- Migration: 2026_09_16_179_child_gender_allows_non_answer.sql
-- Purpose: Accept 'unspecified' from the create path again. The question stays
--          REQUIRED; the parent is simply never forced to disclose.
-- Environment first applied: (pending) staging, then production.
-- Related root SQL: 011 functions.
-- Backport status: pending. Destructive change: no. Requires 178. Idempotent.
-- No BEGIN/COMMIT inside this migration.
-- DOWN: re-apply 178's two-value check - but do not, without re-reading the note
--       below. The two-value form is the one carrying store exposure.
--
-- WHY THIS REVERSES PART OF 178, ONE DAY LATER. 178 refused 'unspecified' on the
-- reasoning that no form offers it any more. That was true of the form and wrong
-- about the consequence: removing the non-answer turns "the parent must answer"
-- into "the parent must DISCLOSE", and disclosure of a minor's gender is not
-- directly relevant to an olympiad-practice app's core functionality. Apple
-- Guideline 5.1.1(v) is explicit about requiring irrelevant personal data, this
-- app has a 5.1.1(v) finding on its record already (answered 2026-08-31 by
-- making the parent phone optional), and Apple has a published rejection about
-- the absence of an opt-out path on exactly this kind of field.
--
-- The owner's intent survives in full: no silent skip, no blank placeholder that
-- submits, and the parent cannot advance without choosing. The enum never
-- changed - 'unspecified' has been valid since migration 169 - so this is a
-- validation change only, and NO store declaration moves: Play asks about
-- optionality per TYPE and that type already carries mandatory grade and school,
-- and Apple's questionnaire has no optionality dimension at all.
--
-- THE BODY BELOW IS THE LIVE 12-ARGUMENT FUNCTION, taken from pg_get_functiondef
-- on production and modified in exactly one place: the value whitelist.

CREATE OR REPLACE FUNCTION public.create_child_account(p_parent_profile_id uuid, p_auth_user_id uuid, p_first_name text, p_last_name text, p_city text DEFAULT NULL::text, p_school_name text DEFAULT NULL::text, p_class_grade text DEFAULT NULL::text, p_grade_id uuid DEFAULT NULL::uuid, p_district_id uuid DEFAULT NULL::uuid, p_school_id uuid DEFAULT NULL::uuid, p_city_district_id uuid DEFAULT NULL::uuid, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(new_student_profile_id uuid, new_child_unique_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_child_id       text;
  v_profile_id      uuid;
  v_student_role_id uuid;
  v_gender          public.student_gender;
begin
  -- MIGRATION 178. A present gender must be one of the two the product offers.
  -- 'unspecified' still exists in the enum so children created before the
  -- question did stay readable, but no form may submit it any more, so accepting
  -- it here would let a stale client write a state the UI can no longer produce.
  --
  -- NULL IS ACCEPTED ON PURPOSE. Migrations apply before the code that needs
  -- them deploys, so in that window the old client still calls this without the
  -- argument. Raising on a missing gender would kill Add-Child on parent web,
  -- mobile and the admin panel simultaneously for the length of the deploy.
  -- Presence is enforced by the app, on the client and again on the server; this
  -- function's job is to refuse a value that is present and wrong.
  if p_gender is not null and btrim(p_gender) <> '' then
    -- MIGRATION 179. 'unspecified' is accepted again, and it is not a loosening.
    -- The product still REQUIRES the parent to answer - there is no blank option
    -- and no placeholder that submits - but one of the answers is "prefer not to
    -- say". Apple Guideline 5.1.1(v) forbids REQUIRING personal information that
    -- is not directly relevant to core functionality, and this field drives
    -- nothing: not access, not content, not ranking. This app already took a
    -- 5.1.1(v) finding on 2026-08-31 and answered it by making the parent phone
    -- optional; forcing a two-value disclosure about a MINOR would run that fix
    -- backwards on the same guideline. Requiredness lives in the FORM; this
    -- function's job is to refuse a value outside the enum.
    if p_gender not in ('female', 'male', 'unspecified') then
      raise exception 'create_child_account: gender must be female, male or unspecified'
        using errcode = 'check_violation';
    end if;
    v_gender := p_gender::public.student_gender;
  end if;

  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- Validate the optional structured grade.
  if p_grade_id is not null
     and not exists (select 1 from public.grades g where g.id = p_grade_id) then
    raise exception 'create_child_account: grade % does not exist', p_grade_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate the optional structured city (district). OPTIONAL: no raise on null.
  if p_district_id is not null
     and not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'create_child_account: city (district) % does not exist', p_district_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Round 21: the intra-city district (rayon). REQUIRED when the chosen city has
  -- active rayons; must belong to that city. (The students trigger additionally
  -- enforces school-rayon consistency and auto-fills from the school.)
  if p_district_id is not null and p_city_district_id is null
     and exists (select 1 from public.city_districts cd
                  where cd.city_id = p_district_id and cd.status = 'active') then
    raise exception 'create_child_account: district is required for city %', p_district_id
      using errcode = 'check_violation',
            hint    = 'district_required';
  end if;
  if p_city_district_id is not null then
    if not exists (select 1 from public.city_districts cd where cd.id = p_city_district_id) then
      raise exception 'create_child_account: district % does not exist', p_city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.city_districts cd
                        where cd.id = p_city_district_id and cd.city_id = p_district_id) then
      raise exception 'create_child_account: district % is not in city %', p_city_district_id, p_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Validate the optional structured school, and (when both given) that the
  -- school belongs to the chosen city. OPTIONAL: no raise on null.
  if p_school_id is not null then
    if not exists (select 1 from public.schools sc where sc.id = p_school_id) then
      raise exception 'create_child_account: school % does not exist', p_school_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.schools sc
                        where sc.id = p_school_id and sc.district_id = p_district_id) then
      raise exception 'create_child_account: school % is not in city %', p_school_id, p_district_id
        using errcode = 'check_violation';
    end if;
    -- Round 21: the school must belong to the chosen rayon (when it has one).
    if p_city_district_id is not null
       and exists (select 1 from public.schools sc
                    where sc.id = p_school_id
                      and sc.city_district_id is not null
                      and sc.city_district_id <> p_city_district_id) then
      raise exception 'create_child_account: school % is not in district %', p_school_id, p_city_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row WITHOUT a login ID (no paid access yet).
  --    child_unique_id stays NULL until a plan is chosen (subscribe step).
  --    Structured district_id/city_district_id/school_id are stored alongside the
  --    free-text city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, city_district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               gender, access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_city_district_id, p_school_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          v_gender, 'inactive');

  -- 3) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 4) ALLOCATE THE LOGIN ID NOW (migration 146).
  --
  -- It used to be deferred to the first subscription, on the reasoning that a
  -- child with no plan has nothing to log in to. That was wrong in a way nobody
  -- noticed until the payments kill switch was thrown: with payments off, no
  -- subscription is ever created, so no id was ever allocated, and the Add-Child
  -- flow completed into an account THAT COULD NEVER BE USED. The success screen
  -- promised "the 8-digit ID appears as soon as a subject subscription is
  -- active" and no screen in the app could make that happen. Two production
  -- children were left in that state.
  --
  -- IDENTITY IS NOT ENTITLEMENT. The id is who the child IS; access_status stays
  -- 'inactive' and every paid gate is untouched. The child can sign in and see
  -- the ordinary locked arena -- a complete, honest state, instead of a dead end.
  --
  -- allocate_child_unique_id is idempotent (it re-reads the registry before
  -- minting), so create_child_subscription calling it again later is harmless.
  v_child_id := public.allocate_child_unique_id(v_profile_id);

  -- Password lives ONLY in Supabase Auth (never stored here).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, v_child_id, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- The caller sets the canonical synthetic auth email from this id; without
  -- that step the child still cannot sign in, so it is not optional.
  return query select v_profile_id, v_child_id;
end;
$function$;

revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, text) to service_role;
