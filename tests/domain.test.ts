import { describe, it, expect } from "vitest";
import {
  weddingCountdown,
  WEDDING_START,
} from "../src/features/countdown/domain";
import {
  canAccess,
  codeFromLink,
  contactSchema,
  invitationCode,
  invitationLink,
  rsvpSchema,
  safeHttps,
  ticketToken,
} from "../src/utils/security";
import { transportLinks } from "../src/features/location/transportLinks";
import {
  notificationTime,
  dueRules,
  NOTIFICATION_DAYS,
} from "../src/features/notifications/domain";
import { importReport, sheetMapping } from "../src/utils/sheets";
import {
  validateCredential,
  uniqueCheckin,
} from "../src/features/checkin/domain";
import { MutationQueue, type KeyValueStorage } from "../src/storage/queue";
import type {
  WeddingEvent,
  OfflineMutation,
  Credential,
  Checkin,
  Rule,
} from "../src/types/domain";
import { createHash } from "node:crypto";
const event: WeddingEvent = {
  id: "event",
  title: "Felipe & Laís",
  starts_at: WEDDING_START,
  timezone: "America/Sao_Paulo",
  venue_name: null,
  address: null,
  latitude: null,
  longitude: null,
};
const target = Date.parse("2026-12-15T19:00:00Z");
describe("countdown com timezone explícito", () => {
  it.each([
    [7 * 24, "days", 7],
    [144, "hours", 144],
    [120, "hours", 120],
    [24, "hours", 24],
    [2.1, "hours", 3],
    [0, "arrived", 0],
    [-1, "arrived", 0],
  ] as const)("%s horas antes", (hours, unit, value) => {
    expect(
      weddingCountdown(WEDDING_START, target - hours * 3600000),
    ).toMatchObject({ unit, value });
  });
  it("não usa fuso implícito", () => {
    expect(() => weddingCountdown("2026-12-15T16:00:00")).toThrow();
    expect(weddingCountdown("2026-12-15T19:00:00Z", target)).toEqual(
      weddingCountdown(WEDDING_START, target),
    );
  });
});
describe("roles e entradas", () => {
  it.each([
    ["GUEST", "admin", false],
    ["GUEST", "ceremonial", false],
    ["CEREMONIALIST", "guest", false],
    ["CEREMONIALIST", "admin", false],
    ["CEREMONIALIST", "ceremonial", true],
    ["ADMIN", "admin", true],
    ["ADMIN", "ceremonial", true],
    [null, "admin", false],
  ] as const)("%s → %s", (role, section, result) =>
    expect(canAccess(role, section)).toBe(result),
  );
  it("não admite códigos curtos/sequenciais", () => {
    expect(invitationCode.safeParse("12345678").success).toBe(false);
    expect(invitationCode.safeParse("x".repeat(48)).success).toBe(true);
  });
  it("resolve links HTTPS e nativos", () => {
    const code = "x".repeat(48);
    expect(codeFromLink(`https://convite.example/c/${code}`)).toBe(code);
    expect(codeFromLink(`felipeelais://c/${code}`)).toBe(code);
    expect(invitationLink("https://convite.example/", code)).toBe(
      `https://convite.example/c/${code}`,
    );
  });
  it("rejeita protocolos e credenciais externas", () => {
    expect(safeHttps("javascript:alert(1)")).toBeNull();
    expect(safeHttps("https://user:pass@example.com")).toBeNull();
    expect(safeHttps("http://example.com")).toBeNull();
  });
  it("consentimentos separados são obrigatórios", () => {
    expect(
      contactSchema.safeParse({ email: "person@example.com" }).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({
        email: "",
        whatsapp: "",
        consent_in_app: true,
        consent_push: false,
        consent_email: false,
        consent_whatsapp: false,
      }).success,
    ).toBe(true);
  });
  it("RSVP valida cada resposta sem confundir check-in", () => {
    expect(
      rsvpSchema.parse({ status: "DECLINED", dietary: "", note: "" }).status,
    ).toBe("DECLINED");
    expect(
      rsvpSchema.safeParse({ status: "PRESENT", dietary: "", note: "" })
        .success,
    ).toBe(false);
  });
});
describe("links de transporte", () => {
  it("não inventa destino", () =>
    expect(transportLinks(event)).toEqual({
      gps: null,
      google: null,
      waze: null,
      uber: null,
      share: null,
    }));
  it("passa coordenadas a Google e Waze", () => {
    const links = transportLinks({ ...event, latitude: -23, longitude: -46 });
    expect(links.google).toContain("-23%2C-46");
    expect(links.waze).toContain("ll=-23,-46");
  });
  it("endereço sem coordenadas tem fallback", () =>
    expect(
      transportLinks({ ...event, address: "Endereço informado" }),
    ).toMatchObject({
      waze: expect.stringContaining("q=Endere"),
      share: "Endereço informado",
    }));
});
describe("QR e check-in", () => {
  const token = "a".repeat(64),
    hash = createHash("sha256").update(token).digest("hex");
  const c: Credential = {
    id: "c",
    event_id: "event",
    guest_id: "guest",
    token_hash: hash,
    issued_at: "now",
    revoked_at: null,
  };
  const entry: Checkin = {
    id: "entry",
    event_id: "event",
    guest_id: "guest",
    mutation_id: "mutation",
    method: "QR",
    actor_id: "actor",
    created_at: "now",
  };
  it("QR contém apenas token opaco, sem identidade", () => {
    expect(ticketToken(`wedding://ticket/${token}`)).toBe(token);
    expect(ticketToken("Nome | Telefone")).toBeNull();
    expect(hash).toHaveLength(64);
  });
  it("validar não registra entrada", () =>
    expect(validateCredential(hash, [c], []).status).toBe("valid"));
  it("credencial revogada é inválida", () =>
    expect(
      validateCredential(hash, [{ ...c, revoked_at: "now" }], []).status,
    ).toBe("invalid"));
  it("já utilizado exibe o registro original", () =>
    expect(validateCredential(hash, [c], [entry])).toMatchObject({
      status: "used",
      checkin: entry,
    }));
  it("mutation ou pessoa repetida não gera nova entrada", () => {
    expect(
      uniqueCheckin([entry], { ...entry, id: "new", mutation_id: "another" }),
    ).toEqual({ checkin: entry, duplicate: true });
  });
});
describe("offline queue", () => {
  function queue() {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async (k) => values.get(k) || null,
      setItem: async (k, v) => {
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    };
    return new MutationQueue(storage, "queue");
  }
  const item: OfflineMutation = {
    mutationId: "m1",
    type: "RSVP_UPDATE",
    payload: {},
    createdAt: "now",
    attempts: 0,
    lastError: null,
  };
  it("enfileira atomicamente e elimina duplicatas", async () => {
    const q = queue();
    await Promise.all([
      q.enqueue(item),
      q.enqueue(item),
      q.enqueue({ ...item, mutationId: "m2" }),
    ]);
    expect(await q.list()).toHaveLength(2);
  });
  it("retém falha e só remove após confirmação", async () => {
    const q = queue();
    await q.enqueue(item);
    await q.flush(async () => {
      throw Error("Sem rede");
    });
    expect(await q.list()).toMatchObject([
      { attempts: 1, lastError: "Não foi possível concluir. Verifique os dados e tente novamente." },
    ]);
    await q.flush(async () => {});
    expect(await q.list()).toEqual([]);
  });
  it("enfileirar durante flush não perde ações", async () => {
    const q = queue();
    await q.enqueue(item);
    await Promise.all([
      q.flush(async () => {}),
      q.enqueue({ ...item, mutationId: "m2" }),
    ]);
    expect(await q.list()).toMatchObject([{ mutationId: "m2" }]);
  });
});
describe("notificações e planilha", () => {
  it("nove regras e calendário no horário local", () => {
    expect(NOTIFICATION_DAYS).toHaveLength(9);
    expect(notificationTime(WEDDING_START, 1)).toBe("2026-12-14T19:00:00.000Z");
  });
  it("desativadas não são selecionadas", () => {
    const rule = {
      id: "r",
      event_id: "event",
      days_before: 1,
      title: "",
      body: "",
      channels: ["IN_APP"],
      active: false,
      version: 1,
    } as Rule;
    expect(dueRules([rule], WEDDING_START, target)).toEqual([]);
  });
  it("mapping separa RSVP de presença física", () => {
    expect(sheetMapping.rsvp).not.toBe(sheetMapping.checkin);
    expect(sheetMapping.id).toBe("Convidado ID");
  });
  it("importação identifica invalidos e duplicidades sem aplicar", () => {
    const report = importReport([
      { name: "Pessoa Demo", family: "Demo" },
      { name: "pessoa demo", family: "Demo" },
      { name: "", family: "Demo" },
    ]);
    expect(report.map((r) => [r.valid, r.duplicate])).toEqual([
      [true, false],
      [true, true],
      [false, false],
    ]);
  });
});

describe("URLs recebidas pelo sistema", () => {
  it("remove consultas não utilizadas antes do parser de navegação", async () => {
    const { safeSystemPath } = await import("../src/utils/systemLinks");
    expect(
      safeSystemPath(`felipeelais://c/${"x".repeat(48)}?bad=%FE%FE%FE`),
    ).toBe(`/c/${"x".repeat(48)}`);
    expect(safeSystemPath("/login?bad=%FE")).toBe("/login");
    expect(safeSystemPath("x".repeat(2000))).toBe("/");
    expect(safeSystemPath("javascript:alert(1)")).toBe("/");
  });
});
