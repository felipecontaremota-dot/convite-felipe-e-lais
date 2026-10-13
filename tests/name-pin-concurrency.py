"""Real independent transactions against a disposable PostgreSQL, never a remote URL."""
import argparse, subprocess, uuid, concurrent.futures, time
p=argparse.ArgumentParser();p.add_argument('--container');p.add_argument('--database');a=p.parse_args()
cmd=['docker','exec','-i',a.container,'psql','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'] if a.container else ['sudo','-u','postgres','psql','-d',a.database,'-qAt','-v','ON_ERROR_STOP=1']
def sql(s):return subprocess.check_output(cmd,input=s,text=True,stderr=subprocess.PIPE).strip()
def q(s):return "'"+s.replace("'","''")+"'"
event=str(uuid.uuid4());admin=str(uuid.uuid4());user=str(uuid.uuid4())
sql(f"insert into events(id,title,starts_at,timezone) values('{event}','Concurrency fixture',now(),'UTC');insert into auth.users(id,is_anonymous) values('{admin}',false),('{user}',true);insert into user_roles(event_id,user_id,role) values('{event}','{admin}','ADMIN');")
def create(name,phone):
 return sql(f"set request.jwt.claim.sub='{admin}';select admin_action('{event}','GUEST_CREATE',jsonb_build_object('name',{q(name)},'whatsapp',{q(phone)}))->>'invitation_id';")
x=create('Concurrent alpha','62999993811');y=create('Concurrent beta','62999993812')
def redeem(name,pin,uid=user):return f"select coalesce((redeem_invitation_by_name('{event}','{uid}',{q(name)},{q(pin)},'concurrency-origin')->>'linked')::boolean,false);"
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(sql,[redeem('Concurrent alpha','3811'),redeem('Concurrent beta','3812')]))
assert results==['t','t'];assert sql(f"select count(*)=1 and bool_and(invitation_id in ('{x}','{y}')) from invitation_sessions where event_id='{event}' and user_id='{user}'")=='t'
# A source rename owns the canonical event barrier while a redeem waits.
block=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
block.stdin.write(f"begin;select pg_advisory_xact_lock(hashtextextended('admin:{event}',0));update guests set name='Renamed alpha' where invitation_id='{x}';select 'ready';\n");block.stdin.flush()
while block.stdout.readline().strip()!='ready':
 if block.poll() is not None:raise RuntimeError('blocker stopped')
with concurrent.futures.ThreadPoolExecutor(1) as pool:
 future=pool.submit(sql,redeem('Concurrent alpha','3811'))
 time.sleep(.1);assert not future.done()
 block.stdin.write('commit;\n');block.stdin.close();block.wait(timeout=10);assert future.result(timeout=10)=='f'
assert sql(redeem('Renamed alpha','3811'))=='t'
# Two units with identical combination are both blocked after commit.
sql(f"update guests set name='Renamed alpha' where invitation_id='{y}';update invitation_access set pin='3811' where invitation_id='{y}';")
assert sql(redeem('Renamed alpha','3811'))=='f'
sql(f"update invitation_access set pin='3812' where invitation_id='{y}';")
assert sql(redeem('Renamed alpha','3812'))=='t'
# Atomic name budget across fresh anonymous UIDs and concurrent requests.
users=[str(uuid.uuid4()) for _ in range(24)]
sql(f"delete from name_pin_private.attempt_limits where event_id='{event}';insert into auth.users(id,is_anonymous) values "+','.join(f"('{u}',true)" for u in users)+';')
with concurrent.futures.ThreadPoolExecutor(8) as pool:results=list(pool.map(lambda u:sql(redeem('Renamed alpha','3811',u)),users))
assert results.count('t')==15 and results.count('f')==9
assert sql(f"select attempts=24 from name_pin_private.attempt_limits where event_id='{event}' and bucket like 'name:%'")=='t'
# A rollback cannot change the authoritative aliases.
sql(f"begin;update guests set name='Rolled back' where invitation_id='{x}';rollback;")
assert sql(f"select not exists((select s.* from invitations i cross join lateral name_pin_private.sources(i.id) s except select * from name_pin_private.aliases) union all (select * from name_pin_private.aliases except select s.* from invitations i cross join lateral name_pin_private.sources(i.id) s))")=='t'
# The owning harness drops the entire disposable database/container. Source-table
# cascades intentionally are not used as fixture cleanup (they invoke audit triggers).
print('Name + PIN: independent-connection binding, rename barrier, ambiguity, atomic limits and rollback passed.')
