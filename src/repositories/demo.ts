import type { Snapshot, Role, OfflineMutation, Ticket } from "../types/domain";
import { WEDDING_START } from "../features/countdown/domain";
import { NOTIFICATION_DAYS } from "../features/notifications/domain";
import { rsvpSchema, contactSchema } from "../utils/security";
import { readCache, writeCache } from "../storage/driver";
import * as Crypto from "expo-crypto";
const event = "00000000-0000-4000-8000-000000000001";
export const demoFamily = "10000000-0000-4000-8000-000000000001";
export const DEMO_CODE = "DemoConviteExclusivoFelipeLais2026";
export const id = () => Crypto.randomUUID();
export const randomToken = () =>
  Array.from(Crypto.getRandomBytes(32), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const hashToken = (token: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
const stamp = () => new Date().toISOString();
export function demoSeed(): Snapshot {
  const guests = ["Convidado Um", "Convidada Dois", "Criança Demo"].map(
    (name, i) => ({
      id: `20000000-0000-4000-8000-00000000000${i + 1}`,
      event_id: event,
      invitation_id: demoFamily,
      name,
      group_label: "Demo",
      version: 1,
      companion_of: null,
    }),
  );
  return {
    role: null,
    event: {
      id: event,
      title: "Felipe & Laís",
      starts_at: WEDDING_START,
      timezone: "America/Sao_Paulo",
      venue_name: null,
      address: null,
      latitude: null,
      longitude: null,
    },
    invitations: [
      {
        id: demoFamily,
        event_id: event,
        name: "Família Demo",
        active: true,
        primary_guest_id: guests[0]!.id,
        version: 1,
      },
    ],
    guests,
    rsvps: guests.map((g, i) => ({
      guest_id: g.id,
      event_id: event,
      status: i === 0 ? "CONFIRMED" : "PENDING",
      dietary: "",
      note: "",
      responded_at: null,
      source: "DEMO",
    })),
    contacts: [],
    gifts: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        event_id: event,
        title: "Um novo capítulo",
        description: "Sugestão ilustrativa. O link será definido pelos noivos.",
        image_url: null,
        external_url: null,
        price_label: "Valor a definir",
        active: true,
        sort_order: 1,
        reservation_enabled: false,
        version: 1,
      },
    ],
    gift_selections: [],
    messages: [],
    announcements: [
      {
        id: id(),
        event_id: event,
        title: "Que alegria ter você aqui",
        content: "Este espaço reúne os detalhes da nossa próxima aventura.",
        created_at: stamp(),
      },
    ],
    rules: NOTIFICATION_DAYS.map((days) => ({
      id: id(),
      event_id: event,
      days_before: days,
      title:
        days === 0
          ? "É hoje!"
          : days === 1
            ? "É amanhã!"
            : `Faltam ${days} dias`,
      body: "Estamos felizes em compartilhar este momento com você.",
      active: true,
      channels: ["IN_APP"],
      version: 1,
    })),
    credentials: [],
    checkins: [],
    notification_jobs: [],
    sheet_jobs: [],
  };
}
interface DemoDatabase {
  snapshot: Snapshot;
  applied: string[];
  tickets: Ticket[];
  codes: Record<string, string>;
}
let chain: Promise<unknown> = Promise.resolve();
async function transaction<T>(
  fn: (db: DemoDatabase) => Promise<T> | T,
): Promise<T> {
  const run = chain.then(async () => {
    const db = (await readCache<DemoDatabase>("demo-db")) || {
      snapshot: demoSeed(),
      applied: [],
      tickets: [],
      codes: { [demoFamily]: DEMO_CODE },
    };
    const result = await fn(db);
    await writeCache("demo-db", db);
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}
export async function demoSnapshot(role: Role): Promise<Snapshot> {
  return transaction((db) => {
    const s = JSON.parse(JSON.stringify(db.snapshot)) as Snapshot;
    s.role = role;
    if (role === "GUEST") {
      s.invitations = s.invitations.filter((i) => i.id === demoFamily);
      s.guests = s.guests.filter((g) => g.invitation_id === demoFamily);
      const guestIds = new Set(s.guests.map((g) => g.id));
      s.rsvps = s.rsvps.filter((r) => guestIds.has(r.guest_id));
      s.contacts = s.contacts.filter((r) => guestIds.has(r.guest_id));
      s.notification_jobs = [];
      s.sheet_jobs = [];
      s.messages = s.messages.filter(
        (m) =>
          (!m.invitation_id || m.invitation_id === demoFamily) &&
          (!m.channels || m.channels.includes("IN_APP")),
      );
      s.credentials = s.credentials.filter(
        (c) => guestIds.has(c.guest_id) && !c.revoked_at,
      );
      s.checkins = [];
      s.rules = [];
      s.gifts = s.gifts.filter((g) => g.active);
    }
    if (role === "CEREMONIALIST") {
      s.notification_jobs = [];
      s.sheet_jobs = [];
      s.messages = [];
      s.contacts = [];
      s.gifts = [];
      s.gift_selections = [];
      s.rules = [];
      s.rsvps = s.rsvps.map((r) => ({ ...r, dietary: "", note: "" }));
    }
    return s;
  });
}
export async function demoMutate(m: OfflineMutation, role: Role) {
  return transaction((db) => {
    if (db.applied.includes(m.mutationId)) return;
    const s = db.snapshot,
      p = m.payload,
      g = s.guests.find((g) => g.id === p.guest_id);
    if (m.type !== "CHECKIN_CREATE" && role === "CEREMONIALIST")
      throw Error("Acesso restrito");
    if (g && role === "GUEST" && g.invitation_id !== demoFamily)
      throw Error("Acesso restrito");
    switch (m.type) {
      case "RSVP_UPDATE": {
        if (!g) throw Error("Integrante inválido");
        const data = rsvpSchema.parse(p);
        const row = s.rsvps.find((r) => r.guest_id === g.id)!;
        Object.assign(row, data, { responded_at: stamp(), source: "APP" });
        if (data.status !== "CONFIRMED") {
          s.credentials.forEach((c) => {
            if (c.guest_id === g.id) c.revoked_at = stamp();
          });
          db.tickets = db.tickets.filter((t) => t.guest_id !== g.id);
        }
        break;
      }
      case "CONTACT_UPDATE": {
        if (!g) throw Error("Integrante inválido");
        const data = contactSchema.parse(p);
        s.contacts = s.contacts.filter((c) => c.guest_id !== g.id);
        s.contacts.push({ ...data, guest_id: g.id });
        break;
      }
      case "MESSAGE_SEND": {
        const invitation =
          role === "GUEST" ? demoFamily : String(p.invitation_id || "") || null;
        if (!String(p.content || "").trim()) throw Error("Digite uma mensagem");
        s.messages.push({
          id: id(),
          event_id: event,
          invitation_id: invitation,
          recipient_guest_id: String(p.recipient_guest_id || "") || null,
          sender_guest_id:
            role === "GUEST" ? String(p.sender_guest_id || "") || null : null,
          sender_user_id: "demo",
          from_admin: role === "ADMIN",
          content: String(p.content),
          channels:
            role === "ADMIN"
              ? (p.channels as Snapshot["messages"][number]["channels"])
              : ["IN_APP"],
          created_at: stamp(),
          read_at: null,
        });
        if (role === "ADMIN") {
          for (const channel of (p.channels as import("../types/domain").Channel[]) || [
            "IN_APP",
          ])
            s.notification_jobs.push({
              id: id(),
              channel,
              status: channel === "IN_APP" ? "sent" : "skipped",
              attempts: 1,
              last_error:
                channel === "IN_APP"
                  ? null
                  : "DEMO: provider externo desativado",
              created_at: stamp(),
            });
        }
        if (
          role === "ADMIN" &&
          !invitation &&
          !p.recipient_guest_id &&
          (!p.channels || (p.channels as string[]).includes("IN_APP"))
        )
          s.announcements.push({
            id: id(),
            event_id: event,
            title: "Mensagem dos noivos",
            content: String(p.content),

            created_at: stamp(),
          });
        break;
      }
      case "CHECKIN_CREATE": {
        if (
          role === "GUEST" ||
          !g ||
          !s.rsvps.some((r) => r.guest_id === g.id && r.status === "CONFIRMED")
        )
          throw Error("Entrada não autorizada");
        if (
          p.method === "QR" &&
          !s.credentials.some(
            (c) =>
              c.guest_id === g.id &&
              !c.revoked_at &&
              c.token_hash === p.token_hash,
          )
        )
          throw Error("Ingresso revogado");
        if (!s.checkins.some((c) => c.guest_id === g.id))
          s.checkins.push({
            id: id(),
            event_id: event,
            guest_id: g.id,
            mutation_id: m.mutationId,
            method: p.method === "QR" ? "QR" : "MANUAL",
            actor_id: "demo",
            created_at: stamp(),
          });
        break;
      }
      case "GIFT_SELECT": {
        if (!g || !s.gifts.some((x) => x.id === p.gift_id && x.active))
          throw Error("Presente inválido");
        s.gift_selections = s.gift_selections.filter(
          (x) => !(x.guest_id === g.id && x.gift_id === p.gift_id),
        );
        if (p.selected)
          s.gift_selections.push({
            guest_id: g.id,
            gift_id: String(p.gift_id),
          });
        break;
      }
      case "PUSH_REGISTER":
        break;
    }
    db.applied.push(m.mutationId);
  });
}
export async function demoTicket(
  guestId: string,
  regenerate = false,
): Promise<Ticket> {
  return transaction(async (db) => {
    if (
      !db.snapshot.rsvps.some(
        (r) => r.guest_id === guestId && r.status === "CONFIRMED",
      )
    )
      throw Error("Confirme a presença primeiro");
    if (
      !regenerate &&
      db.snapshot.credentials.some(
        (c) => c.guest_id === guestId && !c.revoked_at,
      )
    )
      throw Error("Ingresso existente; regeneração explícita necessária");
    db.snapshot.credentials.forEach((c) => {
      if (c.guest_id === guestId) c.revoked_at = stamp();
    });
    const token = randomToken();
    const ticket = { guest_id: guestId, token };
    db.snapshot.credentials.push({
      id: id(),
      event_id: event,
      guest_id: guestId,
      token_hash: await hashToken(token),
      issued_at: stamp(),
      revoked_at: null,
    });
    db.tickets = db.tickets.filter((t) => t.guest_id !== guestId);
    db.tickets.push(ticket);
    return ticket;
  });
}
export async function demoAdmin(
  action: string,
  p: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return transaction((db) => {
    const s = db.snapshot;
    const entity = String(p.id || "");
    const version = Number(p.version);
    const inv = s.invitations.find((i) => i.id === entity);
    if (inv && Number.isFinite(version) && inv.version !== version)
      throw Error("Dados alterados. Atualize a tela.");
    switch (action) {
      case "INVITATION_SAVE":
        if (inv) {
          Object.assign(inv, {
            name: String(p.name),
            active: p.active !== false,
            primary_guest_id: p.primary_guest_id || null,
            version: inv.version + 1,
          });
        } else {
          s.invitations.push({
            id: id(),
            event_id: event,
            name: String(p.name),
            active: true,
            primary_guest_id: null,
            version: 1,
          });
        }
        break;
      case "INVITATION_DISABLE":
        if (inv) {
          inv.active = false;
          inv.version++;
          delete db.codes[inv.id];
        }
        break;
      case "CODE_ROTATE":
        if (!inv) throw Error("Família inválida");
        {
          const code = randomToken().slice(0, 48);
          db.codes[inv.id] = code;
          return { code };
        }
      case "CODE_BLOCK":
        delete db.codes[entity];
        break;
      case "GUEST_SAVE": {
        const existing = s.guests.find((g) => g.id === entity);
        if (!s.invitations.some((i) => i.id === p.invitation_id))
          throw Error("Família inválida");
        if (existing && existing.version !== Number(p.version))
          throw Error("Dados alterados. Atualize.");
        if (existing)
          Object.assign(existing, {
            version: existing.version + 1,
            name: String(p.name),
            invitation_id: String(p.invitation_id),
            group_label: String(p.group_label || ""),
            companion_of: p.companion_of || null,
          });
        else {
          const guest = {
            id: id(),
            event_id: event,
            name: String(p.name),
            invitation_id: String(p.invitation_id),
            group_label: String(p.group_label || ""),
            version: 1,
            companion_of: p.companion_of ? String(p.companion_of) : null,
          };
          s.guests.push(guest);
          s.rsvps.push({
            guest_id: guest.id,
            event_id: event,
            status: "PENDING",
            dietary: "",
            note: "",
            responded_at: null,
            source: "ADMIN",
          });
        }
        break;
      }
      case "GUEST_REMOVE":
        if (
          s.guests.find((g) => g.id === entity)?.version !== Number(p.version)
        )
          throw Error("Dados alterados. Atualize.");
        s.guests = s.guests.filter((g) => g.id !== entity);
        s.rsvps = s.rsvps.filter((r) => r.guest_id !== entity);
        s.credentials = s.credentials.filter((c) => c.guest_id !== entity);
        break;
      case "FAMILY_MERGE":
        s.guests.forEach((g) => {
          if (g.invitation_id === entity) g.invitation_id = String(p.target_id);
        });
        if (inv) {
          inv.active = false;
          inv.version++;
        }
        delete db.codes[entity];
        break;
      case "FAMILY_SPLIT": {
        const newId = id();
        s.invitations.push({
          id: newId,
          event_id: event,
          name: String(p.name),
          active: true,
          primary_guest_id: null,
          version: 1,
        });
        s.guests.forEach((g) => {
          if (
            g.invitation_id === entity &&
            (p.guest_ids as string[]).includes(g.id)
          )
            g.invitation_id = newId;
        });
        break;
      }
      case "GIFT_SAVE": {
        const existing = s.gifts.find((g) => g.id === entity);
        if (existing && existing.version !== version)
          throw Error("Dados alterados. Atualize.");
        const gift = {
          id: entity || id(),
          event_id: event,
          title: String(p.title),
          description: String(p.description || ""),
          image_url: p.image_url ? String(p.image_url) : null,
          external_url: p.external_url ? String(p.external_url) : null,
          price_label: String(p.price_label || ""),
          active: p.active !== false,
          sort_order: Number(p.sort_order || 0),
          reservation_enabled: !!p.reservation_enabled,
          version: (existing?.version || 0) + 1,
        };
        s.gifts = s.gifts.filter((g) => g.id !== gift.id);
        s.gifts.push(gift);
        break;
      }
      case "GIFT_DELETE":
        s.gifts = s.gifts.filter((g) => g.id !== entity);
        break;
      case "RULE_SAVE": {
        const rule = s.rules.find((r) => r.id === entity);
        if (rule) {
          if (rule.version !== version)
            throw Error("Dados alterados. Atualize.");
          Object.assign(rule, {
            title: String(p.title),
            body: String(p.body),
            active: !!p.active,
            channels: p.channels,
            version: rule.version + 1,
          });
        }
        break;
      }
      case "EVENT_SAVE":
        Object.assign(s.event, {
          venue_name: p.venue_name || null,
          address: p.address || null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
        });
        break;
      case "CHECKIN_REVERT":
        s.checkins = s.checkins.filter((c) => c.id !== entity);
        break;
      case "MESSAGE_READ":
        s.messages.forEach((m) => {
          if (m.id === entity) m.read_at = stamp();
        });
        break;
      default:
        throw Error("Operação desconhecida");
    }
    return {};
  });
}
