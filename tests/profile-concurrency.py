"""Local disposable DB only: independent libpq connections, no external providers."""
import argparse
import json
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--container')
parser.add_argument('--database', required=True)
args = parser.parse_args()
command = (['docker', 'exec', '-i', args.container, 'psql', '-U', 'postgres']
           if args.container else ['sudo', '-u', 'postgres', 'psql'])
command += ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', args.database]


def sql(source):
    return subprocess.run(command, input=source, text=True, capture_output=True,
                          check=True, timeout=15).stdout.strip()


def begin_blocker(source):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    process.stdin.write("set application_name='profile-blocker';begin;" + source +
                        ';select pg_sleep(1);commit;')
    process.stdin.close()
    for _ in range(100):
        if sql("select exists(select 1 from pg_stat_activity where application_name='profile-blocker' and wait_event='PgSleep');") == 't':
            return process
        time.sleep(0.01)
    raise AssertionError('blocker did not reach its held-lock barrier')


def finish(process):
    process.wait(timeout=15)
    output = process.stdout.read()
    error = process.stderr.read()
    assert process.returncode == 0, error
    return output


event = '00000000-0000-4000-8000-000000000001'
admin = 'fefc0000-0000-4000-8000-000000000001'
setup = sql(f"""
insert into auth.users(id,is_anonymous) values('{admin}',false);
insert into user_roles(event_id,user_id,role) values('{event}','{admin}','ADMIN');
set request.jwt.claim.sub='{admin}';
select admin_action('{event}','GUEST_CREATE','{{"name":"Concurrent fixture","whatsapp":"62999998217"}}');
""")
guest = json.loads(setup.splitlines()[-1])['id']
sql(f"set request.jwt.claim.sub='{admin}';select app_mutate('{event}',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id','{guest}','consent_email',true));")


def mutate(revoked, mutation='gen_random_uuid()'):
    return (f"set request.jwt.claim.sub='{admin}';select app_mutate('{event}',{mutation},"
            f"'CONTACT_UPDATE',jsonb_build_object('guest_id','{guest}','communications_revoked',{'true' if revoked else 'false'}))")


def job():
    sql(mutate(False))
    result = json.loads(sql(f"set request.jwt.claim.sub='{admin}';select app_mutate('{event}',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Concurrent job','channels','[\"EMAIL\"]'::jsonb,'recipient_guest_ids',jsonb_build_array('{guest}')));"))
    row = json.loads(sql(f"select to_jsonb(j) from claim_event_notifications('{event}',1,'{result['id']}') j;"))
    return row


def admit(j):
    return (f"select authorize_notification_attempt('{event}','{j['id']}','{guest}','EMAIL',"
            f"{j['attempts']},'{j['locked_at']}',true)")


# Revocation commits before a waiting admission. The provider cannot start.
j = job()
blocker = begin_blocker(mutate(True))
assert sql(f"select communications_revoked from guest_contacts where guest_id='{guest}';") == 'f'
assert json.loads(sql(admit(j)))['authorized'] is False
finish(blocker)
assert sql(f"select status from notification_jobs where id='{j['id']}';") == 'skipped'

# Admission commits first; revocation waits, preserves the already-started attempt.
j = job()
blocker = begin_blocker(admit(j))
sql(mutate(True))
assert '"authorized": true' in finish(blocker)
assert sql(f"select status from notification_jobs where id='{j['id']}';") == 'processing'
assert sql(f"select finish_notification_attempt('{event}','{j['id']}',{j['attempts']},'{j['locked_at']}','uncertain','fixture',null,(select delivery_started_at from notification_jobs where id='{j['id']}'));") == 't'
sql(mutate(False))
assert sql(f"select count(*) from claim_event_notifications('{event}',50,'{j['message_id']}');") == '0'

# Two dispatchers sharing a lease admit only one attempt.
j = job()
blocker = begin_blocker(admit(j))
assert json.loads(sql(admit(j)))['authorized'] is False
assert '"authorized": true' in finish(blocker)
assert sql(f"select finish_notification_attempt('{event}','{j['id']}',{j['attempts']},'{j['locked_at']}','failed','fixture');") == 'f'

# Concurrent retries share one receipt and one committed contact result.
mutation = "'fefc0000-0000-4000-8000-000000000030'::uuid"
blocker = begin_blocker(mutate(True, mutation))
replay = json.loads(sql(mutate(True, mutation)))
finish(blocker)
assert replay['duplicate'] is True
assert sql(f"select count(*) from mutation_receipts where event_id='{event}' and user_id='{admin}' and mutation_id={mutation};") == '1'

# Distinct concurrent edits serialize while preserving the global gate and prior consent.
blocker = begin_blocker(mutate(False))
sql(f"set request.jwt.claim.sub='{admin}';select app_mutate('{event}',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id','{guest}','whatsapp','62999998218','consent_email',false));")
finish(blocker)
assert sql(f"select (not communications_revoked) and (not consent_email) and whatsapp='62999998218' from guest_contacts where guest_id='{guest}';") == 't'

# Admission becomes uncertain after a worker crash; a fresh claim cannot resend.
sql(f"update notification_jobs set locked_at=clock_timestamp()-interval '11 minutes' where id='{j['id']}';")
assert sql(f"select count(*) from claim_event_notifications('{event}',50,'{j['message_id']}');") == '0'
assert sql(f"select status from notification_jobs where id='{j['id']}';") == 'uncertain'
print('Independent connections: revocation wins, admission wins, two dispatchers, concurrent receipt replay, concurrent edits, MVCC read, stale admitted lease: passed.')
