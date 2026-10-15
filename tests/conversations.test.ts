import { describe, it, expect } from "vitest";
import {
  chronological,
  category,
  isUnread,
  unreadMessages,
  unitMessages,
  scheduleState,
  messageDate,
  senderCaption,
  conversationList,
} from "../src/features/messages/conversations";
import {
  scheduledInstant,
  scheduleFields,
  scheduledContentError,
} from "../src/features/notifications/scheduling";
import type {
  Message,
  Snapshot,
  NotificationSchedule,
} from "../src/types/domain";
const message = (id: string, extra: Partial<Message> = {}): Message => ({
  id,
  event_id: "event",
  invitation_id: "a",
  recipient_guest_id: null,
  sender_guest_id: null,
  sender_user_id: "user",
  from_admin: true,
  content: "Hi",
  created_at: "2026-01-01T00:00:00Z",
  read_at: null,
  ...extra,
});
const snapshot = (
  role: Snapshot["role"] = "GUEST",
  messages: Message[] = [],
): Snapshot =>
  ({
    role,
    messages,
    capabilities: { messaging_v2: true },
    guests: [{ id: "g", invitation_id: "a" }],
  }) as Snapshot;
describe("conversation identity and counters", () => {
  it("orders chronologically with deterministic ties, excludes tombstones and duplicates", () =>
    expect(
      chronological([
        message("b"),
        message("a"),
        message("b"),
        message("c", { deleted_at: "now" }),
        message("d", { created_at: "2025-01-01T00:00:00Z" }),
      ]).map((m) => m.id),
    ).toEqual(["d", "a", "b"]));
  it.each([
    "GENERAL",
    "PRIVATE",
    "FAMILY",
    "INDIVIDUAL",
    "LEGACY",
    undefined,
  ] as const)(
    "classifies %s without broadcasting targeted or unknown history",
    (audience) =>
      expect(category(message("m", { audience }))).toBe(
        audience === "GENERAL" ? "general" : "private",
      ),
  );
  it("counts incoming only, confirmed viewer reads only, and no duplicate IDs", () => {
    const data = snapshot("GUEST", [
      message("a"),
      message("a"),
      message("b", { viewer_read_at: "read" }),
      message("c", { from_admin: false }),
      message("d", { deleted_at: "now" }),
    ]);
    expect(unreadMessages(data)).toBe(1);
  });
  it("does not confuse a legacy shared admin read with a new user's read", () =>
    expect(
      isUnread(
        message("a", { from_admin: false, read_at: "historical" }),
        snapshot("ADMIN"),
      ),
    ).toBe(true));
  it("legacy backend uses its existing admin read contract and does not invent guest reads", () => {
    const data = snapshot("ADMIN");
    delete data.capabilities;
    expect(
      isUnread(message("a", { from_admin: false, read_at: "yes" }), data),
    ).toBe(false);
    data.role = "GUEST";
    expect(isUnread(message("a"), data)).toBe(false);
  });
  it("counts the two categories independently", () => {
    const data = snapshot("GUEST", [
      message("a", { audience: "GENERAL" }),
      message("b", { audience: "FAMILY" }),
    ]);
    expect(unreadMessages(data, "general")).toBe(1);
    expect(unreadMessages(data, "private")).toBe(1);
  });
  it("unit history does not include another invitation or a public notice", () => {
    const data = snapshot("ADMIN", [
      message("a"),
      message("b", { invitation_id: "b" }),
      message("c", { audience: "GENERAL" }),
      message("d", { invitation_id: null, recipient_guest_ids: ["g"] }),
    ]);
    expect(unitMessages(data, "a").map((m) => m.id)).toEqual(["a", "d"]);
  });
});
describe("server scheduling projection and Sao Paulo time", () => {
  it("uses Sao Paulo independently of browser timezone and round trips", () => {
    expect(scheduledInstant("2026-12-15", "16:00", 0)).toBe(
      "2026-12-15T19:00:00.000Z",
    );
    expect(scheduleFields("2026-12-15T19:00:00Z")).toEqual({
      date: "2026-12-15",
      time: "16:00",
    });
    expect(scheduledInstant("15/12/2026", "16:00", 0)).toBe(
      "2026-12-15T19:00:00.000Z",
    );
  });
  it.each([
    ["2026-02-31", "16:00"],
    ["", "16:00"],
    ["2026-12-15", "25:00"],
    ["2026-12-15", "16:99"],
  ])("rejects invalid %s %s", (date, time) =>
    expect(() => scheduledInstant(date, time, 0)).toThrow(),
  );
  it("requires an actually future instant", () =>
    expect(() =>
      scheduledInstant(
        "2026-12-15",
        "16:00",
        Date.parse("2026-12-16T00:00:00Z"),
      ),
    ).toThrow(/futura/));
  it.each([
    [["sent", "sent"], "Enviada"],
    [["sent", "failed"], "Parcialmente entregue"],
    [["pending"], "Aguardando entrega"],
    [["processing"], "Em processamento"],
    [["failed"], "Falha de entrega"],
    [["uncertain"], "Resultado não confirmado"],
    [["skipped"], "Não enviada — consentimento ou disponibilidade"],
  ])("projects real delivery statuses %j", (statuses, label) => {
    expect(
      scheduleState(
        { id: "s", status: "dispatched" } as NotificationSchedule,
        (statuses as string[]).map((status) => ({
          id: "job",
          message_id: "s",
          channel: "EMAIL",
          status,
          attempts: 1,
          last_error: null,
          created_at: "",
        })),
      ),
    ).toBe(label);
  });
  it("does not call an empty materialization sent", () =>
    expect(
      scheduleState(
        { id: "s", status: "dispatched" } as NotificationSchedule,
        [],
      ),
    ).toBe("Sem destinatários ativos"));
});

