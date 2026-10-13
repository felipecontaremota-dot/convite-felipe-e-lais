import { dispatchHandler } from "../dispatch-notifications/index.ts";
import { invitationHandler } from "../send-invitations/handler.ts";
Deno.test("maintenance claim/reservation failures prevent dispatcher and invitation provider calls",async()=>{
 let providerCalls=0;
 const provider=()=>({send:()=>{providerCalls++;throw Error("unexpected provider");}});
 const db={rpc:()=>Promise.resolve({data:null,error:{code:"PT503",message:"Maintenance"}})};
 const dispatched=await dispatchHandler({service:()=>db,workerAuthorized:()=>true,eventAdmin:()=>Promise.resolve(),provider} as never)(new Request("https://fixture.test",{method:"POST"}));
 if(dispatched.status!==500 || providerCalls!==0)throw Error("Worker bypassed database maintenance");
 const handler=invitationHandler({service:()=>db,eventAdmin:()=>Promise.resolve(),provider,base:()=>"https://example.test"} as never);
 const sent=await handler(new Request("https://fixture.test",{method:"POST",body:JSON.stringify({event_id:"00000000-0000-4000-8000-000000000001",request_id:"aaaaaaaa-0000-4000-8000-000000000001",guest_id:"aaaaaaaa-0000-4000-8000-000000000002"})}));
 if(sent.status!==503 || providerCalls!==0)throw Error("Invitation bypassed maintenance");
});
