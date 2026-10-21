export type Role = "GUEST" | "ADMIN" | "CEREMONIALIST";
export type RSVP = "PENDING" | "CONFIRMED" | "DECLINED";
export type Channel = "IN_APP" | "PUSH" | "EMAIL" | "WHATSAPP";
export interface WeddingEvent {
  gps_url?: string | null;
  version?: number;
  id: string;
  title: string;
  starts_at: string;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}
export interface Invitation {
  name_login_conflict?: boolean;
  kind?: "FAMILY" | "INDIVIDUAL";
  archived_at?: string | null;
  pin?: string | null;
  sharing_code?: string | null;
  link_active?: boolean;
  device_count?: number;
  delivery_status?: "NOT_SENT" | "SENT" | "OPENED";
  sent_at?: string | null;
  sent_channel?: Channel | null;
  first_activated_at?: string | null;
  id: string;
  event_id: string;
  name: string;
  active: boolean;
  primary_guest_id: string | null;
  version: number;
}
export interface Guest {
  invitation_sent?: boolean;
  profile_confirmed_at?: string | null;
  greeting_form?: "MASCULINE" | "FEMININE" | null;
  is_child?: boolean;
  is_adolescent?: boolean;
  admin_notes?: string;
  id: string;
  event_id: string;
  invitation_id: string;
  name: string;
  group_label: string;
  version: number;
  companion_of: string | null;
}
export interface RsvpRecord {
  guest_id: string;
  event_id: string;
  status: RSVP;
  dietary: string;
  note: string;
  responded_at: string | null;
  source: string;
}
export interface Contact {
  updated_at?: string;
  communications_revoked?: boolean;
  guest_id: string;
  email: string;
  whatsapp: string;
  consent_in_app: boolean;
  consent_push: boolean;
  consent_email: boolean;
  consent_whatsapp: boolean;
}
export interface Gift {
  id: string;
  event_id: string;
  title: string;
  description: string;
  image_url: string | null;
  external_url: string | null;
  price_label: string;
  active: boolean;
  sort_order: number;
  reservation_enabled: boolean;
  version: number;
}
export type MessageAudience =
  "GENERAL" | "FAMILY" | "INDIVIDUAL" | "PRIVATE" | "LEGACY";
export interface Message {
  notification_title?: string | null;
  thread_id?: string;
  audience?: MessageAudience;
  viewer_read_at?: string | null;
  legacy_admin_read_at?: string | null;
  deleted_at?: string | null;
  id: string;
  event_id: string;
  invitation_id: string | null;
  recipient_guest_id: string | null;
  recipient_guest_ids?: string[];
  sender_guest_id: string | null;
  sender_user_id: string;
  from_admin: boolean;
  content: string;
  channels?: Channel[];
  created_at: string;
  read_at: string | null;
}
export interface Announcement {
  message_id?: string | null;
  id: string;
  event_id: string;
  title: string;
  content: string;
  created_at: string;
}
export interface Rule {
  id: string;
  event_id: string;
  days_before: number;
  title: string;
  body: string;
  active: boolean;
  channels: Channel[];
  version: number;
}
export interface Credential {
  id: string;
  event_id: string;
  guest_id: string;
  token_hash: string;
  issued_at: string;
  revoked_at: string | null;
}
export interface Ticket {
  guest_id: string;
  token: string;
}
export interface Checkin {
  id: string;
  event_id: string;
  guest_id: string;
  mutation_id: string;
  method: "QR" | "MANUAL";
  actor_id: string;
  created_at: string;
  local?: boolean;
}
export interface NotificationSchedule {
  id: string;
  event_id: string;
  title: string;
  body: string;
  scheduled_at: string;
  audience: "GENERAL" | "FAMILY" | "INDIVIDUAL";
  invitation_id: string | null;
  recipient_guest_ids: string[];
  channels: Channel[];
  active: boolean;
  status: "scheduled" | "dispatched" | "cancelled";
  version: number;
  created_at: string;
}
export interface DeliveryJob {
  message_id?: string | null;
  delivery_started_at?: string | null;
  id: string;
  channel: Channel;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}
export interface SheetJob {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  version: number;
}
export interface Snapshot {
  profile_confirmation?: {
    supported: boolean;
    guest_id?: string | null;
    confirmed_at?: string | null;
  };
  capabilities?: {
    messaging_v2?: boolean;
    notification_schedules?: boolean;
    admin_guest_controls?: boolean;
  };
  notification_schedules?: NotificationSchedule[];
  current_invitation_id?: string | null;
  role: Role | null;
  event: WeddingEvent;
  invitations: Invitation[];
  guests: Guest[];
  rsvps: RsvpRecord[];
  contacts: Contact[];
  gifts: Gift[];
  gift_selections: { guest_id: string; gift_id: string }[];
  messages: Message[];
  announcements: Announcement[];
  rules: Rule[];
  credentials: Credential[];
  checkins: Checkin[];
  notification_jobs: DeliveryJob[];
  sheet_jobs: SheetJob[];
  invitation_deliveries?: {
    id: string;
    request_id?: string;
    superseded_by?: string | null;
    guest_ids?: string[];
    bulk?: boolean;
    attempts?: number;
    last_attempt_at?: string | null;
    guest_id: string;
    invitation_id: string;
    recipient_email: string;
    status: string;
    sent_at: string | null;
    created_at: string;
  }[];
}
export type MutationType =
  | "RSVP_UPDATE"
  | "CONTACT_UPDATE"
  | "CHECKIN_CREATE"
  | "MESSAGE_SEND"
  | "MESSAGE_SEND_TO_GUESTS"
  | "MESSAGE_REPLY"
  | "MESSAGE_READ"
  | "GIFT_SELECT"
  | "PUSH_REGISTER";
export interface OfflineMutation {
  mutationId: string;
  type: MutationType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export type ProfileMutationType = "PROFILE_IDENTIFY" | "PROFILE_CONFIRM";
