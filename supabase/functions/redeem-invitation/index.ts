import { authenticated, service } from "../_shared/http.ts";
import { accessHandler } from "./handler.ts";
Deno.serve(
  accessHandler({
    configuredEvent: Deno.env.get("APP_EVENT_ID"),
    sourceAddress: (request) => {
      const ip = request.headers.get("x-real-ip");
      return Deno.env.get("TRUST_GATEWAY_IP") === "true" &&
        ip &&
        /^[0-9a-f:.]{3,64}$/i.test(ip)
        ? ip
        : undefined;
    },
    authenticate: authenticated,
    rpc: async (name, args) => await service().rpc(name, args),
  }),
);
