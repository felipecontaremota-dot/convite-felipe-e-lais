insert into events(id,title,starts_at,timezone,venue_name,address,latitude,longitude) values('00000000-0000-4000-8000-000000000001','Felipe & Laís','2026-12-15 16:00:00-03','America/Sao_Paulo',null,null,null,null) on conflict(id) do nothing;
insert into event_settings(event_id,settings) values('00000000-0000-4000-8000-000000000001','{"sheet_mapping_version":1}') on conflict(event_id) do nothing;
insert into notification_rules(event_id,days_before,title,body,channels)
select '00000000-0000-4000-8000-000000000001',d,case when d=0 then 'É hoje! ❤️' when d=1 then 'É amanhã! ❤️' else 'Faltam '||d||' dias até o Sim' end,'Estamos felizes em compartilhar este momento com você. Confira seu convite para os detalhes.','{IN_APP}'::delivery_channel[] from unnest(array[30,20,15,10,7,5,2,1,0]) d on conflict(event_id,days_before) do nothing;
-- No real guests, codes, privileged users or credentials are seeded.
