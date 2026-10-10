import { createClient } from "npm:@supabase/supabase-js@2.117.3";
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
export const service = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export async function authenticated(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) throw Error("unauthorized");
  const { data, error } = await service().auth.getUser(token);
  if (error || !data.user) throw Error("unauthorized");
  return data.user;
}
export function workerAuthorized(request: Request) {
  const expected = Deno.env.get("WORKER_SECRET");
  return !!expected && request.headers.get("x-worker-secret") === expected;
}
export async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
  return response.json();
}

export async function eventAdmin(request: Request, event: string) {
  if (typeof event !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event)) throw Error("invalid event");
  await authenticated(request);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: request.headers.get("Authorization")! } },
  });
  const result = await client.rpc("event_role", { p_event: event });
  if (result.error) throw Error("role validation failed");
  if (result.data !== "ADMIN") throw Error("unauthorized");
}
