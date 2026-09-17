-- Migration: 2026_09_17_180_invite_links_without_approval.sql
-- Purpose: Redeeming an invite code grants access IMMEDIATELY. No approval, no
--          rejection, no pending state.
-- Environment first applied: (pending) staging, then production.
-- Related root SQL: 011 functions.
-- Backport status: pending. Destructive change: no rows deleted. Requires 176.
-- Idempotent. No BEGIN/COMMIT inside this migration.
-- DOWN: restore 176's manage_child_link. Existing links are unaffected either
--       way; never delete parent_student_links rows as rollback.
--
-- WHY (owner, 2026-09-17). The invite code is back, but the approval step is
-- not. The code IS the creator's consent: they generated it for a specific child
-- and handed it to a specific adult. Asking them to confirm a second time was
-- ceremony, and the ceremony never completed once in production - 176's 'issue'
-- branch revokes any invite in 'open' OR 'pending', so generating a fresh code
-- silently destroyed a redemption already waiting for approval. Four invites
-- were minted on 2026-09-15, one was redeemed, and zero links resulted.
--
-- WHAT REPLACES APPROVAL, because removing it removes a signal as well as a gate:
--   * a priority-1 notification to the creating parent on every redemption,
--     naming the adult, so the account owner always learns of it;
--   * the audit row 176 already wrote, now recording a grant rather than a
--     nomination;
--   * the 4-adult cap, MOVED from issue/approve onto the link itself - a cap
--     checked only when a code is issued can be outrun by codes issued before
--     the fourth adult arrived.
--
-- This does NOT replace the credential path (migration 177: child id + child
-- password). Both grant immediately, and the invite is the safer of the two -
-- one-time, expiring, and issued deliberately by the creator rather than resting
-- on a password the child also knows and can pass on.
--
-- THE BODY BELOW IS THE LIVE FUNCTION from pg_get_functiondef on production,
-- modified in five places. Do not retype it.

