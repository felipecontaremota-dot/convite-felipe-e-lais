import { describe, it, expect } from "vitest";
import {
  parseActivityPage,
  activityRoutes,
  activitySentence,
  activityTime,
  orderedActivities,
  technicalDetails,
  type GuestActivity,
} from "../src/features/activity/domain";
const entry: GuestActivity = {
  id: "a",
  event_id: "event",
  created_at: "2026-11-25T17:57:00Z",
  kind: "RSVP",
  historical: false,
  guest_id: "guest-a",
  guest_name: "Felipe de Sousa Alencar",
  invitation_name: null,
  status: "CONFIRMED",
  previous_status: "PENDING",
  actor_role: "GUEST",
  actor_guest_id: "guest-a",
  actor_name: "Felipe",
  access_mode: "LINK",
  device: null,
  ip: null,
  editable: true,
};
describe("admin confirmations with honest provenance", () => {
  it.each([
    ["CONFIRMED", "PRESENÇA"],
    ["DECLINED", "NÃO IRÁ"],
    ["MAYBE", "TALVEZ IRÁ"],
  ])("formats %s without changing RSVP states", (status, label) => {
    const m = activitySentence({ ...entry, status });
    expect(m.status).toBe(label);
    expect(m.action).toContain("confirmou");
    expect(m.suffix).toContain("através do link-convite");
    expect(m.suffix).toContain("25/11/2026 às 14:57");
  });
  it("keeps administrative and family changes distinct from the subject", () => {
    expect(
      activitySentence({ ...entry, actor_role: "ADMIN" }).suffix,
    ).toContain("pelos administradores");
    const m = activitySentence({
      ...entry,
      actor_guest_id: "other",
      actor_name: "Responsável",
    });
    expect(m.prefix).toBe("A confirmação de ");
    expect(m.suffix).toContain("por Responsável");
    expect(m.action).not.toContain("confirmou");
  });
  it("uses an existing administrator label without attributing the action to the guest", () => {
    const m = activitySentence({
      ...entry,
      actor_role: "ADMIN",
      actor_name: "Felipe",
    });
    expect(m.suffix).toContain("pelos administradores (Felipe)");
    expect(m.suffix).not.toContain("link-convite");
    expect(m.prefix).toBe("A confirmação de ");
  });
  it("does not invent missing historical status, identity or access method", () => {
    const m = activitySentence({
      ...entry,
      historical: true,
      guest_name: null,
      status: null,
      actor_role: null,
      access_mode: null,
    });
    expect(m.subject).toBe("Convidado não identificado");
    expect(m.status).toBe("");
    expect(m.action).toBe(" foi atualizada");
    expect(m.suffix).not.toContain("link-convite");
  });
  it("distinguishes the true login modalities", () => {
    expect(
      activitySentence({ ...entry, access_mode: "NAME_PIN" }).suffix,
    ).toContain("nome e senha");
    expect(
      activitySentence({ ...entry, kind: "LOGIN", access_mode: "NAME_PIN" })
        .action,
    ).toContain("nome e senha");
    expect(
      activitySentence({
        ...entry,
        kind: "LOGIN",
        access_mode: null,
        guest_name: null,
        invitation_name: "Família",
      }).subject,
    ).toContain("Um integrante");
  });
  it("maps only the actual requested guest routes", () => {
    expect(activityRoutes).toEqual({
      "/presentes": "PRESENTES",
      "/ingressos": "CONVITES",
      "/como-chegar": "LOCAL",
      "/informacoes": "INFORMACOES",
    });
  });
  it.each(["PRESENTES", "CONVITES", "LOCAL", "INFORMACOES", "LOGOUT"] as const)(
    "formats %s without credentials",
    (kind) => {
      const m = activitySentence({ ...entry, kind });
      expect(m.status).toBe("");
      expect(JSON.stringify(m)).not.toMatch(/undefined|null/);
    },
  );
  it("uses Sao Paulo even when the host is elsewhere", () => {
    expect(activityTime("2026-11-26T01:02:00Z")).toBe("25/11/2026 às 22:02");
  });
  it("omits missing technical data and preserves IPv4/IPv6 as observed", () => {
    expect(technicalDetails({ device: null, ip: null })).toBe("");
    expect(technicalDetails({ device: "iPhone", ip: null })).toBe("iPhone");
    expect(technicalDetails({ device: null, ip: "192.0.2.10" })).toBe(
      "IP 192.0.2.10",
    );
    expect(technicalDetails({ device: "Android", ip: "2001:db8::1" })).toBe(
      "Android · IP 2001:db8::1",
    );
  });
  it("deduplicates realtime/initial pages and orders timestamp ties by ID", () => {
    const b = { ...entry, id: "b" },
      old = { ...entry, id: "c", created_at: "2026-01-01T00:00:00Z" };
    expect(
      orderedActivities([
        { items: [entry, b], next: null },
        { items: [entry, old], next: null },
      ]).map((a) => a.id),
    ).toEqual(["b", "a", "c"]);
  });
});

it.each([null, {}, { items: [undefined], next: null }])(
  "isolates an incomplete history response from the rest of the app",
  (value) => {
    expect(() => parseActivityPage(value)).toThrow(
      "Não foi possível carregar as confirmações agora.",
    );
  },
);
it("validates a real empty page without inventing records", () => {
  expect(parseActivityPage({ items: [], next: null })).toEqual({
    items: [],
    next: null,
  });
});

it.each([
  ["2026-11-25T17:57:00.100001Z", "2026-11-25T17:57:00.100999Z"],
  ["2026-11-25T17:57:00.100500Z", "2026-11-25T14:57:00.100600-03:00"],
])(
  "preserves backend microsecond chronology before the stable ID tie-breaker",
  (earlier, later) => {
    const rows = orderedActivities([
      {
        items: [
          { ...entry, id: "z", created_at: earlier },
          { ...entry, id: "a", created_at: later },
        ],
        next: null,
      },
    ]);
    expect(rows.map((a) => a.id)).toEqual(["a", "z"]);
  },
);
