begin;
do $$declare sample text; expected text:='LAIS LORRANE CARIOLANO ROMAO';begin
 foreach sample in array array['Laís Lorrane Cariolano Romão','LAIS LORRANE CARIOLANO ROMAO',' Laís   Lorrane Cariolano Romão ',U&'Lai\0301s Lorrane Cariolano Roma\0303o','ＬＡＩＳ LORRANE CARIOLANO ROMAO','LAIS'||chr(8239)||'LORRANE CARIOLANO ROMAO'] loop
  if name_pin_private.normalize_name(sample) is distinct from expected then raise exception 'normalization mismatch';end if;
 end loop;
 foreach sample in array array['',repeat('a',401),'LAIS'||chr(8203),chr(1)||'LAIS',chr(65279)||'LAIS'] loop
  if name_pin_private.normalize_name(sample) is not null then raise exception 'unsafe name accepted';end if;
 end loop;
 if name_pin_private.normalize_name('αλφα') is distinct from name_pin_private.normalize_name('ΑΛΦΑ') then raise exception 'Unicode case mismatch';end if;
 if name_pin_private.normalize_name('FELIPE')=name_pin_private.normalize_name('FELIPE ALENCAR') then raise exception 'partial names matched';end if;
 if name_pin_private.fingerprint('00000000-0000-4000-8000-000000000001','name:v1','0047')=name_pin_private.fingerprint('00000000-0000-4000-8000-000000000001','pin:v1','0047') then raise exception 'HMAC purpose separation missing';end if;
end$$;
rollback;
