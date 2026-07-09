-- =============================================================================
-- 2026_07_08_044_notifications_cron_and_multi_recipient.sql
-- Two notification fixes (owner-reported 2026-07-08):
--   1) SCHEDULED broadcasts never fired: migration 042 scheduled the cron jobs
--      only in the canonical 016 backport, so DEV never got them. Schedule them
--      here (guarded like 016) so scheduled sends dispatch and old notifications
--      prune. (Backport already lives in 016 for from-zero.)
--   2) MULTI-RECIPIENT audience: the admin composer must target MANY parents at
--      once (and the "individual" block is removed in the UI). Teach
--      lb_notify_audience to accept audience_filter.profile_ids (a uuid array)
--      for the 'parent'/'individual' audiences, keeping single profile_id for
--      backward compatibility.
--
-- Backport: lb_notify_audience -> 011. (Cron already in 016.)
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) multi-recipient audience resolver ------------------------------------
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type in ('parent', 'individual') then
    -- Preferred: a uuid array of recipients (multi-select). Fallback: a single id.
    if p_filter ? 'profile_ids' and jsonb_typeof(p_filter->'profile_ids') = 'array' then
      return query
        select e::uuid
        from jsonb_array_elements_text(p_filter->'profile_ids') e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    elsif (p_filter->>'profile_id') is not null then
      return query select (p_filter->>'profile_id')::uuid;
    end if;
  elsif p_type = 'by_subject' then
    return query
      select distinct cs.student_profile_id
      from public.child_subscriptions cs
      join public.subscription_subjects ss on ss.child_subscription_id = cs.id
      where ss.subject_id = (p_filter->>'subject_id')::uuid
        and cs.status in ('trialing','active');
  end if;
end;
$$;
revoke all on function public.lb_notify_audience(text, jsonb) from public, anon, authenticated;
grant execute on function public.lb_notify_audience(text, jsonb) to service_role;

-- ---- 2) schedule the notification cron jobs (guarded; same as canonical 016) --
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if v_has_cron then
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_dispatch_scheduled_notifications';
    perform cron.schedule('olympiq_dispatch_scheduled_notifications', '*/5 * * * *',
                          'select public.dispatch_scheduled_notifications();');
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_prune_notifications';
    perform cron.schedule('olympiq_prune_notifications', '40 20 * * *',
                          'select public.prune_notifications();');
    raise notice 'notification cron jobs scheduled';
  else
    raise notice 'pg_cron absent — notification cron NOT scheduled (skipped)';
  end if;
end $$;

-- Flush any already-overdue scheduled broadcast now (so the owner's stuck test
-- send goes out immediately instead of waiting for the next 5-min tick).
select public.dispatch_scheduled_notifications();

commit;
