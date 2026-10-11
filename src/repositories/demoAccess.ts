import type { Snapshot, Guest } from "../types/domain";
import {
  guestContact,
  brazilPhone,
  GROUPS,
} from "../features/guests/adminDomain";
import { safeHttps } from "../utils/security";
interface Database {
  snapshot: Snapshot;
  codes: Record<string, string>;
}
interface Generator {
  id: () => string;
  token: () => string;
  hash: (value: string) => Promise<string>;
  pin: () => string;
}
export const ACCESS_ACTIONS = [
  "GUEST_CREATE",
  "GUEST_UPDATE",
  "GUEST_DELETE",
  "GUEST_DELETE_BATCH",
  "GUEST_ASSIGN_FAMILY",
  "GUEST_REMOVE_FROM_FAMILY",
  "FAMILY_ADD_MEMBERS",
  "FAMILY_DELETE",
  "EVENT_SAVE",
];
export async function demoAccess(
  db: Database,
  action: string,
  p: Record<string, unknown>,
  gen: Generator,
): Promise<Record<string, unknown>> {
  const s = db.snapshot,
    event = s.event.id;
  const individual = async (name: string, phone: string, guestId: string) => {
    const code = gen.token().slice(0, 48),
      iid = gen.id();
    s.invitations.push({
      id: iid,
      event_id: event,
      kind: "INDIVIDUAL",
      name,
      active: true,
      primary_guest_id: guestId,
      version: 1,
      pin: phone ? phone.slice(-4) : gen.pin(),
      sharing_code: code,
      link_active: true,
      device_count: 0,
    });
    db.codes[iid] = code;
    return iid;
  };
  if (action === "EVENT_SAVE") {
    if ((s.event.version || 1) !== p.version) throw Error("conflict");
    if (p.gps_url && !safeHttps(String(p.gps_url))) throw Error("invalid GPS");
    Object.assign(s.event, {
      venue_name: p.venue_name,
      address: p.address,
      gps_url: p.gps_url,
      version: (s.event.version || 1) + 1,
    });
    return {};
  }
  if (action === "GUEST_CREATE" || action === "GUEST_UPDATE") {
    const existing = s.guests.find((g) => g.id === p.id);
    if (
      action === "GUEST_UPDATE" &&
      (!existing || existing.version !== p.version)
    )
      throw Error("conflict");
    const phone = brazilPhone(String(p.whatsapp || "")),
      email = String(p.email || "");
    guestContact.parse({ whatsapp: phone, email });
    const group = String(p.group_label || "");
    if (group && !GROUPS.includes(group) && group !== existing?.group_label)
      throw Error("invalid group");
    const greetingForm =
      p.greeting_form === "MASCULINE" || p.greeting_form === "FEMININE"
        ? p.greeting_form
        : null;
    if (p.greeting_form && !greetingForm) throw Error("invalid greeting form");
    const gid = existing?.id || gen.id(),
      name = String(p.name).trim();
    if (!name) throw Error("invalid name");
    const unit =
      existing?.invitation_id || (await individual(name, phone, gid));
    const guest: Guest = {
      id: gid,
      event_id: event,
      name,
      invitation_id: unit,
      group_label: group,
      greeting_form: greetingForm,
      version: (existing?.version || 0) + 1,
      is_child: !!p.is_child,
      is_adolescent: false,
      companion_of: existing?.companion_of || null,
      admin_notes: String(p.admin_notes || ""),
    };
    if (existing) Object.assign(existing, guest);
    else {
      s.guests.push(guest);
      s.rsvps.push({
        event_id: event,
        guest_id: gid,
        status: "PENDING",
        dietary: "",
        note: "",
        responded_at: null,
        source: "ADMIN",
      });
    }
    const invitation = s.invitations.find((i) => i.id === unit)!;
    if (existing) {
      invitation.version++;
      if (invitation.kind === "INDIVIDUAL") invitation.name = name;
    }
    const contact = s.contacts.find((c) => c.guest_id === gid);
    if (contact) Object.assign(contact, { whatsapp: phone, email });
    else
      s.contacts.push({
        guest_id: gid,
        whatsapp: phone,
        email,
        consent_in_app: true,
        consent_push: false,
        consent_email: false,
        consent_whatsapp: false,
      });
    return { id: gid, invitation_id: unit };
  }
  const family = s.invitations.find((i) => i.id === p.id);
  let items = p.guests as {
    id: string;
    version: number;
    invitation_version: number;
  }[];
  if (action === "FAMILY_DELETE") {
    if (
      !family ||
      (family.kind || "FAMILY") !== "FAMILY" ||
      family.version !== p.version
    )
      throw Error("conflict");
    items = s.guests
      .filter((g) => g.invitation_id === family.id)
      .map((g) => ({
        id: g.id,
        version: g.version,
        invitation_version: family.version,
      }));
  }
  const target = s.invitations.find((i) => i.id === p.target_id);
  if (
    ["FAMILY_ADD_MEMBERS", "GUEST_ASSIGN_FAMILY"].includes(action) &&
    (!target ||
      !target.active ||
      target.kind === "INDIVIDUAL" ||
      target.version !== p.target_version)
  )
    throw Error("conflict");
  if (
    ["FAMILY_ADD_MEMBERS", "GUEST_ASSIGN_FAMILY"].includes(action) &&
    (!target?.pin || !target.link_active)
  )
    throw Error("family access required");
  if (
    !Array.isArray(items) ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    throw Error("invalid batch");
  for (const item of items) {
    const g = s.guests.find((g) => g.id === item.id),
      unit = s.invitations.find((i) => i.id === g?.invitation_id);
    if (
      !g ||
      !unit ||
      g.version !== item.version ||
      unit.version !== item.invitation_version
    )
      throw Error("conflict");
    if (
      target &&
      (g.invitation_id === target.id ||
        (unit.kind !== "INDIVIDUAL" && !p.confirm_move))
    )
      throw Error("confirm move");
  }
  for (const item of items) {
    const g = s.guests.find((g) => g.id === item.id)!,
      source = s.invitations.find((i) => i.id === g.invitation_id)!;
    source.device_count = 0;
    source.version++;
    if (source.primary_guest_id === g.id) source.primary_guest_id = null;
    s.credentials.forEach((c) => {
      if (c.guest_id === g.id && !c.revoked_at)
        c.revoked_at = new Date().toISOString();
    });
    s.guests.forEach((other) => {
      if (other.companion_of === g.id) other.companion_of = null;
    });
    if (["GUEST_DELETE", "GUEST_DELETE_BATCH"].includes(action)) {
      s.guests = s.guests.filter((x) => x.id !== g.id);
      s.rsvps = s.rsvps.filter((x) => x.guest_id !== g.id);
      s.contacts = s.contacts.filter((x) => x.guest_id !== g.id);
      s.credentials = s.credentials.filter((x) => x.guest_id !== g.id);
      s.checkins = s.checkins.filter((x) => x.guest_id !== g.id);
      s.gift_selections = s.gift_selections.filter((x) => x.guest_id !== g.id);
    } else {
      g.invitation_id =
        target?.id ||
        (await individual(
          g.name,
          brazilPhone(
            s.contacts.find((c) => c.guest_id === g.id)?.whatsapp || "",
          ),
          g.id,
        ));
      g.companion_of = null;
      g.version++;
    }
    if (source.kind === "INDIVIDUAL") {
      Object.assign(source, {
        active: false,
        archived_at: new Date().toISOString(),
        sharing_code: null,
        link_active: false,
      });
      delete db.codes[source.id];
    }
  }
  if (target) {
    target.version++;
    target.device_count = 0;
  }
  if (family && action === "FAMILY_DELETE") {
    Object.assign(family, {
      active: false,
      archived_at: new Date().toISOString(),
      sharing_code: null,
      link_active: false,
      primary_guest_id: null,
    });
    family.version++;
    delete db.codes[family.id];
  }
  return {};
}
