-- =============================================================================
-- 2026_08_27_154 — PRICE THE LAST TWO SUBJECTS, SO EVERY SUBJECT IS SELLABLE.
--
-- REPORTED: the public Services page did not list every subject the platform
-- supports. It listed five of seven — Elm and Fizika were missing.
--
-- They were missing because that page is built from `subjects_pricing`: a
-- subject with no price cannot go in a basket, so it never appears. That is the
-- right behaviour for a pricing page and the wrong OUTCOME here, because both
-- subjects are real, active, and carry curriculum:
--
--     Elm     64 topics, 293 subtopics, grades 1-11, 100 published questions
--     Fizika  20 topics, 123 subtopics, grades 7-11
--
-- The owner's instruction for Azərbaycan dili was "make it the same as the
-- others", and every other sold subject is 3 / 9 / 90 AZN per child per subject.
-- The same answer applies here.
--
-- WHY THIS IS NOT A CODE FIX. It would have been easy to make the page list
-- every active subject and show "price not set" against two of them. That would
-- put an unbuyable row in a basket UI and move the problem to checkout. The
-- honest fix is the missing data, and the admin panel now FLAGS an unpriced
-- subject ("saytda satılmır") so the next one is visible before a customer
-- notices rather than after.
--
-- Guarded by the natural key, so an admin's later change through the Pricing
-- page is never overwritten by a re-run.
--
-- Data-only. Nothing to backport.
-- =============================================================================
begin;

insert into public.subjects_pricing (subject_id, interval, price_amount, currency, status)
select s.id, v.iv::plan_interval, v.amt, 'AZN', 'active'::catalog_status
from public.subjects s
cross join (values ('week', 3.00), ('month', 9.00), ('year', 90.00)) as v(iv, amt)
where s.code in ('elm', 'fizika')
  and s.status = 'active'
on conflict (subject_id, "interval") do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION: every ACTIVE subject can now be sold, in all three intervals.
-- -----------------------------------------------------------------------------
do $$
declare
  v_unpriced int;
  v_names    text;
begin
  select count(*), coalesce(string_agg(s.name, ', ' order by s.name), '')
    into v_unpriced, v_names
  from public.subjects s
  where s.status = 'active'
    and (select count(*) from public.subjects_pricing p
         where p.subject_id = s.id and p.status = 'active') < 3;

  if v_unpriced > 0 then
    raise exception '154: % active subject(s) still not fully priced: %',
      v_unpriced, v_names;
  end if;

  raise notice '154: every active subject has week/month/year pricing';
end $$;

commit;
