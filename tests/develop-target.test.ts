import { it, expect } from 'vitest';
// Scripts execute on Node; validation happens before any network or subprocess mutation.
import { assertDevelopmentTarget, developmentApiUrl, developmentFunctionUrl, DEVELOPMENT_REF, PRODUCTION_REF } from '../scripts/develop/target.mjs';
import { DevelopManagement } from '../scripts/develop/management.mjs';
it('all DEV endpoints refuse production, missing and arbitrary project refs',()=>{
 for(const ref of [PRODUCTION_REF,undefined,'another-project']) {
  expect(()=>assertDevelopmentTarget(ref)).toThrow();
  expect(()=>developmentApiUrl(ref,'/database/query')).toThrow();
  expect(()=>developmentFunctionUrl(ref,'redeem-invitation')).toThrow();
 }
 expect(developmentApiUrl(DEVELOPMENT_REF,'/database/query')).toBe(`https://api.supabase.com/v1/projects/${DEVELOPMENT_REF}/database/query`);
 expect(()=>developmentApiUrl(DEVELOPMENT_REF,'/../nwgyxmwaqckpghznbfzm')).toThrow();
});
it('requires remote DEV identity before any mutation or key retrieval',async()=>{
 let calls=0;
 const client=new DevelopManagement({ref:DEVELOPMENT_REF,token:'test-placeholder',fetchImpl:async()=>{calls++;return Response.json({id:PRODUCTION_REF,region:'sa-east-1'});}});
 await expect(client.sql('select 1')).rejects.toThrow('identity');
 await expect(client.request('',{method:'PATCH',body:{}})).rejects.toThrow('identity');
 expect(calls).toBe(0);
 await expect(client.verify()).rejects.toThrow('identity mismatch');
 await expect(client.request('/secrets',{method:'POST',body:[]})).rejects.toThrow('identity');
 expect(calls).toBe(1);
});
it('verified DEV uses only its fixed path and suppresses error bodies',async()=>{
 const urls:string[]=[];
 const client=new DevelopManagement({ref:DEVELOPMENT_REF,token:'test-placeholder',fetchImpl:async(url:string)=>{
  urls.push(url);
  return urls.length===1?Response.json({id:DEVELOPMENT_REF,region:'sa-east-1'}):Response.json({secret:'must-not-appear'},{status:403});
 }});
 await client.verify();
 await expect(client.sql('select 1')).rejects.toThrow('response body withheld');
 expect(urls.every(url=>url.startsWith(`https://api.supabase.com/v1/projects/${DEVELOPMENT_REF}`))).toBe(true);
});
