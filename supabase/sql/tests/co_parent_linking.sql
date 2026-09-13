-- Co-parent linking behavioral regression. DEV/STAGING ONLY: all fixtures roll back.
\set ON_ERROR_STOP on
begin;

insert into public.roles(code,name,is_system) values
 ('parent','Parent',true),('student','Student',true)
on conflict(code) do nothing;

insert into auth.users(id,email) values
 ('91000000-0000-0000-0000-000000000001','owner@coparent.invalid'),
 ('91000000-0000-0000-0000-000000000002','second@coparent.invalid'),
 ('91000000-0000-0000-0000-000000000003','third@coparent.invalid'),
 ('91000000-0000-0000-0000-000000000004','child@coparent.invalid');
update public.profiles set status='active',display_name=case auth_user_id
 when '91000000-0000-0000-0000-000000000001' then 'Owner Parent'
 when '91000000-0000-0000-0000-000000000002' then 'Second Parent'
 when '91000000-0000-0000-0000-000000000003' then 'Third Parent'
 else 'Test Child' end
where auth_user_id::text like '91000000-%';

insert into public.parents(profile_id)
 select id from public.profiles where auth_user_id in
 ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000003');
insert into public.students(profile_id,created_by_parent_profile_id,child_unique_id,first_name,last_name)
 select c.id,o.id,'87654321','Test','Child' from public.profiles c,public.profiles o
 where c.auth_user_id='91000000-0000-0000-0000-000000000004'
   and o.auth_user_id='91000000-0000-0000-0000-000000000001';
insert into public.profile_roles(profile_id,role_id)
 select p.id,r.id from public.profiles p join public.roles r on
  r.code=case when p.auth_user_id='91000000-0000-0000-0000-000000000004' then 'student' else 'parent' end
 where p.auth_user_id::text like '91000000-%';
insert into public.parent_student_links(parent_profile_id,student_profile_id,status,verified_at,created_by)
 select o.id,c.id,'active',now(),o.id from public.profiles o,public.profiles c
 where o.auth_user_id='91000000-0000-0000-0000-000000000001'
   and c.auth_user_id='91000000-0000-0000-0000-000000000004';

create temp table _link_test(k text primary key,v jsonb);
insert into _link_test values('issue',(select public.manage_child_link(
 (select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000001'),
 'issue',(select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000004'))));

do $test$ declare j jsonb; begin
 select v into j from _link_test where k='issue';
 if j->>'ok'<>'true' or j->>'child_id'<>'87654321' or (j->>'code')!~'^[A-F0-9]{20}$' then
  raise exception 'issue failed: %',j;
 end if;
 if exists(select 1 from public.parent_link_invites where code_hash=j->>'code') then
  raise exception 'raw invitation code was stored';
 end if;
end $test$;

insert into _link_test values('redeem',(select public.manage_child_link(
 (select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000002'),
 'redeem',null,null,null,'87654321',(select v->>'code' from _link_test where k='issue'))));
do $test$ declare j jsonb; begin
 select v into j from _link_test where k='redeem';
 if j->>'state'<>'pending' then raise exception 'redeem did not become pending: %',j; end if;
 if exists(select 1 from public.parent_student_links l join public.profiles p on p.id=l.parent_profile_id
   where p.auth_user_id='91000000-0000-0000-0000-000000000002' and l.status='active') then
  raise exception 'pending redemption granted access before approval';
 end if;
end $test$;

insert into _link_test values('approve',(select public.manage_child_link(
 (select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000001'),
 'approve',null,(select id from public.parent_link_invites where status='pending'))));
do $test$ declare j jsonb; n int; begin
 select v into j from _link_test where k='approve';
 select count(*) into n from public.parent_student_links l join public.profiles p on p.id=l.parent_profile_id
  where p.auth_user_id='91000000-0000-0000-0000-000000000002' and l.status='active';
 if j->>'ok'<>'true' or n<>1 then raise exception 'approval did not create one active link: %, %',j,n; end if;
 if (select count(*) from public.students where child_unique_id='87654321')<>1 then
  raise exception 'linking duplicated the child';
 end if;
 if exists(select 1 from public.audit_logs where action like 'child.sharing.%'
   and metadata_json::text ~ '(code_hash|[A-F0-9]{20})') then raise exception 'audit leaked invitation material'; end if;
end $test$;

-- The linked parent sees learning identity/progress rows through RLS, but no
-- direct relationship mutation privilege and no payer subscription ledger.
select set_config('request.jwt.claims','{"sub":"91000000-0000-0000-0000-000000000002"}',true);
set local role authenticated;
do $test$ begin
 if (select count(*) from public.students where child_unique_id='87654321')<>1 then
  raise exception 'approved parent cannot see child'; end if;
 if has_table_privilege('authenticated','public.parent_student_links','INSERT') then
  raise exception 'authenticated can forge relationship rows'; end if;
 if exists(select 1 from public.subscription_changes) then
  raise exception 'linked parent can read financial change ledger'; end if;
end $test$;
reset role;

insert into _link_test values('leave',(select public.manage_child_link(
 (select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000002'),
 'leave',(select id from public.profiles where auth_user_id='91000000-0000-0000-0000-000000000004'))));
do $test$ begin
 if exists(select 1 from public.parent_student_links l join public.profiles p on p.id=l.parent_profile_id
   where p.auth_user_id='91000000-0000-0000-0000-000000000002' and l.status='active') then
  raise exception 'leave did not revoke access'; end if;
end $test$;

select 'co_parent_linking' as test_name,'PASS' as status;
rollback;
