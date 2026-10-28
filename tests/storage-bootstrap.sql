-- Storage API metadata stand-in for SQL policy tests; file transport is tested separately.
create schema storage;
create table storage.buckets(id text primary key,name text unique not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on storage.objects,storage.buckets to service_role;
