import { execFileSync } from 'node:child_process';
import { DevelopManagement } from './management.mjs';
import { assertDevelopmentTarget } from './target.mjs';
const ref = assertDevelopmentTarget(process.env.SUPABASE_DEV_PROJECT_REF);
if (execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim() !== 'develop') throw Error('DEV remote operations require develop checkout');
if (execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()) throw Error('Commit/review workspace changes before remote preflight');
const management = new DevelopManagement({ref,token:process.env.SUPABASE_ACCESS_TOKEN});
const identity = await management.verify();
// Only identity and aggregate schema presence, no credentials or application data.
const schema = await management.sql(`BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT session_user::text AS connection_login,current_user::text AS effective_role,
       to_regclass('public.invitations') IS NOT NULL AS invitations_present,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS history_present;
COMMIT;`);
console.log(JSON.stringify({identity, schema}));
