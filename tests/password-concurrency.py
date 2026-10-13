"""Disposable databases only. Each process owns an independent PostgreSQL connection."""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--container')
parser.add_argument('--database', required=True)
args = parser.parse_args()
command = (['docker', 'exec', '-i', args.container, 'psql', '-U', 'postgres']
           if args.container else ['sudo', '-u', 'postgres', 'psql'])
command += ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', args.database]


def sql(source, conflict=False):
    result = subprocess.run(command, input=source, text=True, capture_output=True, timeout=30)
    if conflict:
        assert result.returncode != 0 and 'invitation password conflict' in result.stderr, 'expected controlled structural conflict'
    else:
        assert result.returncode == 0, 'SQL operation failed (sensitive output suppressed)'
    return result.stdout.strip()


def blocker(source):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    process.stdin.write("set application_name='password-blocker';begin;" + source + ';select pg_sleep(1);commit;')
    process.stdin.close()
    for _ in range(150):
        if process.poll() is not None:
            raise AssertionError('blocker exited before barrier (sensitive output suppressed)')
        if sql("select exists(select 1 from pg_stat_activity where application_name='password-blocker' and wait_event='PgSleep');") == 't':
            return process
        time.sleep(0.01)
    raise AssertionError('lock barrier not reached')


def finish(process):
    process.wait(timeout=30)
    assert process.returncode == 0, 'blocking transaction failed (sensitive output suppressed)'
    return process.stdout.read()


event = '00000000-0000-4000-8000-000000000001'
user = 'ffcc0000-0000-4000-8000-000000000001'
sql(f"insert into auth.users(id,is_anonymous) values('{user}',true)")
sql("""create function public.password_fixture_allocate(e uuid,p text) returns uuid language plpgsql as $$
declare i uuid;g uuid;
begin
 i=create_individual_access(e,'Concurrency fixture',p);
 insert into guests(event_id,invitation_id,name) values(e,i,'Concurrency fixture') returning id into g;
 update invitations set primary_guest_id=g where id=i;
 return i;
end$$;revoke all on function public.password_fixture_allocate(uuid,text) from public,anon,authenticated,service_role;""")


def automatic(suffix):
    return f"select password_fixture_allocate('{event}','6299999{suffix}')"


def create(suffix):
    return sql(automatic(suffix)).splitlines()[-1]


def pin(iid, value):
    return f"update invitation_access set pin='{value}' where invitation_id='{iid}'"


def redeem(value):
    return f"select redeem_invitation_password('{event}','{user}','{value}','concurrency-fixture')"


# 1: Two automatic allocators choose the same preferred suffix before either commits.
b = blocker(automatic('9101'))
assert sql(f"select count(*) from invitation_access where event_id='{event}' and pin='9101'") == '0'
second = create('9101')
first = finish(b).splitlines()[0]
assert sql(f"select a.pin<>b.pin from invitation_access a,invitation_access b where a.invitation_id='{first}' and b.invitation_id='{second}'") == 't'
# 2: An explicit duplicate never silently changes an issued credential.
sql(pin(second, '9101'), conflict=True)
# 3: Concurrent explicit updates converge on the same previously unused password.
a, c = create('9102'), create('9103')
b = blocker(pin(a, '9199'))
sql(pin(c, '9199'), conflict=True)
finish(b)
# 4: Activation colliding with an already eligible invitation rolls back.
sql(f"update invitations set active=false where id='{c}';" + pin(c, '9199'))
sql(f"update invitations set active=true where id='{c}'", conflict=True)
assert sql(f"select not active from invitations where id='{c}'") == 't'
# 5: Concurrent archive then activation frees the unique credential only after commit.
b = blocker(f"update invitations set archived_at=now() where id='{a}'")
sql(f"update invitations set active=true where id='{c}'")
finish(b)
# 6: Administrative PIN update commits before a waiting redeem; stale PIN cannot bind.
b = blocker(pin(c, '9188'))
assert sql(redeem('9199')) == 'f'
finish(b)
# 7: Two independent redeem connections produce the same binding and one activation audit.
b = blocker(redeem('9188'))
assert sql(redeem('9188')) == 't'
finish(b)
assert sql(f"select count(*) from invitation_sessions where user_id='{user}' and invitation_id='{c}'") == '1'
assert sql(f"select count(*) from audit_logs where actor='{user}' and entity_id='{c}' and action='ACTIVATION'") == '1'
# 8: Delete commits before waiting redeem: registry cannot establish a stale session.
d = create('9104')
b = blocker(f"update invitations set active=false,primary_guest_id=null where id='{d}';delete from guests where invitation_id='{d}';delete from invitations where id='{d}'")
assert sql(redeem('9104')) == 'f'
finish(b)
# 9: Source changes rolled back leave both credential and registry unchanged.
sql('begin;' + pin(c, '9105') + ';rollback;')
assert sql(f"select pin='9188' from invitation_access where invitation_id='{c}'") == 't'
# 10: Access removal commits before a waiting redeem; stale eligibility is rejected.
d = create('9106')
b = blocker(f"delete from invitation_access where invitation_id='{d}'")
assert sql(redeem('9106')) == 'f'
finish(b)
# 11: Event scope permits the same preferred credential in a different event.
other_event = 'ffcc0000-0000-4000-8000-000000000002'
sql(f"insert into events(id,title,starts_at,timezone) values('{other_event}','Fixture',now(),'America/Sao_Paulo');select password_fixture_allocate('{other_event}','62999999188')")
assert sql(f"select count(*) from invitation_access where pin='9188' and event_id in ('{event}','{other_event}')") == '2'
# 12: Reassociation commits before redeem; the old owner cannot retain eligibility.
e, f = sorted([create('9121'), create('9122')], reverse=True)
old_pin = sql(f"select pin from invitation_access where invitation_id='{e}'")
sql(f"delete from invitation_access where invitation_id='{f}'")
b = blocker(f"update invitation_access set invitation_id='{f}' where invitation_id='{e}'")
assert sql(redeem(old_pin)) == 'f'
finish(b)
assert sql(f"select count(*) from password_entry_private.resolution where invitation_id='{e}'") == '0'
# 13: Unarchiving never silently steals an existing credential.
sql(pin(a, '9188'))
sql(f"update invitations set archived_at=null where id='{a}'", conflict=True)
# 14: Two ineligible sources becoming eligible contend on the same UNIQUE key.
g, h = create('9131'), create('9132')
sql(f"update invitations set active=false where id in ('{g}','{h}');" + pin(g, '9133') + ';' + pin(h, '9133'))
b = blocker(f"update invitations set active=true where id='{g}'")
sql(f"update invitations set active=true where id='{h}'", conflict=True)
finish(b)
# 15: Redeem commits first; a later source update must wait for its parent barrier.
b = blocker(redeem('9188'))
sql(pin(c, '9189'))
assert 't' in finish(b).splitlines()
assert sql(f"select invitation_id='{c}' from invitation_sessions where user_id='{user}'") == 't'
assert sql("select not exists(select 1 from password_entry_private.resolution group by event_id,fingerprint having count(*)>1)") == 't'
assert sql("select not exists((select s.* from invitations i cross join lateral password_entry_private.eligible_source(i.id) s except select event_id,invitation_id,fingerprint from password_entry_private.resolution) union all (select event_id,invitation_id,fingerprint from password_entry_private.resolution except select s.* from invitations i cross join lateral password_entry_private.eligible_source(i.id) s))") == 't'
print('Password 009: 15 independent-connection scenarios passed; registry equals eligible sources.')
