import { describe, it, expect } from "vitest";
import {
  reminderSubject,
  reminderBody,
  reminderTemplate,
  reminderImage,
  reminderContentError,
  reminderDue,
} from "../supabase/functions/_shared/ten-day-content";
import { invitationTemplate } from "../supabase/functions/send-invitations/template";
const data = {
  name: "Maria & João",
  url: "https://felipeelais2026.com.br/c/individual",
  pin: "0478",
  image: reminderImage("https://project.supabase.co"),
};
describe("ten-day reminder", () => {
  it("uses countdown target minus exactly 240 hours and follows event changes", () => {
    expect(reminderDue("2026-12-15T16:00:00-03:00")).toBe(
      "2026-12-05T19:00:00.000Z",
    );
    expect(reminderDue("2027-02-20T17:00:00-03:00")).toBe(
      "2027-02-10T20:00:00.000Z",
    );
  });
  it("formats São Paulo due date", () =>
    expect(
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(reminderDue("2026-12-15T19:00:00Z"))),
    ).toContain("05/12"));
  it("preserves approved subject, paragraphs, emphasis, emojis, credentials and per-person name", () => {
    const m = reminderTemplate(reminderSubject, reminderBody, data);
    expect(m.title).toBe("FALTAM APENAS 10 DIAS PARA O NOSSO CASAMENTO 💙💍");
    expect(m.text).toContain("Olá, Maria & João! Tudo bem? 🥰");
    expect(m.text).toContain("🔑 Sua senha: 0478");
    expect(m.html).toContain("<strong>Maria &amp; João!</strong>");
    expect(m.html).toContain("<strong>INFORMAÇÕES</strong>");
    expect(m.text).toContain("Nos vemos em breve! 🥂");
    expect(m.text).not.toMatch(/[{}*]/);
    expect(m.html).toContain('href="' + data.url + '"');
    expect(m.html).toContain("Acessar meu convite");
    expect(m.text).toContain(data.url);
  });
  it("puts exact artwork before greeting with responsive non-cropped proportions", () => {
    const m = reminderTemplate(reminderSubject, reminderBody, data);
    expect(m.html.indexOf("<img")).toBeLessThan(m.html.indexOf("Olá,"));
    expect(m.html).toContain("height:auto");
    expect(m.html).toContain("max-width:600px");
    expect(m.html).toContain(
      "Felipe &amp; Laís — Faltam apenas 10 dias para o nosso sim!",
    );
    expect(data.image).toContain("Template-Faltam%2010%20dias-horizontal.png");
    expect(m.html).not.toContain("object-fit:cover");
  });
  it.each([
    "",
    reminderBody.replace("{{nome}}", ""),
    reminderBody.replace("{{senha}}", ""),
    reminderBody + "{{outro}}",
    reminderBody + "{",
  ])("rejects invalid placeholders", (body) =>
    expect(reminderContentError(reminderSubject, body)).not.toBe(""),
  );
  it("escapes markup and does not recursively expand personal data", () => {
    const m = reminderTemplate(reminderSubject, reminderBody, {
      ...data,
      name: "<script> {{senha}} & **nome**",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("{{senha}}");
    expect(m.html).toContain("**nome**");
  });
  it("keeps the original invitation unchanged", () => {
    const m = invitationTemplate(data.name, data.url, data.pin);
    expect(m.html).toContain("convite-email_v2.jpeg");
    expect(m.title).toBe("Felipe & Laís têm um convite especial para você 💍");
    expect(m.text).not.toContain("FALTAM APENAS 10 DIAS");
  });
  it("supports edited valid content without accepting arbitrary HTML", () => {
    const m = reminderTemplate(
      "Assunto editado",
      "**Olá {{nome}}**\n\n{{link}}\n\n{{senha}} <img src=x>",
      data,
    );
    expect(m.html).toContain("&lt;img src=x&gt;");
    expect(m.title).toBe("Assunto editado");
  });
});
