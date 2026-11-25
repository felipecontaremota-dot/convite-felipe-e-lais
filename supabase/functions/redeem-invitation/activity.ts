// Context from the request, never from credential/body fields. An IP is only
// accepted behind the existing explicit trusted-gateway configuration.
export function validAddress(value: string | null | undefined): string | null {
  if (!value || value.length > 64 || /[%\s,]/.test(value)) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((p) =>
        Number(p) <= 255 && String(Number(p)) === p
      )
      ? value
      : null;
  }
  if (!value.includes(":")) return null;
  try {
    new URL(`https://[${value}]/`);
    return value;
  } catch {
    return null;
  }
}
export function trackedArgs(
  name: string,
  args: Record<string, unknown>,
  request?: Request,
  address?: string,
  activityRequest?: string,
) {
  return {
    p_event: args.p_event,
    p_user: args.p_user,
    p_code: name !== "redeem_invitation_by_name" ? args.p_code : null,
    p_name: name === "redeem_invitation_by_name" ? args.p_name : null,
    p_pin: args.p_pin ?? null,
    p_bucket: args.p_bucket,
    p_agent: request?.headers.get("user-agent")?.slice(0, 512) || null,
    p_ip: validAddress(address),
    p_resume: name === "identify_invitation",
    p_request: activityRequest || null,
  };
}
