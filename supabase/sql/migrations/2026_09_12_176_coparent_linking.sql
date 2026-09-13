-- Migration: 2026_09_12_176_coparent_linking.sql
-- Purpose: Approved, revocable sharing of an existing child's progress/access.
-- Environment first applied: staging and production, 2026-09-12.
-- Related root SQL: 002 tables; 010 policies; 011 functions; 013 checks.
-- Backport status: completed. Destructive change: no. No payment is created.
-- Requires 173-175. Idempotent. No BEGIN/COMMIT inside this migration.
-- DOWN: revoke execute on the two functions from service_role to disable entry;
-- retain tables and existing links. Never erase live family access as rollback.
-- Shared-child invitations are nominations, not login credentials. A pending
-- nomination grants nothing; the current creator must approve a named adult.
create table if not exists public.parent_link_invites (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students(profile_id) on delete cascade,
  issued_by uuid not null references public.parents(profile_id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'open' check(status in ('open','pending','approved','rejected','revoked')),
  redeemed_by uuid references public.parents(profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '72 hours'),
  resolved_at timestamptz,
  check(expires_at>created_at),
  check((status in ('pending','approved','rejected')) is false or redeemed_by is not null)
);
create unique index if not exists parent_link_invites_one_open on public.parent_link_invites(student_profile_id)
  where status in ('open','pending');
create index if not exists parent_link_invites_issuer_time on public.parent_link_invites(issued_by,created_at);
create table if not exists public.parent_link_redeem_attempts (
  id bigint generated always as identity primary key,
  actor_profile_id uuid not null references public.parents(profile_id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists parent_link_attempts_actor_time on public.parent_link_redeem_attempts(actor_profile_id,attempted_at);
alter table public.parent_link_invites enable row level security;
alter table public.parent_link_redeem_attempts enable row level security;
-- There is deliberately no direct client read/write policy: even a hash or a
-- pending child's identifier must not become a credential/discovery surface.
revoke all on public.parent_link_invites,public.parent_link_redeem_attempts from public,anon,authenticated;
grant all on public.parent_link_invites,public.parent_link_redeem_attempts to service_role;
grant usage,select on sequence public.parent_link_redeem_attempts_id_seq to service_role;
-- All relationship changes go through the audited service. No PostgREST path
-- may repoint a relationship, forge approval, or bypass caps and revocation.
revoke insert,update,delete on public.parent_student_links from anon,authenticated;
create or replace function public.manage_child_link(
 p_actor uuid,p_action text,p_student uuid default null,p_invite uuid default null,
 p_parent uuid default null,p_child_id text default null,p_code text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $fn$
declare v_child public.students%rowtype; v_inv public.parent_link_invites%rowtype;
 v_admin boolean; v_code text; v_count int; v_actor_parent boolean;
begin
 select exists(select 1 from public.parents pa join public.profiles p on p.id=pa.profile_id
   where p.id=p_actor and p.status='active') into v_actor_parent;
 select exists(select 1 from public.profiles p join public.profile_roles pr on pr.profile_id=p.id
   join public.roles r on r.id=pr.role_id where p.id=p_actor and p.status='active' and r.code='administrator') into v_admin;
 if not v_actor_parent and not (v_admin and p_action='revoke') then
   return jsonb_build_object('ok',false,'code','forbidden');
 end if;
 if p_action not in ('issue','redeem','approve','reject','revokeInvite','revoke','leave') or p_action is null then
   return jsonb_build_object('ok',false,'code','invalid');
 end if;
 -- Serialize relationship changes, caps, and promotion/deletion on one lock.
 -- These are rare household administration operations, never normal reads.
 perform pg_advisory_xact_lock(hashtextextended('olympiq-child-links',0));
 if p_action='redeem' then
   delete from public.parent_link_redeem_attempts where actor_profile_id=p_actor and attempted_at<now()-interval '1 day';
   select count(*) into v_count from public.parent_link_redeem_attempts
     where actor_profile_id=p_actor and attempted_at>now()-interval '1 hour';
   if v_count>=10 then return jsonb_build_object('ok',false,'code','rate'); end if;
   insert into public.parent_link_redeem_attempts(actor_profile_id) values(p_actor);
   v_code:=regexp_replace(upper(coalesce(p_code,'')),'[ -]','','g');
   if p_child_id is null or p_child_id!~'^[0-9]{8}$' or v_code!~'^[A-F0-9]{20}$' then
     return jsonb_build_object('ok',false,'code','invalidInvite');
   end if;
   select i.* into v_inv from public.parent_link_invites i join public.students s on s.profile_id=i.student_profile_id
     where s.child_unique_id=p_child_id and i.code_hash=encode(digest(v_code,'sha256'),'hex')
       and i.status in ('open','pending') and i.expires_at>now() for update of i;
   if not found then return jsonb_build_object('ok',false,'code','invalidInvite'); end if;
   p_student:=v_inv.student_profile_id;
 elsif p_action in ('approve','reject','revokeInvite') then
   select * into v_inv from public.parent_link_invites where id=p_invite for update;
   if not found then return jsonb_build_object('ok',false,'code','unavailable'); end if;
   p_student:=v_inv.student_profile_id;
 end if;
 select * into v_child from public.students where profile_id=p_student for update;
 if not found then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 if p_action='redeem' then
   if v_inv.issued_by is distinct from v_child.created_by_parent_profile_id then
     return jsonb_build_object('ok',false,'code','invalidInvite');
   end if;
   if v_child.created_by_parent_profile_id=p_actor or exists(select 1 from public.parent_student_links
     where student_profile_id=p_student and parent_profile_id=p_actor and status='active') then
     return jsonb_build_object('ok',false,'code','alreadyLinked');
   end if;
   if v_inv.status='pending' then
     if v_inv.redeemed_by=p_actor then return jsonb_build_object('ok',true,'state','pending'); end if;
     return jsonb_build_object('ok',false,'code','invalidInvite');
   end if;
   update public.parent_link_invites set status='pending',redeemed_by=p_actor where id=v_inv.id;
 elsif p_action='leave' then
   if v_child.created_by_parent_profile_id=p_actor then return jsonb_build_object('ok',false,'code','creatorOnly'); end if;
   update public.parent_student_links set status='revoked',updated_at=now()
     where student_profile_id=p_student and parent_profile_id=p_actor and status='active';
   if not found then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 else
   if v_child.created_by_parent_profile_id is distinct from p_actor and not(v_admin and p_action='revoke') then
     return jsonb_build_object('ok',false,'code','forbidden');
   end if;
   if p_action in ('issue','approve') then
     select count(*)+1 into v_count from public.parent_student_links
       where student_profile_id=p_student and status='active' and parent_profile_id<>v_child.created_by_parent_profile_id;
     if v_count>=4 then return jsonb_build_object('ok',false,'code','limit'); end if;
   end if;
   if p_action='issue' then
     if v_child.child_unique_id is null then return jsonb_build_object('ok',false,'code','needsId'); end if;
     select count(*) into v_count from public.parent_link_invites where issued_by=p_actor and created_at>now()-interval '1 day';
     if v_count>=5 then return jsonb_build_object('ok',false,'code','rate'); end if;
     update public.parent_link_invites set status='revoked',resolved_at=now()
       where student_profile_id=p_student and status in ('open','pending');
     v_code:=upper(encode(gen_random_bytes(10),'hex'));
     insert into public.parent_link_invites(student_profile_id,issued_by,code_hash)
       values(p_student,p_actor,encode(digest(v_code,'sha256'),'hex')) returning * into v_inv;
   elsif p_action='approve' then
     if v_inv.status<>'pending' or v_inv.expires_at<=now() or v_inv.issued_by<>p_actor
       or not exists(select 1 from public.parents pa join public.profiles pr on pr.id=pa.profile_id
         where pa.profile_id=v_inv.redeemed_by and pr.status='active') then
       return jsonb_build_object('ok',false,'code','unavailable');
     end if;
     insert into public.parent_student_links(parent_profile_id,student_profile_id,status,verified_at,created_by)
       values(v_inv.redeemed_by,p_student,'active',now(),p_actor)
       on conflict(parent_profile_id,student_profile_id) do update
         set status='active',verified_at=now(),created_by=p_actor,updated_at=now();
     update public.parent_link_invites set status='approved',resolved_at=now() where id=v_inv.id;
   elsif p_action in ('reject','revokeInvite') then
     if v_inv.issued_by<>p_actor or v_inv.status not in ('open','pending') then
       return jsonb_build_object('ok',false,'code','unavailable');
     end if;
     update public.parent_link_invites set status=case when p_action='reject' and redeemed_by is not null then 'rejected' else 'revoked' end,
       resolved_at=now() where id=v_inv.id;
   elsif p_action='revoke' then
     if p_parent is null or p_parent=v_child.created_by_parent_profile_id then return jsonb_build_object('ok',false,'code','creatorOnly'); end if;
     update public.parent_student_links set status='revoked',updated_at=now()
       where student_profile_id=p_student and parent_profile_id=p_parent and status='active';
     if not found then return jsonb_build_object('ok',false,'code','unavailable'); end if;
   end if;
 end if;
 insert into public.audit_logs(actor_profile_id,action,target_table,target_id,metadata_json)
 values(p_actor,'child.sharing.'||p_action,'students',p_student,
   jsonb_build_object('invite_id',v_inv.id,'parent_id',case
     when p_action in ('redeem','leave') then p_actor
     when p_action in ('approve','reject') then v_inv.redeemed_by
     else p_parent end));
 if p_action='issue' then return jsonb_build_object('ok',true,'code',v_code,'expires_at',v_inv.expires_at,'child_id',v_child.child_unique_id); end if;
 return jsonb_build_object('ok',true,'state',case when p_action='redeem' then 'pending' else 'saved' end);
end;
$fn$;
revoke all on function public.manage_child_link(uuid,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_child_link(uuid,text,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.parent_link_state(p_actor uuid,p_student uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $fn$
declare v_admin boolean;
begin
 select exists(select 1 from public.profiles p join public.profile_roles pr on pr.profile_id=p.id
   join public.roles r on r.id=pr.role_id where p.id=p_actor and p.status='active' and r.code='administrator') into v_admin;
 if not exists(select 1 from public.parents pa join public.profiles p on p.id=pa.profile_id where p.id=p_actor and p.status='active')
    and not(v_admin and p_student is not null) then return jsonb_build_object('children','[]'::jsonb,'pending','[]'::jsonb); end if;
 return jsonb_build_object('children',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.profile_id,'name',concat_ws(' ',s.first_name,s.last_name),'child_id',s.child_unique_id,
   'is_creator',s.created_by_parent_profile_id=p_actor,'creator_name',cp.display_name,
   'adults',case when s.created_by_parent_profile_id=p_actor or v_admin then coalesce((select jsonb_agg(jsonb_build_object(
     'parent_id',l.parent_profile_id,'name',p.display_name)) from public.parent_student_links l join public.profiles p on p.id=l.parent_profile_id
     where l.student_profile_id=s.profile_id and l.status='active' and l.parent_profile_id<>s.created_by_parent_profile_id),'[]'::jsonb) else '[]'::jsonb end,
   'invitations',case when s.created_by_parent_profile_id=p_actor or v_admin then coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'status',i.status,'expires_at',i.expires_at,'name',p.display_name,
     'masked_email',case when p.email is not null then left(p.email::text,1)||'***@'||split_part(p.email::text,'@',2) end))
     from public.parent_link_invites i left join public.profiles p on p.id=i.redeemed_by
     where i.student_profile_id=s.profile_id and i.status in ('open','pending') and i.expires_at>now()),'[]'::jsonb) else '[]'::jsonb end
   ) order by s.created_at) from public.students s left join public.profiles cp on cp.id=s.created_by_parent_profile_id
   where (p_student is null or s.profile_id=p_student) and (s.created_by_parent_profile_id=p_actor or (v_admin and p_student is not null)
     or exists(select 1 from public.parent_student_links l where l.student_profile_id=s.profile_id and l.parent_profile_id=p_actor and l.status='active'))),'[]'::jsonb),
   -- Pending applicants learn only request state: approval is the boundary for child data.
   'pending',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at))
     from public.parent_link_invites i where i.redeemed_by=p_actor and i.status='pending' and i.expires_at>now()),'[]'::jsonb));
