import { z } from "zod";
import { AppError } from "../../lib/errors";
import { feedbackColors } from "../../theme/feedback";
export type ActivityKind =
  | "RSVP"
  | "LOGIN"
  | "PRESENTES"
  | "CONVITES"
  | "LOCAL"
  | "INFORMACOES"
  | "LOGOUT";
export interface GuestActivity {
  id: string;
  event_id: string;
  created_at: string;
  kind: ActivityKind;
  historical: boolean;
  guest_id: string | null;
  guest_name: string | null;
  invitation_name: string | null;
  status: string | null;
  previous_status: string | null;
  actor_role: string | null;
  actor_guest_id: string | null;
  actor_name: string | null;
  access_mode: string | null;
  device: string | null;
  ip: string | null;
  editable: boolean;
}
export interface ActivityCursor {
  at: string;
  id: string;
}
export interface ActivityPage {
  items: GuestActivity[];
  next: ActivityCursor | null;
}
export const activityRoutes: Record<string, ActivityKind> = {
  "/presentes": "PRESENTES",
  "/ingressos": "CONVITES",
  "/como-chegar": "LOCAL",
  "/informacoes": "INFORMACOES",
};
export function activityTime(instant: string) {
  const d = new Date(instant);
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${date} às ${time}`;
}
export function activitySentence(a: GuestActivity) {
  const self =
    a.actor_role === "GUEST" && !!a.guest_id && a.actor_guest_id === a.guest_id;
  const status =
    a.status === "CONFIRMED"
      ? "PRESENÇA"
      : a.status === "DECLINED"
        ? "NÃO IRÁ"
        : a.status === "MAYBE"
          ? "TALVEZ IRÁ"
          : a.status === "PENDING"
            ? "PENDENTE"
            : "";
  const color =
    a.status === "CONFIRMED"
      ? feedbackColors.confirmed.text
      : a.status === "DECLINED"
        ? feedbackColors.declined.text
        : a.status === "MAYBE"
          ? feedbackColors.deciding.text
          : feedbackColors.neutral.text;
  const access =
    a.actor_role === "ADMIN"
      ? ""
      : a.access_mode === "LINK"
        ? "através do link-convite"
        : a.access_mode === "NAME_PIN"
          ? "através do acesso por nome e senha"
          : "";
  const subject =
    a.guest_name ||
    (a.kind === "LOGIN"
      ? a.invitation_name
        ? `Um integrante do convite “${a.invitation_name}”`
        : "Um integrante do convite"
      : "Convidado não identificado");
  if (a.kind === "RSVP") {
    const actor =
      a.actor_role === "ADMIN"
        ? ` pelos administradores${a.actor_name ? ` (${a.actor_name})` : ""}`
        : !self && a.actor_name
          ? ` por ${a.actor_name}`
          : "";
    return {
      prefix: self ? "" : "A confirmação de ",
      subject,
      action:
        self && status && a.status !== "PENDING"
          ? a.status === "CONFIRMED"
            ? " confirmou "
            : " confirmou que "
          : status
            ? " foi alterada para "
            : " foi atualizada",
      status,
      color,
      suffix: `${actor}, em ${activityTime(a.created_at)}${access ? ` ${access}` : ""}.`,
    };
  }
  const action =
    a.kind === "LOGIN"
      ? ` acessou o convite${access ? ` ${access}` : ""}`
      : a.kind === "LOGOUT"
        ? " saiu do dispositivo"
        : ` acessou a tela ${a.kind === "INFORMACOES" ? "INFORMAÇÕES" : a.kind}`;
  return {
    prefix: "",
    subject,
    action,
    status: "",
    color,
    suffix: ` em ${activityTime(a.created_at)}.`,
  };
}
// PostgreSQL timestamps retain microseconds; Date alone truncates to milliseconds.
function subMillisecond(instant: string) {
  return Number(
    (instant.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3, 6),
  );
}
export function orderedActivities(pages: ActivityPage[]) {
  return [
    ...new Map(pages.flatMap((p) => p.items).map((a) => [a.id, a])).values(),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
      subMillisecond(b.created_at) - subMillisecond(a.created_at) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}
export function technicalDetails(a: Pick<GuestActivity, "device" | "ip">) {
  return [a.device, a.ip ? `IP ${a.ip}` : null].filter(Boolean).join(" · ");
}

const optionalText = z.string().nullable();
const activitySchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  kind: z.enum([
    "RSVP",
    "LOGIN",
    "PRESENTES",
    "CONVITES",
    "LOCAL",
    "INFORMACOES",
    "LOGOUT",
  ]),
  historical: z.boolean(),
  guest_id: z.string().uuid().nullable(),
  guest_name: optionalText,
  invitation_name: optionalText,
  status: z.enum(["CONFIRMED", "DECLINED", "MAYBE", "PENDING"]).nullable(),
  previous_status: optionalText,
  actor_role: optionalText,
  actor_guest_id: z.string().uuid().nullable(),
  actor_name: optionalText,
  access_mode: z.enum(["LINK", "NAME_PIN"]).nullable(),
  device: optionalText,
  ip: optionalText,
  editable: z.boolean(),
});
const activityPageSchema = z.object({
  items: z.array(activitySchema).max(20),
  next: z
    .object({
      at: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullable(),
});
export function parseActivityPage(value: unknown): ActivityPage {
  const result = activityPageSchema.safeParse(value);
  if (!result.success)
    throw new AppError("Não foi possível carregar as confirmações agora.");
  return result.data;
}
