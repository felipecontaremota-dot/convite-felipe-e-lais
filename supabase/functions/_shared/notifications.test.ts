import {notificationEmail} from './notification-email.ts';
import {allowedPushEndpoint,sendWebPush} from './web-push.ts';
import {ProviderDefinitiveError,ProviderUncertainError,type service} from './http.ts';
function assert(v:unknown,label:string){if(!v)throw Error(label);}
Deno.test('notification mail escapes markup and keeps paragraphs, identity and preferences',()=>{
 const m=notificationEmail('<script>Title</script>','Line 1\n\nLine 2 💙','https://example.test/wedding');
 assert(!m.html.includes('<script>'),'escaped title');assert(m.html.includes('&lt;script&gt;'),'safe title');assert(m.html.includes('white-space:pre-wrap'),'paragraphs');assert(m.text.includes('Line 1\n\nLine 2 💙'),'literal full body');assert(m.html.includes('https://example.test/wedding/perfil'),'authenticated opt-out');assert(m.html.includes('https://example.test/wedding/inicio'),'safe public link');
});
Deno.test('push refuses SSRF and accepts supported provider origins',()=>{
 for(const endpoint of ['http://fcm.googleapis.com/private','https://localhost/private','https://fcm.googleapis.com.evil.test/foo','https://user@fcm.googleapis.com/foo'])assert(!allowedPushEndpoint(endpoint),'reject unsafe endpoint');
 for(const endpoint of ['https://fcm.googleapis.com/wp/123','https://updates.push.services.mozilla.com/wpush/v2/123','https://web.push.apple.com/123'])assert(allowedPushEndpoint(endpoint),'valid endpoint');
});
for(const mode of ['sent','expired','failed','uncertain','missing'])Deno.test(`Web Push ${mode} preserves device admission and safe outcome`,async()=>{
 for(const [k,v] of Object.entries({VAPID_PUBLIC_KEY:'fixture-public',VAPID_PRIVATE_KEY:'fixture-private',VAPID_SUBJECT:'mailto:fixture@example.test'}))Deno.env.set(k,v);
 let disabled=false;const statuses:string[]=[];
 const row={id:'subscription',endpoint:'https://fcm.googleapis.com/wp/fixture',p256dh:'fixture',auth_key:'fixture'};
 const db={rpc:async(name:string,args:{p_status?:string})=>{if(args.p_status)statuses.push(args.p_status);return {data:true,error:null};},from:()=>{const chain={select:()=>chain,eq:()=>chain,update:()=>{disabled=true;return chain;},then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:mode==='missing'?[]:[row],error:null}).then(resolve)};return chain;}} as unknown as ReturnType<typeof service>;
 try{
  let result,err;
  try{result=await sendWebPush(db,{id:'job',event_id:'event',guest_id:'guest'},'Title','Body',async()=>{
   if(mode==='expired')throw {statusCode:410};if(mode==='failed')throw {statusCode:400};if(mode==='uncertain')throw Error('offline');return {statusCode:201,body:'',headers:{}};
  });}catch(e){err=e;}
  if(mode==='failed')assert(err instanceof ProviderDefinitiveError,'definitive failure');
  if(mode==='uncertain')assert(err instanceof ProviderUncertainError,'uncertain result');
  if(mode==='sent')assert(result?.status==='sent'&&statuses[0]==='sent','provider accepted');
  if(mode==='expired')assert(disabled&&result?.status==='skipped'&&statuses[0]==='expired','subscription retired');
  if(mode==='missing')assert(result?.status==='skipped','missing device');
 }finally{for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])Deno.env.delete(k);}
});

Deno.test('Vault worker authentication rejects an invalid secret before claiming any job',async()=>{
 const {dispatchHandler}=await import('../dispatch-notifications/index.ts');let claims=0;
 const db={rpc:async(name:string)=>{if(name.startsWith('claim'))claims++;return {data:false,error:null};}} as unknown as ReturnType<typeof service>;
 const response=await dispatchHandler({service:()=>db,workerAuthorized:()=>false,eventAdmin:async()=>{throw Error('unauthorized');},provider:()=>{throw Error('must not send');}})(new Request('https://fixture.test',{method:'POST',headers:{'x-worker-secret':'invalid'}}));
 assert(response.status===401&&claims===0,'no unauthenticated worker operation');
});
Deno.test('Vault worker authentication accepts a valid server secret without requiring an ADMIN browser',async()=>{
 const {dispatchHandler}=await import('../dispatch-notifications/index.ts');const calls:string[]=[];
 const db={rpc:async(name:string)=>{calls.push(name);return {data:name==='notification_worker_authorized'?true:name==='claim_notifications'?[]:null,error:null};}} as unknown as ReturnType<typeof service>;
 const response=await dispatchHandler({service:()=>db,workerAuthorized:()=>false,eventAdmin:async()=>{throw Error('must not require browser');},provider:()=>{throw Error('must not send');}})(new Request('https://fixture.test',{method:'POST',headers:{'x-worker-secret':'fixture'}}));
 assert(response.status===200&&calls.join(',')==='notification_worker_authorized,schedule_notifications,claim_notifications','trusted background worker');
});

Deno.test('Web Push library builds encrypted aes128gcm payload and signed VAPID offline in Deno',async()=>{
  const {default:webpush}=await import('npm:web-push@3.6.7');
  const {createECDH,randomBytes}=await import('node:crypto');
  const receiver=createECDH('prime256v1');receiver.generateKeys();
  const keys=webpush.generateVAPIDKeys();
  const details=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/wp/offline-fixture',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},JSON.stringify({title:'Recado de teste 💙',body:'Conteúdo protegido'}),{TTL:60,vapidDetails:{subject:'mailto:fixture@example.test',publicKey:keys.publicKey,privateKey:keys.privateKey}});
  assert(details.headers['Content-Encoding']==='aes128gcm','standard encrypted content encoding');
  assert(String(details.headers.Authorization).startsWith('vapid '),'signed VAPID authorization');
  assert(details.body && !details.body.toString().includes('Conteúdo protegido'),'encrypted body, not plaintext');
});
