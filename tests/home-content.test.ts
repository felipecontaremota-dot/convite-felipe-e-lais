import { describe, expect, it } from "vitest";
import { homeGreeting, homePresence } from "../src/features/guests/homeContent";
import { weddingCountdown } from "../src/features/countdown/domain";
import type { Guest, Invitation } from "../src/types/domain";
const unit = {
  id: "unit",
  event_id: "event",
  name: "Família Teste",
  active: true,
  primary_guest_id: "person",
  version: 1,
  kind: "INDIVIDUAL",
} satisfies Invitation;
const person = {
  id: "person",
  event_id: "event",
  invitation_id: "unit",
  name: "Guilherme",
  group_label: "",
  version: 1,
  companion_of: null,
} satisfies Guest;
describe("Home greeting from the existing access unit", () => {
  it("uses explicit masculine form", () =>
    expect(
      homeGreeting(unit, [{ ...person, greeting_form: "MASCULINE" }]),
    ).toBe("Bem-vindo, Guilherme"));
  it("uses explicit feminine form", () =>
    expect(
      homeGreeting(unit, [
        { ...person, name: "Laís", greeting_form: "FEMININE" },
      ]),
    ).toBe("Bem-vinda, Laís"));
  it.each([undefined, null] as const)(
    "uses fallback for %s without inferring a name",
    (greeting_form) =>
      expect(homeGreeting(unit, [{ ...person, greeting_form }])).toBe(
        "Boas-vindas, Guilherme",
      ),
  );
  it("uses the responsible guest, not member order or the family label", () =>
    expect(
      homeGreeting({ ...unit, kind: "FAMILY" }, [
        { ...person, id: "other", name: "Outra pessoa" },
        person,
      ]),
    ).toBe("Bem-vindos, Guilherme e família"));
  it("falls back to the family label when no responsible guest exists", () =>
    expect(
      homeGreeting({ ...unit, kind: "FAMILY", primary_guest_id: null }, [
        person,
      ]),
    ).toBe("Bem-vindos, Família Teste"));
  it("does not use a responsible guest from another access unit", () =>
    expect(
      homeGreeting({ ...unit, kind: "FAMILY" }, [
        { ...person, invitation_id: "other" },
      ]),
    ).toBe("Bem-vindos, Família Teste"));
  it("handles absent snapshot without an error", () =>
    expect(homeGreeting(undefined, [])).toBe("Boas-vindas à nossa celebração"));
});
describe("Home countdown keeps the dynamic baseline calculation", () => {
  const target = Date.parse("2026-12-15T16:00:00-03:00");
  it("decreases with time and keeps timezone semantics", () => {
    expect(
      weddingCountdown("2026-12-15T16:00:00-03:00", target - 66 * 86400000)
        .value,
    ).toBe(66);
    expect(
      weddingCountdown("2026-12-15T19:00:00Z", target - 65 * 86400000).value,
    ).toBe(65);
  });
});

