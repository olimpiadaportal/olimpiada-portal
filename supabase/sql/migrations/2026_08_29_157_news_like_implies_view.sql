-- =============================================================================
-- 2026_08_29_157 — "A LIKE IMPLIES A VIEW" BECOMES A REAL INVARIANT INSTEAD OF
--                  A PROPERTY OF WHERE A BUTTON HAPPENS TO SIT.
--
-- REPORTED: a news article showing 11 views and 16 likes.
--
-- THE DATA IS NOT CORRUPT — THE TWO NUMBERS MEAN DIFFERENT THINGS.
--   * news.like_count is a trigger-maintained cache of news_likes rows, and
--     news_likes is primary-keyed (news_id, profile_id). One like per profile,
--     deduped by the database. That number is CORRECT.
--   * news.view_count is a rows-less anonymous accumulator moved only by
--     bump_news_view(), which is called only from the article DETAIL screen on
--     both platforms.
--
-- On the web the two could not diverge by accident of LAYOUT: the like button
-- exists only on the same detail page whose beacon fires the view. Nobody wrote
-- that rule down; it was an emergent property of one page. When the mobile app
-- put an interactive like button on the LIST CARD, a reader could like an
-- article straight from the feed without ever opening it — +1 like, +0 views,
-- every time. The invariant broke silently because it had never been encoded
-- anywhere it could be checked.
--
-- THE FIX IS AT THE SOURCE OF TRUTH, NOT AT THE DISPLAY. Clamping the rendered
-- number would leave the stored data in the impossible state and would have to
-- be re-applied at every surface that ever shows it (web list, web detail,
-- mobile card, mobile article, admin). Instead the like path itself now
-- guarantees the invariant, and a CHECK constraint makes it impossible to
-- reach the impossible state again from any path at all.
--
-- WHY THE TRIGGER RAISES A FLOOR AND DOES NOT ADD +1. The obvious form,
-- `view_count = view_count + 1` on every like, double-counts the WEB reader:
-- they are on the detail page, the beacon has already counted them this
-- session, and their like would count them a second time. The floor form
--
--     view_count = greatest(view_count, like_count + 1)
--
-- adds a view exactly where none was recorded (the mobile feed like, where
-- view_count has not moved) and changes nothing where one already was (the web
-- reader, whose view_count is far above like_count). It is also self-healing:
-- whatever the prior state, the post-condition view_count >= like_count holds
-- unconditionally. Both expressions read the PRE-UPDATE row, so `like_count + 1`
-- there IS the new like count -- do not "simplify" this into two statements or
-- reorder it to read a post-update value.
--
-- The DELETE branch is untouched: unliking lowers like_count and leaves
-- view_count alone. Views only ever rise, likes can fall, so once the invariant
-- holds it holds forever.
--
-- WHAT THE RECONCILE IS AND IS NOT. It raises view_count to the number of
-- distinct likers on articles where likes currently exceed views. It is NOT
-- invented traffic: every one of those likes is a real, per-profile,
-- database-deduped act that REQUIRED the article to be rendered on someone's
-- screen. The likers are the minimum set of people who provably saw it, and
-- their renders were simply never counted because the like came from a feed
-- card. The reconcile never lowers a view count, never touches like_count, and
-- never hides a like.
--
-- MOBILE IS NOT CHANGED HERE and does not need to be for the numbers to be
-- consistent. Whether the feed card should keep its like button is a product
-- question for the mobile owners; this migration makes either answer safe.
--
-- BACKPORT: supabase/sql/014_news.sql —
--   * replace fn_news_like_count() (~line 166) with the version below and
--     refresh its `comment on function` (~line 184);
--   * add the `news_view_count_at_least_likes` CHECK to the `create table ...
--     public.news` block (~line 31) or immediately after it, alongside the
--     existing `alter table public.news add column if not exists like_count`.
--   The reconcile is data repair and is NOT backported: a freshly built
--   database has no rows to repair.
-- Backport status: completed
-- =============================================================================
begin;

