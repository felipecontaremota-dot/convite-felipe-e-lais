import { execFileSync } from 'node:child_process';
import { DevelopManagement } from './management.mjs';
import { assertDevelopmentTarget, developmentFunctionUrl } from './target.mjs';
const ref = assertDevelopmentTarget(process.env.SUPABASE_DEV_PROJECT_REF);
if (execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim() !== 'develop') throw Error('DEV deploy requires develop');
if (execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()) throw Error('Review/commit changes before deployment');
const manager = new DevelopManagement({ref,token:process.env.SUPABASE_ACCESS_TOKEN});
const functions = ['dispatch-notifications','redeem-invitation','send-invitations','sync-sheets'];
for (const name of functions) {
  developmentFunctionUrl(ref,name);
  await manager.verify();
  try {
    execFileSync('npx',['--yes','supabase@2.101.0','functions','deploy',name,'--project-ref',ref,'--no-verify-jwt'],{
      stdio:'pipe',
      env:{...process.env,SUPABASE_API_URL:'https://api.supabase.com',SUPABASE_HOME:'/tmp/wedding-supabase-cli',SUPABASE_TELEMETRY_DISABLED:'true',SUPABASE_NO_KEYRING:'true',npm_config_cache:'/tmp/wedding-npm'},
    });
  } catch { throw Error(`DEV deploy failed for ${name}; raw CLI output withheld to protect credentials`); }
  console.log(`${name}: DEV deployment completed`);
}
