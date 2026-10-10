import { accessHandler } from "./handler.ts";
const event = "00000000-0000-4000-8000-000000000001", code = "CodeSeguroNaoEnumeravelCom32Chars";
function assert(value: unknown, label: string) { if (!value) throw Error(label); }
function request(body: unknown) { return new Request("https://example.test", { method: "POST", body: JSON.stringify(body), headers: { "x-real-ip": "192.0.2.1" } }); }
Deno.test("anonymous PIN activation preserves leading zeros and hashes source", async () => {
  const handle = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: true }), rpc: async (name, args) => { if (name === "identify_invitation") return { data: { name: "Família", activated: false }, error: null }; assert(name === "redeem_invitation", "RPC"); assert(args.p_pin === "0047", "leading zeros"); assert(String(args.p_bucket).length === 64, "hashed address"); return { data: true, error: null }; } });
  assert((await handle(request({ event_id: event, code, pin: "0047" }))).status === 200, "activation");
});
Deno.test("invalid PIN/code and blocked invitations fail closed with specific public codes", async () => {
  const handle = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: true }), rpc: async () => ({ data: false, error: null }) });
  for (const body of [{ event_id: event, code, pin: 47 }, { event_id: event, code, pin: "47" }, { event_id: event, code: "bad", pin: "0047" }, { event_id: event, code, pin: "9999" }]) {
    const response = await handle(request(body)); assert(response.status !== 200, "reject"); assert(["invalid_link", "invalid_password"].includes((await response.json()).code), "specific public error");
  }
});
Deno.test("staff sessions cannot bind invitations or call identify", async () => {
  const handle = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: false }), rpc: () => { throw Error("must not call"); } });
  assert((await handle(request({ event_id: event, code, pin: "0047" }))).status === 403, "staff rejected");
});
Deno.test("identification only returns minimal metadata; never invokes redeem", async () => {
  const handle = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: true }), rpc: async (name, args) => { assert(name === "identify_invitation", "identify only"); assert(!("p_pin" in args), "no activation"); return { data: { name: "Família Teste", activated: false }, error: null }; } });
  const body = await (await handle(request({ event_id: event, code, action: "identify" }))).json(); assert(Object.keys(body).length === 2, "minimal");
});
Deno.test("missing session and malformed JSON fail closed", async () => {
  const handle = accessHandler({ authenticate: () => { throw Error("unauthorized"); }, rpc: () => { throw Error("must not call"); } });
  assert((await handle(request({}))).status === 401, "auth required");
});
Deno.test("technical lookup failure never becomes invalid password and staff is explicit", async () => {
  const failing = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: true }), rpc: async () => ({ data: null, error: { message: "private failure" } }) });
  const response = await failing(request({ event_id: event, code, action: "identify" }));
  assert(response.status === 503 && (await response.json()).code === "technical", "technical lookup distinguished");
  const staff = accessHandler({ authenticate: async () => ({ id: "u", is_anonymous: false }), rpc: () => { throw Error("never call"); } });
  assert((await (await staff(request({ event_id: event, code, action: "identify" }))).json()).code === "staff_session", "explicit staff session");
});
