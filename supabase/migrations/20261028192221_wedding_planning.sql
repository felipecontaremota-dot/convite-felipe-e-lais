-- Isolated administrative ledger. No existing application RPC or historical migration is replaced.
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
create schema planning_private;
revoke all on schema planning_private from public,anon,authenticated;
create table public.planning_suppliers (
 id uuid primary key, event_id uuid not null references public.events(id),
 name text not null check(length(trim(name)) between 1 and 200), responsible text not null default '',
 tax_id text not null default '', category text not null default '', phone text not null default '', whatsapp text not null default '',
 email text not null default '', website text not null default '', address text not null default '',
 pix_type text not null default '' check(pix_type in ('','CPF','CNPJ','PHONE','EMAIL','RANDOM')),
 pix_key text not null default '', holder_name text not null default '', holder_tax_id text not null default '',
 bank text not null default '', agency text not null default '', account text not null default '', notes text not null default '',
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null, updated_by uuid not null, deleted_at timestamptz, unique(event_id,id)
);
create unique index planning_supplier_name on public.planning_suppliers(event_id,lower(trim(name))) where deleted_at is null;
create unique index planning_supplier_tax on public.planning_suppliers(event_id,tax_id) where deleted_at is null and tax_id<>'';
create table public.planning_entries (
 id uuid primary key,event_id uuid not null references public.events(id),
 kind text not null check(kind in ('SERVICE','EXPENSE')),title text not null check(length(trim(title)) between 1 and 200),
 category text not null default '',description text not null default '',supplier_id uuid,
 status text not null default 'PLANNED' check(status in ('PLANNED','QUOTED','NEGOTIATING','CONTRACTED','COMPLETED','CANCELLED')),
 contracted_on date, delivery_on date, notes text not null default '',
 estimated_cents bigint not null default 0 check(estimated_cents between 0 and 99999999999),
 agreed_cents bigint not null default 0 check(agreed_cents between 0 and 99999999999),
 discount_cents bigint not null default 0 check(discount_cents between 0 and agreed_cents),
 settlement_cents bigint not null default 0 check(settlement_cents between 0 and 99999999999),
 payment_method text not null default '',financial_notes text not null default '',
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,unique(event_id,id),
 foreign key(event_id,supplier_id) references public.planning_suppliers(event_id,id)
);
create index planning_entry_supplier on public.planning_entries(event_id,supplier_id);
create index planning_entry_status on public.planning_entries(event_id,status);
create table public.planning_installments (
 id uuid primary key,event_id uuid not null references public.events(id),entry_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 200),position integer not null default 1 check(position>0),
 amount_cents bigint not null check(amount_cents between 1 and 99999999999),due_on date not null,notes text not null default '',
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,unique(event_id,id),unique(event_id,entry_id,id),
 foreign key(event_id,entry_id) references public.planning_entries(event_id,id)
);
create index planning_installment_due on public.planning_installments(event_id,due_on,entry_id) where deleted_at is null;
create table public.planning_payments (
 id uuid primary key,event_id uuid not null references public.events(id),entry_id uuid not null,installment_id uuid not null,
 supplier_id uuid,supplier_name text not null default '',
 amount_cents bigint not null check(amount_cents between 1 and 99999999999),paid_on date not null,
 method text not null check(length(trim(method)) between 1 and 100),notes text not null default '',
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,unique(event_id,id),
 foreign key(event_id,entry_id,installment_id) references public.planning_installments(event_id,entry_id,id),
 foreign key(event_id,supplier_id) references public.planning_suppliers(event_id,id)
);
create index planning_payment_supplier on public.planning_payments(event_id,supplier_id);
create index planning_payment_entry on public.planning_payments(event_id,entry_id,installment_id);
create table public.planning_budgets (
 id uuid primary key references public.events(id),event_id uuid not null unique references public.events(id),
 amount_cents bigint not null check(amount_cents between 0 and 99999999999),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,check(id=event_id)
);
create table public.planning_documents (
 id uuid primary key,event_id uuid not null references public.events(id),supplier_id uuid,entry_id uuid,payment_id uuid,
 name text not null check(length(name) between 1 and 200),mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 object_path text not null unique,state text not null default 'PENDING' check(state in ('PENDING','READY')),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null,updated_by uuid not null,deleted_at timestamptz,unique(event_id,id),
 check(num_nonnulls(supplier_id,entry_id,payment_id)=1),
 foreign key(event_id,supplier_id) references public.planning_suppliers(event_id,id),
 foreign key(event_id,entry_id) references public.planning_entries(event_id,id),
 foreign key(event_id,payment_id) references public.planning_payments(event_id,id)
);
create index planning_document_supplier on public.planning_documents(event_id,supplier_id);
create index planning_document_entry on public.planning_documents(event_id,entry_id);
create index planning_document_payment on public.planning_documents(event_id,payment_id);
alter table public.planning_suppliers enable row level security;
revoke all on public.planning_suppliers from public,anon,authenticated;
grant select on public.planning_suppliers to authenticated;
create policy planning_admin_read on public.planning_suppliers for select to authenticated using(public.event_role(event_id)='ADMIN');
alter table public.planning_entries enable row level security;
revoke all on public.planning_entries from public,anon,authenticated;
grant select on public.planning_entries to authenticated;
create policy planning_admin_read on public.planning_entries for select to authenticated using(public.event_role(event_id)='ADMIN');
alter table public.planning_installments enable row level security;
revoke all on public.planning_installments from public,anon,authenticated;
grant select on public.planning_installments to authenticated;
create policy planning_admin_read on public.planning_installments for select to authenticated using(public.event_role(event_id)='ADMIN');
alter table public.planning_payments enable row level security;
revoke all on public.planning_payments from public,anon,authenticated;
grant select on public.planning_payments to authenticated;
create policy planning_admin_read on public.planning_payments for select to authenticated using(public.event_role(event_id)='ADMIN');
alter table public.planning_budgets enable row level security;
revoke all on public.planning_budgets from public,anon,authenticated;
grant select on public.planning_budgets to authenticated;
create policy planning_admin_read on public.planning_budgets for select to authenticated using(public.event_role(event_id)='ADMIN');
alter table public.planning_documents enable row level security;
revoke all on public.planning_documents from public,anon,authenticated;
grant select on public.planning_documents to authenticated;
create policy planning_admin_read on public.planning_documents for select to authenticated using(public.event_role(event_id)='ADMIN');

