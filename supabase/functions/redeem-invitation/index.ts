import { authenticated, service } from "../_shared/http.ts";
import { accessHandler } from "./handler.ts";
Deno.serve(accessHandler({ authenticate: authenticated, rpc: async (name, args) => await service().rpc(name, args) }));