end;
$fn$;
revoke all on function public.parent_link_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.parent_link_state(uuid,uuid) to service_role;

-- A co-parent needs the child's effective learning access, not the payer's
-- financial ledger. Keep progress/entitlements readable through the existing
-- child RLS, expose the per-child free flag, and narrow subscription rows to
-- their paying owner, the child, and staff.
drop policy if exists "subs_select" on public.subscriptions;
create policy "subs_select" on public.subscriptions for select to authenticated
  using (owner_profile_id=public.current_profile_id()
    or student_profile_id=public.current_profile_id()
    or public.is_admin() or public.has_permission('subscriptions.manage'));
drop policy if exists "child_subs_select" on public.child_subscriptions;
create policy "child_subs_select" on public.child_subscriptions for select to authenticated
  using (owner_parent_profile_id=public.current_profile_id()
    or student_profile_id=public.current_profile_id()
    or public.is_admin() or public.has_permission('subscriptions.manage'));
drop policy if exists "sub_subjects_select" on public.subscription_subjects;
create policy "sub_subjects_select" on public.subscription_subjects for select to authenticated
  using (exists(select 1 from public.child_subscriptions cs where cs.id=child_subscription_id
    and (cs.owner_parent_profile_id=public.current_profile_id()
      or cs.student_profile_id=public.current_profile_id() or public.is_admin())));