-- CPF/CNPJ checksums are enforced at the boundary, not merely masked in the browser.
create function planning_private.valid_tax(v text) returns boolean language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare n int:=length(v); total int; digit int; stage int; j int; weight int; computed text:=v;
begin
 if n not in (11,14) or v !~ '^[0-9]+$' or v=repeat(left(v,1),n) then return false; end if;
 for stage in 1..2 loop
  total:=0;
  for j in 1..n-3+stage loop
   weight:=case when n=11 then n-1+stage-j else ((n-3+stage-j)%8)+2 end;
   total:=total+substr(v,j,1)::int*weight;
  end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if digit<>substr(v,n-2+stage,1)::int then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function planning_private.valid_tax(text) from public,anon,authenticated;
create function public.planning_snapshot(p_event uuid) returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp set statement_timeout='10s' as $$
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object(
 'suppliers',coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from public.planning_suppliers t where event_id=p_event),'[]'),
 'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.planning_entries t where event_id=p_event),'[]'),
 'installments',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_on,t.position) from public.planning_installments t where event_id=p_event),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(t) order by t.paid_on desc,t.created_at desc) from public.planning_payments t where event_id=p_event),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(t)-'sha256'-'object_path' order by t.created_at desc) from public.planning_documents t where event_id=p_event),'[]'),
 'budget',(select to_jsonb(t) from public.planning_budgets t where event_id=p_event),
 'history','[]'::jsonb);
