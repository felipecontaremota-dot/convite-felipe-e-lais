create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path=public,extensions;
create type public.app_role as enum ('GUEST','ADMIN','CEREMONIALIST');
create type public.rsvp_status as enum ('PENDING','CONFIRMED','DECLINED');
create type public.delivery_channel as enum ('IN_APP','PUSH','EMAIL','WHATSAPP');
create table events (id uuid primary key default gen_random_uuid(),title text not null,starts_at timestamptz not null,timezone text not null default 'America/Sao_Paulo',venue_name text,address text,latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check((latitude is null)=(longitude is null)));
create table event_settings (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,settings jsonb not null default '{}',unique(event_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table profiles (id uuid primary key references auth.users(id) on delete cascade,display_name text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table user_roles (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role app_role not null check(role in ('ADMIN','CEREMONIALIST')),unique(event_id,user_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table invitations (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,name text not null check(length(name) between 1 and 200),active boolean not null default true,code_hash text unique,primary_guest_id uuid,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table guests (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,invitation_id uuid not null,name text not null check(length(name) between 1 and 200),group_label text not null default '',version integer not null default 1,companion_of uuid,foreign key(event_id,invitation_id) references invitations(event_id,id),foreign key(event_id,companion_of) references guests(event_id,id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
alter table invitations add constraint invitations_primary_fk foreign key(event_id,primary_guest_id) references guests(event_id,id) deferrable initially deferred;
create table invitation_sessions (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,invitation_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade,unique(event_id,user_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table guest_contacts (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,email text not null default '',whatsapp text not null default '',consent_in_app boolean not null default true,consent_push boolean not null default false,consent_email boolean not null default false,consent_whatsapp boolean not null default false,consent_changed_at timestamptz not null default now(),foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,unique(guest_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table rsvps (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,status rsvp_status not null default 'PENDING',dietary text not null default '',note text not null default '',responded_at timestamptz,source text not null default 'ADMIN',foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,unique(guest_id),check(length(dietary)<=500 and length(note)<=1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table gifts (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,title text not null check(length(title) between 1 and 200),description text not null default '',image_url text,external_url text,price_label text not null default '',active boolean not null default true,sort_order integer not null default 0,reservation_enabled boolean not null default false,version integer not null default 1,check(image_url is null or image_url ~ '^https://[^ /]+'),check(external_url is null or external_url ~ '^https://[^ /]+'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table gift_selections (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,gift_id uuid not null,foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,foreign key(event_id,gift_id) references gifts(event_id,id) on delete cascade,unique(guest_id,gift_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table message_threads (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,invitation_id uuid,foreign key(event_id,invitation_id) references invitations(event_id,id),unique(event_id,invitation_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table messages (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,thread_id uuid not null,invitation_id uuid,recipient_guest_id uuid,sender_guest_id uuid,sender_user_id uuid references auth.users(id) on delete set null,from_admin boolean not null default false,channels delivery_channel[] not null default '{IN_APP}',content text not null check(length(content) between 1 and 4000),read_at timestamptz,foreign key(event_id,thread_id) references message_threads(event_id,id),foreign key(event_id,invitation_id) references invitations(event_id,id),foreign key(event_id,recipient_guest_id) references guests(event_id,id) on delete cascade,foreign key(event_id,sender_guest_id) references guests(event_id,id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table message_recipients (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,message_id uuid not null,guest_id uuid not null,foreign key(event_id,message_id) references messages(event_id,id) on delete cascade,foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,unique(message_id,guest_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table announcements (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,title text not null,content text not null,rule_id uuid unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table device_push_tokens (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,token text not null,platform text not null check(platform in ('ios','android')),active boolean not null default true,foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,unique(event_id,user_id,guest_id,token),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table notification_rules (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,days_before integer not null check(days_before>=0),title text not null,body text not null,active boolean not null default true,channels delivery_channel[] not null default '{IN_APP}',version integer not null default 1,unique(event_id,days_before),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table notification_jobs (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,rule_id uuid,message_id uuid,guest_id uuid not null,channel delivery_channel not null,idempotency_key text not null unique,status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),attempts integer not null default 0,last_error text,next_attempt_at timestamptz not null default now(),locked_at timestamptz,foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,foreign key(event_id,rule_id) references notification_rules(event_id,id),foreign key(event_id,message_id) references messages(event_id,id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table delivery_attempts (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,job_id uuid not null,status text not null,provider text not null,error text,provider_id text,foreign key(event_id,job_id) references notification_jobs(event_id,id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table qr_credentials (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,token_hash text not null unique,issued_at timestamptz not null default now(),revoked_at timestamptz,foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create unique index one_live_qr_per_guest on qr_credentials(guest_id) where revoked_at is null;
create table checkins (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,guest_id uuid not null,mutation_id uuid not null unique,method text not null check(method in ('QR','MANUAL')),actor_id uuid not null references auth.users(id),foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,unique(event_id,guest_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table sheet_sync_jobs (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,entity_id uuid not null,type text not null default 'GUEST_UPSERT',status text not null default 'pending' check(status in ('pending','processing','success','failed')),attempts integer not null default 0,last_error text,last_run_at timestamptz,next_attempt_at timestamptz not null default now(),locked_at timestamptz,version bigint not null default 1,unique(event_id,entity_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table audit_logs (id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,actor uuid,action text not null,entity text not null,entity_id uuid,metadata jsonb not null default '{}' ,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(event_id,id));
create table mutation_receipts(event_id uuid references events(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,mutation_id uuid not null,created_at timestamptz not null default now(),primary key(event_id,user_id,mutation_id));
create table invitation_rate_limits(bucket text primary key,window_at timestamptz not null default now(),attempts integer not null default 0);
create view invitation_members with (security_invoker=true) as select id as guest_id,invitation_id,event_id,created_at,updated_at from guests;
create function event_role(p_event uuid) returns app_role language sql stable security definer set search_path=public,extensions,pg_temp as $$ select coalesce((select role from user_roles where event_id=p_event and user_id=auth.uid()),(select 'GUEST'::app_role from invitation_sessions s join invitations i on i.id=s.invitation_id where s.event_id=p_event and s.user_id=auth.uid() and i.active)) $$;
create function my_invitation(p_event uuid) returns uuid language sql stable security definer set search_path=public,extensions,pg_temp as $$ select s.invitation_id from invitation_sessions s join invitations i on i.id=s.invitation_id where s.event_id=p_event and s.user_id=auth.uid() and i.active $$;
create function owns_guest(p_event uuid,p_guest uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$ select exists(select 1 from guests where id=p_guest and event_id=p_event and invitation_id=my_invitation(p_event)) $$;
create function touch_row() returns trigger language plpgsql set search_path=public,extensions,pg_temp as $$ begin new.updated_at=now(); return new; end $$;
create function audit_row() returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$ declare r record;begin if tg_op='DELETE' then r=old;else r=new;end if;insert into audit_logs(event_id,actor,action,entity,entity_id) values(r.event_id,auth.uid(),tg_op,tg_table_name,r.id);if tg_op='DELETE' then return old;end if;return new;end $$;
create function enqueue_sheet() returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$ declare gid uuid;eid uuid;begin if tg_table_name='guests' then gid=coalesce(new.id,old.id);else gid=coalesce(new.guest_id,old.guest_id);end if;eid=coalesce(new.event_id,old.event_id);insert into sheet_sync_jobs(event_id,entity_id) values(eid,gid) on conflict(event_id,entity_id) do update set version=sheet_sync_jobs.version+1,status='pending',next_attempt_at=now();if tg_op='DELETE' then return old;end if;return new;end $$;
alter table events enable row level security;
create trigger touch before update on events for each row execute function touch_row();
alter table profiles enable row level security;
create trigger touch before update on profiles for each row execute function touch_row();
alter table event_settings enable row level security;
create trigger touch before update on event_settings for each row execute function touch_row();
alter table user_roles enable row level security;
create trigger touch before update on user_roles for each row execute function touch_row();
alter table invitations enable row level security;
create trigger touch before update on invitations for each row execute function touch_row();
alter table guests enable row level security;
create trigger touch before update on guests for each row execute function touch_row();
alter table invitation_sessions enable row level security;
create trigger touch before update on invitation_sessions for each row execute function touch_row();
alter table guest_contacts enable row level security;
create trigger touch before update on guest_contacts for each row execute function touch_row();
alter table rsvps enable row level security;
create trigger touch before update on rsvps for each row execute function touch_row();
alter table gifts enable row level security;
create trigger touch before update on gifts for each row execute function touch_row();
alter table gift_selections enable row level security;
create trigger touch before update on gift_selections for each row execute function touch_row();
alter table message_threads enable row level security;
create trigger touch before update on message_threads for each row execute function touch_row();
alter table messages enable row level security;
create trigger touch before update on messages for each row execute function touch_row();
alter table message_recipients enable row level security;
create trigger touch before update on message_recipients for each row execute function touch_row();
alter table announcements enable row level security;
create trigger touch before update on announcements for each row execute function touch_row();
alter table device_push_tokens enable row level security;
create trigger touch before update on device_push_tokens for each row execute function touch_row();
alter table notification_rules enable row level security;
create trigger touch before update on notification_rules for each row execute function touch_row();
alter table notification_jobs enable row level security;
create trigger touch before update on notification_jobs for each row execute function touch_row();
alter table delivery_attempts enable row level security;
create trigger touch before update on delivery_attempts for each row execute function touch_row();
alter table qr_credentials enable row level security;
create trigger touch before update on qr_credentials for each row execute function touch_row();
alter table checkins enable row level security;
create trigger touch before update on checkins for each row execute function touch_row();
alter table sheet_sync_jobs enable row level security;
create trigger touch before update on sheet_sync_jobs for each row execute function touch_row();
alter table audit_logs enable row level security;
create trigger touch before update on audit_logs for each row execute function touch_row();
alter table mutation_receipts enable row level security;
alter table invitation_rate_limits enable row level security;
create policy event_public on events for select to anon,authenticated using(true);
create policy profile_self on profiles for select to authenticated using(id=auth.uid());
create policy admin_read on event_settings for select to authenticated using(event_role(event_id)='ADMIN');
grant select on event_settings to authenticated;
create policy admin_read on user_roles for select to authenticated using(event_role(event_id)='ADMIN');
grant select on user_roles to authenticated;
create policy admin_read on invitations for select to authenticated using(event_role(event_id)='ADMIN');
grant select on invitations to authenticated;
create policy admin_read on guests for select to authenticated using(event_role(event_id)='ADMIN');
grant select on guests to authenticated;
create policy admin_read on invitation_sessions for select to authenticated using(event_role(event_id)='ADMIN');
grant select on invitation_sessions to authenticated;
create policy admin_read on guest_contacts for select to authenticated using(event_role(event_id)='ADMIN');
grant select on guest_contacts to authenticated;
create policy admin_read on rsvps for select to authenticated using(event_role(event_id)='ADMIN');
grant select on rsvps to authenticated;
create policy admin_read on gifts for select to authenticated using(event_role(event_id)='ADMIN');
grant select on gifts to authenticated;
create policy admin_read on gift_selections for select to authenticated using(event_role(event_id)='ADMIN');
grant select on gift_selections to authenticated;
create policy admin_read on message_threads for select to authenticated using(event_role(event_id)='ADMIN');
grant select on message_threads to authenticated;
create policy admin_read on messages for select to authenticated using(event_role(event_id)='ADMIN');
grant select on messages to authenticated;
create policy admin_read on message_recipients for select to authenticated using(event_role(event_id)='ADMIN');
grant select on message_recipients to authenticated;
create policy admin_read on announcements for select to authenticated using(event_role(event_id)='ADMIN');
grant select on announcements to authenticated;
create policy admin_read on device_push_tokens for select to authenticated using(event_role(event_id)='ADMIN');
grant select on device_push_tokens to authenticated;
create policy admin_read on notification_rules for select to authenticated using(event_role(event_id)='ADMIN');
grant select on notification_rules to authenticated;
create policy admin_read on notification_jobs for select to authenticated using(event_role(event_id)='ADMIN');
grant select on notification_jobs to authenticated;
create policy admin_read on delivery_attempts for select to authenticated using(event_role(event_id)='ADMIN');
grant select on delivery_attempts to authenticated;
create policy admin_read on qr_credentials for select to authenticated using(event_role(event_id)='ADMIN');
grant select on qr_credentials to authenticated;
create policy admin_read on checkins for select to authenticated using(event_role(event_id)='ADMIN');
grant select on checkins to authenticated;
create policy admin_read on sheet_sync_jobs for select to authenticated using(event_role(event_id)='ADMIN');
grant select on sheet_sync_jobs to authenticated;
create policy admin_read on audit_logs for select to authenticated using(event_role(event_id)='ADMIN');
grant select on audit_logs to authenticated;
create trigger audit after insert or update or delete on user_roles for each row execute function audit_row();
create trigger audit after insert or update or delete on invitations for each row execute function audit_row();
create trigger audit after insert or update or delete on guests for each row execute function audit_row();
create trigger audit after insert or update or delete on guest_contacts for each row execute function audit_row();
create trigger audit after insert or update or delete on rsvps for each row execute function audit_row();
create trigger audit after insert or update or delete on gifts for each row execute function audit_row();
create trigger audit after insert or update or delete on gift_selections for each row execute function audit_row();
create trigger audit after insert or update or delete on messages for each row execute function audit_row();
create trigger audit after insert or update or delete on notification_rules for each row execute function audit_row();
create trigger audit after insert or update or delete on qr_credentials for each row execute function audit_row();
create trigger audit after insert or update or delete on checkins for each row execute function audit_row();
create trigger sync_sheet after insert or update or delete on guests for each row execute function enqueue_sheet();
create trigger sync_sheet after insert or update on guest_contacts for each row execute function enqueue_sheet();
create trigger sync_sheet after insert or update on rsvps for each row execute function enqueue_sheet();
create trigger sync_sheet after insert or delete on checkins for each row execute function enqueue_sheet();
create policy guest_read on invitations for select to authenticated using(id=my_invitation(event_id));
create policy guest_read on guests for select to authenticated using(invitation_id=my_invitation(event_id));
create policy guest_read on guest_contacts for select to authenticated using(owns_guest(event_id,guest_id));
create policy guest_read on rsvps for select to authenticated using(owns_guest(event_id,guest_id));
create policy guest_read on gift_selections for select to authenticated using(owns_guest(event_id,guest_id));
create policy gift_read on gifts for select to authenticated using(event_role(event_id)='GUEST' and active);
create policy announcement_read on announcements for select to authenticated using(event_role(event_id)='GUEST');
create policy guest_messages on messages for select to authenticated using(event_role(event_id)='GUEST' and channels @> '{IN_APP}'::delivery_channel[] and (invitation_id=my_invitation(event_id) or invitation_id is null));
create policy guest_threads on message_threads for select to authenticated using(event_role(event_id)='GUEST' and invitation_id=my_invitation(event_id));
create policy guest_recipients on message_recipients for select to authenticated using(owns_guest(event_id,guest_id));
create policy own_session on invitation_sessions for select to authenticated using(user_id=auth.uid());
grant select on events to anon,authenticated;
grant select on profiles,invitation_members to authenticated;
-- Mutations only through explicit RPCs. No role or session table writes from clients.
revoke all on invitation_rate_limits,mutation_receipts from anon,authenticated;

create function redeem_invitation(p_event uuid,p_user uuid,p_code text,p_bucket text) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare bucket_name text;lim invitation_rate_limits;inv uuid;
begin
 foreach bucket_name in array array['user:'||p_user::text,'ip:'||p_bucket,'global:'||p_event::text] loop
  insert into invitation_rate_limits(bucket) values(bucket_name) on conflict do nothing;
  select * into lim from invitation_rate_limits where bucket=bucket_name for update;
  if lim.window_at < now()-interval '15 minutes' then update invitation_rate_limits set window_at=now(),attempts=1 where bucket=bucket_name;else update invitation_rate_limits set attempts=attempts+1 where bucket=bucket_name;end if;
  if lim.window_at>=now()-interval '15 minutes' and lim.attempts>=(case when bucket_name like 'global:%' then 1000 else 15 end) then return false;end if;
 end loop;
 if p_code !~ '^[A-Za-z0-9_-]{32,64}$' then return false;end if;
 select id into inv from invitations where event_id=p_event and active and code_hash=encode(digest(p_code,'sha256'),'hex');
 if inv is null or exists(select 1 from user_roles where event_id=p_event and user_id=p_user) then return false;end if;
 insert into invitation_sessions(event_id,user_id,invitation_id) values(p_event,p_user,inv) on conflict(event_id,user_id) do update set invitation_id=excluded.invitation_id;
 return true;
end $$;
create function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event);inv uuid:=my_invitation(p_event);result jsonb;
begin
 if role is null then raise exception 'unauthorized';end if;
 select jsonb_build_object('role',role,'event',to_jsonb(e)) into result from events e where id=p_event;
 result=result||jsonb_build_object(
 'invitations',(select coalesce(jsonb_agg(to_jsonb(i)-'code_hash'),'[]') from invitations i where event_id=p_event and (role='ADMIN' or i.id=inv or role='CEREMONIALIST' and i.active)),
 'guests',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from guests g where event_id=p_event and (role='ADMIN' or g.invitation_id=inv or role='CEREMONIALIST' and exists(select 1 from rsvps r where r.guest_id=g.id and r.status='CONFIRMED'))),
 'rsvps',(select coalesce(jsonb_agg(case when role='CEREMONIALIST' then jsonb_build_object('event_id',r.event_id,'guest_id',r.guest_id,'status',r.status,'dietary','','note','','responded_at',r.responded_at,'source',r.source) else to_jsonb(r) end),'[]') from rsvps r where event_id=p_event and (role='ADMIN' or owns_guest(p_event,r.guest_id) or role='CEREMONIALIST' and r.status='CONFIRMED')),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from guest_contacts c where event_id=p_event and (role='ADMIN' or role='GUEST' and owns_guest(p_event,c.guest_id))),
 'gifts',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from gifts g where event_id=p_event and (role='ADMIN' or role='GUEST' and g.active)),
 'gift_selections',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from gift_selections g where event_id=p_event and (role='ADMIN' or role='GUEST' and owns_guest(p_event,g.guest_id))),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from messages m where event_id=p_event and (role='ADMIN' or role='GUEST' and m.channels @> '{IN_APP}'::delivery_channel[] and (m.invitation_id=inv or m.invitation_id is null))),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from announcements a where event_id=p_event and role in ('ADMIN','GUEST')),
 'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.days_before desc),'[]') from notification_rules r where event_id=p_event and role='ADMIN'),
 'credentials',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from qr_credentials q where event_id=p_event and revoked_at is null and role in ('ADMIN','CEREMONIALIST')),
 'notification_jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'channel',j.channel,'status',j.status,'attempts',j.attempts,'last_error',j.last_error,'created_at',j.created_at)),'[]') from notification_jobs j where event_id=p_event and role='ADMIN'),
 'sheet_jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'status',j.status,'attempts',j.attempts,'last_error',j.last_error,'version',j.version)),'[]') from sheet_sync_jobs j where event_id=p_event and role='ADMIN'),
 'checkins',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]') from checkins c where event_id=p_event and role in ('ADMIN','CEREMONIALIST')));
 return result;
end $$;
create function issue_ticket(p_event uuid,p_guest uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare token text:=encode(gen_random_bytes(32),'hex');
begin
 if event_role(p_event) is distinct from 'ADMIN' and not owns_guest(p_event,p_guest) then raise exception 'unauthorized';end if;
 perform 1 from guests where event_id=p_event and id=p_guest for update;
 if not exists(select 1 from rsvps where event_id=p_event and guest_id=p_guest and status='CONFIRMED') then raise exception 'not confirmed';end if;
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=p_guest and revoked_at is null;
 insert into qr_credentials(event_id,guest_id,token_hash) values(p_event,p_guest,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('guest_id',p_guest,'token',token);
end $$;
create function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event);gid uuid:=(p_payload->>'guest_id')::uuid;inv uuid:=my_invitation(p_event);tid uuid;mid uuid;recipient uuid;msg text;chan delivery_channel;method text;
begin
 if role is null then raise exception 'unauthorized';end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true);end if;
 if gid is not null then
 perform 1 from guests where id=gid and event_id=p_event for update;
 if not found then raise exception 'invalid guest';end if;
 if role='GUEST' and not owns_guest(p_event,gid) then raise exception 'unauthorized';end if;
 end if;
 if role='CEREMONIALIST' and p_type<>'CHECKIN_CREATE' then raise exception 'unauthorized';end if;
 case p_type
 when 'RSVP_UPDATE' then
 insert into rsvps(event_id,guest_id,status,dietary,note,responded_at,source) values(p_event,gid,(p_payload->>'status')::rsvp_status,coalesce(p_payload->>'dietary',''),coalesce(p_payload->>'note',''),now(),'APP') on conflict(guest_id) do update set status=excluded.status,dietary=excluded.dietary,note=excluded.note,responded_at=now(),source='APP';
 if p_payload->>'status'<>'CONFIRMED' then update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=gid and revoked_at is null;end if;
 when 'CONTACT_UPDATE' then
 if length(coalesce(p_payload->>'email',''))>320 or length(coalesce(p_payload->>'whatsapp',''))>30 then raise exception 'invalid contact';end if;
 insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_push,consent_email,consent_whatsapp) values(p_event,gid,coalesce(p_payload->>'email',''),coalesce(p_payload->>'whatsapp',''),coalesce((p_payload->>'consent_in_app')::boolean,false),coalesce((p_payload->>'consent_push')::boolean,false),coalesce((p_payload->>'consent_email')::boolean,false),coalesce((p_payload->>'consent_whatsapp')::boolean,false)) on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp,consent_in_app=excluded.consent_in_app,consent_push=excluded.consent_push,consent_email=excluded.consent_email,consent_whatsapp=excluded.consent_whatsapp,consent_changed_at=now();
 if not coalesce((p_payload->>'consent_push')::boolean,false) then update device_push_tokens set active=false where event_id=p_event and guest_id=gid;end if;
 when 'GIFT_SELECT' then
 if not exists(select 1 from gifts where id=(p_payload->>'gift_id')::uuid and event_id=p_event and active) then raise exception 'invalid gift';end if;
 if (p_payload->>'selected')::boolean then insert into gift_selections(event_id,guest_id,gift_id) values(p_event,gid,(p_payload->>'gift_id')::uuid) on conflict do nothing;else delete from gift_selections where guest_id=gid and gift_id=(p_payload->>'gift_id')::uuid and event_id=p_event;end if;
 when 'PUSH_REGISTER' then
 if not exists(select 1 from guest_contacts where guest_id=gid and event_id=p_event and consent_push) or p_payload->>'token' !~ '^(ExponentPushToken|ExpoPushToken)\[.{1,200}\]$' then raise exception 'push not allowed';end if;
 insert into device_push_tokens(event_id,guest_id,user_id,token,platform) values(p_event,gid,auth.uid(),p_payload->>'token',p_payload->>'platform') on conflict(event_id,user_id,guest_id,token) do update set active=true;
 when 'CHECKIN_CREATE' then
 if role not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 if not exists(select 1 from rsvps where event_id=p_event and guest_id=gid and status='CONFIRMED') then raise exception 'not confirmed';end if;
 method=p_payload->>'method';if method not in ('QR','MANUAL') then raise exception 'invalid method';end if;
 if method='QR' and not exists(select 1 from qr_credentials where event_id=p_event and guest_id=gid and token_hash=p_payload->>'token_hash' and revoked_at is null) then raise exception 'invalid QR';end if;
 insert into checkins(event_id,guest_id,mutation_id,method,actor_id) values(p_event,gid,p_mutation,method,auth.uid()) on conflict(event_id,guest_id) do nothing;
 return (select to_jsonb(c)||jsonb_build_object('duplicate',c.mutation_id<>p_mutation) from checkins c where event_id=p_event and guest_id=gid);
 when 'MESSAGE_SEND' then
 if role='ADMIN' then inv=(p_payload->>'invitation_id')::uuid;recipient=(p_payload->>'recipient_guest_id')::uuid;end if;
 if inv is not null and not exists(select 1 from invitations where id=inv and event_id=p_event and active) then raise exception 'invalid invitation';end if;
 if recipient is not null and not exists(select 1 from guests where id=recipient and event_id=p_event and invitation_id=inv) then raise exception 'invalid recipient';end if;
 if role='GUEST' and p_payload->>'sender_guest_id' is not null and not owns_guest(p_event,(p_payload->>'sender_guest_id')::uuid) then raise exception 'invalid sender';end if;
 msg=trim(p_payload->>'content');
 insert into message_threads(event_id,invitation_id) values(p_event,inv) on conflict(event_id,invitation_id) do update set updated_at=now() returning id into tid;
 insert into messages(event_id,thread_id,invitation_id,recipient_guest_id,sender_guest_id,sender_user_id,from_admin,content,channels) values(p_event,tid,inv,recipient,case when role='GUEST' then (p_payload->>'sender_guest_id')::uuid else null end,auth.uid(),role='ADMIN',msg,case when role='ADMIN' then array(select jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'))::delivery_channel) else '{IN_APP}'::delivery_channel[] end) returning id into mid;
 if role='ADMIN' then
 insert into message_recipients(event_id,message_id,guest_id) select p_event,mid,g.id from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.active and (inv is null or g.invitation_id=inv) and (recipient is null or g.id=recipient);
 for chan in select jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'))::delivery_channel loop
 insert into notification_jobs(event_id,message_id,guest_id,channel,idempotency_key) select p_event,mid,mr.guest_id,chan,mid||':'||mr.guest_id||':'||chan from message_recipients mr where message_id=mid on conflict do nothing;
 end loop;
 if inv is null and coalesce(p_payload->'channels','["IN_APP"]') ? 'IN_APP' then insert into announcements(event_id,title,content) values(p_event,'Mensagem dos noivos',msg);end if;
 end if;
 else raise exception 'unknown mutation';end case;
 return jsonb_build_object('ok',true);
end $$;
