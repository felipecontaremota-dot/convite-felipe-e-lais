import { runtimeEnvironment, externalDeliveryDisabled } from "./environment.ts";
import { provider } from "./providers.ts";
import { requestJson } from "./http.ts";
Deno.test("DEV refuses PROD runtime and disables providers even with configured credentials", async () => {
 const names=["SUPABASE_URL","APP_ENV","EMAIL_PROVIDER","EMAIL_API_KEY","EMAIL_FROM"];
 const before=names.map(n=>Deno.env.get(n));
 try {
  Deno.env.set("APP_ENV","development");
  Deno.env.set("SUPABASE_URL","https://nwgyxmwaqckpghznbfzm.supabase.co");
  let rejected=false;try{runtimeEnvironment();}catch{rejected=true;}if(!rejected)throw Error("Cross-environment runtime accepted");
  Deno.env.set("SUPABASE_URL","https://oxdalpfvahcgzvqyctkq.supabase.co");
  Deno.env.set("EMAIL_PROVIDER","resend");Deno.env.set("EMAIL_API_KEY","mock-only");Deno.env.set("EMAIL_FROM","fixture@example.test");
  const result=await provider("EMAIL").send({id:"mock",key:"mock",title:"mock",body:"mock",email:"fixture@example.test",whatsapp:"",tokens:[]});
  if(!externalDeliveryDisabled() || result.status!=="skipped" || result.provider!=="development_disabled")throw Error("DEV provider enabled");
  try { await requestJson("https://example.test"); throw Error("fetch should be blocked"); } catch(e) { if((e as Error).message!=="Provider rejeitou o envio")throw e; }
 } finally {names.forEach((n,i)=>before[i]===undefined?Deno.env.delete(n):Deno.env.set(n,before[i]!));}
});
