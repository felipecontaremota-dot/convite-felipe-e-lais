import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const output = process.argv[2];
if (!output || !relative(resolve('.'),resolve(output)).startsWith('..')) throw Error('Output must be outside repository');
const entries = JSON.parse(readFileSync('config/migrations.json','utf8'));
mkdirSync(output,{recursive:true,mode:0o700});
for (const entry of entries) {
 const source=readFileSync(`supabase/migrations/${entry.file}`,'utf8');
 if(createHash('sha256').update(source).digest('hex')!==entry.sha256) throw Error('Migration checksum mismatch');
 const [version,...parts]=entry.file.replace(/\.sql$/,'').split('_');
 const name=parts.join('_');
 let body=source;
 if (source.trimStart().toLowerCase().startsWith('begin;')) {
  if (!/^begin;\s/i.test(source) || !/commit;\s*$/i.test(source)) throw Error('Unexpected transaction envelope');
  body=source.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
 }
 const privateGuard = name==='password_entry' ? `\nDO $$ BEGIN\n IF to_regnamespace('deployment_guard') IS NOT NULL THEN\n PERFORM deployment_guard.protect_table('password_entry_private.derivation_key'::regclass);\n PERFORM deployment_guard.protect_table('password_entry_private.resolution'::regclass);\n PERFORM deployment_guard.protect_table('password_entry_private.attempt_limits'::regclass);\n END IF;\nEND $$;\n` : '';
 writeFileSync(resolve(output,entry.file),`BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\nSELECT pg_advisory_xact_lock(610120008);\n${body}\n${privateGuard}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}');\nCOMMIT;\n`,{mode:0o600});
}
console.log('Offline envelopes generated; no database connection or application performed.');