it("preserves explicitly shared historical admin reads without assigning a user", () => {
  expect(
    isUnread(
      message("m", { from_admin: false, legacy_admin_read_at: "historical" }),
      snapshot("ADMIN"),
    ),
  ).toBe(false);
});

it("scheduled provider payloads respect byte budgets and JSON escaping", () => {
  expect(scheduledContentError("Title", "😀".repeat(1000), ["PUSH"])).toMatch(
    /PUSH/,
  );
  expect(scheduledContentError("Title", '"'.repeat(1600), ["PUSH"])).toMatch(
    /PUSH/,
  );
  expect(
    scheduledContentError("Title", "A".repeat(1200), ["WHATSAPP"]),
  ).toMatch(/WHATSAPP/);
  expect(
    scheduledContentError("Title", "A".repeat(3700), ["EMAIL", "IN_APP"]),
  ).toBeNull();
});

it("chronology compares actual instants across timezone offsets", () => {
  expect(
    chronological([
      message("a", { created_at: "2026-01-01T10:00:00-03:00" }),
      message("b", { created_at: "2026-01-01T12:00:00Z" }),
    ]).map((m) => m.id),
  ).toEqual(["b", "a"]);
});

describe("unified conversation presentation", () => {
  it("formats event local time without seconds or technical timezone", () =>
    expect(messageDate("2026-10-14T21:35:49Z")).toBe("14/10/2026, 18:35"));
  it.each([
    ["GENERAL", "Felipe & Laís para todos"],
    ["FAMILY", "Felipe & Laís para sua família"],
    ["INDIVIDUAL", "Felipe & Laís para você"],
    ["PRIVATE", "Felipe & Laís para você"],
    ["LEGACY", "Felipe & Laís"],
  ] as const)(
    "labels %s without changing its stored audience",
    (audience, label) => {
      const m = message("a", { audience });
      expect(senderCaption(m)).toBe(label);
      expect(m.audience).toBe(audience);
    },
  );
  it("orders access units by real activity and counts incoming unread only", () => {
    const data = {
      ...snapshot("ADMIN", [
        message("in-a", {
          from_admin: false,
          invitation_id: "a",
          created_at: "2026-01-01T12:00:00Z",
        }),
        message("in-b", {
          from_admin: false,
          invitation_id: "b",
          created_at: "2026-01-01T13:00:00Z",
        }),
        message("out-a", {
          audience: "FAMILY",
          invitation_id: "a",
          created_at: "2026-01-01T14:00:00Z",
        }),
        message("general", {
          audience: "GENERAL",
          created_at: "2026-01-01T15:00:00Z",
        }),
      ]),
      invitations: [
        { id: "a", name: "Unidade A" },
        { id: "b", name: "Unidade B" },
      ],
    } as Snapshot;
    const result = conversationList(data);
    expect(result.map((c) => c.unit.id)).toEqual(["a", "b"]);
    expect(result.map((c) => c.unread)).toEqual([1, 1]);
    expect(result[0].anchor?.id).toBe("in-a");
    expect(
      result.flatMap((c) => c.messages).some((m) => m.id === "general"),
    ).toBe(false);
  });
});

it("keeps active units without activity available with stable ordering", () => {
  const data = {
    ...snapshot("ADMIN", []),
    invitations: [
      { id: "b", name: "B", active: true },
      { id: "a", name: "A", active: true },
    ],
    guests: [
      { id: "g-a", invitation_id: "a" },
      { id: "g-b", invitation_id: "b" },
    ],
  } as Snapshot;
  expect(conversationList(data).map((c) => c.unit.id)).toEqual(["a", "b"]);
  expect(conversationList(data).every((c) => !c.latest && c.unread === 0)).toBe(
    true,
  );
});
