// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { ProviderDefinitiveError, ProviderUncertainError } from "./http.ts";
export const allowedPushEndpoint = (url: string) => /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//.test(url);
export async function sendWebPush(db: SupabaseClient, job: {id:string;event_id:string;guest_id:string}, title: string, body: string, send: typeof webpush.sendNotification = webpush.sendNotification) {
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return {status:'skipped' as const,provider:'web_push',reason:'Web Push não configurado'};
  const {data:subscriptions,error}=await db.from('web_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('event_id',job.event_id).eq('guest_id',job.guest_id).eq('active',true);
  if(error) throw Error('Falha ao consultar dispositivos');
  if(!subscriptions?.length) return {status:'skipped' as const,provider:'web_push',reason:'Sem dispositivo autorizado'};
  let sent=0, failed=0, uncertain=false;
  for(const s of subscriptions) {
    if(!allowedPushEndpoint(s.endpoint)) {failed++;continue;}
    const start=await db.rpc('notification_push_attempt',{p_job:job.id,p_subscription:s.id,p_action:'START'});
    if(start.error || !start.data) {uncertain=true;continue;}
    let status='uncertain';
    try {
      await send({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_key}},JSON.stringify({title,body:Array.from(body).slice(0,180).join(''),url:'/inicio',tag:job.id}),{vapidDetails:{subject,publicKey,privateKey},TTL:86400,timeout:10000});
      sent++;status='sent';
    } catch(e) {
      const code=(e as {statusCode?:number}).statusCode;
      if(code===404 || code===410) {
        status='expired';
        const invalid=await db.from('web_push_subscriptions').update({active:false}).eq('id',s.id).eq('event_id',job.event_id);
        if(invalid.error) uncertain=true;
      } else if(code && code>=400 && code<500) {status='failed';failed++;}
      else {uncertain=true;}
    }
    const finish=await db.rpc('notification_push_attempt',{p_job:job.id,p_subscription:s.id,p_action:'FINISH',p_status:status});
    if(finish.error || !finish.data) uncertain=true;
  }
  if(uncertain || (sent && failed)) throw new ProviderUncertainError();
  if(failed) throw new ProviderDefinitiveError();
  return {status:sent?'sent' as const:'skipped' as const,provider:'web_push'};
}
