import { trackedArgs, validAddress } from "./activity.ts";
import { authenticated, service } from "../_shared/http.ts";
import { accessHandler } from "./handler.ts";
const sourceAddress = (request: Request) =>
  Deno.env.get("TRUST_GATEWAY_IP") === "true"
    ? validAddress(request.headers.get("x-real-ip")) || undefined
    : undefined;
Deno.serve(
  accessHandler({
    configuredEvent: Deno.env.get("APP_EVENT_ID"),
    sourceAddress,
    authenticate: authenticated,
    rpc: async (name, args, request, activityRequest) => {
      if (
        name === "redeem_invitation_by_name" ||
        name === "redeem_invitation_link" ||
        (name === "identify_invitation" && !!activityRequest)
      ) {
        return await service().rpc(
          "redeem_invitation_tracked",
          trackedArgs(
            name,
            args,
            request,
            request ? sourceAddress(request) : undefined,
            activityRequest,
          ),
        );
      }
      return await service().rpc(name, args);
    },
  }),
);