describe("Home reads the existing per-person RSVP", () => {
  const records = (
    status: "CONFIRMED" | "DECLINED" | "PENDING",
    responded_at: string | null = null,
  ) => [
    {
      event_id: "event",
      guest_id: "person",
      status,
      responded_at,
      dietary: "",
      note: "",
      source: "APP",
    },
  ];
  it.each([
    ["CONFIRMED", null, "Sua presença está confirmada."],
    ["DECLINED", null, "Sua ausência foi confirmada, sentiremos sua falta."],
    ["PENDING", null, "Sua presença ainda não foi confirmada."],
    [
      "PENDING",
      "2026-10-11T00:00:00Z",
      "Ainda dá tempo de você confirmar sua presença.",
    ],
  ] as const)("individual %s / %s", (status, stamp, message) =>
    expect(homePresence(unit, [person], records(status, stamp))).toBe(message),
  );
  it.each([
    ["CONFIRMED", null, "Sua presença e de sua família está confirmada."],
    [
      "DECLINED",
      null,
      "Sua ausência e de sua família foi confirmada, sentiremos suas faltas.",
    ],
    [
      "PENDING",
      null,
      "Sua presença e de sua família ainda não está confirmada.",
    ],
    [
      "PENDING",
      "2026-10-11T00:00:00Z",
      "Ainda dá tempo de você confirmar a sua presença e de sua família.",
    ],
  ] as const)("uniform family %s / %s", (status, stamp, message) =>
    expect(
      homePresence(
        { ...unit, kind: "FAMILY" },
        [person],
        records(status, stamp),
      ),
    ).toBe(message),
  );
  it("counts mixed states without applying the responsible guest answer to others", () =>
    expect(
      homePresence(
        { ...unit, kind: "FAMILY" },
        [person, { ...person, id: "second" }],
        records("CONFIRMED"),
      ),
    ).toBe("1 presença confirmada · 1 ainda não confirmada"));
  it("does not count people or RSVPs from another access unit", () =>
    expect(
      homePresence(
        unit,
        [person, { ...person, id: "other", invitation_id: "other" }],
        records("CONFIRMED"),
      ),
    ).toBe("Sua presença está confirmada."));
  it("requires all family members to agree and preserves their records", () => {
    const members = [person, { ...person, id: "second" }];
    const rsvps = [
      ...records("CONFIRMED"),
      { ...records("CONFIRMED")[0]!, guest_id: "second" },
    ];
    const before = JSON.stringify(rsvps);
    expect(homePresence({ ...unit, kind: "FAMILY" }, members, rsvps)).toBe(
      "Sua presença e de sua família está confirmada.",
    );
    expect(JSON.stringify(rsvps)).toBe(before);
  });
  it("keeps both PENDING meanings separate in a mixed family", () => {
    const members = [person, { ...person, id: "second" }];
    const rsvps = [
      ...records("PENDING"),
      { ...records("PENDING", "2026-10-11T00:00:00Z")[0]!, guest_id: "second" },
    ];
    expect(homePresence({ ...unit, kind: "FAMILY" }, members, rsvps)).toBe(
      "1 ainda não confirmada · 1 ainda decidindo",
    );
  });
  it("recognizes offline PENDING without fabricating responded_at", () => {
    const rsvps = records("PENDING");
    const pending = [
      {
        mutationId: "saved",
        type: "RSVP_UPDATE" as const,
        payload: { guest_id: "person", status: "PENDING" },
        createdAt: "2026-10-11T00:00:00Z",
        attempts: 0,
        lastError: null,
      },
    ];
    expect(homePresence(unit, [person], rsvps, pending)).toBe(
      "Ainda dá tempo de você confirmar sua presença.",
    );
    expect(rsvps[0]!.responded_at).toBeNull();
    expect(
      homePresence({ ...unit, kind: "FAMILY" }, [person], rsvps, pending),
    ).toBe("Ainda dá tempo de você confirmar a sua presença e de sua família.");
  });
  it("uses the latest queued reply and ignores another guest's queue", () => {
    const pending = [
      {
        mutationId: "old",
        type: "RSVP_UPDATE" as const,
        payload: { guest_id: "person", status: "PENDING" },
        createdAt: "2026-10-11T00:00:00Z",
        attempts: 0,
        lastError: null,
      },
      {
        mutationId: "new",
        type: "RSVP_UPDATE" as const,
        payload: { guest_id: "person", status: "DECLINED" },
        createdAt: "2026-10-11T00:01:00Z",
        attempts: 0,
        lastError: null,
      },
    ];
    expect(homePresence(unit, [person], records("PENDING"), pending)).toBe(
      "Sua ausência foi confirmada, sentiremos sua falta.",
    );
    expect(
      homePresence(unit, [person], records("PENDING"), [
        { ...pending[0]!, payload: { guest_id: "other", status: "PENDING" } },
      ]),
    ).toBe("Sua presença ainda não foi confirmada.");
  });
  it("missing records are unanswered", () =>
    expect(homePresence(unit, [person], [])).toBe(
      "Sua presença ainda não foi confirmada.",
    ));
});