CREATE OR REPLACE FUNCTION public.manage_child_link(p_actor uuid, p_action text, p_student uuid DEFAULT NULL::uuid, p_invite uuid DEFAULT NULL::uuid, p_parent uuid DEFAULT NULL::uuid, p_child_id text DEFAULT NULL::text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_child public.students%rowtype; v_inv public.parent_link_invites%rowtype; v_actor_nm text;
 v_admin boolean; v_code text; v_count int; v_actor_parent boolean;
begin
 select exists(select 1 from public.parents pa join public.profiles p on p.id=pa.profile_id
   where p.id=p_actor and p.status='active') into v_actor_parent;
 select exists(select 1 from public.profiles p join public.profile_roles pr on pr.profile_id=p.id
   join public.roles r on r.id=pr.role_id where p.id=p_actor and p.status='active' and r.code='administrator') into v_admin;
 if not v_actor_parent and not (v_admin and p_action='revoke') then
   return jsonb_build_object('ok',false,'code','forbidden');
 end if;
 -- 'approve' and 'reject' are REMOVED, not merely unused: a second path that can
 -- still mint a link is how two code paths drift apart. A caller on the old
 -- contract gets the same 'invalid' it would get for a typo.
 if p_action not in ('issue','redeem','revokeInvite','revoke','leave') or p_action is null then
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
 elsif p_action='revokeInvite' then
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
   -- MIGRATION 180: REDEEMING LINKS IMMEDIATELY. There is no pending state and
   -- no approval. The code IS the creator's consent - they generated it for this
   -- child and handed it over - so asking them to confirm a second time was
   -- ceremony, and it was ceremony that never completed: issuing a fresh code
   -- revoked any pending redemption, so a parent who redeemed, saw no prompt and
   -- generated another code destroyed their own request.
   --
   -- A legacy 'pending' row can still exist from before this migration. Let its
   -- original redeemer finish rather than stranding them.
   if v_inv.status='pending' and v_inv.redeemed_by is distinct from p_actor then
     return jsonb_build_object('ok',false,'code','invalidInvite');
   end if;

   -- THE 4-ADULT CAP MOVES HERE WITH THE LINK. It used to sit on 'issue' and
   -- 'approve'; approve is gone, and a cap checked only at issue time can be
   -- outrun by codes issued before the fourth adult joined.
   select count(*)+1 into v_count from public.parent_student_links
     where student_profile_id=p_student and status='active'
       and parent_profile_id<>v_child.created_by_parent_profile_id;
   if v_count>=4 then return jsonb_build_object('ok',false,'code','limit'); end if;

   insert into public.parent_student_links(parent_profile_id,student_profile_id,status,verified_at,created_by)
     values(p_actor,p_student,'active',now(),p_actor)
     on conflict(parent_profile_id,student_profile_id) do update
       set status='active',verified_at=now(),updated_at=now();
   update public.parent_link_invites
     set status='approved',redeemed_by=p_actor,resolved_at=now() where id=v_inv.id;

   -- THE NOTIFICATION REPLACES THE APPROVAL PROMPT. Without it the creator gets
   -- no signal at all that another adult now reaches their child. Priority 1 is
   -- exempt from the platform notification switch and from the recipient's own
   -- mute, because that level is reserved for payment and security - and this is
   -- the second. Category 'announcement' rather than a new one: the web processor
   -- sends channelId = category, and a new value would land on an Android channel
   -- the shipped 1.16.0 binary does not define.
   select coalesce(nullif(btrim(coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,'')),''),pr.display_name)
     into v_actor_nm from public.profiles pr where pr.id=p_actor;
   if v_child.created_by_parent_profile_id is not null then
     perform public.create_notification(
       v_child.created_by_parent_profile_id,'child_access_granted',
       (select display_name from public.profiles where id=p_student),
       v_actor_nm,
       jsonb_build_object('student_profile_id',p_student,'parent_profile_id',p_actor,
                          'parent_name',v_actor_nm,'method','invite'),
       array['in_app','push'],
       'child_access_granted:'||p_student::text||':'||p_actor::text,
       1,null,'announcement',null);
   end if;
 elsif p_action='leave' then
   if v_child.created_by_parent_profile_id=p_actor then return jsonb_build_object('ok',false,'code','creatorOnly'); end if;
   update public.parent_student_links set status='revoked',updated_at=now()
     where student_profile_id=p_student and parent_profile_id=p_actor and status='active';
   if not found then return jsonb_build_object('ok',false,'code','unavailable'); end if;
 else
   if v_child.created_by_parent_profile_id is distinct from p_actor and not(v_admin and p_action='revoke') then
     return jsonb_build_object('ok',false,'code','forbidden');
   end if;
   if p_action='issue' then
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
   -- The 'approve' branch that used to live here is DELETED, not left dormant.
   -- It held a second insert into parent_student_links, and a second way to mint
   -- a link is how two paths drift apart the day somebody re-adds the action to
   -- the whitelist to "fix" something. Redeem does the work now.
   elsif p_action='revokeInvite' then
     if v_inv.issued_by<>p_actor or v_inv.status not in ('open','pending') then
       return jsonb_build_object('ok',false,'code','unavailable');
     end if;
     -- Only revocation remains: there is no nomination left to reject.
     update public.parent_link_invites set status='revoked',
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
     when p_action='revokeInvite' then v_inv.redeemed_by
     else p_parent end));
 if p_action='issue' then return jsonb_build_object('ok',true,'code',v_code,'expires_at',v_inv.expires_at,'child_id',v_child.child_unique_id); end if;
 -- Every successful action is simply saved now. 'pending' WAS the approval
 -- state, and there is no approval.
 return jsonb_build_object('ok',true,'state','saved');
end;
$function$;

revoke all on function public.manage_child_link(uuid,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_child_link(uuid,text,uuid,uuid,uuid,text,text) to service_role;