-- ---- 1. The like path now carries the view floor --------------------------
create or replace function public.fn_news_like_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- MIGRATION 157 -- a like implies a view. Both expressions read the row as
    -- it was BEFORE this update, so `like_count + 1` is the new like count.
    -- greatest() and not +1: the web reader was already counted by the view
    -- beacon on the same page, and must not be counted twice for liking.
    update public.news
       set like_count = like_count + 1,
           view_count = greatest(view_count, like_count + 1)
     where id = new.news_id;
    return new;
  elsif tg_op = 'DELETE' then
    -- Unliking never returns a view. Views are monotonic; that is what keeps
    -- the invariant true once it is true.
    update public.news set like_count = greatest(like_count - 1, 0) where id = old.news_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function public.fn_news_like_count() is
  'Trigger function: keeps news.like_count in sync with news_likes rows and '
  'enforces "a like implies a view" by raising view_count to at least the like '
  'count on INSERT (migration 157) — a reader must render the article to like '
  'it, and on mobile the like button sits on a list card that never fires '
  'bump_news_view. SECURITY DEFINER so likers need no UPDATE right on public.news.';

revoke all on function public.fn_news_like_count() from public, anon, authenticated;

-- Re-arm defensively: `create or replace` keeps the existing binding, but a
-- rerun on a database where the trigger was dropped must still leave it armed.
drop trigger if exists trg_news_like_count on public.news_likes;
create trigger trg_news_like_count
  after insert or delete on public.news_likes
  for each row execute function public.fn_news_like_count();

-- ---- 2. Reconcile the rows already in the impossible state -----------------
do $$
declare
  v_rows  int;
  v_drift int;
begin
  -- Cache drift is a DIFFERENT defect and is reported, not silently absorbed:
  -- if like_count ever disagreed with the news_likes rows behind it, the floor
  -- below uses the LARGER of the two so the displayed invariant holds either way.
  select count(*) into v_drift
  from public.news n
  where n.like_count <> (select count(*) from public.news_likes nl where nl.news_id = n.id);
  if v_drift > 0 then
    raise notice
      '157: % article(s) have a like_count that disagrees with news_likes — investigate separately; views reconciled against the larger of the two',
      v_drift;
  end if;

  -- Raise views to the liker count wherever likes currently exceed views.
  -- The WHERE clause makes this a no-op on a rerun, and greatest() means it can
  -- only ever raise a count.
  update public.news n
     set view_count = greatest(n.like_count,
                               (select count(*) from public.news_likes nl where nl.news_id = n.id))
   where n.view_count < greatest(n.like_count,
                                 (select count(*) from public.news_likes nl where nl.news_id = n.id));
  get diagnostics v_rows = row_count;
  raise notice
    '157: raised view_count to the distinct-liker count on % article(s) (likes that were never counted as views)',
    v_rows;
end $$;

-- ---- 3. Make the impossible state impossible -------------------------------
-- Nothing in the codebase lowers view_count (bump_news_view only increments,
-- and no admin path writes the column), so this constraint can only be tripped
-- by a future path that recreates the reported bug. Failing loudly there is the
-- point: the last one went unnoticed until a reader counted the two numbers.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.news'::regclass
      and conname = 'news_view_count_at_least_likes'
  ) then
    alter table public.news
      add constraint news_view_count_at_least_likes check (view_count >= like_count);
  end if;
end $$;

-- ---- 4. Verification -------------------------------------------------------
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.news where like_count > view_count;
  if v_bad > 0 then
    raise exception '157: % article(s) still report more likes than views', v_bad;
  end if;

  if position('greatest(view_count, like_count + 1)' in
              pg_get_functiondef('public.fn_news_like_count()'::regprocedure)) = 0 then
    raise exception '157: fn_news_like_count no longer raises the view floor on INSERT';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.news_likes'::regclass
      and t.tgname = 'trg_news_like_count'
      and not t.tgisinternal
  ) then
    raise exception '157: trg_news_like_count is not armed on news_likes';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.news'::regclass
      and conname = 'news_view_count_at_least_likes'
  ) then
    raise exception '157: the view >= likes constraint is missing';
  end if;

  raise notice '157: like-implies-view holds for every news row, in the trigger and in a constraint';
end $$;

commit;
