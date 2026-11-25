import { trackedArgs, validAddress } from "./activity.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error(`Mismatch ${JSON.stringify(a)}`);
  }
};
Deno.test("only verified gateway addresses accept IPv4 and IPv6", () => {
  for (const ip of ["192.0.2.1", "2001:db8::1", "::1"]) {
    equal(validAddress(ip), ip);
  }
  for (
    const ip of [
      "999.1.1.1",
      "192.0.2.1, 1.2.3.4",
      "abc",
      "::not",
      "01.2.3.4",
      null,
    ]
  ) equal(validAddress(ip), null);
});
Deno.test("tracked redemption uses the actual verified flow and observed request context", () => {
  const req = new Request("https://example.test", {
    headers: { "user-agent": "iPhone", "x-forwarded-for": "malicious" },
  });
  const args = {
    p_event: "event",
    p_user: "user",
    p_code: "secret-code",
    p_pin: "1234",
    p_bucket: "hash",
  };
  equal(trackedArgs("redeem_invitation_link", args, req).p_ip, null);
  equal(trackedArgs("redeem_invitation_link", args, req).p_agent, "iPhone");
  equal(trackedArgs("redeem_invitation_link", args, req).p_name, null);
  equal(
    trackedArgs(
      "redeem_invitation_by_name",
      { ...args, p_name: "Name" },
      req,
      "2001:db8::1",
    ).p_code,
    null,
  );
});

Deno.test("verified link resume passes a stable activity request; credential lookup does not record a premature login", async () => {
  const { accessHandler } = await import("./handler.ts");
  const event = "00000000-0000-4000-8000-000000000001",
    requestId = crypto.randomUUID();
  const seen: (string | undefined)[] = [];
  const handle = accessHandler({
    configuredEvent: event,
    authenticate: async () => ({ id: "server-user", is_anonymous: true }),
    rpc: async (name, _args, _request, activityRequest) => {
      if (name === "identify_invitation") {
        seen.push(activityRequest);
        return { data: { name: "Family", activated: true }, error: null };
      }
      return { data: { linked: true, invitation_id: event }, error: null };
    },
  });
  const req = (body: object) =>
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify(body),
    });
  equal(
    (await handle(
      req({
        action: "identify",
        event_id: event,
        code: "a".repeat(48),
        request_id: requestId,
      }),
    )).status,
    200,
  );
  equal(
    trackedArgs(
      "identify_invitation",
      {
        p_event: event,
        p_user: "server-user",
        p_code: "a".repeat(48),
        p_bucket: "hash",
      },
      undefined,
      undefined,
      requestId,
    ).p_pin,
    null,
  );
  equal(seen[0], requestId);
  await handle(req({ event_id: event, code: "a".repeat(48), pin: "1234" }));
  equal(seen[1], undefined);
});
