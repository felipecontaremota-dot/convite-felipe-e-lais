-- Read-only catalog checks. Safe after installation; never reads guest/contact data.
do $$
declare f text;
begin
 if not exists(select 1 from pg_class where oid='wedding_party_private.promotions'::regclass and relrowsecurity and relowner='postgres'::regrole) then raise exception 'party table RLS/owner mismatch';end if;
 if has_schema_privilege('anon','wedding_party_private','USAGE') or has_schema_privilege('authenticated','wedding_party_private','USAGE') or has_table_privilege('authenticated','wedding_party_private.promotions','SELECT,INSERT,UPDATE,DELETE') then raise exception 'party private data exposed';end if;
 foreach f in array array['public.wedding_party_state(uuid)','public.wedding_party_admin_get(uuid,uuid)','public.wedding_party_admin_set(uuid,uuid,text,uuid)','public.wedding_party_respond(uuid,uuid,text)'] loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(f) and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog']) then raise exception 'party RPC config mismatch: %',f;end if;
  if has_function_privilege('anon',f,'EXECUTE') or not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'party RPC grants mismatch: %',f;end if;
 end loop;
 if has_function_privilege('authenticated','wedding_party_private.actor(uuid)','EXECUTE') then raise exception 'party helper exposed';end if;
end $$;
select public.wedding_party_state(null::uuid) = '{"promotion":null}'::jsonb as unauthenticated_denied;
