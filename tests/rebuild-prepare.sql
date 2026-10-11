-- Representative operations on the post-008 contract.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Discardable guest","group_label":"Familiar do noivo","email":"test@example.invalid","whatsapp":"11999999999"}'::jsonb) as created \gset
select (:'created'::jsonb)->>'id' as guest_id \gset
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',:'guest_id','status','MAYBE'));
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'guest_id','email','test@example.invalid','whatsapp','11999999999','notifications_revoked',true));
select issue_ticket('00000000-0000-4000-8000-000000000001',:'guest_id');
insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,attempts,first_attempt_at,last_attempt_at,payload_hash)
select event_id,invitation_id,id,gen_random_uuid(),'test@example.invalid',1,now(),now(),repeat('a',64) from guests where id=:'guest_id';
insert into invitations(id,event_id,name,kind) values('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000001','Discardable family','FAMILY');
insert into family_qr_credentials(event_id,invitation_id,token_hash) values('00000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',repeat('b',64));
