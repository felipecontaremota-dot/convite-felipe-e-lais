-- psql variables are quoted by psql; no real UUID/password is committed.
select set_config('wedding.admin_user_id', :'admin_user_id', true);
do $$
begin
 if not exists(select 1 from auth.users where id=current_setting('wedding.admin_user_id')::uuid and not is_anonymous) then
  raise exception 'ADMIN must be an existing non-anonymous Auth user';
 end if;
end $$;
-- The seed is executed immediately before this file by run-rebuild.sh.
insert into public.user_roles(event_id,user_id,role)
values ('00000000-0000-4000-8000-000000000001',current_setting('wedding.admin_user_id')::uuid,'ADMIN');
notify pgrst,'reload schema';