end $$;
revoke all on function public.planning_snapshot(uuid) from public,anon,service_role;
grant execute on function public.planning_snapshot(uuid) to authenticated;

create function public.planning_action(p_event uuid,p_kind text,p_id uuid,p_version integer,p_values jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
set lock_timeout='3s' set statement_timeout='15s' as $$
declare
 tbl text; entity text:=split_part(p_kind,'_',1); arch boolean:=right(p_kind,8)='_ARCHIVE';
 oldrow jsonb; newrow jsonb; allowed text[]; vals jsonb; result jsonb; fingerprint text; saved jsonb;
 entry public.planning_entries%rowtype; parcel public.planning_installments%rowtype; supplier public.planning_suppliers%rowtype;
 paid bigint; parent_paid bigint; obligation bigint; amount bigint; qty int; first_date date; child_id uuid; j int; total bigint;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_id is null or p_request is null or p_values is null or jsonb_typeof(p_values)<>'object' or length(p_values::text)>50000 then raise exception 'planning_invalid'; end if;
 -- Event-scoped serialization: low-volume administrative writes; no locks on guest tables.
 perform pg_advisory_xact_lock(hashtextextended('planning:'||p_event::text,0));
 fingerprint:=encode(extensions.digest(p_kind||p_id::text||coalesce(p_version::text,'new')||p_values::text,'sha256'),'hex');
 select r.result into saved from public.mutation_receipts r where r.event_id=p_event and r.user_id=auth.uid() and r.mutation_id=p_request;
 if found then
  if saved->>'module' is distinct from 'planning' or saved->>'fingerprint' is distinct from fingerprint then raise exception 'planning_request_changed'; end if;
  return saved->'result';
 end if;
 if p_kind='SCHEDULE_GENERATE' then
  select * into entry from planning_entries where event_id=p_event and id=p_id for update;
  if not found or entry.version<>p_version then raise exception 'planning_stale'; end if;
  qty:=(p_values->>'quantity')::int;first_date:=(p_values->>'first_due_on')::date;
  if qty is null or qty not between 1 and 120 or first_date is null then raise exception 'planning_invalid'; end if;
  total:=greatest(0,(case when entry.status='CANCELLED' then entry.settlement_cents else entry.agreed_cents-entry.discount_cents end)-(select coalesce(sum(p.amount_cents),0) from planning_payments p where p.event_id=p_event and p.entry_id=p_id and p.deleted_at is null));
  if total<qty or exists(select 1 from planning_installments where event_id=p_event and entry_id=p_id and deleted_at is null) then raise exception 'planning_schedule_exists'; end if;
  for j in 1..qty loop
   child_id:=gen_random_uuid();
   insert into planning_installments(id,event_id,entry_id,description,position,amount_cents,due_on,created_by,updated_by)
    values(child_id,p_event,p_id,'Parcela '||j,j,total/qty+case when j<=total%qty then 1 else 0 end,(first_date+make_interval(months=>j-1))::date,auth.uid(),auth.uid());
   insert into audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),'CREATE','planning_installments',child_id,jsonb_build_object('amount_cents',total/qty+case when j<=total%qty then 1 else 0 end,'due_on',(first_date+make_interval(months=>j-1))::date,'entry_id',p_id));
  end loop;
  update planning_entries set version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=p_event and id=p_id returning to_jsonb(planning_entries.*) into newrow;
  result:=jsonb_build_object('id',p_id,'version',newrow->'version');
 elsif p_kind='DOCUMENT_PREPARE' then
  select to_jsonb(t) into oldrow from planning_documents t where event_id=p_event and id=p_id;
  if oldrow is not null then raise exception 'planning_document_exists'; end if;
  if p_values->>'mime' not in ('application/pdf','image/jpeg','image/png') then raise exception 'planning_invalid'; end if;
  insert into planning_documents(id,event_id,supplier_id,entry_id,payment_id,name,mime,size_bytes,sha256,object_path,created_by,updated_by)
  values(p_id,p_event,(p_values->>'supplier_id')::uuid,(p_values->>'entry_id')::uuid,(p_values->>'payment_id')::uuid,
    p_values->>'name',p_values->>'mime',(p_values->>'size_bytes')::integer,p_values->>'sha256',p_event::text||'/'||p_id::text,auth.uid(),auth.uid());
  if (p_values->>'supplier_id' is not null and not exists(select 1 from planning_suppliers where event_id=p_event and id=(p_values->>'supplier_id')::uuid))
   or (p_values->>'entry_id' is not null and not exists(select 1 from planning_entries where event_id=p_event and id=(p_values->>'entry_id')::uuid))
   or (p_values->>'payment_id' is not null and not exists(select 1 from planning_payments where event_id=p_event and id=(p_values->>'payment_id')::uuid)) then raise exception 'planning_invalid_parent'; end if;
  result:=jsonb_build_object('id',p_id,'path',p_event::text||'/'||p_id::text);
 else
  if p_kind not in ('SUPPLIER_SAVE','SUPPLIER_ARCHIVE','ENTRY_SAVE','ENTRY_ARCHIVE','INSTALLMENT_SAVE','INSTALLMENT_ARCHIVE','PAYMENT_SAVE','PAYMENT_ARCHIVE','BUDGET_SAVE','DOCUMENT_SAVE','DOCUMENT_ARCHIVE') then raise exception 'planning_invalid'; end if;
  tbl:=case entity when 'SUPPLIER' then 'planning_suppliers' when 'ENTRY' then 'planning_entries' when 'INSTALLMENT' then 'planning_installments' when 'PAYMENT' then 'planning_payments' when 'BUDGET' then 'planning_budgets' when 'DOCUMENT' then 'planning_documents' end;
  execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tbl) into oldrow using p_event,p_id;
  if (oldrow is not null and (p_version is null or (oldrow->>'version')::int<>p_version)) or (oldrow is null and p_version is not null) then raise exception 'planning_stale'; end if;
  if oldrow->>'deleted_at' is not null and arch then raise exception 'planning_archived'; end if;
  if entity='DOCUMENT' and oldrow is null then raise exception 'planning_invalid'; end if;
  if arch then
   if oldrow is null then raise exception 'planning_invalid'; end if;
   execute format('update public.%I set deleted_at=now(),updated_at=now(),updated_by=$3,version=version+1 where event_id=$1 and id=$2 returning to_jsonb(%I.*)',tbl,tbl) into newrow using p_event,p_id,auth.uid();
  else
   allowed:=case entity
    when 'SUPPLIER' then array['name','responsible','tax_id','category','phone','whatsapp','email','website','address','pix_type','pix_key','holder_name','holder_tax_id','bank','agency','account','notes']
    when 'ENTRY' then array['kind','title','category','description','supplier_id','status','contracted_on','delivery_on','notes','estimated_cents','agreed_cents','discount_cents','settlement_cents','payment_method','financial_notes']
    when 'INSTALLMENT' then array['entry_id','description','position','amount_cents','due_on','notes']
    when 'PAYMENT' then array['entry_id','installment_id','amount_cents','paid_on','method','notes']
    when 'BUDGET' then array['amount_cents'] when 'DOCUMENT' then array['name'] end;
   if exists(select 1 from jsonb_object_keys(p_values) k where not(k=any(allowed)) and k<>'allow_overpay') then raise exception 'planning_invalid_field'; end if;
   vals:=coalesce(oldrow,'{}')||(p_values-'allow_overpay')||jsonb_build_object('id',p_id,'event_id',p_event,'created_by',coalesce(oldrow->>'created_by',auth.uid()::text),'updated_by',auth.uid(),'version',coalesce((oldrow->>'version')::int,0)+1,'created_at',coalesce(oldrow->>'created_at',now()::text),'updated_at',now(),'deleted_at',oldrow->'deleted_at');
   if entity='BUDGET' and p_id<>p_event then raise exception 'planning_invalid'; end if;
   if entity='SUPPLIER' then
    vals:=jsonb_build_object('responsible','','tax_id','','category','','phone','','whatsapp','','email','','website','','address','','pix_type','','pix_key','','holder_name','','holder_tax_id','','bank','','agency','','account','','notes','')||vals;
    if (vals->>'tax_id'<>'' and not planning_private.valid_tax(vals->>'tax_id')) or (vals->>'holder_tax_id'<>'' and not planning_private.valid_tax(vals->>'holder_tax_id')) then raise exception 'planning_invalid_tax'; end if;
    if vals->>'pix_type' in ('CPF','CNPJ') and (length(vals->>'pix_key')<>case when vals->>'pix_type'='CPF' then 11 else 14 end or not planning_private.valid_tax(vals->>'pix_key')) then raise exception 'planning_invalid_pix'; end if;
    if (vals->>'pix_type'='' and vals->>'pix_key'<>'') or (vals->>'pix_type'<>'' and coalesce(vals->>'pix_key','')='')
     or (vals->>'pix_type'='PHONE' and vals->>'pix_key' !~ '^\+[1-9][0-9]{9,14}$')
     or (vals->>'pix_type'='EMAIL' and vals->>'pix_key' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or (vals->>'pix_type'='RANDOM' and vals->>'pix_key' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') then raise exception 'planning_invalid_pix'; end if;
    if vals->>'email'<>'' and vals->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'planning_invalid_email'; end if;
    if oldrow->>'deleted_at' is null and exists(select 1 from planning_suppliers s where s.event_id=p_event and s.id<>p_id and s.deleted_at is null and (lower(trim(s.name))=lower(trim(vals->>'name')) or (coalesce(vals->>'tax_id','')<>'' and s.tax_id=vals->>'tax_id'))) then raise exception 'planning_duplicate_supplier'; end if;
   end if;
   if entity in ('INSTALLMENT','PAYMENT') then
    if oldrow is not null and vals->>'entry_id'<>oldrow->>'entry_id' then raise exception 'planning_invalid_parent'; end if;
    select * into entry from planning_entries where event_id=p_event and id=(vals->>'entry_id')::uuid for update;
    if not found then raise exception 'planning_invalid_parent'; end if;
   end if;
   if entity='ENTRY' then
    vals:=jsonb_build_object('category','','description','','status','PLANNED','notes','','estimated_cents',0,'agreed_cents',0,'discount_cents',0,'settlement_cents',0,'payment_method','','financial_notes','')||vals;
    if vals->>'supplier_id' is not null and not exists(select 1 from planning_suppliers where event_id=p_event and id=(vals->>'supplier_id')::uuid and (deleted_at is null or id=(oldrow->>'supplier_id')::uuid)) then raise exception 'planning_invalid_parent'; end if;
    select coalesce(sum(amount_cents),0) into paid from planning_payments where event_id=p_event and entry_id=p_id and deleted_at is null;
    obligation:=case when vals->>'status' in ('CONTRACTED','COMPLETED') then (vals->>'agreed_cents')::bigint-(vals->>'discount_cents')::bigint when vals->>'status'='CANCELLED' then (vals->>'settlement_cents')::bigint else 0 end;
    if paid>0 and vals->>'status' in ('PLANNED','QUOTED','NEGOTIATING') then raise exception 'planning_paid_entry'; end if;
    if paid>obligation and coalesce((p_values->>'allow_overpay')::boolean,false) is not true then raise exception 'planning_overpay'; end if;
   end if;
   if entity='INSTALLMENT' then
    vals:=jsonb_build_object('position',1,'notes','')||vals;
    select coalesce(sum(amount_cents),0) into paid from planning_payments where event_id=p_event and installment_id=p_id and deleted_at is null;
    if paid>(vals->>'amount_cents')::bigint and coalesce((p_values->>'allow_overpay')::boolean,false) is not true then raise exception 'planning_overpay'; end if;
   end if;
   if entity='PAYMENT' then
    vals:=jsonb_build_object('notes','')||vals||jsonb_build_object('supplier_id',case when oldrow is null then to_jsonb(entry.supplier_id) else oldrow->'supplier_id' end,'supplier_name',case when oldrow is null then coalesce((select name from planning_suppliers where event_id=p_event and id=entry.supplier_id),'') else coalesce(oldrow->>'supplier_name','') end);
    if (vals->>'paid_on')::date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'planning_future_payment'; end if;
    if oldrow is not null and vals->>'installment_id'<>oldrow->>'installment_id' then raise exception 'planning_invalid_parent'; end if;
    select * into parcel from planning_installments where event_id=p_event and id=(vals->>'installment_id')::uuid and entry_id=entry.id and (deleted_at is null or oldrow is not null);
    if not found or entry.status not in ('CONTRACTED','COMPLETED','CANCELLED') then raise exception 'planning_invalid_parent'; end if;
    select coalesce(sum(amount_cents) filter(where installment_id=parcel.id),0),coalesce(sum(amount_cents),0) into paid,parent_paid from planning_payments where event_id=p_event and entry_id=entry.id and id<>p_id and deleted_at is null;
    obligation:=case when entry.status='CANCELLED' then entry.settlement_cents else entry.agreed_cents-entry.discount_cents end;
    amount:=(vals->>'amount_cents')::bigint;
    if (paid+amount>parcel.amount_cents or parent_paid+amount>obligation) and coalesce((p_values->>'allow_overpay')::boolean,false) is not true then raise exception 'planning_overpay'; end if;
   end if;
   -- Only whitelisted relation names. Populated records preserve typed constraints; caller cannot set server-owned columns.
   if oldrow is null then
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',tbl,tbl,tbl) into newrow using vals;
   else
    execute format('update public.%I t set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1) n) where event_id=$2 and id=$3 returning to_jsonb(t)',tbl,
     (select string_agg(quote_ident(a),',') from unnest(allowed||array['updated_at','updated_by','version']) a),
     (select string_agg('n.'||quote_ident(a),',') from unnest(allowed||array['updated_at','updated_by','version']) a),tbl) into newrow using vals,p_event,p_id;
   end if;
  end if;
  -- No contacts, PIX keys, banking data or free-form notes in audit metadata.
  insert into audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),p_kind,tbl,p_id,
   jsonb_build_object('version',newrow->'version','before_supplier_id',oldrow->'supplier_id','after_supplier_id',newrow->'supplier_id','changed_fields',(select jsonb_agg(k) from jsonb_object_keys(p_values-'allow_overpay') k where oldrow is null or oldrow->k is distinct from newrow->k),
   'before',jsonb_strip_nulls(jsonb_build_object('amount_cents',oldrow->'amount_cents','agreed_cents',oldrow->'agreed_cents','discount_cents',oldrow->'discount_cents','settlement_cents',oldrow->'settlement_cents','estimated_cents',oldrow->'estimated_cents','status',oldrow->'status','due_on',oldrow->'due_on','paid_on',oldrow->'paid_on')),
   'after',jsonb_strip_nulls(jsonb_build_object('amount_cents',newrow->'amount_cents','agreed_cents',newrow->'agreed_cents','discount_cents',newrow->'discount_cents','settlement_cents',newrow->'settlement_cents','estimated_cents',newrow->'estimated_cents','status',newrow->'status','due_on',newrow->'due_on','paid_on',newrow->'paid_on'))));
  result:=jsonb_build_object('id',p_id,'version',newrow->'version');
 end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id,result) values(p_event,auth.uid(),p_request,jsonb_build_object('module','planning','fingerprint',fingerprint,'result',result));
 return result;
