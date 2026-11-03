begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- New supplier-centric ledger. Previous planning_* records remain untouched as
-- an archive; inconsistent historical financial amounts are never guessed.
create table public.planning_vendors (
 id uuid primary key,event_id uuid not null references public.events(id),name text not null check(length(trim(name)) between 1 and 200),
 details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
 total_cents bigint not null default 0 check(total_cents between 0 and 99999999999),
 plan_type text not null default 'CASH' check(plan_type in ('CASH','DOWN','INSTALLMENTS')),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,unique(event_id,id)
);
create index planning_vendor_event on public.planning_vendors(event_id) where deleted_at is null;
create unique index planning_vendor_name on public.planning_vendors(event_id,lower(trim(name))) where deleted_at is null;
create unique index planning_vendor_tax on public.planning_vendors(event_id,(details->>'tax_id')) where deleted_at is null and coalesce(details->>'tax_id','')<>'';
create table public.planning_dues (
 id uuid primary key,event_id uuid not null,vendor_id uuid not null,label text not null check(length(trim(label)) between 1 and 120),
 amount_cents bigint not null check(amount_cents between 1 and 99999999999),due_on date not null,position integer not null check(position between 0 and 120),
 deleted_at timestamptz,unique(event_id,id),unique(event_id,vendor_id,id),
 foreign key(event_id,vendor_id) references public.planning_vendors(event_id,id)
);
create index planning_due_vendor on public.planning_dues(event_id,vendor_id,due_on);
create table public.planning_settlements (
 id uuid primary key,event_id uuid not null,vendor_id uuid not null,due_id uuid not null,
 amount_cents bigint not null check(amount_cents between 1 and 99999999999),paid_on date not null,
 method text not null check(length(trim(method)) between 1 and 100),notes text not null default '' check(length(notes)<=4000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,
 foreign key(event_id,vendor_id,due_id) references public.planning_dues(event_id,vendor_id,id),unique(event_id,id)
);
create index planning_settlement_due on public.planning_settlements(event_id,vendor_id,due_id);
alter table public.planning_vendors enable row level security;
alter table public.planning_dues enable row level security;
alter table public.planning_settlements enable row level security;
revoke all on public.planning_vendors,public.planning_dues,public.planning_settlements from public,anon,authenticated;
grant select on public.planning_vendors,public.planning_dues,public.planning_settlements to authenticated;
create policy planning_vendor_admin on public.planning_vendors for select to authenticated using(public.event_role(event_id)='ADMIN');
create policy planning_due_admin on public.planning_dues for select to authenticated using(public.event_role(event_id)='ADMIN');
create policy planning_settlement_admin on public.planning_settlements for select to authenticated using(public.event_role(event_id)='ADMIN');
-- Preserve real contact/bank registrations, not the old contract/parcel ambiguity.
insert into public.planning_vendors(id,event_id,name,details,created_at,updated_at,created_by,updated_by)
select id,event_id,name,to_jsonb(s)-array['id','event_id','name','version','created_at','updated_at','created_by','updated_by','deleted_at'],created_at,updated_at,created_by,updated_by
from public.planning_suppliers s where deleted_at is null;

create function public.planning_simple_snapshot(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized' using errcode='42501';end if;
 return jsonb_build_object(
 'vendors',coalesce((select jsonb_agg(to_jsonb(v) order by v.name,v.id) from public.planning_vendors v where event_id=p_event and deleted_at is null),'[]'),
 'dues',coalesce((select jsonb_agg(to_jsonb(d) order by d.due_on,d.position,d.id) from public.planning_dues d join public.planning_vendors v on v.id=d.vendor_id and v.event_id=d.event_id where d.event_id=p_event and d.deleted_at is null and v.deleted_at is null),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on,p.id) from public.planning_settlements p join public.planning_vendors v on v.id=p.vendor_id and v.event_id=p.event_id where p.event_id=p_event and p.deleted_at is null and v.deleted_at is null),'[]'),
 'budget',(select to_jsonb(b) from public.planning_budgets b where event_id=p_event and deleted_at is null),
 'legacy_count',(select count(*) from public.planning_entries where event_id=p_event));
