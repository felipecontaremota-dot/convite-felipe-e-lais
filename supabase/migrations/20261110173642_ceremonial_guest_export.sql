begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
-- Read-only operational export. Contacts, invitation links, PINs and QR secrets
-- remain ADMIN-only. This function never queries the access/contact tables.
-- No changes to data, policies, table grants or existing RPC implementations.
create function public.guest_list_export(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor_role public.app_role:=public.event_role(p_event);
begin
 if auth.uid() is null or actor_role is null or actor_role not in ('ADMIN','CEREMONIALIST') then
  raise exception 'unauthorized' using errcode='42501';
 end if;
 return jsonb_build_object(
  'role',actor_role,'event',jsonb_build_object('id',p_event),
  'guests',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'event_id',g.event_id,'invitation_id',g.invitation_id,'name',g.name,
   'group_label',g.group_label,'version',g.version,'companion_of',g.companion_of,
   'is_child',g.is_child,'is_adolescent',g.is_adolescent,
   'invitation_sent',coalesce(s.sent,false),'party_role',p.role)),'[]'::jsonb)
   from public.guests g
   left join public.guest_invitation_status s on s.event_id=g.event_id and s.guest_id=g.id
   left join wedding_party_private.promotions p on p.event_id=g.event_id and p.guest_id=g.id and p.active
   where g.event_id=p_event),
  'invitations',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',i.id,'event_id',i.event_id,'name',i.name,'active',i.active,'kind',i.kind,
   'primary_guest_id',i.primary_guest_id,'version',i.version)),'[]'::jsonb)
   from public.invitations i where i.event_id=p_event),
  'contacts','[]'::jsonb,
  'rsvps',(select coalesce(jsonb_agg(jsonb_build_object('event_id',r.event_id,'guest_id',r.guest_id,'status',r.status,'responded_at',r.responded_at,'dietary','','note','','source',r.source)),'[]'::jsonb) from public.rsvps r where r.event_id=p_event)
 );
end $$;
revoke all on function public.guest_list_export(uuid) from public,anon,authenticated,service_role;
grant execute on function public.guest_list_export(uuid) to authenticated;
commit;