drop policy if exists "sub_changes_select" on public.subscription_changes;
create policy "sub_changes_select" on public.subscription_changes for select to authenticated
  using (owner_parent_profile_id=public.current_profile_id()
    or student_profile_id=public.current_profile_id()
    or public.is_admin() or public.has_permission('subscriptions.manage'));

create or replace function public.is_child_free_access_active(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select case
 when p_student is null then false
 when p_student=public.current_profile_id() then public.is_free_access_active_for_student(p_student)
 when exists(select 1 from public.students s where s.profile_id=p_student
   and (s.created_by_parent_profile_id=public.current_profile_id()
     or public.is_parent_linked_to_student(s.profile_id)))
 then public.is_free_access_active_for_student(p_student)
 else false end; $$;
revoke all on function public.is_child_free_access_active(uuid) from public,anon;
grant execute on function public.is_child_free_access_active(uuid) to authenticated,service_role;


create or replace function public.admin_child_link_state(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $fn$
declare v_actor uuid;
begin
  v_actor:=public.current_profile_id();
  if v_actor is null or not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return public.parent_link_state(v_actor,p_student);
end;
$fn$;
revoke all on function public.admin_child_link_state(uuid) from public,anon;
grant execute on function public.admin_child_link_state(uuid) to authenticated,service_role;

create or replace function public.admin_revoke_child_link(p_student uuid,p_parent uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_actor uuid;
begin
  v_actor:=public.current_profile_id();
  if v_actor is null or not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return public.manage_child_link(v_actor,'revoke',p_student,null,p_parent,null,null);
end;
$fn$;
revoke all on function public.admin_revoke_child_link(uuid,uuid) from public,anon;
grant execute on function public.admin_revoke_child_link(uuid,uuid) to authenticated,service_role;