end $$;
revoke all on function public.planning_simple_snapshot(uuid) from public,anon,service_role;
grant execute on function public.planning_simple_snapshot(uuid) to authenticated;

create function public.planning_simple_action(p_event uuid,p_kind text,p_id uuid,p_version integer,p_values jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set lock_timeout='3s' set statement_timeout='15s' as $$
declare v public.planning_vendors%rowtype;d public.planning_dues%rowtype;p public.planning_settlements%rowtype;
 old_doc jsonb;old_plan jsonb;item jsonb;info jsonb;fingerprint text;saved jsonb;result jsonb;total bigint;paid bigint;vendor_paid bigint;amount bigint;plan_sum bigint:=0;seen uuid[]:='{}';changed_paid boolean:=false;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized' using errcode='42501';end if;
 if p_id is null or p_request is null or p_values is null or jsonb_typeof(p_values)<>'object' or length(p_values::text)>60000 then raise exception 'simple_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('planning-simple:'||p_event::text,0));
 fingerprint:=encode(extensions.digest(p_kind||p_id::text||coalesce(p_version::text,'new')||p_values::text,'sha256'),'hex');
 select r.result into saved from public.mutation_receipts r where event_id=p_event and user_id=auth.uid() and mutation_id=p_request;
 if found then
  if saved->>'module' is distinct from 'simple-planning' or saved->>'fingerprint' is distinct from fingerprint then raise exception 'simple_stale';end if;
  return saved->'result';
 end if;
 if p_kind in ('VENDOR_SAVE','VENDOR_DELETE') then
  select * into v from public.planning_vendors where event_id=p_event and id=p_id for update;
  if (v.id is null and p_version is not null) or (v.id is not null and (v.version is distinct from p_version or v.deleted_at is not null)) then raise exception 'simple_stale';end if;
  old_doc=to_jsonb(v);
  select jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'due_on',due_on,'position',position) order by position,id) into old_plan from public.planning_dues where event_id=p_event and vendor_id=p_id and deleted_at is null;
  if p_kind='VENDOR_DELETE' then
   if v.id is null then raise exception 'simple_stale';end if;
   select coalesce(sum(amount_cents),0) into paid from public.planning_settlements where event_id=p_event and vendor_id=p_id and deleted_at is null;
   if (p_values->>'expected_paid_cents')::bigint is distinct from paid then raise exception 'simple_stale';end if;
   update public.planning_vendors set deleted_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event and id=p_id;
  else
   if exists(select 1 from jsonb_object_keys(p_values) k where k not in ('name','details','total_cents','plan_type','dues','confirm_paid')) then raise exception 'simple_invalid';end if;
   if (p_values->>'total_cents') !~ '^[0-9]+$' or not(p_values ? 'total_cents') then raise exception 'simple_invalid';end if;
   total=(p_values->>'total_cents')::bigint;
   info=coalesce(p_values->'details','{}');
   if jsonb_typeof(info)<>'object' or exists(select 1 from jsonb_object_keys(info) k where k not in ('responsible','tax_id','category','phone','whatsapp','email','website','address','pix_type','pix_key','holder_name','holder_tax_id','bank','agency','account','account_type','notes')) then raise exception 'simple_invalid';end if;
   if exists(select 1 from jsonb_each(info) e where jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>4000) then raise exception 'simple_invalid';end if;
   if nullif(info->>'tax_id','') is not null and not planning_private.valid_tax(info->>'tax_id') then raise exception 'simple_tax';end if;
   if nullif(info->>'holder_tax_id','') is not null and not planning_private.valid_tax(info->>'holder_tax_id') then raise exception 'simple_tax';end if;
   if nullif(info->>'email','') is not null and (info->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'simple_email';end if;
   if nullif(info->>'pix_type','') is not null then
    if (info->>'pix_type'='CPF' and (length(info->>'pix_key')<>11 or not planning_private.valid_tax(info->>'pix_key')))
    or (info->>'pix_type'='CNPJ' and (length(info->>'pix_key')<>14 or not planning_private.valid_tax(info->>'pix_key')))
    or (info->>'pix_type'='PHONE' and (info->>'pix_key') !~ '^\+[1-9][0-9]{9,14}$')
    or (info->>'pix_type'='EMAIL' and (info->>'pix_key') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (info->>'pix_type'='RANDOM' and (info->>'pix_key') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    or info->>'pix_type' not in ('CPF','CNPJ','PHONE','EMAIL','RANDOM') or coalesce(info->>'pix_key','')='' then raise exception 'simple_pix';end if;
   elsif coalesce(info->>'pix_key','')<>'' then raise exception 'simple_pix';end if;
   if jsonb_typeof(p_values->'dues') is distinct from 'array' or jsonb_array_length(p_values->'dues')>121 then raise exception 'simple_invalid';end if;
   select coalesce(sum(amount_cents),0) into vendor_paid from public.planning_settlements where event_id=p_event and vendor_id=p_id and deleted_at is null;
   if total<vendor_paid then raise exception 'simple_below_paid';end if;
   -- Validate the entire replacement plan before changing any rows.
   for item in select value from jsonb_array_elements(p_values->'dues') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','label','amount_cents','due_on','position')) or jsonb_typeof(item)<>'object' then raise exception 'simple_invalid';end if;
    if (item->>'amount_cents') !~ '^[0-9]+$' or not(item ? 'amount_cents') then raise exception 'simple_invalid';end if;
    amount=(item->>'amount_cents')::bigint;
    if amount<1 or amount>99999999999 or (item->>'id')::uuid=any(seen) then raise exception 'simple_invalid';end if;
    if (item->>'id') is null then raise exception 'simple_invalid';end if;
    seen=array_append(seen,(item->>'id')::uuid);plan_sum=plan_sum+amount;
    select * into d from public.planning_dues where id=(item->>'id')::uuid;
    if d.id is not null and (d.event_id<>p_event or d.vendor_id<>p_id or d.deleted_at is not null) then raise exception 'simple_invalid';end if;
    select coalesce(sum(amount_cents),0) into paid from public.planning_settlements where event_id=p_event and due_id=(item->>'id')::uuid and deleted_at is null;
    if amount<paid then raise exception 'simple_below_paid';end if;
    if paid>0 and (d.amount_cents<>amount or d.due_on is distinct from (item->>'due_on')::date or d.position is distinct from (item->>'position')::int or d.label is distinct from item->>'label') then changed_paid=true;end if;
   end loop;
   if plan_sum<>total then raise exception 'simple_plan_difference';end if;
   if exists(select 1 from public.planning_dues existing_due join public.planning_settlements paid_row on paid_row.event_id=existing_due.event_id and paid_row.due_id=existing_due.id where existing_due.event_id=p_event and existing_due.vendor_id=p_id and existing_due.deleted_at is null and paid_row.deleted_at is null and not(existing_due.id=any(seen))) then raise exception 'simple_paid_due';end if;
   if changed_paid and coalesce((p_values->>'confirm_paid')::boolean,false) is not true then raise exception 'simple_confirm_paid';end if;
   if v.id is null then
    insert into public.planning_vendors(id,event_id,name,details,total_cents,plan_type,created_by,updated_by) values(p_id,p_event,p_values->>'name',info,total,p_values->>'plan_type',auth.uid(),auth.uid());
   else
    update public.planning_vendors set name=p_values->>'name',details=info,total_cents=total,plan_type=p_values->>'plan_type',version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event and id=p_id;
   end if;
   update public.planning_dues set deleted_at=now() where event_id=p_event and vendor_id=p_id and deleted_at is null and not(id=any(seen));
   for item in select value from jsonb_array_elements(p_values->'dues') loop
    insert into public.planning_dues(id,event_id,vendor_id,label,amount_cents,due_on,position)
    values((item->>'id')::uuid,p_event,p_id,item->>'label',(item->>'amount_cents')::bigint,(item->>'due_on')::date,(item->>'position')::int)
    on conflict(id) do update set label=excluded.label,amount_cents=excluded.amount_cents,due_on=excluded.due_on,position=excluded.position;
   end loop;
  end if;
  select version into p_version from public.planning_vendors where event_id=p_event and id=p_id;
 elsif p_kind in ('PAYMENT_SAVE','PAYMENT_DELETE') then
  select * into p from public.planning_settlements where event_id=p_event and id=p_id for update;
  if (p.id is null and p_version is not null) or (p.id is not null and (p.version is distinct from p_version or p.deleted_at is not null)) then raise exception 'simple_stale';end if;
  old_doc=to_jsonb(p);
  if p_kind='PAYMENT_DELETE' then
   if p.id is null then raise exception 'simple_stale';end if;
   select * into v from public.planning_vendors where event_id=p_event and id=p.vendor_id and deleted_at is null;
   if v.id is null then raise exception 'simple_stale';end if;
   update public.planning_settlements set deleted_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event and id=p_id;
  else
   if exists(select 1 from jsonb_object_keys(p_values) k where k not in ('due_id','amount_cents','paid_on','method','notes')) or (p_values->>'amount_cents') !~ '^[0-9]+$' or not(p_values ? 'amount_cents') then raise exception 'simple_invalid';end if;
   select * into d from public.planning_dues where event_id=p_event and id=(p_values->>'due_id')::uuid and deleted_at is null;
   select * into v from public.planning_vendors where event_id=p_event and id=d.vendor_id and deleted_at is null;
   if d.id is null or v.id is null or (p.id is not null and p.due_id<>d.id) then raise exception 'simple_invalid';end if;
   amount=(p_values->>'amount_cents')::bigint;
   select coalesce(sum(amount_cents),0) into paid from public.planning_settlements where event_id=p_event and due_id=d.id and deleted_at is null and id<>p_id;
   select coalesce(sum(amount_cents),0) into vendor_paid from public.planning_settlements where event_id=p_event and vendor_id=v.id and deleted_at is null and id<>p_id;
   -- Strict >: equality is a normal full payment, never an overpayment.
   if paid+amount>d.amount_cents or vendor_paid+amount>v.total_cents then raise exception 'simple_overpay';end if;
   if (p_values->>'paid_on')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'simple_future_payment';end if;
   if p.id is null then
    insert into public.planning_settlements(id,event_id,vendor_id,due_id,amount_cents,paid_on,method,notes,created_by,updated_by)
    values(p_id,p_event,v.id,d.id,amount,(p_values->>'paid_on')::date,p_values->>'method',coalesce(p_values->>'notes',''),auth.uid(),auth.uid());
   else
    update public.planning_settlements set amount_cents=amount,paid_on=(p_values->>'paid_on')::date,method=p_values->>'method',notes=coalesce(p_values->>'notes',''),version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event and id=p_id;
   end if;
  end if;
  select version into p_version from public.planning_settlements where event_id=p_event and id=p_id;
 else raise exception 'simple_invalid';end if;
 -- Financial audit only. No contact/bank fields or free notes copied into logs.
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),p_kind,'planning_simple',p_id,jsonb_build_object('version',p_version,'old_total',old_doc->'total_cents','old_amount',old_doc->'amount_cents','total',p_values->'total_cents','amount',p_values->'amount_cents','old_plan',old_plan,'plan',p_values->'dues','paid_on',p_values->'paid_on','due_id',p_values->'due_id'));
 result=jsonb_build_object('id',p_id,'version',p_version);
 insert into public.mutation_receipts(event_id,user_id,mutation_id,result) values(p_event,auth.uid(),p_request,jsonb_build_object('module','simple-planning','fingerprint',fingerprint,'result',result));
 return result;
exception when insufficient_privilege then raise;
 when lock_not_available or query_canceled then raise exception 'simple_busy';
 when unique_violation then raise exception 'simple_duplicate';
 when others then
  if sqlerrm ~ '^simple_[a-z_]+$' then raise;end if;
  raise exception 'simple_invalid';
end $$;
revoke all on function public.planning_simple_action(uuid,text,uuid,integer,jsonb,uuid) from public,anon,service_role;
grant execute on function public.planning_simple_action(uuid,text,uuid,integer,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