exception
 when insufficient_privilege then raise;
 when lock_not_available or query_canceled then raise exception 'planning_busy';
 when others then
  if sqlerrm ~ '^planning_[a-z_]+$' then raise exception using message=sqlerrm,errcode='P0001'; end if;
  -- Never return a constraint DETAIL containing supplier or banking columns.
  raise exception 'planning_invalid';
end $$;
revoke all on function public.planning_action(uuid,text,uuid,integer,jsonb,uuid) from public,anon,service_role;
grant execute on function public.planning_action(uuid,text,uuid,integer,jsonb,uuid) to authenticated;

-- Only the validating upload worker may finish a document. No client can bypass byte validation.
create function public.planning_document_finish(p_event uuid,p_id uuid,p_sha256 text) returns jsonb language plpgsql security definer
set search_path=public,pg_temp set lock_timeout='3s' set statement_timeout='10s' as $$
declare d planning_documents%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('planning:'||p_event::text,0));
 select * into d from planning_documents where event_id=p_event and id=p_id and deleted_at is null for update;
 if not found or d.sha256<>p_sha256 or not exists(select 1 from public.user_roles r where r.event_id=p_event and r.user_id=d.created_by and r.role='ADMIN') then raise exception 'planning_invalid_document'; end if;
 if d.state='READY' then return jsonb_build_object('id',p_id); end if;
 update planning_documents set state='READY',updated_at=now(),version=version+1 where event_id=p_event and id=p_id;
 insert into audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,d.created_by,'DOCUMENT_UPLOAD','planning_documents',p_id,jsonb_build_object('size_bytes',d.size_bytes,'mime',d.mime));
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.planning_document_finish(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.planning_document_finish(uuid,uuid,text) to service_role;

-- Complete, cursor-paginated audit trail, including child financial records and attachments.
create index planning_audit_history on public.audit_logs(event_id,created_at desc,id desc) where left(entity,9)='planning_';
create function public.planning_history(p_event uuid,p_entity uuid default null,p_before timestamptz default null,p_cursor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp set statement_timeout='10s' as $$
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized' using errcode='42501'; end if;
 if (p_before is null)<>(p_cursor is null) then raise exception 'planning_invalid'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc) from (
  select a.id,a.actor,coalesce((select nullif(trim(p.display_name),'') from public.profiles p where p.id=a.actor),'Administrador') actor_name,
   a.action,a.entity,a.entity_id,a.metadata,a.created_at
  from public.audit_logs a where a.event_id=p_event and left(a.entity,9)='planning_'
   and (p_before is null or (a.created_at,a.id)<(p_before,p_cursor))
   and (p_entity is null or a.entity_id=p_entity or a.entity_id in (
    select i.id from public.planning_installments i where i.event_id=p_event and i.entry_id=p_entity
    union all select p.id from public.planning_payments p where p.event_id=p_event and p.entry_id=p_entity
    union all select d.id from public.planning_documents d where d.event_id=p_event and (
      d.entry_id=p_entity or d.supplier_id=p_entity or d.payment_id=p_entity or d.payment_id in(select p.id from public.planning_payments p where p.event_id=p_event and p.entry_id=p_entity))
   )) order by a.created_at desc,a.id desc limit 100
 ) t),'[]'::jsonb);
end $$;
revoke all on function public.planning_history(uuid,uuid,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.planning_history(uuid,uuid,timestamptz,uuid) to authenticated;

-- Deliberately private. The existing public invitation-assets bucket is untouched.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('wedding-planning','wedding-planning',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy planning_document_read on storage.objects for select to authenticated using (
 bucket_id='wedding-planning' and exists(select 1 from public.planning_documents d where d.object_path=storage.objects.name and d.state='READY' and d.deleted_at is null and public.event_role(d.event_id)='ADMIN')
);
-- No authenticated INSERT/UPDATE/DELETE storage policy. Upload uses the worker's server-only key after authorization.
notify pgrst, 'reload schema';
commit;
