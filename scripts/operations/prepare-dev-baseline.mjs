import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const out=process.argv[2];
if(!out || !relative(resolve('.'),resolve(out)).startsWith('..'))throw Error('Staging must be outside checkout');
const migrations=JSON.parse(readFileSync('config/migrations.json','utf8'));
mkdirSync(resolve(out,'supabase/migrations'),{recursive:true,mode:0o700});
for(const m of migrations.slice(0,7)){
 const path=`supabase/migrations/${m.file}`;
 if(createHash('sha256').update(readFileSync(path)).digest('hex')!==m.sha256)throw Error('Baseline checksum mismatch');
 copyFileSync(path,resolve(out,'supabase/migrations',m.file));
}
let config=readFileSync('supabase/config.toml','utf8').replace('project_id = "convite-felipe-e-lais"','project_id = "convite-felipe-e-lais-develop"').replace('enabled = true\nsql_paths = ["./seed.sql"]','enabled = false\nsql_paths = []');
writeFileSync(resolve(out,'supabase/config.toml'),config,{mode:0o600});
console.log('DEV baseline staging prepared offline. No link/push/deploy performed.');
