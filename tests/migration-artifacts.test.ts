import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
it('canonical files match manifest and atomic envelopes preserve migration bodies',()=>{
 const manifest=JSON.parse(readFileSync('config/migrations.json','utf8')) as {file:string;sha256:string}[];
 expect(readdirSync('supabase/migrations').sort()).toEqual(manifest.map(m=>m.file).sort());
 expect(manifest).toHaveLength(9);
 const out=mkdtempSync(join(tmpdir(),'wedding-envelope-test-'));
 try {
  execFileSync(process.execPath,['scripts/operations/envelopes.mjs',out]);
  for(const m of manifest){
   expect(m.file).toMatch(/^\d{14}_/);
   const original=readFileSync(`supabase/migrations/${m.file}`,'utf8');
   expect(createHash('sha256').update(original).digest('hex')).toBe(m.sha256);
   const envelope=readFileSync(join(out,m.file),'utf8');
   expect(envelope).toContain(original.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
   expect(envelope.match(/^BEGIN;/gm)).toHaveLength(1);
   expect(envelope.match(/^COMMIT;/gm)).toHaveLength(1);
   expect(envelope).toContain(`VALUES ('${m.file.slice(0,14)}'`);
  }
 }finally{rmSync(out,{recursive:true,force:true});}
});
