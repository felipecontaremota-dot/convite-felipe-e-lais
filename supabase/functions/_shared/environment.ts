const projects = { development: "oxdalpfvahcgzvqyctkq", production: "nwgyxmwaqckpghznbfzm" };
export function runtimeEnvironment() {
  const url = Deno.env.get("SUPABASE_URL");
  const configured = Deno.env.get("APP_ENV");
  if (configured && !["development", "production", "local"].includes(configured)) throw Error("Invalid runtime environment");
  const parsed = url ? new URL(url) : undefined;
  const host = parsed?.hostname || "localhost";
  const mode = configured || (host === `${projects.development}.supabase.co` ? "development" : host === `${projects.production}.supabase.co` ? "production" : "local");
  if (mode === "local" && !["localhost", "127.0.0.1", "kong"].includes(host)) throw Error("Remote runtime requires a known environment");
  if (mode !== "local" && (host !== `${projects[mode as keyof typeof projects]}.supabase.co` || parsed?.protocol !== "https:" || parsed?.port || parsed?.username || parsed?.password || parsed?.search || parsed?.hash || parsed?.pathname !== "/")) throw Error("Runtime project/environment mismatch");
  return mode;
}
export function externalDeliveryDisabled() { return runtimeEnvironment() === "development"; }
