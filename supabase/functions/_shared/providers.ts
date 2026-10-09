import { requestJson } from "./http.ts";
export interface Delivery {
  id: string;
  key: string;
  title: string;
  body: string;
  email: string;
  whatsapp: string;
  tokens: string[];
}
export interface ProviderResult {
  status: "sent" | "skipped";
  provider: string;
  providerId?: string;
  reason?: string;
}
export interface Provider {
  send(delivery: Delivery): Promise<ProviderResult>;
}
export class DisabledProvider implements Provider {
  constructor(private name: string) {}
  async send(_delivery: Delivery): Promise<ProviderResult> {
    return {
      status: "skipped",
      provider: this.name,
      reason: "Provider não configurado",
    };
  }
}
export class ResendProvider implements Provider {
  async send(d: Delivery): Promise<ProviderResult> {
    const data = await requestJson("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("EMAIL_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": d.key,
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM"),
        to: [d.email],
        subject: d.title,
        text: d.body,
      }),
    });
    return { status: "sent", provider: "resend", providerId: data.id };
  }
}
export class WhatsAppProvider implements Provider {
  async send(d: Delivery): Promise<ProviderResult> {
    const version = Deno.env.get("WHATSAPP_API_VERSION");
    const data = await requestJson(
      `https://graph.facebook.com/${version}/${
        Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
      }/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: d.whatsapp.replace(/\D/g, ""),
          type: "template",
          template: {
            name: Deno.env.get("WHATSAPP_TEMPLATE_NAME"),
            language: { code: "pt_BR" },
            components: [{
              type: "body",
              parameters: [{ type: "text", text: d.body }],
            }],
          },
        }),
      },
    );
    return {
      status: "sent",
      provider: "whatsapp",
      providerId: data.messages?.[0]?.id,
    };
  }
}
export class ExpoPushProvider implements Provider {
  async send(d: Delivery): Promise<ProviderResult> {
    if (!d.tokens.length) {
      return {
        status: "skipped",
        provider: "expo",
        reason: "Sem dispositivo registrado",
      };
    }
    const data = await requestJson("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Deno.env.get("EXPO_ACCESS_TOKEN")
          ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify(
        d.tokens.map((to) => ({
          to,
          title: d.title,
          body: d.body,
          sound: "default",
          channelId: "wedding",
        })),
      ),
    });
    if (
      data.errors?.length ||
      data.data?.some((r: { status: string }) => r.status === "error")
    ) throw Error("Expo rejeitou o envio");
    return {
      status: "sent",
      provider: "expo",
      providerId: JSON.stringify(data.data?.map((r: { id: string }) => r.id)),
    };
  }
}
export function provider(channel: string): Provider {
  if (
    channel === "EMAIL" && Deno.env.get("EMAIL_PROVIDER") === "resend" &&
    Deno.env.get("EMAIL_API_KEY") && Deno.env.get("EMAIL_FROM")
  ) return new ResendProvider();
  if (
    channel === "WHATSAPP" &&
    [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_API_VERSION",
      "WHATSAPP_TEMPLATE_NAME",
    ].every((k) => Deno.env.get(k))
  ) return new WhatsAppProvider();
  if (channel === "PUSH") return new ExpoPushProvider();
  return new DisabledProvider(channel.toLowerCase());
}
